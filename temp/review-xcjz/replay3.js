const p = require('./smoke-project.json');
const chs = p.chapters
  .filter(c => (c.content || '').trim())
  .sort((a, b) => a.orderIndex - b.orderIndex);

const characterNames = p.characters.map(c => c.name).filter(n => n && n.length >= 2);
// 滑窗词里剔除含角色名字字的词 + 常见功能虚词
const STOP_TERMS = new Set([
  '发现', '其经', '经手', '一处', '出现', '同时', '进行', '已经', '可以', '一个',
  '手中', '手中所', '告诫', '初次', '赐予', '激烈', '抗税', '以此', '常年',
  '往', '在', '与', '和', '了', '的', '时', '中', '为', '其',
]);

function terms(text) {
  const chars = [...text.matchAll(/[\u4e00-\u9fff]/gu)].map(m => m[0]).join('');
  const set = new Set();
  for (let i = 0; i < chars.length - 1; i += 1) {
    const term = chars.slice(i, i + 2);
    if (STOP_TERMS.has(term)) continue;
    if (characterNames.some(name => name.includes(term[0]) && name.length <= 3)) {
      // 含角色名首字的词不全是噪声（如 陆衍→陆衍），只剔除与名字直接重叠的
      if ([...characterNames].some(n => n.includes(term))) continue;
    }
    set.add(term);
  }
  return set;
}

function sharedTermCount(hint, text) {
  if (!text) return 0;
  let hits = 0;
  for (const t of terms(hint)) if (text.includes(t)) hits += 1;
  return hits;
}

console.log('=== 纯 outline 实体词共现（去人名/停用词后）===');
p.foreshadows.forEach(f => {
  const setup = f.setupChapter ?? f.createdChapter;
  const rates = chs
    .map((c, i) => `${i + 1}:${sharedTermCount(f.hint, c.outline || '')}`)
    .join(' ');
  console.log(`fs@${String(setup).padStart(3)} ${rates}`);
});
