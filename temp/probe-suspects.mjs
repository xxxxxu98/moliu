import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const chText = (n) => ((proj.chapters ?? []).find((x) => (x.orderIndex ?? 0) + 1 === n)?.content) ?? '';
const out = [];

const CONDEMN_PRED = '(?:被处斩|被判斩|被问斩|被定罪|被定谳|被论罪|被革职抄没|被满门抄斩)';
const ADVERB = '(?:当场|随即|立刻|当即|最终|当晚|当日|翌日|不久|很快)?';
const DEATH_PRED = '(?:气绝|毙命|身亡|丧命|殒命|惨死|暴毙|命丧|吐血而亡|服毒自尽|自刎|坠亡|被杀|被鸩杀|被毒杀|被人所杀|死于非命)';
const EXECUTE_RE =
  /^(?:(?:全族|一族|一党|余党|党羽|亲族|阖族|等[^。！？，]{0,8})?(?:亦|已|皆|尽){0,2}(?:被)?(?:伏诛|处决|处斩|正法|枭首|斩首|腰斩|凌迟|赐死))/;
const dismissSubjRe1 = /^(?:[^。！？]{0,4}?(?:被|遭)?(?:当堂|当场|即日|就地)?(?:削爵|革爵|夺爵|革职|罢免|免职|撤职|停职|废黜|废为庶民|贬为庶人))/;
const dismissSubjRe2 = /^(?:[^。！？]{0,4}?(?:亲王|郡王|国公|侯)?爵位[^。！？]{0,4}?(?:被)?(?:削|夺|废|褫))/;
const dismissSubjRe3 = /^(?:虽)?(?:然)?已?(?:被)?(?:夺职|革职|罢黜|削爵|革爵)/;

for (const [n, name] of [[42, '齐王'], [63, '陆淮安'], [84, '江南漕运总督'], [122, '杨文渊']]) {
  const text = chText(n);
  let from = 0;
  let k = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) break;
    from = at + name.length;
    k++;
    const tail = text.slice(at + name.length, at + name.length + 24);
    const lead = text.slice(Math.max(0, at - 12), at);
    const flags = [];
    if (new RegExp(`^${ADVERB}${DEATH_PRED}`).test(tail)) flags.push('deathSubj');
    if (EXECUTE_RE.test(tail)) flags.push('executeSubj');
    if (new RegExp(`^${ADVERB}${CONDEMN_PRED}`).test(tail)) flags.push('condemnSubj');
    if (dismissSubjRe1.test(tail) || dismissSubjRe2.test(tail) || dismissSubjRe3.test(tail)) flags.push('dismissSubj');
    if (flags.length) out.push(`ch${n} ${name}#${k} [${flags.join(',')}] lead=‖${lead}‖ tail=${tail}‖`);
  }
}
writeFileSync('temp/r2a-suspect-probe.txt', out.join('\n'), 'utf8');
console.log('written');
