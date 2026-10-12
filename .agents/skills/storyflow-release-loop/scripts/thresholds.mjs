#!/usr/bin/env node
/**
 * 阈值有界自治 CLI（2026-10-12 ⑤）：读者裁判门禁的 提议→生效→台账 流程。
 *
 * SSOT 是 docs/quality-ledger/thresholds.json；findings-lib.resolveReaderJudgeGate
 * 优先读它。流程：
 *   show                       查看 active/pending/history
 *   propose --gate <k> --to <v> --evidence <text> [--approved-by <name>]
 *                              写 pending。|Δ|≤MAX_DELTA 且 ≥FLOOR → 自动可生效；
 *                              超出幅度须 --approved-by；低于 FLOOR 一律拒绝。
 *   apply [--approved-by <name>]
 *                              pending → active + history 台账（审计轨迹）。
 *   history                    打印变更史。
 * apply 后必须重跑：npm run findings:converge + 各历史轮 validate（判定随阈值重算）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  READER_JUDGE_GATE_FLOOR,
  READER_JUDGE_GATE_MAX_DELTA,
} from './findings-lib.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const THRESHOLDS_PATH = join(repoRoot, 'docs/quality-ledger/thresholds.json');
const GATES = ['outline', 'mean', 'median', 'min'];

function load() {
  const doc = JSON.parse(readFileSync(THRESHOLDS_PATH, 'utf8'));
  if (doc.schemaVersion !== 'thresholds/v1') throw new Error(`schema 版本不符：${doc.schemaVersion}`);
  return doc;
}

function save(doc) {
  writeFileSync(THRESHOLDS_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * 校验一次提议（导出供测试）。
 * @returns {{ errors: string[], autoEligible: boolean }}
 */
export function validateProposal(active, gate, to, approvedBy) {
  const errors = [];
  if (!GATES.includes(gate)) errors.push(`gate 非法：${gate}（${GATES.join('/')}）`);
  if (!Number.isFinite(to)) errors.push('--to 必须是数字');
  if (errors.length > 0) return { errors, autoEligible: false };
  const current = active[gate];
  const floor = READER_JUDGE_GATE_FLOOR[gate];
  if (to < floor) errors.push(`${gate}=${to} 低于硬下限 ${floor}，任何方式不得逾越`);
  else if (Math.abs(to - current) > READER_JUDGE_GATE_MAX_DELTA && !approvedBy) {
    errors.push(
      `|${to}-${current}|=${Math.abs(to - current).toFixed(1)} 超出自动幅度 ±${READER_JUDGE_GATE_MAX_DELTA}，须 --approved-by 人工批准`
    );
  }
  return { errors, autoEligible: errors.length === 0 };
}

function runShow() {
  const doc = load();
  const active = doc.active.readerJudge;
  console.log(`[thresholds] active readerJudge: outline=${active.outline} mean=${active.mean} median=${active.median} min=${active.min}`);
  console.log(`[thresholds] floor: outline=${READER_JUDGE_GATE_FLOOR.outline} mean=${READER_JUDGE_GATE_FLOOR.mean} median=${READER_JUDGE_GATE_FLOOR.median} min=${READER_JUDGE_GATE_FLOOR.min} (auto delta ±${READER_JUDGE_GATE_MAX_DELTA})`);
  if (doc.pending) {
    console.log(`[thresholds] pending: ${doc.pending.gate} ${doc.pending.from} -> ${doc.pending.to} (evidence: ${doc.pending.evidence})`);
  } else {
    console.log('[thresholds] pending: none');
  }
  console.log(`[thresholds] history entries: ${doc.history.length}`);
}

function runPropose(args) {
  const doc = load();
  if (doc.pending) throw new Error(`已有 pending（${doc.pending.gate} ${doc.pending.from}->${doc.pending.to}），先 apply 或手工清空`);
  const gate = argValue(args, '--gate');
  const to = Number(argValue(args, '--to'));
  const evidence = argValue(args, '--evidence');
  const approvedBy = argValue(args, '--approved-by');
  if (!gate || !Number.isFinite(to) || !evidence) {
    throw new Error('用法: propose --gate <k> --to <v> --evidence <text> [--approved-by name]');
  }
  const { errors, autoEligible } = validateProposal(doc.active.readerJudge, gate, to, approvedBy);
  if (errors.length > 0) throw new Error(errors.join('；'));
  doc.pending = {
    gate,
    from: doc.active.readerJudge[gate],
    to,
    evidence,
    ...(approvedBy ? { approvedBy } : {}),
    proposedAt: new Date().toISOString(),
  };
  save(doc);
  console.log(`[thresholds] proposed readerJudge.${gate}: ${doc.pending.from} -> ${to} (${autoEligible && !approvedBy ? 'auto-eligible' : 'human-approved'})`);
  console.log('[thresholds] 下一步：apply（生效后必须重跑 findings:converge + 历史轮 validate）');
}

function runApply(args) {
  const doc = load();
  if (!doc.pending) throw new Error('无 pending 提议，先 propose');
  const pending = doc.pending;
  const { errors } = validateProposal(doc.active.readerJudge, pending.gate, pending.to, pending.approvedBy ?? argValue(args, '--approved-by'));
  if (errors.length > 0) throw new Error(`pending 提议不再合法（active 已变？）：${errors.join('；')}`);
  const from = { ...doc.active.readerJudge };
  doc.active.readerJudge = { ...from, [pending.gate]: pending.to };
  doc.history.push({
    changedAt: new Date().toISOString(),
    mode: pending.approvedBy ? 'human' : 'auto',
    ...(pending.approvedBy ? { approvedBy: pending.approvedBy } : {}),
    evidence: pending.evidence,
    from: { readerJudge: from },
    to: { readerJudge: doc.active.readerJudge },
  });
  doc.pending = null;
  save(doc);
  console.log(`[thresholds] applied readerJudge.${pending.gate}: ${pending.from} -> ${pending.to} (mode=${pending.approvedBy ? 'human' : 'auto'})`);
  console.log('[thresholds] 提醒：重跑 npm run findings:converge 与历史轮 validate，使上线判定与新阈值一致');
}

function runHistory() {
  const doc = load();
  for (const entry of doc.history) {
    console.log(
      `[thresholds] ${entry.changedAt} mode=${entry.mode} ${entry.note ?? entry.evidence ?? ''} ${entry.from ? `${JSON.stringify(entry.from)} -> ${JSON.stringify(entry.to)}` : ''}`
    );
  }
}

const [command, ...rest] = process.argv.slice(2);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  if (!existsSync(THRESHOLDS_PATH)) {
    console.error(`[thresholds] 缺 ${THRESHOLDS_PATH}`);
    process.exit(1);
  }
  try {
    if (command === 'show') runShow();
    else if (command === 'propose') runPropose(rest);
    else if (command === 'apply') runApply(rest);
    else if (command === 'history') runHistory();
    else {
      console.error('usage: thresholds.mjs <show | propose --gate k --to v --evidence t [--approved-by n] | apply [--approved-by n] | history>');
      process.exit(2);
    }
  } catch (error) {
    console.error(`[thresholds] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
