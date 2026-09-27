#!/usr/bin/env node
/**
 * 读者评审补测 runner：node scripts/storyflow-reader-reeval.mjs <project-store.json> [--step N] [--outline]
 *
 * 背景（2026-09-23 g38f 500ch 实证）：生成轮读者评审环节整段死于网关限流冷却
 * （reader-chapter-judge 500 次全部 503 秒拒），四指标（章均/中位/最低/大纲）
 * 无数据也无补测入口。本工具对既有书离线重跑读者评审：
 *   - 逐章 evaluateChapter（ReaderQualityJudge 同口径 reader-eval-v1）
 *   - 断点续跑：已评章写进 jsonl 后跳过（同 repair-empty 逐章落盘哲学）
 *   - --step N 抽样（默认 1 全量）；--outline 追加大纲评审
 *   - 汇总输出章均/中位/最低/p10/弃读数，对照硬门禁 85/86/65
 * 与 repair-empty 不同：本链路不触 SQLite（只读 store JSON + AI 调用），无需
 * Electron ABI 对齐，直接走 vitest CLI（2026-09-24 实证：Electron vitest runner
 * 对本文件报 MODULE_TYPELESS/ERR_MODULE_NOT_FOUND——Node 原生直载 .ts 且
 * 无扩展名相对导入解析失败；vitest CLI resolver 正常）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve, basename } from 'node:path';

const [storeArg, ...flags] = process.argv.slice(2);
if (!storeArg) {
  console.error('用法: node scripts/storyflow-reader-reeval.mjs <project-store.json> [--step N] [--outline]');
  process.exit(1);
}
const storePath = isAbsolute(storeArg) ? storeArg : resolve(process.cwd(), storeArg);
if (!existsSync(storePath)) {
  console.error(`store 不存在: ${storePath}`);
  process.exit(1);
}
const step = (() => {
  const i = flags.indexOf('--step');
  const v = i >= 0 ? Number(flags[i + 1]) : 1;
  return Number.isInteger(v) && v > 0 ? String(v) : '1';
})();
const withOutline = flags.includes('--outline') ? '1' : '0';
const outPath = resolve(process.cwd(), 'temp/reader-reeval', `${basename(storePath).replace(/\.json$/, '')}-${new Date().toISOString().slice(5, 10).replace(/-/g, '')}.jsonl`);

const vitestBin = resolve(process.cwd(), 'node_modules/vitest/vitest.mjs');
const result = spawnSync(
  process.execPath,
  [vitestBin, 'run', 'src/renderer/src/services/writing/__tests__/storyflow.reader-reeval.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      REAL_AI: '1',
      MOLIU_REEVAL_STORE: storePath,
      MOLIU_REEVAL_STEP: step,
      MOLIU_REEVAL_OUTLINE: withOutline,
      MOLIU_REEVAL_OUT: outPath,
    },
  },
);
process.exit(result.status ?? 1);
