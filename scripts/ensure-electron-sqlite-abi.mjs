#!/usr/bin/env node
/**
 * 冒烟前置：确保 better-sqlite3 按 Electron ABI 编译。
 *
 * 背景：`npm run test` 的 pretest 钩子会执行 `npm rebuild better-sqlite3`，按系统 Node 的
 * NODE_MODULE_VERSION 重编译；而 storyflow 闭环冒烟用 Electron 跑 Vitest（与桌面主进程同 ABI）。
 * 两者交替执行时，native 模块会停留在错误的 ABI 上，冒烟静默降级内存后端，
 * 直到最后一条 runtimeBackend 断言才失败，白跑一小时。
 *
 * 这里先探针加载，失败则用 electron-rebuild 重建后再探一次。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 并发矩阵时多轮冒烟同时启动，若各自发现 ABI 不符会同时 electron-rebuild 同一份
// node_modules——构建产物被并发覆盖，轻则重建失败重则 native 文件损坏。
// 约定：用锁文件互斥「检查+重建」整段；已有他轮持锁时等待并只做探针（不重建）。
const ABI_LOCK = join(process.cwd(), 'temp', '.sqlite-abi-rebuild.lock');
const ABI_LOCK_STALE_MS = 10 * 60 * 1000; // 重建最长耗时（含下载头文件），超时视为持锁者已死

// better-sqlite3 的 native addon 是懒加载的：只 require 不会触发 ABI 校验，
// 必须真的开一个库，否则探针会在 ABI 不匹配时误报通过。
const PROBE_CODE =
  'try { const D = require("better-sqlite3"); new D(":memory:").close(); console.log("SQLITE_ABI_OK"); }' +
  ' catch (e) { console.error("SQLITE_ABI_FAIL: " + String(e && e.message).slice(0, 300)); process.exit(1); }';

/** 用 Electron（as node）加载 better-sqlite3，返回是否成功 */
function probeUnderElectron(electronBinary) {
  const result = spawnSync(electronBinary, ['-e', PROBE_CODE], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0 && (result.stdout ?? '').includes('SQLITE_ABI_OK'),
    detail: (result.stderr ?? '').trim() || (result.stdout ?? '').trim(),
  };
}

function runElectronRebuild() {
  const binary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild',
  );
  if (!existsSync(binary)) {
    return { ok: false, detail: `未找到 ${binary}，请先安装依赖（@electron/rebuild 随 electron-forge 提供）` };
  }
  const result = spawnSync(binary, ['-f', '-w', 'better-sqlite3'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return { ok: result.status === 0, detail: `electron-rebuild 退出码 ${result.status}` };
}

/** 用锁文件互斥「检查+重建」；等待他轮释放期间反复探针，就绪即返（无需自己重建） */
function waitForAbiReady(label, electronBinary) {
  for (;;) {
    if (!existsSync(ABI_LOCK)) {
      try {
        // O_EXCL 原子创建：与其它进程竞争，只有一方能成功
        closeSync(openSync(ABI_LOCK, 'wx'));
        return true; // 拿到锁（此刻他轮刚好释放），由调用方走检查+重建
      } catch {
        // 竞争失败：他轮刚拿到锁，继续等
      }
    }
    // 持锁者可能已死（进程被杀），过期则清锁重试竞争
    try {
      if (Date.now() - statSync(ABI_LOCK).mtimeMs > ABI_LOCK_STALE_MS) {
        rmSync(ABI_LOCK, { force: true });
        console.warn(`[${label}] ABI 重建锁超过 ${ABI_LOCK_STALE_MS / 60000} 分钟未释放，已清除（持锁者可能已退出）`);
        continue;
      }
    } catch {
      /* 锁文件刚被释放/替换，继续轮询 */
    }
    const probe = probeUnderElectron(electronBinary);
    if (probe.ok) return false; // 他轮已重建完成，直接可用
    const detail = (probe.stderr ?? '').trim() || (probe.stdout ?? '').trim();
    console.log(`[${label}] 等待并发兄弟轮次重建 better-sqlite3 ABI…（${detail.slice(0, 80)}）`);
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},5000)']);
  }
}

/**
 * @returns {boolean} true 表示 Electron 下可加载 better-sqlite3
 */
export function ensureElectronSqliteAbi(label = 'smoke') {
  const electronBinary = require('electron');

  const first = probeUnderElectron(electronBinary);
  if (first.ok) return true;

  mkdirSync(join(process.cwd(), 'temp'), { recursive: true });
  const acquired = waitForAbiReady(label, electronBinary);
  if (!acquired) return true; // 等待期间兄弟轮次已完成重建

  try {
    console.log(`[${label}] better-sqlite3 不匹配 Electron ABI，开始重建：${first.detail}`);
    const rebuilt = runElectronRebuild();
    if (!rebuilt.ok) {
      console.error(`[${label}] electron-rebuild 失败：${rebuilt.detail}`);
      return false;
    }

    const second = probeUnderElectron(electronBinary);
    if (!second.ok) {
      console.error(`[${label}] 重建后仍无法加载 better-sqlite3：${second.detail}`);
      return false;
    }
    console.log(`[${label}] better-sqlite3 已按 Electron ABI 重建`);
    return true;
  } finally {
    rmSync(ABI_LOCK, { force: true });
  }
}
