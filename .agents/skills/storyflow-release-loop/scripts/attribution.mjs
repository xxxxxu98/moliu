#!/usr/bin/env node
/**
 * 归因四分诊自动化（2026-10-12 ③）：新 findings 的 S1/S2 按分类检索历史修法表，
 * 旧签名直接命中已知修法/已知复发形态，只把新签名升级给 AI/人工。
 *
 * 用法：
 *   node attribution.mjs <findings.json> [--ledger <findings目录>] [--patterns <fix-patterns.json>]
 * 报告落 temp/findings-ledger/<round>.attribution.md；控制台只打 ASCII 摘要。
 *
 * 三态判定：
 *   recurred-after-fix  该类有历史修法仍复发——换机制而非再加补丁（§8 候选）
 *   first-appearance    该类此前未出现过——先检索已知修法为何未生效（复用优先）
 *   novel-class         分类表外/无修法记录——新签名，升级 AI 归因；修复后登记 fix-patterns
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FINDING_CLASSES } from './findings-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const DEFAULT_LEDGER_DIR = join(repoRoot, 'docs/quality-ledger/findings');
const DEFAULT_PATTERNS = join(repoRoot, 'docs/quality-ledger/fix-patterns.json');
const OUT_DIR = join(repoRoot, 'temp/findings-ledger');

/** 读修法表并做完整性校验（分类必须在固定表内） */
export function loadFixPatterns(patternsPath) {
  const raw = JSON.parse(readFileSync(patternsPath, 'utf8'));
  if (raw.schemaVersion !== 'fix-patterns/v1') throw new Error(`fix-patterns schema 版本不符：${raw.schemaVersion}`);
  const map = new Map();
  for (const pattern of raw.patterns ?? []) {
    if (!(pattern.class in FINDING_CLASSES)) {
      throw new Error(`fix-patterns 含未知分类：${pattern.class}`);
    }
    map.set(pattern.class, pattern);
  }
  return map;
}

/** 取某轮终稿 S1/S2 的分类集合 */
function blockingClassesOf(doc) {
  return new Set(
    (doc.findings ?? [])
      .filter(f => (f.severity === 'S1' || f.severity === 'S2') && f.status === 'final')
      .map(f => f.class)
  );
}

/**
 * 归因三态判定（导出供测试）。
 * @param {object} targetDoc 本轮 findings 文档
 * @param {object[]} priorDocs 按时间升序的历史轮文档（不含本轮）
 * @param {Map} patterns fix-patterns 表
 */
export function attributeFindings(targetDoc, priorDocs, patterns) {
  const priorClasses = new Set(priorDocs.flatMap(doc => [...blockingClassesOf(doc)]));
  const rows = [];
  for (const finding of targetDoc.findings ?? []) {
    if (!((finding.severity === 'S1' || finding.severity === 'S2') && finding.status === 'final')) continue;
    const pattern = patterns.get(finding.class);
    const id = `${targetDoc.round}-${finding.id}`;
    if (!pattern) {
      rows.push({
        id, cls: finding.class, severity: finding.severity,
        verdict: 'novel-class', fixes: [], suggestedRootLayers: ['unknown'],
        advice: '无历史修法记录：新签名，升级 AI 归因；修复落地后必须登记 fix-patterns.json',
      });
      continue;
    }
    const lastFix = pattern.fixes[pattern.fixes.length - 1];
    if (priorClasses.has(finding.class)) {
      rows.push({
        id, cls: finding.class, severity: finding.severity,
        verdict: 'recurred-after-fix', fixes: pattern.fixes,
        suggestedRootLayers: pattern.expectedRootLayers,
        lastFix,
        advice: `该类已有 ${pattern.fixes.length} 个历史修法仍复发（最近修法：${lastFix.round} ${lastFix.mechanism.slice(0, 40)}…）——换机制而非再加补丁（converge §8 候选）`,
      });
    } else {
      rows.push({
        id, cls: finding.class, severity: finding.severity,
        verdict: 'first-appearance', fixes: pattern.fixes,
        suggestedRootLayers: pattern.expectedRootLayers,
        lastFix,
        advice: `该类首次出现：先核对已有修法（${pattern.fixes.length} 个）为何未覆盖本形态，复用优先于新造`,
      });
    }
  }
  return rows;
}

export function renderAttributionReport(doc, rows) {
  const byVerdict = { 'recurred-after-fix': [], 'first-appearance': [], 'novel-class': [] };
  for (const row of rows) byVerdict[row.verdict]?.push(row);
  const lines = [
    `# ${doc.round} 《${doc.book ?? '?'}》归因四分诊（历史修法检索）`,
    '',
    `> 由 attribution.mjs 从 fix-patterns.json 计算；rootLayer 建议是检索结论，最终归因仍以通读证据为准。`,
    '',
    `## 摘要：复发待换机制 ${byVerdict['recurred-after-fix'].length} ｜ 首现查修法 ${byVerdict['first-appearance'].length} ｜ 新签名升级 ${byVerdict['novel-class'].length}`,
    '',
  ];
  for (const [verdict, label] of [
    ['recurred-after-fix', '复发待换机制（§8 候选）'],
    ['first-appearance', '首现——先查已有修法为何未生效'],
    ['novel-class', '新签名——升级 AI 归因'],
  ]) {
    if (byVerdict[verdict].length === 0) continue;
    lines.push(`## ${label}`, '');
    for (const row of byVerdict[verdict]) {
      lines.push(`- **${row.id}**（${row.severity} ${row.cls}｜建议根因层：${row.suggestedRootLayers.join('/')}）：${row.advice}`);
      for (const fix of row.fixes) {
        lines.push(`  - 历史 ${fix.round}：${fix.mechanism}（${fix.modules.map(m => m.split('/').pop()).join(', ')}）`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error('用法: attribution.mjs <findings.json> [--ledger dir] [--patterns fix-patterns.json]');
    process.exit(1);
  }
  const doc = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const ledgerDir = resolve(argValue(flags, '--ledger') ?? DEFAULT_LEDGER_DIR);
  const patterns = loadFixPatterns(resolve(argValue(flags, '--patterns') ?? DEFAULT_PATTERNS));
  const priorDocs = existsSync(ledgerDir)
    ? readdirSync(ledgerDir)
        .filter(name => name.endsWith('.json'))
        .map(name => JSON.parse(readFileSync(join(ledgerDir, name), 'utf8')))
        .filter(item => item.round !== doc.round)
        .sort((a, b) => String(a.reviewedAt).localeCompare(String(b.reviewedAt)))
    : [];
  const rows = attributeFindings(doc, priorDocs, patterns);
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${doc.round ?? basename(file, '.json')}.attribution.md`);
  writeFileSync(outPath, renderAttributionReport(doc, rows), 'utf8');
  const counts = { 'recurred-after-fix': 0, 'first-appearance': 0, 'novel-class': 0 };
  for (const row of rows) counts[row.verdict] += 1;
  console.log(
    `[attribution] recurred=${counts['recurred-after-fix']} first=${counts['first-appearance']} novel=${counts['novel-class']} total=${rows.length}`
  );
  console.log(`[attribution] report: ${outPath}`);
}
