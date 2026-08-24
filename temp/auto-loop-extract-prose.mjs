// 从章 trace 提取正文(scene-draft paragraphs)供人工抽读
import fs from 'node:fs';

const ch = process.argv[2] || 'ch1';
const dir = 'temp/ai-traces';
const f = fs.readdirSync(dir)
  .filter((x) => x.includes('provider-1787039781123') && x.includes(`-${ch}-`))
  .sort().at(-1);
if (!f) { console.error('no trace for', ch); process.exit(1); }

const lines = fs.readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n');
for (const l of lines) {
  const j = JSON.parse(l);
  if (j.purpose === 'scene-draft' && j.response && Array.isArray(j.response.paragraphs)) {
    const r = j.response;
    console.log(`# ${ch} seq${j.seq} 标题: ${r.chapterTitle || '-'}`);
    const text = r.paragraphs.join('\n\n');
    console.log(`字数: ${text.replace(/\s/g, '').length}`);
    // 段落长度变异系数(AI 味指标: CV<0.15 偏 AI)
    const lens = r.paragraphs.map((x) => x.replace(/\s/g, '').length).filter((n) => n > 0);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    console.log(`段落 ${lens.length} 段, 均长 ${mean.toFixed(0)}, CV ${(sd / mean).toFixed(2)} (阈值<0.15 偏AI)`);
    console.log('---');
    console.log(text);
    break;
  }
}
// 章末 judge 结论
const judge = lines.map((l) => JSON.parse(l)).filter((j) => j.purpose === 'chapter-judge').at(-1);
if (judge) {
  const r = judge.response || {};
  console.log('\n== chapter-judge ==');
  console.log(JSON.stringify({ fulfillment: r.fulfillment, forbidden: r.forbidden, resolvedForeshadowIds: r.resolvedForeshadowIds, issues: r.issues }, null, 1).slice(0, 1200));
}
