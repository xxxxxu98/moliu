#!/usr/bin/env node
/**
 * 换模型评估标准化 harness（2026-10-12 ④）：把「converge §8 触发→评估换模型」
 * 从人工建议变成确定性步骤——固定 reg20 基准探测 + 统一对比表。
 *
 * 用法：
 *   node scripts/storyflow-model-probe.mjs probe <providerId> [--chapters 20] [--tag <tag>]
 *       跑基准探测：multi runner（固定章数/种子场景）→ triage → 摘要存
 *       temp/model-probes/<tag>.json（缺省 tag = providerId-日期）。
 *   node scripts/storyflow-model-probe.mjs table [--dir temp/model-probes] [--out <md>]
 *       汇总全部探测记录，输出对比表（md 落盘，控制台 ASCII 摘要）。
 *
 * 对比口径（列）：
 *   verdict / 章节 / 首过率 / 重写轮 / 读者章均 / 读者最低 / 大纲分 / 红签名数 /
 *   scene-draft p50 延迟 / 墙钟分钟。读者分数跨口径不可比时表内标注口径版本。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROBES_DIR = join(repoRoot, 'temp/model-probes');

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/** 从 triage 报告行提取探测摘要（导出供测试） */
export function probeRecordFromTriage(tag, row, meta = {}) {
  return {
    schemaVersion: 'model-probe/v1',
    tag,
    at: new Date().toISOString(),
    providerId: row.providerId ?? null,
    model: row.model ?? null,
    verdict: row.verdict ?? null,
    chaptersAccepted: row.chaptersAccepted ?? null,
    wallMinutes: row.wallMinutes ?? null,
    firstPassRate: row.repairMetrics?.firstPassRate ?? null,
    averageRewriteRounds: row.repairMetrics?.averageRewriteRounds ?? null,
    readerChapterAverage: row.readerMetrics?.chapterAverage ?? null,
    readerChapterMinimum: row.readerMetrics?.chapterMinimum ?? null,
    readerOutlineScore: row.readerOutlineScore ?? null,
    readerEvalVersion: row.readerEvalVersion ?? null,
    redSignatures: (row.signatures ?? []).filter(sig => sig.severity === 'red').length,
    yellowSignatures: (row.signatures ?? []).filter(sig => sig.severity !== 'red').length,
    sceneDraftP50Ms: row.latency?.['scene-draft']?.p50Ms ?? null,
    ...meta,
  };
}

const pct = value => (typeof value === 'number' ? `${Math.round(value * 100)}%` : '-');
const num = value => (typeof value === 'number' ? String(value) : '-');

/** 生成对比表（markdown，导出供测试）。读者分数按 readerEvalVersion 分组标注可比性 */
export function buildComparisonTable(records) {
  const header = [
    '| tag | model | 判定 | 章节 | 首过率 | 重写轮 | 读者章均 | 读者最低 | 大纲分 | 红/黄签名 | 起草p50(ms) | 墙钟(min) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const rows = records.map(rec =>
    [
      `| ${rec.tag}`,
      `${rec.model ?? '?'}`,
      `${rec.verdict ?? '?'}`,
      `${rec.chaptersAccepted ?? '?'}`,
      `${pct(rec.firstPassRate)}`,
      `${num(rec.averageRewriteRounds)}`,
      `${num(rec.readerChapterAverage)}`,
      `${num(rec.readerChapterMinimum)}`,
      `${num(rec.readerOutlineScore)}`,
      `${rec.redSignatures ?? '-'}/${rec.yellowSignatures ?? '-'}`,
      `${num(rec.sceneDraftP50Ms)}`,
      `${num(rec.wallMinutes)} |`,
    ].join(' | ')
  );
  const calibers = [...new Set(records.map(rec => rec.readerEvalVersion).filter(Boolean))];
  const notes = [];
  if (calibers.length > 1) {
    notes.push(`> 注意：探测间读者评审口径不一致（${calibers.join(' vs ')}）——读者分数列不可跨行直接对比`);
  }
  const failSlow = records.filter(rec => typeof rec.firstPassRate === 'number' && rec.firstPassRate < 0.3);
  if (failSlow.length > 0) {
    notes.push(`> 首过率 <30%：${failSlow.map(rec => rec.tag).join('、')}（model-capability 嫌疑，对照 triage 的 verdict 再判）`);
  }
  return ['# 换模型评估对比表（reg20 基准探测）', '', ...header, ...rows, '', ...notes].join('\n') + '\n';
}

function loadRecords(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function runProbe(args) {
  const providerId = args.find(arg => !arg.startsWith('--'));
  if (!providerId) {
    console.error('用法: probe <providerId> [--chapters 20] [--tag tag]');
    process.exit(1);
  }
  const chapters = Number(argValue(args, '--chapters') ?? 20);
  const tag = argValue(args, '--tag') ?? `${providerId}-${new Date().toISOString().slice(5, 10).replace(/-/g, '')}`;
  const matrixDir = join(repoRoot, 'temp', `storyflow-matrix-probe-${tag}`);
  console.log(`[model-probe] 探测 ${providerId}（${chapters} 章）→ ${relative(repoRoot, matrixDir)}`);
  const run = spawnSync('node', [join(repoRoot, 'scripts/agent-storyflow-real-multi.mjs'), providerId], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: { ...process.env, MOLIU_CHAPTER_COUNT: String(chapters), MOLIU_STORYFLOW_MATRIX_DIR: matrixDir },
  });
  if (run.status !== 0) {
    console.error(`[model-probe] 探测跑失败 exit=${run.status}（记录仍尝试提取，triage 可能给出 infra 判定）`);
  }
  const triage = spawnSync('node', [join(repoRoot, 'scripts/storyflow-triage.mjs')], {
    stdio: 'inherit',
    cwd: repoRoot,
    env: { ...process.env, MOLIU_STORYFLOW_MATRIX_DIR: matrixDir },
  });
  const latestPath = join(repoRoot, 'temp/storyflow-triage/latest.json');
  if (!existsSync(latestPath)) {
    console.error('[model-probe] triage 未产出 latest.json，中止记录');
    process.exit(1);
  }
  void triage;
  const report = JSON.parse(readFileSync(latestPath, 'utf8'));
  const row = (report.providers ?? [])[0];
  if (!row) {
    console.error('[model-probe] triage 报告无 provider 行，中止记录');
    process.exit(1);
  }
  mkdirSync(PROBES_DIR, { recursive: true });
  const record = probeRecordFromTriage(tag, row, { chapters, matrixDir: relative(repoRoot, matrixDir) });
  const outPath = join(PROBES_DIR, `${tag}.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf8');
  console.log(`[model-probe] record -> ${relative(repoRoot, outPath)}`);
  console.log(`[model-probe] verdict=${record.verdict} firstPass=${pct(record.firstPassRate)} red=${record.redSignatures}`);
}

function runTable(args) {
  const dir = resolve(argValue(args, '--dir') ?? PROBES_DIR);
  const records = loadRecords(dir);
  if (records.length === 0) {
    console.error(`[model-probe] 无探测记录：${dir}`);
    process.exit(1);
  }
  const table = buildComparisonTable(records);
  const outPath = resolve(argValue(args, '--out') ?? join(dir, 'COMPARISON.md'));
  writeFileSync(outPath, table, 'utf8');
  console.log(`[model-probe] probes=${records.length} -> ${relative(repoRoot, outPath)}`);
  for (const rec of records) {
    console.log(
      `  ${rec.tag} ${rec.model ?? '?'} verdict=${rec.verdict} firstPass=${pct(rec.firstPassRate)} red=${rec.redSignatures ?? '-'}`
    );
  }
}

const [command, ...rest] = process.argv.slice(2);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  if (command === 'probe') runProbe(rest);
  else if (command === 'table') runTable(rest);
  else {
    console.error('usage: storyflow-model-probe.mjs <probe <providerId> [--chapters N] [--tag t] | table [--dir d] [--out f]>');
    process.exit(2);
  }
}
