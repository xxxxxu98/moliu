import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanProseDeadResurrection } from '../scripts/storyflow-triage.mjs';

const dir = 'temp/book-review/大理寺打工人：用现代审计整顿大奉朝堂-0831';
const num = n => String(n).padStart(3, '0');
const chapters = [];
for (let n = 1; n <= 200; n++) {
  try {
    chapters.push({ n, text: readFileSync(join(dir, `${num(n)}.txt`), 'utf8') });
  } catch { /* 空洞章跳过 */ }
}
const roster = ['李泰', '沈淮安', '陆文渊', '裴行舟', '苏清婉', '赵敬堂', '冯恩', '景泰帝', '温见山', '李烈', '金万两', '钱四海', '萧破虏', '周成'];
const result = scanProseDeadResurrection(chapters, roster);
const out = ['# A书 dead-resurrection 复现', '', JSON.stringify(result, null, 2)];

// 守卫验证样本(修复前后对比用)
const sample = [
  { n: 1, text: '愤怒的吼声如同山洪暴发。"宰了督战队！杀了李泰！"数千名倒戈的前锋营士兵疯了一样扑向李泰的督战中军！' },
  { n: 2, text: '裴行舟手起刀落，当阵斩杀了李泰。三军肃然。' },
];
const sampleResult = scanProseDeadResurrection(sample, roster);
out.push('', '## 守卫验证样本(呐喊 vs 叙述处决)', JSON.stringify(sampleResult, null, 2));

writeFileSync('temp/dead-res-repro.json', out.join('\n'), 'utf8');
console.log('written temp/dead-res-repro.json');
