#!/usr/bin/env node
/**
 * 在 Electron 的 Node ABI 中运行 Vitest，供依赖 Electron native addon 的真实 smoke 使用。
 */
import { startVitest } from 'vitest/node';

const filters = process.argv.slice(2);
const context = await startVitest('test', filters, {
  run: true,
  reporters: ['default'],
});

if (!context) {
  console.error('[electron-vitest-runner] Vitest 启动失败');
  process.exit(1);
} else {
  const exitCode = context.state.getCountOfFailedTests() > 0 ? 1 : 0;
  // 真实 AI 冒烟会创建 SQLite、计时器和网络客户端等长生命周期句柄。
  // 仅设置 process.exitCode 会让 Electron/Vitest 在报告已结束后继续驻留，
  // 进而卡住外层矩阵的归档与 triage。startVitest 已在 run 模式关闭 worker；
  // 等 stdout/stderr 刷新后显式退出，避免吞掉最终测试报告。
  await new Promise(resolve => process.stdout.write('', resolve));
  await new Promise(resolve => process.stderr.write('', resolve));
  process.exit(exitCode);
}
