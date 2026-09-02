import { readFileSync, writeFileSync } from 'node:fs';
import { insideDialogue } from '../scripts/storyflow-triage.mjs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const ch = (proj?.chapters ?? []).find((c) => (c.orderIndex ?? 0) + 1 === 186);
const text = ch.content;

const out = [];
for (const name of ['林铁锋', '赵元澈', '幼帝']) {
  let from = 0;
  let k = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) break;
    from = at + name.length;
    k++;
    const tail = text.slice(at + name.length, at + name.length + 24);
    const lead = text.slice(Math.max(0, at - 12), at);
    const dialogue = insideDialogue(text, at);
    out.push(
      `#${name} 出现${k} @${at} dialogue=${dialogue}\n  lead=‖${lead}‖\n  tail=${tail}‖…`,
    );
  }
}
writeFileSync('temp/r2a-occ-probe.txt', out.join('\n'), 'utf8');
console.log('written');
