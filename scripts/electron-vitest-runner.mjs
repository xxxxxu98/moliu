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
  process.exitCode = 1;
} else {
  process.exitCode = context.state.getCountOfFailedTests() > 0 ? 1 : 0;
}
