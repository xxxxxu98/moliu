// 把 storyflow 矩阵产物(project-store)组装成 book-precheck 兼容的书审目录。
// 用法: node scripts/assemble-matrix-bookreview.mjs <project-store.json> [输出目录]
import fs from 'node:fs';
import path from 'node:path';

const [, storePath, outDirArg] = process.argv.slice(1);
if (!storePath) {
  console.error('用法: node assemble-matrix-bookreview.mjs <project-store.json> [输出目录]');
  process.exit(1);
}
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
const project = (store.projects || [])[0];
if (!project) {
  console.error('project-store 里没有 projects[0]');
  process.exit(1);
}

const date = new Date().toISOString().slice(5, 10).replace('-', '');
const slug = (project.name || 'book').replace(/[\\/:*?"<>|]/g, '').slice(0, 24);
const outDir =
  outDirArg || path.join(process.cwd(), 'temp', 'book-review', `${slug}-${date}`);
fs.mkdirSync(outDir, { recursive: true });

const chapters = [...(project.chapters || [])].sort(
  (a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
);

// 章纲真源是 plotOutline 节点（滚纲/再生只更新节点，章节表 outline 保留初版快照
// 可能是脏数据——reg20 实证 18-50 章 outline 同文但节点与正文全正常）。
// 按 orderIndex 对齐节点，节点有 CBN 时优先，章节表字段兜底。
const chapterNodes = [...(project.plotOutline || [])]
  .filter(n => n.type === 'chapter')
  .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
function blueprintTextFor(orderIndex, fallback) {
  const node = chapterNodes.find(n => n.orderIndex === orderIndex);
  if (!node || !node.CBN) return fallback;
  const structured = [
    '--- 结构化节点 ---',
    node.CBN ? `【CBN】${node.CBN}` : '',
    Array.isArray(node.CPNs) && node.CPNs.length ? `【CPNs】${node.CPNs.join('\n')}` : '',
    node.CEN ? `【CEN】${node.CEN}` : '',
    Array.isArray(node.mustCover) && node.mustCover.length ? `【必须覆盖】${node.mustCover.join('、')}` : '',
  ].filter(Boolean).join('\n');
  return `${node.summary || node.title || ''}\n\n${structured}`;
}

const outlineLines = [];
for (const c of chapters) {
  const outlineText = blueprintTextFor(c.orderIndex, c.outline || '(无outline)');
  outlineLines.push(`=== ${c.title} (orderIndex=${c.orderIndex}) ===`);
  outlineLines.push(outlineText);
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
// 伏笔台账随书导出：ending-audit 只需拿到书审目录即可统计回收率，
// 不必再回头翻 project-store（目录自足原则，与 book-precheck 同一输入）。
const foreshadows = (project.foreshadows || []).map(f => ({
  id: f.id,
  hint: f.hint,
  status: f.status,
  importance: f.importance,
  setupChapter: f.setupChapter,
  actualPlantedChapter: f.actualPlantedChapter,
  payoffChapter: f.payoffChapter,
}));
fs.writeFileSync(
  path.join(outDir, 'book.json'),
  JSON.stringify(
    { id: project.id, name: project.name, genre: project.genre, exportedAt: new Date().toISOString(), source: path.resolve(storePath), chapters: manifest, foreshadows },
    null,
    1
  ),
  'utf8'
);
console.log(`assembled: ${outDir}`);
console.log(`chapters=${manifest.length} withContent=${manifest.filter(c => c.hasContent).length} foreshadows=${foreshadows.length}`);
