import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const out = [];

const EXECUTE_RE =
  /^(?:(?:全族|一族|一党|余党|党羽|亲族|阖族|等[^。！？，]{0,8})?(?:亦|已|皆|尽)?(?:被)?(?:伏诛|处决|处斩|正法|枭首|斩首|腰斩|凌迟|赐死))/;

for (const n of [156, 157, 162]) {
  const ch = (proj.chapters ?? []).find((x) => (x.orderIndex ?? 0) + 1 === n);
  const text = ch?.content ?? '';
  let from = 0;
  let k = 0;
  for (;;) {
    const at = text.indexOf('顾成化', from);
    if (at < 0) break;
    from = at + 3;
    k++;
    const tail = text.slice(at + 3, at + 3 + 24);
    out.push(`ch${n}#${k} tail=${tail}‖ executeSubj=${EXECUTE_RE.test(tail)}`);
  }
}
writeFileSync('temp/r2a-gu-probe.txt', out.join('\n'), 'utf8');
console.log('written');
