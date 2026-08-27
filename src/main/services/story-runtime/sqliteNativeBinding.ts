/**
 * better-sqlite3 双 ABI 加载器。
 *
 * 问题背景（Windows 特有）：Electron 内置 Node 与系统 Node 的 ABI
 * （NODE_MODULE_VERSION）不同——本项目 Electron 41 → ABI 145，Node 22 → ABI 127。
 * node_modules 里只能存在一份 better_sqlite3.node：
 * - 按 Electron 编译后，vitest（系统 Node）加载即崩；
 * - 按系统 Node 编译后，App 启动即崩；且 App 运行期间文件被锁，
 *   Windows 禁止删除/覆盖已加载的 DLL，rebuild 必须先退出 App。
 *
 * 解决：`scripts/rebuild-better-sqlite3.mjs` 把两个 ABI 各编译一份放进
 * `prebuilds/better-sqlite3/<abi>/better_sqlite3.node`，本模块按当前运行时的
 * process.versions.modules 选择对应文件。加载方式有两条：
 * - vitest / 直接运行时：通过 `new Database(path, { nativeBinding })` 显式指定
 *   （better-sqlite3 原生支持该选项，无需 patch bindings 搜索路径）；
 * - 打包产物（forge.vite 打 main.js）：不注入 nativeBinding，走默认
 *   build/Release 加载——打包流程自带 electron-rebuild，ABI 天然正确。
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

/** 当前 Node 运行时的 ABI 版本号（Electron 主进程返回其内置 Node 的 ABI） */
export function currentNodeAbi(): string {
  return process.versions.modules;
}

/** 双份编译产物的根目录（仓库根/prebuilds/better-sqlite3） */
export function prebuildsRoot(): string {
  // vite 转换下 __dirname 指向源文件目录 src/main/services/story-runtime，
  // 上溯四级即仓库根。
  return path.resolve(__dirname, '..', '..', '..', '..', 'prebuilds', 'better-sqlite3');
}

/**
 * 解析当前 ABI 对应的 native binding 路径；不存在时返回 undefined
 * （调用方回退到默认加载路径——即 node_modules/build/Release 的那份）。
 */
export function resolveNativeBindingPath(rootDir?: string): string | undefined {
  const candidate = path.join(rootDir ?? prebuildsRoot(), currentNodeAbi(), 'better_sqlite3.node');
  return existsSync(candidate) ? candidate : undefined;
}
