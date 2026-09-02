import { readFileSync, writeFileSync } from 'node:fs';
import { insideDialogue } from '../scripts/storyflow-triage.mjs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2b/provider-1787039781123/storyflow-agif200r2b-1788272534546.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const ch = (proj.chapters ?? []).find((c) => (c.orderIndex ?? 0) + 1 === 15);
const text = ch.content;
const out = [];

const ADVERB = '(?:当场|随即|立刻|当即|最终|当晚|当日|翌日|不久|很快)?';
const DEATH_PRED = '(?:气绝|毙命|身亡|丧命|殒命|惨死|暴毙|命丧|吐血而亡|服毒自尽|自刎|坠亡|被杀|被鸩杀|被毒杀|被人所杀|死于非命)';
const EXECUTE_RE =
  /^(?:(?:全族|一族|一党|余党|党羽|亲族|阖族|等[^。！？，]{0,8})?(?:亦|已|皆|尽){0,2}(?:被)?(?:伏诛|处决|处斩|正法|枭首|斩首|腰斩|凌迟|赐死))/;
const RESULT_SENTENCE_RE =
  /人头落地|(?:头颅|首级)[^。！？]{0,8}(?:滚落|落地)|当场毙命|当场身亡|气绝身亡|当场殒命/;

let from = 0;
let k = 0;
for (;;) {
  const at = text.indexOf('高猛', from);
  if (at < 0) break;
  from = at + 2;
  k++;
  const tail = text.slice(at + 2, at + 2 + 24);
  const lead = text.slice(Math.max(0, at - 12), at);
  const flags = [];
  if (new RegExp(`^${ADVERB}${DEATH_PRED}`).test(tail)) flags.push('deathSubj');
  if (EXECUTE_RE.test(tail)) flags.push('executeSubj');
  // 结果句紧邻
  const sStart = Math.max(text.lastIndexOf('。', at), text.lastIndexOf('！', at), text.lastIndexOf('？', at)) + 1;
  let sEnd = text.length;
  for (let i = at + 2; i < text.length; i++) {
    if ('。！？'.includes(text[i])) { sEnd = i + 1; break; }
  }
  const sentence = text.slice(sStart, sEnd);
  if (RESULT_SENTENCE_RE.test(sentence)) {
    const adjacent = new RegExp(`高猛[^。！？」”]{0,10}?${RESULT_SENTENCE_RE.source}`).test(sentence);
    flags.push('resultSentence(adjacent=' + adjacent + ')');
  }
  if (flags.length) {
    out.push(`#${k} @${at} dialogue=${insideDialogue(text, at)} [${flags.join(',')}]`);
    out.push('  lead=‖' + lead + '‖');
    out.push('  tail=' + JSON.stringify(tail));
    out.push('  sent=' + JSON.stringify(sentence.slice(0, 200)));
  }
}
writeFileSync('temp/r2b-gaomeng2-probe.txt', out.join('\n'), 'utf8');
console.log('written');
