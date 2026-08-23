const p = require('./smoke-project.json');
const chs = p.chapters
  .filter(c => (c.content || '').trim())
  .sort((a, b) => a.orderIndex - b.orderIndex);

function bigramOverlap(hint, prose) {
  const hc = [...hint.matchAll(/[\u4e00-\u9fff]/gu)].map(m => m[0]);
  if (hc.length < 2) return 0;
  const pb = new Set();
  for (const m of prose.matchAll(/[\u4e00-\u9fff]{2}/gu)) pb.add(m[0]);
  let h = 0;
  for (let i = 0; i < hc.length - 1; i++) {
    if (pb.has(hc[i] + hc[i + 1])) h += 1;
  }
  return h / (hc.length - 1);
}

console.log('=== 离线回放：新检测逻辑在真实冒烟产物上的表现 ===');
for (let ci = 0; ci < chs.length; ci++) {
  const n = ci + 1;
  const prose = chs[ci].content;
  const hits = [];
  p.foreshadows.forEach(f => {
    const setup = f.setupChapter ?? f.createdChapter;
    if (f.status !== 'planned' || setup > n + 1) return;
    const segs = f.hint.match(/[\u4e00-\u9fff]{3,}/gu) || [];
    const direct = segs.some(t => prose.includes(t));
    const ov = bigramOverlap(f.hint, prose);
    if (direct || ov >= 0.35) hits.push(`fs@${setup}${direct ? '(直接)' : `(${ov.toFixed(2)})`}`);
  });
  if (hits.length) console.log(`ch${n}: ${hits.join(' ')}`);
}

// 全章 bigram 重合率表：验证阈值 0.35 的区分度
console.log('\n=== 到点伏笔 vs 各章 bigram 重合率矩阵（fs@setup 章号）===');
p.foreshadows
  .filter(f => (f.setupChapter ?? f.createdChapter) <= 13)
  .forEach(f => {
    const setup = f.setupChapter ?? f.createdChapter;
    const rates = chs.map((c, i) => `${i + 1}:${bigramOverlap(f.hint, c.content).toFixed(2)}`).join(' ');
    console.log(`fs@${setup} ${rates}`);
  });
