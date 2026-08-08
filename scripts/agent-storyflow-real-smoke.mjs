#!/usr/bin/env node
/**
 * Storyflow 闭环真实 AI 冒烟：开题中心大纲生成 → 应用 → 批量续写
 *
 *   npm run smoke:storyflow:real
 *
 * 走真实 AI 请求（复用 temp/continue-write.real.config.json 的 App 默认 AI 配置）：
 * 1. 大纲生成：UnifiedOutlineGenerator.generateDirections → expandDirection（与开题中心 prompt 玩法同路径）
 * 2. 应用大纲：useProjectCreator.createProject（真实 buildPlotOutline 等构建链）
 * 3. 建章：useChapterOutlineGenerator.createChapters
 * 4. 批量续写：runContinueWriteChapters（BATCH_CONTINUE，与 useBatchWriter 同路径）
 *
 * 产物：
 * - temp/storyflow.closed-loop.summary.json
 * - temp/ai-traces/storyflow-*.jsonl
 *
 * 跑前清本轮冒烟自己的全部产物与 trace（不保留历史，避免新旧混淆误判）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { cleanupSmokeArtifacts } from './cleanup-smoke-artifacts.mjs';

process.env.REAL_AI = process.env.REAL_AI || '1';

console.log('[smoke:storyflow:real] 真实 AI 闭环：大纲生成 → 应用 → 批量续写');

// ---------- 清理上一轮产物与 trace，避免新旧混淆 ----------
// 产物：temp/ 下 storyflow.closed-loop.* 的 outline/summary/prose 及带后缀的 .bak 孪生产物；
// trace：temp/ai-traces/ 下 storyflow-*（本轮冒烟自己的，不碰 continue-write/topic 等）。
cleanupSmokeArtifacts(
  'smoke:storyflow:real',
  [
    'storyflow.closed-loop.outline.json',
    'storyflow.closed-loop.summary.json',
    'storyflow.closed-loop.prose',
  ],
  {
    prefixes: ['storyflow.closed-loop.'],
    tracePrefixes: ['storyflow-'],
  },
);

const result = spawnSync(
  'npm',
  [
    'run',
    'test',
    '--',
    '--run',
    'src/renderer/src/services/writing/__tests__/storyflow.closed-loop.test.ts',
  ],
  { stdio: 'inherit', shell: true, env: process.env }
);

const summary = join(process.cwd(), 'temp', 'storyflow.closed-loop.summary.json');
if (existsSync(summary)) {
  console.log(`[smoke:storyflow:real] summary: ${summary}`);
}
const traceDir = join(process.cwd(), 'temp', 'ai-traces');
if (existsSync(traceDir)) {
  const files = readdirSync(traceDir)
    .filter(name => name.includes('storyflow') && name.endsWith('.jsonl'))
    .map(name => {
      const full = join(traceDir, name);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (files[0]) {
    console.log(`[smoke:storyflow:real] latest trace: ${files[0].full}`);
  }
}

process.exit(result.status ?? 1);
