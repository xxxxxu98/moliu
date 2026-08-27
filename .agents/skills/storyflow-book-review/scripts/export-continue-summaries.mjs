#!/usr/bin/env node
// 从 continue-write real harness 的章级 summary 导出正文,供 book-precheck 审查。
// 用法: node export-continue-summaries.mjs [summary目录(默认 temp)] [输出目录(默认 temp/book-review/<book>-<MMDD>-r<轮次>)]
// 匹配 temp/continue-write.real.ch{N}.summary.json,取 prose 字段按章号落盘。
import fs from 'node:fs';
import path from 'node:path';

const srcDir = process.argv[2] || path.join(process.cwd(), 'temp');
const files = fs.readdirSync(srcDir)
  .filter(f => /^continue-write\.real\.ch(\d+)\.summary\.json$/.test(f))
  .sort((a, b) => Number(a.match(/ch(\d+)/)[1]) - Number(b.match(/ch(\d+)/)[1]));
if (files.length === 0) {
  console.error(`未找到 temp/continue-write.real.ch*.summary.json`);
  process.exit(1);
}

const first = JSON.parse(fs.readFileSync(path.join(srcDir, files[0]), 'utf8'));
const book = (first.book || 'book').replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
const date = new Date().toISOString().slice(5, 10).replace('-', '');
const outDir = process.argv[3] || path.join(process.cwd(), 'temp', 'book-review', `${book}-${date}-rewrite`);
fs.mkdirSync(outDir, { recursive: true });

// 大纲从 App 项目库取(与导出脚本同源)
const store = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'moliu', 'moliu-projects.json'), 'utf8'));
const project = (store.projects || []).find(p => p.name === first.book || p.id === first.projectId);
if (project) {
  const chapters = [...(project.chapters || [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const lines = [];
  for (const c of chapters) {
    lines.push(`=== ${c.title} (orderIndex=${c.orderIndex}) ===`);
    lines.push(c.outline || '(无outline)');
    lines.push(`plotSummary: ${c.plotSummary || '(无)'}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(outDir, 'outlines.txt'), lines.join('\n'), 'utf8');
}

for (const f of files) {
  const s = JSON.parse(fs.readFileSync(path.join(srcDir, f), 'utf8'));
  const n = Number(f.match(/ch(\d+)/)[1]);
  const title = s.chapterTitle || `第${n}章`;
  fs.writeFileSync(path.join(outDir, `${String(n).padStart(3, '0')}.txt`), `${title}\n\n${s.prose || ''}`, 'utf8');
}
console.log(`已导出 ${files.length} 章 → ${outDir}`);
console.log(`书籍: ${first.book} | 模型: ${first.model || first.provider || '?'}`);
