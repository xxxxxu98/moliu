import { readFileSync, readdirSync } from 'node:fs';

const pid = process.argv[2];
const dir = `temp/storyflow-matrix/${pid}/prose`;
const chapters = readdirSync(dir).filter(f => /^ch\d+\.txt$/.test(f)).sort();

const prose = chapters.map(f => readFileSync(`${dir}/${f}`, 'utf8'));

// ---------- 章级指标 ----------
console.log(`====== ${pid} 章级指标 ======`);
console.log('章 | 字数 | 段数 | 平均段长 | cv | vague/千字 | 明喻');
const metrics = prose.map((t, i) => {
  const paras = t.split(/\r?\n/).filter(p => p.trim());
  const lens = paras.map(p => p.length);
  const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length);
  const cv = avg > 0 ? sd / avg : 0;
  const vague = (t.match(/(他|她|他们|对方|那人|此人)/g) || []).length;
  const simile = (t.match(/(像是|仿佛|宛如|犹如)/g) || []).length;
  console.log(
    String(i + 1).padStart(2),
    '|', String(t.length).padStart(4),
    '|', String(paras.length).padStart(3),
    '|', avg.toFixed(0).padStart(3),
    '|', cv.toFixed(2),
    '|', (vague / t.length * 1000).toFixed(1).padStart(4),
    '|', simile,
  );
  return { words: t.length, cv, paras: paras.length };
});

// ---------- 跨章重复：每章头两段的开头 12 字 ----------
console.log('\n====== 每章开章前 12 字（开章套路检测）======');
prose.forEach((t, i) => {
  const first = (t.split(/\r?\n/).find(p => p.trim()) || '').trim();
  console.log(`ch${String(i + 1).padStart(2)}: ${first.slice(0, 12)}`);
});

// ---------- 跨章重复：高频 5-gram ----------
console.log('\n====== 跨章重复 5-gram（出现 ≥3 章的短语）======');
const gramMap = new Map(); // gram -> Set(chapterIdx)
prose.forEach((t, i) => {
  const clean = t.replace(/[\r\n“”"]/g, '');
  const seen = new Set();
  for (let j = 0; j + 5 <= clean.length; j++) {
    const g = clean.slice(j, j + 5);
    if (/[，。！？；：、\s]/.test(g)) continue;
    if (!seen.has(g)) {
      seen.add(g);
      if (!gramMap.has(g)) gramMap.set(g, new Set());
      gramMap.get(g).add(i);
    }
  }
});
const repeated = [...gramMap.entries()]
  .filter(([, set]) => set.size >= 3)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 25);
for (const [g, set] of repeated) {
  console.log(`${set.size}章: ${g}  [${[...set].map(x => x + 1).join(',')}]`);
}

// ---------- 节奏漂移：字数趋势 ----------
const words = metrics.map(m => m.words);
const half = Math.floor(words.length / 2);
const avgFirst = words.slice(0, half).reduce((a, b) => a + b, 0) / half;
const avgSecond = words.slice(half).reduce((a, b) => a + b, 0) / (words.length - half);
console.log(`\n====== 节奏漂移 ======`);
console.log(`前半平均字数 ${avgFirst.toFixed(0)} → 后半 ${avgSecond.toFixed(0)}（偏移 ${(((avgSecond - avgFirst) / avgFirst) * 100).toFixed(1)}%）`);
const cvs = metrics.map(m => m.cv);
console.log(`cv 范围 ${Math.min(...cvs).toFixed(2)}-${Math.max(...cvs).toFixed(2)}，均匀化章（cv<0.14 且段数≥12）: ${metrics.filter(m => m.cv < 0.14 && m.paras >= 12).length}/${metrics.length}`);
