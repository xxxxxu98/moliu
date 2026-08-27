#!/usr/bin/env node
// 从 continue-write real 的 ai-traces jsonl 提取每章最终正文(scene-draft 响应的 paragraphs)。
// 用法: node extract-prose-from-traces.mjs <trace目录:temp/ai-traces> <输出目录>
// 规则: 每个 runId 对应一章;取该 runId 最后一条 scene-draft 记录的 paragraphs 数组(最终轮,含 repair)。
import fs from 'node:fs';
import path from 'node:path';

const traceDir = process.argv[2] || path.join(process.cwd(), 'temp', 'ai-traces');
const outDir = process.argv[3];
if (!outDir) {
  console.error('用法: node extract-prose-from-traces.mjs <traceDir> <outDir>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(traceDir)
  .filter(f => /^continue-write-real-.*\.jsonl$/.test(f) && f.includes('-from-ch') === false ? true : f.includes('continue-write-real'))
  .map(f => ({ f, mtime: fs.statSync(path.join(traceDir, f)).mtimeMs }))
  // 只取本次批量(最近的批次):按 mtime 降序,收集同批
  ;

// 简化:收集所有 continue-write-real trace,按记录里的 runId 分组
// runId 形如 continue-write-real-<projectId>-batch-ch<N>-<ts>
const byRun = new Map();
for (const { f } of files) {
  const lines = fs.readFileSync(path.join(traceDir, f), 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.purpose !== 'scene-draft') continue;
    const runId = rec.runId || f;
    // 响应体:可能是 rec.response/rec.result/rec.output
    const body = rec.response ?? rec.result ?? rec.output ?? rec.parsed ?? null;
    if (!body || !Array.isArray(body.paragraphs)) continue;
    const prev = byRun.get(runId);
    if (!prev || (rec.at ?? 0) >= (prev.at ?? 0)) {
      byRun.set(runId, { at: rec.at ?? 0, paragraphs: body.paragraphs, title: body.chapterTitle });
    }
  }
}

// 从 runId 提取章号
const chapters = new Map();
for (const [runId, v] of byRun) {
  const m = runId.match(/-ch(\d+)-/) || runId.match(/ch(\d+)/);
  if (!m) continue;
  const n = Number(m[1]);
  const cur = chapters.get(n);
  if (!cur || v.at > cur.at) chapters.set(n, v);
}

if (chapters.size === 0) {
  console.error('未从 trace 提取到任何章节正文。检查 trace 记录结构。');
  process.exit(1);
}

for (const [n, v] of [...chapters.entries()].sort((a, b) => a[0] - b[0])) {
  const title = v.title || `第${n}章`;
  fs.writeFileSync(
    path.join(outDir, `${String(n).padStart(3, '0')}.txt`),
    `${title}\n\n${v.paragraphs.join('\n\n')}`,
    'utf8'
  );
}
console.log(`已从 trace 提取 ${chapters.size} 章 → ${outDir}`);
