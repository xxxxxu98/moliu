#!/usr/bin/env node
/**
 * 书审 Findings 台账 CLI（release-loop 第 4/7 步的数据出口）。
 *
 * 用法：
 *   node findings-ledger.mjs validate <findings.json>
 *       校验 schema/分类/证据 + 从数据计算上线判定，报告落盘 temp/findings-ledger/
 *   node findings-ledger.mjs converge [--dir <findings目录>] [--out <CONVERGENCE.md>]
 *       汇总跨轮 findings，输出收敛矩阵 + 升级信号（默认 docs/quality-ledger/）
 *
 * 约束：控制台只打 ASCII 摘要（CMD 中文乱码），完整中文报告一律落盘 UTF-8 用 Read 读。
 * 台账目录在 docs/ 下入 git——temp/book-review 3 天裁剪，放那里跨轮收敛会断档。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FINDING_CLASSES,
  buildConvergenceMatrix,
  computeReleaseVerdict,
  countFindings,
  detectEscalationSignals,
  validateFindingsDoc,
} from './findings-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
/** 默认台账目录（入 git 的跨轮 findings 历史） */
const DEFAULT_LEDGER_DIR = join(repoRoot, 'docs/quality-ledger/findings');
const DEFAULT_CONVERGENCE_OUT = join(repoRoot, 'docs/quality-ledger/CONVERGENCE.md');
const VERDICT_OUT_DIR = join(repoRoot, 'temp/findings-ledger');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`读取 ${path} 失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/** 渲染单轮校验 + 判定报告（中文 markdown） */
export function renderVerdictReport(doc, validation, verdict) {
  const counts = countFindings(doc);
  const lines = [
    `# ${doc.round ?? '?'} 《${doc.book ?? '?'}》上线判定（由 findings 数据计算）`,
    '',
    `- 结论：**${verdict.ready ? 'READY' : 'NOT READY'}**`,
    `- 审法：${doc.review?.method ?? '未声明'}，通读 ${doc.review?.chaptersRead ?? '?'}/${doc.chapters ?? '?'} 章，独立审稿=${doc.review?.independentReviewer === true}`,
    `- 终稿计数：S1=${counts.S1} S2=${counts.S2} S3=${counts.S3} S4=${counts.S4}；待核实=${counts.needsVerify}；过程已兜住（不计）=${counts.caught}`,
    '',
    '## 阻断项',
    ...(verdict.blockers.length ? verdict.blockers.map(item => `- ${item}`) : ['- 无']),
    '',
    '## 提示',
    ...[...verdict.warnings, ...validation.warnings].map(item => `- ${item}`),
  ];
  if (validation.errors.length) {
    lines.push('', '## schema 错误（修正后再判定）', ...validation.errors.map(item => `- ${item}`));
  }
  return `${lines.join('\n')}\n`;
}

/** 渲染跨轮收敛报告（中文 markdown） */
export function renderConvergenceReport(docs, matrix, signals) {
  const header = ['分类', ...matrix.rounds].join(' | ');
  const divider = ['---', ...matrix.rounds.map(() => '---')].join(' | ');
  const rows = matrix.rows.map(row => {
    const cells = row.cells.map(cell => (cell.S1 || cell.S2 ? `${cell.S1}/${cell.S2}` : '·'));
    return [`${row.cls}（${FINDING_CLASSES[row.cls]}）`, ...cells].join(' | ');
  });
  const summary = docs.map(doc => {
    const counts = countFindings(doc);
    const verdict = computeReleaseVerdict(doc);
    return `| ${doc.round} | ${doc.book} | ${doc.chapters} | ${doc.review?.method ?? '?'} | ${counts.S1} | ${counts.S2} | ${verdict.ready ? 'READY' : `NOT READY（${verdict.blockers.length} 项阻断）`} |`;
  });
  return [
    '# 可上线大循环跨轮收敛表',
    '',
    '> 本文件由 `findings-ledger.mjs converge` 生成，勿手改。单元格为「终稿 S1/S2」计数，`·` 为 0。',
    '',
    '## 各轮概览',
    '',
    '| 轮次 | 书 | 章数 | 审法 | S1 | S2 | 计算判定 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...summary,
    '',
    '## 分类收敛矩阵',
    '',
    `| ${header} |`,
    `| ${divider} |`,
    ...rows.map(row => `| ${row} |`),
    '',
    '## 升级信号',
    '',
    ...(signals.length
      ? signals.map(signal => `- **${signal.kind}**：${signal.message}`)
      : ['- 无（继续按归因四分诊修复）']),
    '',
  ].join('\n');
}

/** 读取目录下全部 findings 文档并按 reviewedAt 升序 */
export function loadLedger(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => ({ name, doc: readJson(join(dir, name)) }))
    .sort((a, b) => String(a.doc.reviewedAt).localeCompare(String(b.doc.reviewedAt)));
}

function runValidate(args) {
  const file = args[0];
  if (!file) throw new Error('用法: findings-ledger.mjs validate <findings.json>');
  const doc = readJson(resolve(file));
  const validation = validateFindingsDoc(doc);
  const verdict = computeReleaseVerdict(doc);
  mkdirSync(VERDICT_OUT_DIR, { recursive: true });
  const outPath = join(VERDICT_OUT_DIR, `${basename(file, '.json')}.verdict.md`);
  writeFileSync(outPath, renderVerdictReport(doc, validation, verdict), 'utf8');
  const counts = countFindings(doc);
  console.log(
    `[findings] errors=${validation.errors.length} warnings=${validation.warnings.length} ` +
      `S1=${counts.S1} S2=${counts.S2} verify=${counts.needsVerify} ` +
      `ready=${verdict.ready} blockers=${verdict.blockers.length}`
  );
  console.log(`[findings] report: ${outPath}`);
  return validation.errors.length > 0 ? 1 : 0;
}

function runConverge(args) {
  const dir = resolve(argValue(args, '--dir') ?? DEFAULT_LEDGER_DIR);
  const out = resolve(argValue(args, '--out') ?? DEFAULT_CONVERGENCE_OUT);
  const entries = loadLedger(dir);
  if (entries.length === 0) throw new Error(`台账目录无 findings：${dir}`);
  const invalid = entries.filter(entry => validateFindingsDoc(entry.doc).errors.length > 0);
  if (invalid.length > 0) {
    throw new Error(`以下台账 schema 不合格，先 validate 修正：${invalid.map(entry => entry.name).join(', ')}`);
  }
  const docs = entries.map(entry => entry.doc);
  const matrix = buildConvergenceMatrix(docs);
  const signals = detectEscalationSignals(docs);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderConvergenceReport(docs, matrix, signals), 'utf8');
  console.log(`[findings] rounds=${docs.length} classes=${matrix.rows.length} signals=${signals.length}`);
  console.log(`[findings] signals: ${signals.map(signal => signal.kind).join(',') || 'none'}`);
  console.log(`[findings] report: ${out}`);
  return 0;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'validate') process.exit(runValidate(rest));
    if (command === 'converge') process.exit(runConverge(rest));
    console.error('usage: findings-ledger.mjs <validate <file> | converge [--dir d] [--out f]>');
    process.exit(2);
  } catch (error) {
    console.error(`[findings] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
