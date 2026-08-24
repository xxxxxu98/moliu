// 跨章分析:章末句复读(已知38%盲区)/地名幻觉/开头接续
import fs from 'node:fs';

const dir = process.env.TRACE_DIR || 'temp/ai-traces';
const PROV = 'provider-1787039781123';
const files = fs.readdirSync(dir)
  .filter((x) => x.includes(PROV) && /-ch\d+-/.test(x))
  .sort((a, b) => {
    const na = Number(a.match(/-ch(\d+)-/)[1]), nb = Number(b.match(/-ch(\d+)-/)[1]);
    return na - nb;
  });

const chapters = [];
for (const f of files) {
  const n = Number(f.match(/-ch(\d+)-/)[1]);
  const lines = fs.readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n');
  // 取最后一次 scene-draft(重写后的终稿)
  let draft = null, judges = 0;
  for (const l of lines) {
    const j = JSON.parse(l);
    if (j.purpose === 'scene-draft' && j.response?.paragraphs) draft = j.response;
    if (j.purpose === 'chapter-judge') judges++;
  }
  if (draft) chapters.push({ n, title: draft.chapterTitle, paras: draft.paragraphs, judges });
}
chapters.sort((a, b) => a.n - b.n);
console.log(`已产出 ${chapters.length} 章终稿\n`);

// 1. 章末句跨章复读:末段最后一句(取最后30字)与其他章开头首句/末句相似度
console.log('== 章末句复读检测(末句片段在多章出现) ==');
const endFrags = chapters.map((c) => {
  const last = c.paras.at(-1).replace(/\s/g, '');
  return { n: c.n, frag: last.slice(-28) };
});
let repeatHits = 0;
for (let i = 0; i < chapters.length; i++) {
  const body = chapters.map((c) => c.paras.join('')).join('');
  const frag = endFrags[i].frag;
  // 在全部正文中数 frag 出现次数(含自身一次)
  let count = 0, idx = 0;
  while ((idx = body.indexOf(frag, idx)) !== -1) { count++; idx += 5; }
  if (count > 1) { repeatHits++; console.log(`  ch${c_n(chapters, i)} 末句片段出现 ${count} 次: 「${frag.slice(0, 20)}…」`); }
}
function c_n(chs, i) { return chs[i].n; }
console.log(`  复读章数: ${repeatHits}/${chapters.length}`);

// 2. 相邻章 开头接续检查:ch(N+1) 开头是否承接 chN 结尾(粗查:开头200字含末章关键词)
console.log('\n== 相邻章衔接粗检 ==');
for (let i = 1; i < chapters.length; i++) {
  const prevEnd = chapters[i - 1].paras.at(-1).replace(/\s/g, '');
  const curStart = chapters[i].paras[0].replace(/\s/g, '');
  // 取前章末句的实体词(≥3字连续片段)看是否在下一章开头300字出现
  const frag3 = new Set();
  for (let k = 0; k + 4 <= prevEnd.length; k += 2) frag3.add(prevEnd.slice(k, k + 4));
  let hits = 0;
  const win = curStart.slice(0, 300);
  for (const f of frag3) if (win.includes(f)) hits++;
  const ratio = hits / frag3.size;
  if (ratio < 0.05) console.log(`  ⚠ ch${chapters[i - 1].n}→ch${chapters[i].n} 衔接弱(${(ratio * 100).toFixed(0)}%): 开头「${curStart.slice(0, 40)}…」`);
}

// 3. 地名幻觉:提取正文中的地点候选(含「殿|寺|门|府|司|宫|院|局|坊|街|牢|库|库」词),与大纲 locations 对照
console.log('\n== 地名门禁抽查 ==');
const o = JSON.parse(fs.readFileSync('temp/storyflow-checkpoints/provider-1787039781123.outline.json', 'utf8')).outline;
const locs = (o.worldBuilding.locations || []).map((l) => typeof l === 'string' ? l : l.name).join('|');
// 大理寺/刑部等核心地名在蓝图中出现即可信;只报告完全未在 outline 任何字段出现过的专有地点
const outlineAll = JSON.stringify(o);
const suspects = new Map();
for (const c of chapters) {
  const text = c.paras.join('');
  const re = /[一-龥]{1,6}(?:殿|寺|公堂|门|府|司|宫|院|局|坊|牢|阁|台|监)/g;
  let m;
  while ((m = re.exec(text))) {
    const w = m[0];
    if (w.length < 2) continue;
    if (!outlineAll.includes(w)) suspects.set(w, (suspects.get(w) || 0) + 1);
  }
}
const top = [...suspects.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log('  大纲未登记且出现≥3次的地名候选:', top.length ? top.map(([w, n]) => `${w}×${n}`).join(' ') : '无');

// 4. 段落 CV 汇总
console.log('\n== 段落节奏 CV ==');
const cvs = chapters.map((c) => {
  const lens = c.paras.map((x) => x.replace(/\s/g, '').length).filter((n) => n > 0);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  return { n: c.n, cv: sd / mean, chars: c.paras.join('').replace(/\s/g, '').length };
});
console.log('  ' + cvs.map((x) => `ch${x.n}:${x.cv.toFixed(2)}`).join(' '));
const low = cvs.filter((x) => x.cv < 0.15);
console.log(`  CV<0.15 章数: ${low.length}${low.length ? ' → ' + low.map((x) => 'ch' + x.n).join(',') : ''}`);
const short = cvs.filter((x) => x.chars < 2000);
console.log(`  字数<2000: ${short.length}${short.length ? ' → ' + short.map((x) => `ch${x.n}(${x.chars})`).join(',') : ''}`);
