import { readFileSync, writeFileSync } from 'node:fs';

const base = 'temp/storyflow-matrix-agif200ch-b/provider-1787039781123';
const s = JSON.parse(readFileSync(`${base}/storyflow.closed-loop.summary.json`, 'utf8'));
const out = [];

out.push(`# B轮 summary digest`);
out.push(`status=${s.status} requested=${s.requestedChapterCount} completed=${s.completedChapters} chapters字段=${s.chapters}`);
out.push(`phaseTimings=${JSON.stringify(s.phaseTimings)}`);

const chapters = s.batch || [];
out.push(`batch条目数=${chapters.length}`);
const bad = chapters.filter(c => c.error || !c.accepted || (c.words ?? 0) === 0);
out.push(`\n## 异常章(error/未accept/0字) 共${bad.length}条`);
for (const c of bad) {
  out.push(`- ch${c.ch} acc=${c.accepted} words=${c.words} attempts=${c.attempts} rewrites=${c.rewriteRounds} title=${c.title}`);
  out.push(`  error=${JSON.stringify(c.error)}`);
  out.push(`  gateIssues=${JSON.stringify(c.gateIssues)}`);
}
const ch72 = chapters.find(c => c.ch === 72);
out.push(`\n## ch72 完整条目`);
out.push('```json');
out.push(JSON.stringify(ch72, null, 1)?.slice(0, 3000) ?? 'null');
out.push('```');

const att = {};
const rw = {};
for (const c of chapters) {
  att[c.attempts] = (att[c.attempts] || 0) + 1;
  rw[c.rewriteRounds] = (rw[c.rewriteRounds] || 0) + 1;
}
out.push(`\nattempts分布=${JSON.stringify(att)} rewriteRounds分布=${JSON.stringify(rw)}`);
const words = chapters.map(c => c.words ?? 0);
out.push(`words min/max/avg=${Math.min(...words)}/${Math.max(...words)}/${Math.round(words.reduce((a, b) => a + b, 0) / words.length)}`);

const gi = {};
for (const c of chapters) for (const g of c.gateIssues || []) gi[g] = (gi[g] || 0) + 1;
out.push(`gateIssues聚合=${JSON.stringify(gi)}`);

const ow = s.outlineWarnings || [];
out.push(`\n## outlineWarnings ${ow.length}条`);
for (const w of ow.slice(0, 12)) out.push(`- ${typeof w === 'string' ? w : JSON.stringify(w)}`);

const re = s.readerEvaluation;
if (re) {
  const scores = (re.evaluations || []).map(e => e.score).filter(x => typeof x === 'number');
  scores.sort((a, b) => a - b);
  const q = p => scores[Math.floor(p * (scores.length - 1))];
  out.push(`\n## readerEvaluation 评审数=${scores.length} min=${scores[0]} p10=${q(0.1)} p25=${q(0.25)} median=${q(0.5)}`);
  const issues = (re.evaluations || []).flatMap(e => (e.issues || []).map(i => ({ ch: e.chapter, blocking: i.blocking, conf: i.confidence, desc: i.description })));
  out.push(`issues总数=${issues.length} blocking=${issues.filter(i => i.blocking).length}`);
  for (const i of issues.filter(i => i.blocking)) out.push(`- [blocking] ch${i.ch} conf=${i.conf} ${i.desc}`);
  for (const i of issues.filter(i => !i.blocking).slice(0, 10)) out.push(`- ch${i.ch} conf=${i.conf} ${i.desc}`);
} else out.push(`\nreaderEvaluation=无`);

const psv = s.projectStorageVerification;
if (psv) out.push(`\nprojectStorageVerification=${JSON.stringify(psv).slice(0, 800)}`);
out.push(`\n顶层键=${Object.keys(s).join(',')}`);

writeFileSync('temp/digest-b.md', out.join('\n'), 'utf8');
console.log('written temp/digest-b.md');
