/**
 * 渲染进程安全的环境变量读取。
 *
 * 渲染进程运行在浏览器上下文（sandbox + contextIsolation），没有 Node 的 process 全局：
 * Vite 打包时把 `process.env` 替换为 `{}`，但 dev 服务器不替换，直接访问会抛
 * ReferenceError。vitest/冒烟脚本在 Node 中运行时可正常读取。
 */

/** 读取字符串环境变量（已 trim），缺失或无 process 全局时返回 undefined */
export function readStringEnv(name: string): string | undefined {
  const raw = typeof process === 'undefined' ? undefined : process.env?.[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value.length > 0 ? value : undefined;
}

/** 读取正整数环境变量，无效或缺失时返回 undefined */
export function readPositiveIntEnv(name: string): number | undefined {
  const value = Number(readStringEnv(name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
