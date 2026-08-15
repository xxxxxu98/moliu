/**
 * 读取正整数环境变量，无效或缺失时返回 undefined。
 *
 * 渲染进程运行在浏览器上下文，没有 Node 的 process 全局，直接访问会抛
 * ReferenceError（模块加载即崩溃）；vitest/冒烟脚本在 Node 中运行时可正常读取。
 */
export function readPositiveIntEnv(name: string): number | undefined {
  const raw = typeof process === 'undefined' ? undefined : process.env?.[name];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
