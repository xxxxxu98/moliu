#!/usr/bin/env node
/**
 * Agent 续写自测入口：跑 harness，失败时打印最新 ai-trace 路径。
 * 用法：node scripts/agent-continue-write-smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const result = spawnSync(
  'npm',
  [
    'run',
    'test',
    '--',
    '--run',
    'src/renderer/src/services/writing/__tests__/continueWrite.harness.test.ts',
  ],
  { stdio: 'inherit', shell: true }
);

const traceDir = join(process.cwd(), 'temp', 'ai-traces');
if (existsSync(traceDir)) {
  const files = readdirSync(traceDir)
    .filter(name => name.endsWith('.jsonl'))
    .map(name => {
      const full = join(traceDir, name);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  if (files[0]) {
    console.log(`\n[agent-continue-write-smoke] latest trace: ${files[0].full}`);
  }
}

process.exit(result.status ?? 1);
