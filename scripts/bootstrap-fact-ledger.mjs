#!/usr/bin/env node
/**
 * 老书事实台账 bootstrap 入口：npm run bootstrap:fact-ledger
 * 环境变量：
 *   MOLIU_BOOTSTRAP_PROJECT=<书名或项目ID>   目标书籍（缺省用 continue-write.real.config.json 的项目）
 *   MOLIU_AI_PROVIDER_ID / MOLIU_AI_*        AI 配置（缺省用 App 默认模型）
 * 产物：temp/bootstrap-ledger.summary.json；moliu-projects.json 先备份再回写。
 */
import { spawnSync } from 'node:child_process';

process.env.REAL_AI = process.env.REAL_AI || '1';
process.env.MOLIU_BOOTSTRAP_LEDGER = '1';

const result = spawnSync(
  'npm',
  ['run', 'test', '--', '--run', 'src/renderer/src/services/writing/__tests__/numericLedger.bootstrap.harness.test.ts'],
  { stdio: 'inherit', shell: true, env: process.env }
);
process.exit(result.status ?? 0);
