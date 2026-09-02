#!/usr/bin/env node
/**
 * 真 AI 多章续写冒烟：与正式批量续写对齐（BATCH_CONTINUE_PRESET）
 *
 *   npm run smoke:continue-write:real:multi
 *
 * 配置：temp/continue-write.real.config.json
 * - chapterNumber：起始章（默认 1）
 * - chapterCount：连续章数（默认 20；也可用 MOLIU_CHAPTER_COUNT）
 *
 * 跑前清本轮冒烟自己的全部产物与 trace（不保留历史，避免新旧混淆误判）。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { cleanupSmokeArtifacts } from './cleanup-smoke-artifacts.mjs';

process.env.REAL_AI = process.env.REAL_AI || '1';
process.env.REAL_AI_MULTI = process.env.REAL_AI_MULTI || '1';
if (!process.env.MOLIU_CHAPTER_COUNT) {
  process.env.MOLIU_CHAPTER_COUNT = '20';
}

const configPath = join(process.cwd(), 'temp', 'continue-write.real.config.json');
const examplePath = join(process.cwd(), 'temp', 'continue-write.real.config.example.json');

if (!existsSync(configPath)) {
  if (existsSync(examplePath)) {
    copyFileSync(examplePath, configPath);
    console.log(`已生成配置文件：${configPath}`);
  } else {
    console.error('缺少配置模板 temp/continue-write.real.config.example.json');
    process.exit(1);
  }
}

console.log(
  `[smoke:continue-write:real:multi] config=${configPath} chapterCount=${process.env.MOLIU_CHAPTER_COUNT}`
);

// ---------- 清理上一轮产物与 trace，避免新旧混淆 ----------
// 与单章脚本同策略：产物按前缀清（含 .bak），trace 跑前全清本轮冒烟自己的。
// keepNames：配置文件与模板不能删。
cleanupSmokeArtifacts(
  'smoke:continue-write:real:multi',
  [],
  {
    prefixes: ['continue-write.real.'],
    tracePrefixes: ['continue-write-real-', 'continue-write-harness'],
    keepNames: new Set([
      'continue-write.real.config.json',
      'continue-write.real.config.example.json',
    ]),
  },
);

const result = spawnSync(
  'npm',
  [
    'run',
    'test',
    '--',
    '--run',
    'src/renderer/src/services/writing/__tests__/continueWrite.real.harness.test.ts',
    '-t',
    'BATCH_CONTINUE',
  ],
  { stdio: 'inherit', shell: true, env: process.env }
);

const traceDir = join(process.cwd(), 'temp', 'ai-traces');
if (existsSync(traceDir)) {
  const files = readdirSync(traceDir)
    .filter(name => name.includes('continue-write-real') && name.endsWith('.jsonl'))
    .map(name => {
      const full = join(traceDir, name);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (files[0]) {
    console.log(`\n[smoke:continue-write:real:multi] latest trace: ${files[0].full}`);
  }
}

const multiSummary = join(process.cwd(), 'temp', 'continue-write.real.multi.summary.json');
if (existsSync(multiSummary)) {
  console.log(`[smoke:continue-write:real:multi] summary: ${multiSummary}`);
}
const multiSteps = join(process.cwd(), 'temp', 'continue-write.real.multi.steps.txt');
if (existsSync(multiSteps)) {
  console.log(`[smoke:continue-write:real:multi] step dump: ${multiSteps}`);
}

process.exit(result.status ?? 1);
