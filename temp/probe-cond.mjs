import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const CONDITIONAL_RE =
  /不过是|无非是|大不了|照样[要会]|便[是要会]|就得|就能|便能|要是|若是|如果|倘若|万一|与其|只当|只要|想想|盘算|权衡|岂能|焉能|唯有|方有|一线生/;
const out = [];
const chText = (n) => ((proj.chapters ?? []).find((x) => (x.orderIndex ?? 0) + 1 === n)?.content) ?? '';

for (const n of [156, 157]) {
  const text = chText(n);
  let from = 0;
  let k = 0;
  for (;;) {
    const at = text.indexOf('顾成化', from);
    if (at < 0) break;
    from = at + 3;
    k++;
    const tail = text.slice(at + 3, at + 3 + 24);
    if (!/^(?:(?:全族|一族|一党|余党|党羽|亲族|阖族|等[^。！？，]{0,8})?(?:亦|已|皆|尽){0,2}(?:被)?(?:伏诛|处决|处斩|正法|枭首|斩首|腰斩|凌迟|赐死))/.test(tail)) continue;
    const window = text.slice(Math.max(0, at - 30), at + 3 + 30);
    out.push(`ch${n}#${k} 条件窗命中=${CONDITIONAL_RE.test(window)}`);
    out.push('window=' + JSON.stringify(window));
    const m = window.match(CONDITIONAL_RE);
    out.push('命中词=' + (m ? m[0] : '(无)'));
  }
}
writeFileSync('temp/r2a-cond-probe.txt', out.join('\n'), 'utf8');
console.log('written');
