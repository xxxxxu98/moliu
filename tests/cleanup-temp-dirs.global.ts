/**
 * vitest 全局测试数据清理（setupFile）。
 *
 * 管理对象：各测试/harness 在系统 Temp 里创建的 `moliu-*` 目录
 * （moliu-cw-runtime-*、moliu-story-runtime-*、moliu-story-ipc-*、
 * moliu-long-form-*、moliu-workflow-run-* 等）。
 *
 * 问题背景：这些目录虽然多数有 afterEach 清理，但用例超时/崩溃/进程被杀时
 * 清理代码不会执行——实测累积 30+ 个孤儿目录（含 SQLite 库与 WAL 文件）。
 *
 * 清理策略（双保险）：
 * - suiteStart：删除「修改时间早于本次测试开始 1 小时前」的 moliu-* 目录，
 *   只清历史孤儿，绝不碰并行 worker 正在创建使用的新目录；
 * - suiteEnd（teardown）：删除本次运行开始后仍未被清理、且已无进程持有
 *   （尝试删除成功即视为无持有）的全部 moliu-* 目录。
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 匹配本仓库测试在 Temp 创建的所有目录名前缀 */
const MOLIU_TEMP_PREFIXES = [
  'moliu-cw-runtime-',
  'moliu-story-runtime-',
  'moliu-story-ipc-',
  'moliu-long-form-',
  'moliu-workflow-run-',
];

/** 历史孤儿的宽限期：修改时间早于此刻该时长才认为是上一轮遗留 */
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

function isMoliuTestDir(name: string): boolean {
  return MOLIU_TEMP_PREFIXES.some(prefix => name.startsWith(prefix));
}

function listMoliuTempDirs(): string[] {
  const tmp = os.tmpdir();
  if (!existsSync(tmp)) return [];
  return readdirSync(tmp)
    .filter(isMoliuTestDir)
    .map(name => path.join(tmp, name))
    .filter(fullPath => statSync(fullPath).isDirectory());
}

/**
 * 删除目录；正在被进程使用的目录（SQLite 库被打开时 Windows 会锁定文件）
 * 删除失败则跳过并返回 false，不抛错——绝不能因为清理影响正常运行的 App 或并行 worker。
 */
function safeRemoveDir(fullPath: string): boolean {
  try {
    rmSync(fullPath, { recursive: true, force: true });
    return !existsSync(fullPath);
  } catch {
    return false;
  }
}

export function setup(): void {
  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  let removed = 0;
  for (const fullPath of listMoliuTempDirs()) {
    const mtime = statSync(fullPath).mtimeMs;
    // 宽限期内的目录可能是并行 worker / 冒烟脚本正在用的，不动
    if (mtime > cutoff) continue;
    if (safeRemoveDir(fullPath)) removed += 1;
  }
  if (removed > 0) {
    console.log(`[test-cleanup] 已清扫 ${removed} 个历史遗留的 moliu-* 测试临时目录`);
  }
}

export function teardown(): void {
  // 本轮结束后：能删掉的都删掉（删不掉说明还被某个进程持有——比如用户开着
  // 长时间挂起的冒烟脚本，留给下一轮的 suiteStart 按宽限规则处理）。
  let removed = 0;
  for (const fullPath of listMoliuTempDirs()) {
    if (safeRemoveDir(fullPath)) removed += 1;
  }
  if (removed > 0) {
    console.log(`[test-cleanup] 测试结束，已清理 ${removed} 个 moliu-* 测试临时目录`);
  }
}

// CLI 直跑入口：node --experimental-strip-types 下可直接执行（vitest 外手动清扫）
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  teardown();
}
