import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const roster = (proj?.characters ?? []).map((c) => (c?.name || '').trim());
const out = ['roster(' + roster.length + '): ' + roster.join('、')];

// ch131 林铁锋 / ch157 赵元澈 逐出现场
const chText = (n) => {
  const c = (proj.chapters ?? []).find((x) => (x.orderIndex ?? 0) + 1 === n);
  return c?.content ?? '';
};
for (const [n, name] of [[131, '林铁锋'], [157, '赵元澈']]) {
  const text = chText(n);
  let from = 0;
  let k = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) break;
    from = at + name.length;
    k++;
    out.push(`ch${n} ${name}#${k} lead=‖${text.slice(Math.max(0, at - 12), at)}‖ tail=${text.slice(at + name.length, at + name.length + 24)}‖`);
  }
}
writeFileSync('temp/r2a-newfp-probe.txt', out.join('\n'), 'utf8');
console.log('written');
