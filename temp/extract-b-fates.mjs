import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/九品账房：社畜的内阁升迁录-0902';
const out = [];

// 三人各自「命运章」中含名字的死亡/下狱句 + 后章首现
const targets = [
  { name: '高猛', fate: 15, actives: [16, 19, 22] },
  { name: '崔炳坤', fate: 16, actives: [23, 28, 59] },
  { name: '赵煜', fate: 130, actives: [158, 173, 184] },
];

const DEATH_RE = /(?:气绝|毙命|身亡|丧命|殒命|惨死|暴毙|命丧|服毒自尽|自刎|坠亡|被杀|被鸩杀|被毒杀|死于非命|伏诛|处决|处斩|正法|枭首|斩首)/;
const JAILEY_RE = /(?:打入|押入|关进|收监|下狱|天牢|大牢|死牢|诏狱)/;

for (const t of targets) {
  const fateText = readFileSync(join(dir, `${String(t.fate).padStart(3, '0')}.txt`), 'utf8');
  out.push(`\n===== ${t.name} 命运章 ch${t.fate} 含死亡/牢狱词的句子 =====`);
  for (const sentence of fateText.split(/(?<=[。！？])/)) {
    if (sentence.includes(t.name) && (DEATH_RE.test(sentence) || JAILEY_RE.test(sentence))) {
      out.push('· ' + sentence.trim().slice(0, 220));
    }
  }
  for (const n of t.actives) {
    const aText = readFileSync(join(dir, `${String(n).padStart(3, '0')}.txt`), 'utf8');
    const i = aText.indexOf(t.name);
    out.push(`-- ch${n} ${t.name} 首现(偏移${i}): ` + (i >= 0 ? aText.slice(Math.max(0, i - 40), i + 120).replace(/\s+/g, ' ') : '(未出现)'));
  }
}

writeFileSync('temp/r2b-fate-evidence.txt', out.join('\n'), 'utf8');
console.log('written');
