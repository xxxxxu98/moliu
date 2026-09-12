#!/usr/bin/env node
/**
 * 续写收束卷 runner：node scripts/storyflow-closeout.mjs <store.json> <from> <to>
 *
 * 与 storyflow-repair-empty.mjs 同构：Electron 作为 Node 跑 vitest（SQLite ABI
 * 与生产一致），测试文件按 MOLIU_CLOSEOUT_* 环境变量滚终卷蓝图并逐章补写。
 * 通道沿用 temp/continue-write.real.config.json（providerId 指定写作/裁判模型）。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { ensureElectronSqliteAbi } from './ensure-electron-sqlite-abi.mjs';

const [storeArg, fromArg, toArg] = process.argv.slice(2);
const from = Number(fromArg);
const to = Number(toArg);
if (!storeArg || !Number.isInteger(from) || !Number.isInteger(to) || to < from) {
  console.error('用法: node scripts/storyflow-closeout.mjs <project-store.json> <fromChapter> <toChapter>');
  process.exit(1);
}
const storePath = isAbsolute(storeArg) ? storeArg : resolve(process.cwd(), storeArg);
if (!existsSync(storePath)) {
  console.error(`store 不存在: ${storePath}`);
  process.exit(1);
}

// harness 配置：providerId 即写作/裁判通道
const configPath = resolve(process.cwd(), 'temp/continue-write.real.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (!config?.enabled) {
  console.error('temp/continue-write.real.config.json 未启用（enabled!=true）');
  process.exit(1);
}

if (!ensureElectronSqliteAbi('storyflow:closeout')) {
  console.error('[storyflow:closeout] SQLite 后端不可用，中止');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const vitestRunner = resolve(process.cwd(), 'scripts/electron-vitest-runner.mjs');
const result = spawnSync(
  electronBinary,
  [
    vitestRunner,
    'src/renderer/src/services/writing/__tests__/storyflow.closeout.test.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      REAL_AI: '1',
      MOLIU_CLOSEOUT_STORE: storePath,
      MOLIU_CLOSEOUT_FROM: String(from),
      MOLIU_CLOSEOUT_TO: String(to),
    },
  },
);
process.exit(result.status ?? 1);
