#!/usr/bin/env node
/** 运行读者评审质量变异真实冒烟（Electron Node + Vitest）。 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');
const runner = join(process.cwd(), 'scripts', 'electron-vitest-runner.mjs');
const result = spawnSync(
  electronBinary,
  [runner, 'src/renderer/src/services/story-runtime/__tests__/readerQualityCanary.real.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', REAL_AI: '1' },
  }
);
process.exit(result.status ?? 1);
