#!/usr/bin/env node
/**
 * 真 AI 续写冒烟：读 temp/continue-write.real.config.json
 * 默认 useAppDefaultProvider=true，自动用 App 默认模型（本机解密 Key）。
 *
 *   npm run smoke:continue-write:real
 *
 * 产物：
 * - temp/continue-write.real.summary.json
 * - temp/continue-write.real.steps.txt
 * - temp/ai-traces/continue-write-real-*.jsonl
 *
 * 跑完自动清理更早的轨迹（默认保留最近 3 次）。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { cleanupSmokeArtifacts } from './cleanup-smoke-artifacts.mjs';

process.env.REAL_AI = process.env.REAL_AI || '1';

const configPath = join(process.cwd(), 'temp', 'continue-write.real.config.json');
const examplePath = join(process.cwd(), 'temp', 'continue-write.real.config.example.json');

if (!existsSync(configPath)) {
  if (existsSync(examplePath)) {
    copyFileSync(examplePath, configPath);
    console.log(`已生成配置文件：${configPath}`);
    console.log('默认 useAppDefaultProvider=true（复用 App 默认模型）。也可手填 apiKey。');
  } else {
    console.error('缺少配置模板 temp/continue-write.real.config.example.json');
    process.exit(1);
  }
}

console.log(`[smoke:continue-write:real] config=${configPath}`);

// ---------- 清理上一轮产物，避免新旧混淆 ----------
// 单章产物：continue-write.real.{summary,steps,report}.*；trace 按时间戳命名不冲突。
cleanupSmokeArtifacts('smoke:continue-write:real', [], {
  prefixes: ['continue-write.real.'],
});

const result = spawnSync(
  'npm',
  [
    'run',
    'test',
    '--',
    '--run',
    'src/renderer/src/services/writing/__tests__/continueWrite.real.harness.test.ts',
    '-t',
    '第1章',
  ],
  { stdio: 'inherit', shell: true, env: process.env }
);

const cleanup = spawnSync('node', ['scripts/cleanup-continue-write-artifacts.mjs'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});
if ((cleanup.status ?? 1) !== 0) {
  console.warn('[smoke:continue-write:real] 产物清理未完全成功，可手动 npm run cleanup:continue-write-artifacts');
}

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
    console.log(`\n[smoke:continue-write:real] latest trace: ${files[0].full}`);
  }
}

const stepsPath = join(process.cwd(), 'temp', 'continue-write.real.steps.txt');
if (existsSync(stepsPath)) {
  console.log(`[smoke:continue-write:real] step dump: ${stepsPath}`);
}

const summaryPath = join(process.cwd(), 'temp', 'continue-write.real.summary.json');
if (existsSync(summaryPath)) {
  console.log(`[smoke:continue-write:real] summary: ${summaryPath}`);
}

process.exit(result.status ?? 1);
