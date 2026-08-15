#!/usr/bin/env node
/** 冒烟观察小工具：打点 trace 文件数/最新事件与主日志尾行，避免大 JSON 直接回显 */
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const traceDir = path.join(cwd, 'temp', 'ai-traces');
const logPath = path.join(cwd, 'temp', 'storyflow-run10.log');

const lines = [];
lines.push('=== trace files (storyflow*) ===');
if (fs.existsSync(traceDir)) {
  const files = fs.readdirSync(traceDir)
    .filter(f => f.includes('storyflow') && f.endsWith('.jsonl'))
    .map(f => {
      const full = path.join(traceDir, f);
      const st = fs.statSync(full);
      return { f, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
  for (const x of files.slice(0, 8)) lines.push(`${x.mtime}  ${String(x.size).padStart(8)}  ${x.f}`);
  lines.push(`(total ${files.length})`);
}
lines.push('');
lines.push('=== run log tail ===');
if (fs.existsSync(logPath)) {
  const log = fs.readFileSync(logPath, 'utf8').split('\n').filter(l => l.trim());
  for (const l of log.slice(-12)) lines.push(l.slice(0, 160));
}
lines.push('');
lines.push('=== summary checkpoint (if any) ===');
const sumPath = path.join(cwd, 'temp', 'storyflow.closed-loop.summary.json');
if (fs.existsSync(sumPath)) {
  const s = JSON.parse(fs.readFileSync(sumPath, 'utf8'));
  lines.push(`status=${s.status} completed=${s.completedChapters}/${s.requestedChapterCount} updatedAt=${s.updatedAt ?? '-'}`);
  for (const b of s.batch ?? []) {
    lines.push(`  ch${b.ch} accepted=${b.accepted} words=${b.words} ${b.error ? 'ERR:' + String(b.error).slice(0, 80) : ''}`);
  }
}
fs.writeFileSync(path.join(cwd, 'temp', 'watch-out.txt'), lines.join('\n'), 'utf8');
console.log(lines.join('\n').slice(0, 3000));
