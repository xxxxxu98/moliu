#!/usr/bin/env node
/**
 * Storyflow 冒烟产物跨轮清理（prune）。
 *
 * 既有清理只覆盖「同一后缀的当轮产物」（storyflow-run-suffix.mjs）和
 * 「同一 provider 目录内的上一轮归档」（multi 归档逻辑），跨轮累积没有 GC：
 * 旧 provider 归档目录、跑崩未归档的孤儿 trace、场景矩阵旧产物会无限增长
 * （2026-08-22 实测累积到 177MB）。本模块提供确定性清理，只删明确的冒烟产物，
 * 永不触碰：配置文件（continue-write.real.config.json）、storyflow-checkpoints/
 * （断点续跑省钱）、storyflow-triage/（diff 基线）、storyflow-scenario-matrix/
 * 当前场景目录（正在跑/最近对比证据）。
 *
 *   node scripts/storyflow-prune.mjs --dry-run            # 只列清单不删（默认）
 *   node scripts/storyflow-prune.mjs                       # 执行删除
 *   MOLIU_PRUNE_KEEP_DAYS=7 node scripts/storyflow-prune.mjs   # 保留最近 N 天（默认 7）
 *
 * 也从 multi 脚本暴露：node scripts/agent-storyflow-real-multi.mjs --prune [--dry-run]
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = join(process.cwd(), 'temp');

/** 只认这些明确的冒烟产物位置；temp 根部散文件成分复杂（配置/调试脚本混杂），不自动删 */
function pruneTargets(nowMs, keepDays) {
  const cutoff = nowMs - keepDays * 86_400_000;
  const targets = [];

  // 1) storyflow-matrix/<providerId>/：按目录 mtime，只动 matrix.json 登记的厂商归档
  const matrixDir = join(TEMP_DIR, 'storyflow-matrix');
  if (existsSync(matrixDir)) {
    for (const name of readdirSync(matrixDir)) {
      const p = join(matrixDir, name);
      if (!statSync(p).isDirectory()) continue;
      if (statSync(p).mtimeMs < cutoff) targets.push({ path: p, kind: 'matrix-provider-dir' });
    }
  }

  // 2) ai-traces/*.jsonl：trace 是排障用，归档目录里已有同内容副本，孤儿（跑崩未归档）
  //    与过期一律清理。只删 .jsonl，防误伤未来可能新增的索引文件。
  const traceDir = join(TEMP_DIR, 'ai-traces');
  if (existsSync(traceDir)) {
    for (const name of readdirSync(traceDir)) {
      if (!name.endsWith('.jsonl')) continue;
      const p = join(traceDir, name);
      if (statSync(p).mtimeMs < cutoff) targets.push({ path: p, kind: 'trace' });
    }
  }

  // 3) storyflow.closed-loop.<suffix>.* / storyflow-<suffix>-*：跑崩后没走完归档的
  //    temp 根部孤儿产物（多轮累积时无人认领）。固定名（无后缀）也过期即清——
  //    单跑跑成功会被归档移走，留下的固定名文件只可能是崩跑残留。
  for (const name of readdirSync(TEMP_DIR)) {
    const p = join(TEMP_DIR, name);
    if (!statSync(p).isFile()) continue;
    if (
      (/^storyflow\.closed-loop\.[\w-]+\.(summary|outline)\.json$/u.test(name) ||
        /^storyflow-[\w-]+-\d+\.project-store\.json$/u.test(name) ||
        name === 'storyflow.closed-loop.summary.json' ||
        name === 'storyflow.closed-loop.outline.json') &&
      statSync(p).mtimeMs < cutoff
    ) {
      targets.push({ path: p, kind: 'orphan-artifact' });
    }
  }
  // storyflow.closed-loop.<suffix>.prose/ 孤儿目录（跑崩时 prose 未随归档移走）
  for (const name of readdirSync(TEMP_DIR)) {
    const p = join(TEMP_DIR, name);
    if (!statSync(p).isDirectory()) continue;
    if (
      /^storyflow\.closed-loop\.[\w-]+\.prose$/u.test(name) &&
      statSync(p).mtimeMs < cutoff
    ) {
      targets.push({ path: p, kind: 'orphan-prose-dir' });
    }
  }

  return targets;
}

export function planPrune({ nowMs = Date.now(), keepDays = 7 } = {}) {
  return pruneTargets(nowMs, keepDays);
}

export function runPrune({ dryRun = true, keepDays = 7, nowMs = Date.now() } = {}) {
  // nowMs 必须透传 planPrune：默认真实时钟会让固定时间戳夹具（相对 now 计算
  // OLD/FRESH 的测试）随真实日期漂移而误删 fresh 产物（2026-09-01 时间炸弹实锤）
  const targets = planPrune({ nowMs, keepDays });
  let freedBytes = 0;
  const sizeOf = p => {
    const st = statSync(p);
    if (!st.isDirectory()) return st.size;
    return readdirSync(p).reduce((sum, e) => sum + sizeOf(join(p, e)), 0);
  };
  for (const t of targets) {
    freedBytes += sizeOf(t.path);
    if (!dryRun) rmSync(t.path, { recursive: true, force: true });
  }
  return { count: targets.length, freedBytes, dryRun, targets };
}

// ---------- CLI ----------
if (process.argv[1] && process.argv[1].endsWith('storyflow-prune.mjs')) {
  const dryRun = !process.argv.includes('--exec');
  const keepDays = Number(process.env.MOLIU_PRUNE_KEEP_DAYS) > 0
    ? Number(process.env.MOLIU_PRUNE_KEEP_DAYS)
    : 7;
  const { count, freedBytes, dryRun: isDry, targets } = runPrune({ dryRun, keepDays });
  const header = `[storyflow-prune] 保留 ${keepDays} 天，${isDry ? '[dry-run] ' : ''}命中 ${count} 项，可释放 ${(freedBytes / 1048576).toFixed(1)} MB`;
  console.log(header);
  for (const t of targets) console.log(`  ${t.kind.padEnd(18)} ${t.path}`);
  if (isDry) console.log('确认无误后执行：node scripts/storyflow-prune.mjs --exec');
}
