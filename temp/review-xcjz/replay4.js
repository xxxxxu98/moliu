// 复刻 pipeline 里 detectPlannedForeshadowings 的最终实现，回放到冒烟产物
const p = require('./smoke-project.json');
const chs = p.chapters
  .filter(c => (c.content || '').trim())
  .sort((a, b) => a.orderIndex - b.orderIndex);
const characterNames = p.characters.map(c => c.name).filter(n => n && n.length >= 2);

const nameTerms = new Set(
  characterNames.flatMap(name => {
    const chars = [...name];
    return chars.map((_, i) => name.slice(i, i + 2)).filter(t => t.length === 2);
  })
);

function sharedCount(hint, chapterOutline) {
  if (!chapterOutline.trim()) return 0;
  const chars = [...hint.matchAll(/[\u4e00-\u9fff]/gu)].map(m => m[0]).join('');
  let hits = 0;
  const seen = new Set();
  for (let i = 0; i < chars.length - 1; i += 1) {
    const term = chars.slice(i, i + 2);
    if (seen.has(term)) continue;
    seen.add(term);
    if (nameTerms.has(term)) continue;
    if (chapterOutline.includes(term)) hits += 1;
  }
  return hits;
}

console.log('=== 最终实现回放：每章确认埋设的 planned 伏笔 ===');
let totalPlanted = 0;
for (let ci = 0; ci < chs.length; ci++) {
  const n = ci + 1;
  const outline = chs[ci].outline ?? chs[ci].plotSummary ?? '';
  const hits = p.foreshadows
    .filter(f => {
      const setup = f.setupChapter ?? f.createdChapter;
      return (
        f.status === 'planned' &&
        setup <= n + 1 &&
        sharedCount(f.hint, outline) >= 5
      );
    })
    .map(f => `fs@${f.setupChapter ?? f.createdChapter}`);
  if (hits.length) {
    totalPlanted += hits.length;
    console.log(`ch${n}: 确认埋设 ${hits.join(' ')}`);
  }
}
console.log(`\n12 章内应确认埋设: ${totalPlanted} 条（fs@10 一条到点，其余伏笔 setup 均 >13）`);
