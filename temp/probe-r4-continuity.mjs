import fs from 'node:fs';

// 1) 回档嫌疑对：拼接处的相似度摘要
const extract = fs.readFileSync('temp/book-review/大乾第一账房：从做假账到诛九族-0913/extract.txt', 'utf8');
const pairs = [...extract.matchAll(/----- 第(\d+)章结尾 -----/g)].map(m => Number(m[1]));
console.log('回档嫌疑对章：' + pairs.join('、'));

// 2) summary 读者逐章 findings：连贯性类计数与内容
const s = JSON.parse(fs.readFileSync(
  'temp/storyflow-matrix-g37f200ch/provider-1787039781123/storyflow.closed-loop.summary.json', 'utf8'));
const ev = s.readerEvaluation ?? {};
const chapters = ev.chapters ?? [];
const CONT_RE = /连贯|连续|前后|承接|上一章|上章|矛盾|冲突|断|吃书|无视|跳过|回退|倒流|时空|状态.*(不符|打架|矛盾)|出场.*身份|复活/;
const contFindings = [];
for (const c of chapters) {
  const issues = c?.issues ?? c?.findings ?? [];
  for (const it of issues) {
    const txt = typeof it === 'string' ? it : `${it?.description ?? ''}${it?.issue ?? ''}`;
    if (CONT_RE.test(txt)) contFindings.push({ ch: c.chapter ?? c.ch, txt: txt.slice(0, 150) });
  }
}
console.log('reader 连贯性类 findings：' + contFindings.length + ' 条');
for (const f of contFindings.slice(0, 12)) console.log(`  ch${f.ch}: ${f.txt}`);

// 3) 评分分布
const scores = chapters.map(c => ({ ch: c.chapter ?? c.ch, score: Number(c.score ?? c.total ?? NaN) })).filter(x => Number.isFinite(x.score));
const sorted = [...scores].sort((a, b) => a.score - b.score);
console.log('评分：n=' + scores.length + ' min=' + sorted[0].score + '(ch' + sorted[0].ch + ') p10=' + sorted[Math.floor(sorted.length * .1)].score + ' median=' + sorted[Math.floor(sorted.length / 2)].score);
console.log('低分章(<70) Top5: ' + sorted.slice(0, 5).map(x => 'ch' + x.ch + '=' + x.score).join(' '));
