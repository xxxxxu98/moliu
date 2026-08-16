#!/usr/bin/env node
/** 临时:三家矩阵监控(mtime > 启动时刻 10:45 的才是本轮产物),跑完可删 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const IDS = {
  'provider-1786762630678': 'mimo-v2.5-pro',
  'provider-1786762462935': 'ds-flash',
  'provider-1786843122914': 'glm-5.2',
};
const RUN_STARTED = new Date('2026-08-16T10:45:00');
const TRACE_DIR = 'temp/ai-traces';
const MATRIX_DIR = 'temp/storyflow-matrix';

for (const [id, label] of Object.entries(IDS)) {
  const prefix = `storyflow-${id}-`;
  const traces = existsSync(TRACE_DIR)
    ? readdirSync(TRACE_DIR).filter(n => n.startsWith(prefix) && n.endsWith('.jsonl'))
    : [];
  // 已归档(本轮的)优先
  const archived = existsSync(join(MATRIX_DIR, id))
    ? readdirSync(join(MATRIX_DIR, id)).filter(n => n.startsWith(prefix) && n.endsWith('.jsonl'))
    : [];

  const sources = [...traces.map(n => join(TRACE_DIR, n)), ...archived.map(n => join(MATRIX_DIR, id, n))]
    .filter(p => statSync(p).mtime >= RUN_STARTED);

  const logPath = join(MATRIX_DIR, id, 'run.log');
  let phase = '';
  if (existsSync(logPath) && statSync(logPath).mtime >= RUN_STARTED) {
    const c = readFileSync(logPath, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
    if (/Test Files/.test(c)) {
      const fail = /Tests\s+\d+ failed/.test(c);
      const dur = (c.match(/Duration\s+([\d.]+)s/) || [])[1];
      const err = (c.match(/storyflow 闭环失败[^\n]{0,80}/) || [])[0];
      phase = `[结束 ${fail ? 'FAIL' : 'PASS'} ${dur}s] ${err || ''}`;
    }
  }

  if (sources.length === 0 && !phase) { console.log(`${label.padEnd(14)} | 无本轮trace | 启动中`); continue; }

  let reqs = 0, errs = 0, sum = 0;
  const errSamples = [];
  for (const p of sources) {
    for (const line of readFileSync(p, 'utf8').split('\n').filter(Boolean)) {
      let r; try { r = JSON.parse(line); } catch { continue; }
      reqs++; sum += r.ms || 0;
      if (r.error) { errs++; if (errSamples.length < 3) errSamples.push(String(r.error).slice(0, 45)); }
    }
  }
  console.log(
    `${label.padEnd(14)} | reqs=${String(reqs).padStart(3)} err=${errs} ${(sum / 60000).toFixed(0)}min${phase ? ' ' + phase : ''}` +
    (errSamples.length ? ' | ' + errSamples.join(' ; ') : '')
  );
  // summary 阶段进度
  const summary = join(MATRIX_DIR, id, 'storyflow.closed-loop.summary.json');
  if (existsSync(summary) && statSync(summary).mtime >= RUN_STARTED && !phase) {
    const s = JSON.parse(readFileSync(summary, 'utf8'));
    console.log(`${''.padEnd(14)}   summary: ${s.status} ${s.completedChapters}/${s.requestedChapterCount}章`);
  }
}
