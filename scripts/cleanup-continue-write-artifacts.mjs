#!/usr/bin/env node
/**
 * 续写测试产物有条件清理：只保留最近 N 次跑次，避免 temp/ 无限膨胀。
 *
 *   npm run cleanup:continue-write-artifacts
 *   MOLIU_ARTIFACT_KEEP_RUNS=3 npm run cleanup:continue-write-artifacts
 *
 * 跑次识别：
 * - 批量：每个 continue-write-real-*-batch-ch1-{ts}.jsonl 视为一次跑次起点，
 *   保留该起点之后、下一次 ch1 之前的 ch2/ch3… 轨迹
 * - 单章：continue-write-real-*-from-ch* / 其它 real 轨迹，按文件 mtime 保留最近 N 个
 * - harness：默认最多保留 1 个
 *
 * 配置文件与最新 stem 报告（summary/steps/report）始终保留。
 */
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const KEEP_RUNS = Math.max(
  1,
  Number.parseInt(process.env.MOLIU_ARTIFACT_KEEP_RUNS || '3', 10) || 3
);

const root = process.cwd();
const tempDir = join(root, 'temp');
const traceDir = join(tempDir, 'ai-traces');

const KEEP_TEMP_NAMES = new Set([
  'continue-write.real.config.json',
  'continue-write.real.config.example.json',
  'continue-write.real.summary.json',
  'continue-write.real.steps.txt',
  'continue-write.real.report.json',
  'continue-write.real.multi.summary.json',
  'continue-write.real.multi.steps.txt',
  'continue-write.real.multi.report.json',
]);

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map(name => {
      const full = join(dir, name);
      try {
        const st = statSync(full);
        if (!st.isFile()) return null;
        return { name, full, mtime: st.mtimeMs, size: st.size };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function deleteFiles(files, label) {
  let removed = 0;
  let bytes = 0;
  for (const file of files) {
    try {
      unlinkSync(file.full);
      removed += 1;
      bytes += file.size;
      console.log(`  - ${label}: ${file.name}`);
    } catch (error) {
      console.warn(`  ! 删除失败 ${file.name}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return { removed, bytes };
}

const BATCH_CH1_RE = /^continue-write-real-.*-batch-ch1-(\d+)\.jsonl$/u;
const BATCH_ANY_RE = /^continue-write-real-.*-batch-ch(\d+)-(\d+)\.jsonl$/u;
const HARNESS_RE = /^continue-write-harness.*\.jsonl$/u;
const REAL_RE = /^continue-write-real-.*\.jsonl$/u;

function cleanupAiTraces() {
  const all = listFiles(traceDir);
  const keep = new Set();

  const batchFiles = all.filter(f => BATCH_ANY_RE.test(f.name));
  const batchCh1 = all
    .map(f => {
      const m = f.name.match(BATCH_CH1_RE);
      if (!m) return null;
      return { file: f, ts: Number(m[1]) };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);

  const keptCh1 = batchCh1.slice(0, KEEP_RUNS);
  const keptStartTs = keptCh1.map(item => item.ts).sort((a, b) => a - b);

  for (const file of batchFiles) {
    const m = file.name.match(BATCH_ANY_RE);
    if (!m) continue;
    const fileTs = Number(m[2]);
    // 落在某个保留跑次区间：[runStart, nextRunStart)
    for (let i = 0; i < keptStartTs.length; i += 1) {
      const start = keptStartTs[i];
      const end = keptStartTs[i + 1] ?? Number.POSITIVE_INFINITY;
      if (fileTs >= start && fileTs < end) {
        keep.add(file.full);
        break;
      }
    }
  }

  // 单章 / from-ch / 其它 real（非 batch）
  const singleReal = all
    .filter(f => REAL_RE.test(f.name) && !BATCH_ANY_RE.test(f.name))
    .sort((a, b) => b.mtime - a.mtime);
  for (const file of singleReal.slice(0, KEEP_RUNS)) {
    keep.add(file.full);
  }

  // harness 最多留 1 个最新
  const harness = all.filter(f => HARNESS_RE.test(f.name)).sort((a, b) => b.mtime - a.mtime);
  for (const file of harness.slice(0, 1)) {
    keep.add(file.full);
  }

  const continuWriteTraces = all.filter(
    f => REAL_RE.test(f.name) || HARNESS_RE.test(f.name)
  );
  const toDelete = continuWriteTraces.filter(f => !keep.has(f.full));

  console.log(
    `[cleanup] ai-traces: 续写轨迹 ${continuWriteTraces.length} 个；` +
      `batch 跑次锚点 ${batchCh1.length} 个，保留 ${keptCh1.length} 次；` +
      `单章保留 ${Math.min(KEEP_RUNS, singleReal.length)} 个`
  );
  const result = deleteFiles(toDelete, 'trace');
  return {
    ...result,
    keptFiles: keep.size,
    keptRuns: keptCh1.length,
  };
}

function cleanupTempReports() {
  const files = listFiles(tempDir);
  const toDelete = [];

  for (const file of files) {
    if (KEEP_TEMP_NAMES.has(file.name)) continue;
    if (/^continue-write\.real\.ch\d+\.(summary|steps|report)\.(json|txt)$/u.test(file.name)) {
      continue;
    }
    if (
      /^continue-write\.real/u.test(file.name) &&
      (/\.bak$/u.test(file.name) ||
        /\.old\./u.test(file.name) ||
        /\.prev\./u.test(file.name) ||
        (/\d{10,}/u.test(file.name) && !/^continue-write\.real\.ch\d+\./u.test(file.name)))
    ) {
      toDelete.push(file);
    }
  }

  console.log(`[cleanup] temp 报告杂项候选 ${toDelete.length} 个`);
  return deleteFiles(toDelete, 'temp');
}

function main() {
  console.log(`[cleanup] keepRuns=${KEEP_RUNS}`);
  const traces = cleanupAiTraces();
  const reports = cleanupTempReports();
  const removed = traces.removed + reports.removed;
  const bytes = traces.bytes + reports.bytes;
  console.log(
    `[cleanup] 完成：删除 ${removed} 个文件（约 ${(bytes / 1024 / 1024).toFixed(2)} MB），` +
      `ai-traces 保留约 ${traces.keptFiles} 个文件（batch 锚点 ${traces.keptRuns} 次）`
  );
}

main();
