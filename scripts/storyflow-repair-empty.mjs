#!/usr/bin/env node
/**
 * 空章补写 runner：node scripts/storyflow-repair-empty.mjs <store.json> <36,184>
 *
 * 与 agent-storyflow-real-smoke.mjs 同构：Electron 作为 Node 跑 vitest（SQLite ABI
 * 与生产一致），测试文件按 MOLIU_REPAIR_* 环境变量定点补写并落盘。
 * 通道沿用 temp/continue-write.real.config.json（providerId 指定写作/裁判模型）。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { ensureElectronSqliteAbi } from './ensure-electron-sqlite-abi.mjs';

const [storeArg, chaptersArg] = process.argv.slice(2);
if (!storeArg || !chaptersArg) {
  console.error('用法: node scripts/storyflow-repair-empty.mjs <project-store.json> <章号[,章号...]>');
  process.exit(1);
}
const storePath = isAbsolute(storeArg) ? storeArg : resolve(process.cwd(), storeArg);
if (!existsSync(storePath)) {
  console.error(`store 不存在: ${storePath}`);
  process.exit(1);
}

// harness 配置：providerId 即写作/裁判通道；缺失或未启用则从 example 结构重建
const configPath = resolve(process.cwd(), 'temp/continue-write.real.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!config?.enabled) {
  console.error('temp/continue-write.real.config.json 未启用（enabled!=true）');
  process.exit(1);
}

if (!ensureElectronSqliteAbi('storyflow:repair-empty')) {
  console.error('[storyflow:repair-empty] SQLite 后端不可用，中止');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const vitestRunner = resolve(process.cwd(), 'scripts/electron-vitest-runner.mjs');
const result = spawnSync(
  electronBinary,
  [
    vitestRunner,
    'src/renderer/src/services/writing/__tests__/storyflow.repair-empty.test.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      REAL_AI: '1',
      MOLIU_REPAIR_STORE: storePath,
      MOLIU_REPAIR_CHAPTERS: chaptersArg,
    },
  },
);
process.exit(result.status ?? 1);
