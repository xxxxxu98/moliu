#!/usr/bin/env node
// 从 moliu 应用数据导出指定书籍的大纲与正文,供 book-precheck.mjs 与 AI 审查使用。
// 用法: node export-book.mjs <书名或项目ID> [输出目录]
// 输出: outlines.txt(全部章节结构化节点) + NNN.txt(有正文的章节) + book.json(清单)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_DATA = path.join(os.homedir(), 'AppData', 'Roaming', 'moliu', 'moliu-projects.json');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('用法: node export-book.mjs <书名或项目ID> [输出目录(默认 temp/book-review/<slug>-<MMDD>)]');
  process.exit(1);
}
const needle = args[0];
const slug = needle.replace(/[\\/:*?"<>|]/g, '').slice(0, 24) || 'book';
const date = new Date().toISOString().slice(5, 10).replace('-', '');
const outDir = args[1] || path.join(process.cwd(), 'temp', 'book-review', `${slug}-${date}`);

if (!fs.existsSync(APP_DATA)) {
  console.error(`未找到应用数据: ${APP_DATA}(应用是否运行过?)`);
  process.exit(1);
}
const store = JSON.parse(fs.readFileSync(APP_DATA, 'utf8'));
const projects = store.projects || [];
const project =
  projects.find(p => p.id === needle) ||
  projects.find(p => p.name === needle) ||
  projects.find(p => (p.name || '').includes(needle));
if (!project) {
  console.error(`未找到书籍: ${needle}`);
  console.error('现有项目:');
  for (const p of projects) console.error(`  ${p.id} | ${p.name} | ${p.wordCount}字`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const chapters = [...(project.chapters || [])].sort(
  (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
);

const outlineLines = [];
for (const c of chapters) {
  outlineLines.push(`=== ${c.title} (orderIndex=${c.orderIndex}) ===`);
  outlineLines.push(c.outline || '(无outline)');
  outlineLines.push(`plotSummary: ${c.plotSummary || '(无)'}`);
  outlineLines.push('');
}
fs.writeFileSync(path.join(outDir, 'outlines.txt'), outlineLines.join('\n'), 'utf8');

const manifest = [];
for (const c of chapters) {
  const content = c.content || '';
  if (content.trim()) {
    const file = `${String(c.orderIndex + 1).padStart(3, '0')}.txt`;
    fs.writeFileSync(path.join(outDir, file), `${c.title}\n\n${content}`, 'utf8');
  }
  manifest.push({
    index: c.orderIndex + 1,
    title: c.title,
    words: content.replace(/\s/g, '').length,
    hasContent: content.trim().length > 0,
  });
}
fs.writeFileSync(
  path.join(outDir, 'book.json'),
  JSON.stringify(
    { id: project.id, name: project.name, exportedAt: new Date().toISOString(), chapters: manifest },
    null,
    1
  ),
  'utf8'
);
console.log(`已导出《${project.name}》→ ${outDir}`);
console.log(`章节 ${manifest.length} 个,其中有正文 ${manifest.filter(c => c.hasContent).length} 个`);
