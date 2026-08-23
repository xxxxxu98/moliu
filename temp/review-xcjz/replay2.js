const p = require('./smoke-project.json');
const chs = p.chapters
  .filter(c => (c.content || '').trim())
  .sort((a, b) => a.orderIndex - b.orderIndex);

// 从 hint 提取 2 字滑窗实体词
function terms(text) {
  const chars = [...text.matchAll(/[\u4e00-\u9fff]/gu)].map(m => m[0]).join('');
  const set = new Set();
  for (let i = 0; i < chars.length - 1; i += 1) set.add(chars.slice(i, i + 2));
  return set;
}

// 共享实体词计数：hint 词集与文本词集的交集大小
function sharedTermCount(hint, text) {
  if (!text) return 0;
  const h = terms(hint);
  let hits = 0;
  for (const t of h) if (text.includes(t)) hits += 1;
  return hits;
}

console.log('=== 实体词共现矩阵（fs@setup × 章，值为共享 2 字词数；outline+正文联合）===');
p.foreshadows.forEach(f => {
  const setup = f.setupChapter ?? f.createdChapter;
  const rates = chs
    .map((c, i) => {
      const combined = `${c.outline || ''}\n${c.content || ''}`;
      return `${i + 1}:${sharedTermCount(f.hint, combined)}`;
    })
    .join(' ');
  console.log(`fs@${String(setup).padStart(3)} ${rates}`);
});

console.log('\n=== 判定规则：setup≤章号+1 且 共享词≥6 ===');
for (let ci = 0; ci < chs.length; ci++) {
  const n = ci + 1;
  const combined = `${chs[ci].outline || ''}\n${chs[ci].content || ''}`;
  const hits = p.foreshadows
    .filter(f => {
      const setup = f.setupChapter ?? f.createdChapter;
      return f.status === 'planned' && setup <= n + 1 && sharedTermCount(f.hint, combined) >= 6;
    })
    .map(f => `fs@${f.setupChapter ?? f.createdChapter}`);
  if (hits.length) console.log(`ch${n}: ${hits.join(' ')}`);
}
