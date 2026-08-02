#!/usr/bin/env node
/**
 * 开题中心真实 AI 冒烟：六模块真实链路（seeds/radar/mix/dice/twist/prompt）
 *
 *   npm run smoke:topic-discovery:real
 *
 * 与 smoke:continue-write:real:multi 同型：走真实 AI 请求（复用
 * temp/continue-write.real.config.json 的 App 默认 AI 配置），
 * 覆盖「种子/提示 → 方向 → 扩展大纲 → 应用映射」全链路，并做大纲质量断言
 * （开篇钩子长度、必出事件粒度、CBN/CEN 无「推进至」元指令等）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

process.env.REAL_AI = process.env.REAL_AI || '1';

console.log('[smoke:topic-discovery:real] 六模块真实链路（seeds/radar/mix/dice/twist/prompt）');

const result = spawnSync(
  'npm',
  [
    'run',
    'test',
    '--',
    '--run',
    'src/renderer/src/services/inspiration/__tests__/topicDiscovery.real.harness.test.ts',
    '-t',
    '开题中心 REAL AI',
  ],
  { stdio: 'inherit', shell: true, env: process.env }
);

const summary = join(process.cwd(), 'temp', 'topic-discovery.real.summary.json');
if (existsSync(summary)) {
  console.log(`[smoke:topic-discovery:real] summary: ${summary}`);
}

process.exit(result.status ?? 1);
