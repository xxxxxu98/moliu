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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

/**
 * @returns {boolean} true 表示 Electron 下可加载 better-sqlite3
 */
export function ensureElectronSqliteAbi(label = 'smoke') {
  const electronBinary = require('electron');

  const first = probeUnderElectron(electronBinary);
  if (first.ok) return true;

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
}
