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
import { createRequire } from 'node:module';

import { cleanupSmokeArtifacts } from './cleanup-smoke-artifacts.mjs';
import { ensureElectronSqliteAbi } from './ensure-electron-sqlite-abi.mjs';
import {
  sanitizeRunSuffix,
  smokeCleanupConfig,
  storyflowArtifactNames,
} from './storyflow-run-suffix.mjs';

process.env.REAL_AI = process.env.REAL_AI || '1';

console.log('[smoke:storyflow:real] 真实 AI 闭环：大纲生成 → 应用 → 批量续写');

// ---------- 清理上一轮产物与 trace，避免新旧混淆 ----------
// 产物：temp/ 下的 storyflow.closed-loop.* 大纲/summary/prose；storyflow-*（横杠）是
// harness installFileElectronAPI 每轮写的 project-store 模拟主进程存储（含正文，数百 KB/轮），
// 不清会无限累积；顺带覆盖 storyflow-run*.log 等历史调试日志。
// trace：temp/ai-traces/ 下 storyflow-*（本轮冒烟自己的，不碰 continue-write/topic 等）。
// 并发矩阵（MOLIU_RUN_SUFFIX）：清理只匹配本轮后缀，绝不触碰并发中的兄弟轮次。
const runSuffix = sanitizeRunSuffix(process.env.MOLIU_RUN_SUFFIX);
if (runSuffix) {
  console.log(`[smoke:storyflow:real] 矩阵并发模式：runSuffix=${runSuffix}（产物/清理均按后缀隔离）`);
}
const cleanupCfg = smokeCleanupConfig(runSuffix);
cleanupSmokeArtifacts('smoke:storyflow:real', cleanupCfg.artifacts, {
  prefixes: cleanupCfg.prefixes,
  tracePrefixes: cleanupCfg.tracePrefixes,
});

// better-sqlite3 必须按 Electron ABI 编译。普通系统 Node 跑 Vitest 会因
// NODE_MODULE_VERSION 不同而假失败并降级内存；这里让 Electron 作为 Node 运行 Vitest，
// 与生产桌面进程加载同一 native 模块，真实验证 SQLite。
// `npm test` 的 pretest 会把它按系统 Node 重编译，所以每轮冒烟前都先探针 + 必要时重建，
// 否则要等一小时后的 runtimeBackend 断言才发现整轮跑在内存后端上。
if (!ensureElectronSqliteAbi('smoke:storyflow:real')) {
  console.error('[smoke:storyflow:real] SQLite 后端不可用，中止（真实持久化无法验证）');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const vitestRunner = join(process.cwd(), 'scripts', 'electron-vitest-runner.mjs');
const result = spawnSync(
  electronBinary,
  [
    vitestRunner,
    'src/renderer/src/services/writing/__tests__/storyflow.closed-loop.test.ts',
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  },
);

const artifactNames = storyflowArtifactNames(runSuffix);
const summary = join(process.cwd(), 'temp', artifactNames.summary);
if (existsSync(summary)) {
  console.log(`[smoke:storyflow:real] summary: ${summary}`);
}
const traceDir = join(process.cwd(), 'temp', 'ai-traces');
if (existsSync(traceDir)) {
  // 并发矩阵只认本轮后缀的 trace；单跑认全部 storyflow-*
  const traceFilter = runSuffix
    ? (name => name.startsWith(`storyflow-${runSuffix}-`) && name.endsWith('.jsonl'))
    : (name => name.includes('storyflow') && name.endsWith('.jsonl'));
  const files = readdirSync(traceDir)
    .filter(traceFilter)
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
