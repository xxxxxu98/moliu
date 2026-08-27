#!/usr/bin/env node
/**
 * better-sqlite3 双 ABI 编译脚本。
 *
 * 背景：Electron 主进程（ABI 145）与 vitest / 系统 Node 22（ABI 127）需要
 * 各自编译的 better_sqlite3.node，Windows 下已加载的 .node 文件被锁定、无法在
 * App 运行期间替换。本脚本把两个 ABI 各编译一份放进仓库 prebuilds/ 目录：
 *
 *   prebuilds/better-sqlite3/<abi>/better_sqlite3.node
 *
 * 运行时由 src/main/services/story-runtime/sqliteNativeBinding.ts 按当前
 * process.versions.modules 显式加载（new Database(path, { nativeBinding })），
 * node_modules/build/Release 保持最近一次 npm install/rebuild 的状态不动。
 *
 * 编译链路：优先 prebuild-install 拉官方预编译二进制（秒级）；失败回退
 * 项目内 @electron/node-gyp 从源码编译。
 *
 * 用法：node scripts/rebuild-better-sqlite3.mjs [--abi 127 --abi 145]
 *       无参数时默认编译 [系统 Node ABI, Electron ABI] 两份。
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleDir = path.join(repoRoot, 'node_modules', 'better-sqlite3');
const releaseBinary = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');
const prebuildsDir = path.join(repoRoot, 'prebuilds', 'better-sqlite3');
const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));

/** electron 包版本对应的 ABI（借依赖树里的 node-abi 映射表） */
function resolveElectronAbi() {
  const electronVersion = JSON.parse(
    readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
  const abiCandidates = [
    'node-abi',
    '@electron/node-gyp/node_modules/node-abi',
  ];
  for (const candidate of abiCandidates) {
    try {
      return {
        version: electronVersion,
        abi: Number(requireFromRepo(candidate).getAbi(electronVersion, 'electron')),
      };
    } catch {
      // 尝试下一个候选
    }
  }
  throw new Error('无法解析 Electron 的 ABI：找不到可用的 node-abi。请显式传 --abi。');
}

const args = process.argv.slice(2);
const requestedAbis = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--abi') {
    requestedAbis.push(Number(args[i + 1]));
    i += 1;
  }
}
if (requestedAbis.length === 0) {
  requestedAbis.push(
    Number(process.versions.modules), // 系统 Node（vitest）
    resolveElectronAbi().abi,         // Electron（App 主进程）
  );
}
const uniqueAbis = [...new Set(requestedAbis.filter(Number.isFinite))];

console.log(`[rebuild-better-sqlite3] 目标 ABI：${uniqueAbis.join(', ')}`);
mkdirSync(prebuildsDir, { recursive: true });

const electronInfo = (() => {
  try {
    return resolveElectronAbi();
  } catch {
    return null;
  }
})();

for (const abi of uniqueAbis) {
  console.log(`\n===== 编译 ABI ${abi} =====`);
  const isElectronAbi =
    electronInfo !== null && abi === electronInfo.abi && abi !== Number(process.versions.modules);
  const runtime = isElectronAbi ? 'electron' : 'node';
  const target = isElectronAbi ? electronInfo.version : process.versions.node;

  // 官方预编译二进制优先（prebuild-install 按 better-sqlite3 包内配置下载）
  let fetched = false;
  if (existsSync(path.join(moduleDir, 'node_modules', '.bin', 'prebuild-install.cmd')) ||
      existsSync(path.join(repoRoot, 'node_modules', 'prebuild-install'))) {
    try {
      execFileSync(
        process.execPath,
        [
          path.join(repoRoot, 'node_modules', 'prebuild-install', 'bin.js'),
          '--runtime', runtime,
          '--target', target,
          '--verbose',
        ],
        { cwd: moduleDir, stdio: 'inherit' },
      );
      fetched = true;
    } catch (error) {
      console.warn(`[rebuild-better-sqlite3] ABI ${abi} 预编译下载失败，回退源码编译：${error.message}`);
    }
  }

  if (!fetched) {
    // 源码编译：清理后用项目内 node-gyp；Electron 目标走 electron 头文件
    rmSync(path.join(moduleDir, 'build'), { recursive: true, force: true });
    const gypJs = path.join(repoRoot, 'node_modules', '@electron', 'node-gyp', 'bin', 'node-gyp.js');
    const env = { ...process.env };
    if (isElectronAbi) {
      env.npm_config_runtime = 'electron';
      env.npm_config_target = String(target);
      env.npm_config_disturl = 'https://electronjs.org/headers';
    }
    execFileSync(process.execPath, [gypJs, 'rebuild', '--release'], {
      cwd: moduleDir,
      stdio: 'inherit',
      env,
    });
  }

  if (!existsSync(releaseBinary)) {
    throw new Error(`ABI ${abi} 编译完成但未找到产物：${releaseBinary}`);
  }

  const destDir = path.join(prebuildsDir, String(abi));
  mkdirSync(destDir, { recursive: true });
  cpSync(releaseBinary, path.join(destDir, 'better_sqlite3.node'));
  console.log(`[rebuild-better-sqlite3] ABI ${abi}（${runtime} ${target}）→ ${destDir}`);
}

console.log('\n[rebuild-better-sqlite3] 完成。App 与 vitest 现在各自加载 prebuilds/ 下的对应版本。');
console.log('[rebuild-better-sqlite3] 提示：建议把 prebuilds/better-sqlite3/ 加入 .gitignore（构建产物不入库）。');
