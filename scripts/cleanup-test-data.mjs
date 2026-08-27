/**
 * 测试临时数据手动清扫 CLI。
 *
 * 与 tests/cleanup-temp-dirs.global.ts 共用同一套逻辑（vitest 跑前/跑后自动执行）；
 * 本 CLI 供随时手动触发：npm run cleanup:test-data
 *
 * 参数：
 *   --all    不带宽限期，删除所有可删除的 moliu-* Temp 目录（默认只清 >1h 的历史孤儿）
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MOLIU_TEMP_PREFIXES = [
  'moliu-cw-runtime-',
  'moliu-story-runtime-',
  'moliu-story-ipc-',
  'moliu-long-form-',
  'moliu-workflow-run-',
];

const removeAll = process.argv.includes('--all');
const graceMs = removeAll ? 0 : 60 * 60 * 1000;
const cutoff = Date.now() - graceMs;

const tmp = os.tmpdir();
const targets = readdirSync(tmp)
  .filter(name => MOLIU_TEMP_PREFIXES.some(prefix => name.startsWith(prefix)))
  .map(name => path.join(tmp, name))
  .filter(fullPath => statSync(fullPath).isDirectory());

let removed = 0;
let skipped = 0;
for (const fullPath of targets) {
  if (!removeAll && statSync(fullPath).mtimeMs > cutoff) continue;
  try {
    rmSync(fullPath, { recursive: true, force: true });
    if (existsSync(fullPath)) throw new Error('still exists');
    removed += 1;
  } catch {
    // 删不掉 = 仍被进程持有（如 App 正开着该库），跳过不中断
    skipped += 1;
  }
}

console.log(`[cleanup:test-data] 扫描 ${targets.length} 个 moliu-* 目录：已删 ${removed}${skipped > 0 ? `，被占用跳过 ${skipped}` : ''}。`);
if (targets.length - removed - skipped > 0) {
  console.log(`[cleanup:test-data] ${targets.length - removed - skipped} 个在宽限期内（1 小时内修改），保留；加 --all 强制清扫。`);
}
