import { readFileSync, writeFileSync } from 'node:fs';
import { scanProseDeadResurrection } from '../scripts/storyflow-triage.mjs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const chapters = [];
for (const ch of proj?.chapters ?? []) {
  if (ch?.content && ch.content.trim()) chapters.push({ n: (ch.orderIndex ?? 0) + 1, text: ch.content });
}
chapters.sort((a, b) => a.n - b.n);
const roster = (proj?.characters ?? [])
  .map((c) => (c?.name || '').trim())
  .filter((n) => n.length >= 2 && n.length <= 8);

const hits = scanProseDeadResurrection(chapters, roster);
const out = [];
out.push('roster size: ' + roster.length);
out.push('hits: ' + hits.length);
for (const h of hits) {
  // 找到命中章,取角色名周边原句
  const ch = chapters.find((c) => c.n === h.chapter);
  let ctx = '';
  if (ch) {
    const at = ch.text.indexOf(h.name);
    ctx = at >= 0 ? ch.text.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, ' ') : '(本档未找到)';
  }
  out.push(`${h.name} | ${h.state} @ch${h.chapter} | active=${h.activeChapters.join(',')}\n   ctx: ${ctx}`);
}
writeFileSync('temp/r2a-real-scan-hits.txt', out.join('\n'), 'utf8');
console.log('written, hits=' + hits.length);
