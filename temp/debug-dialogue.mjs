import { readFileSync } from 'node:fs';
import { scanProseDeadResurrection, insideDialogue } from '../scripts/storyflow-triage.mjs';

const text1 = '愤怒的吼声如同山洪暴发，数千名倒戈的前锋营士兵目眦欲裂。"宰了督战队！杀了李泰！"他们疯了一样扑向督战中军！';
const at = text1.indexOf('李泰');
console.log('at=', at);
console.log('insideDialogue=', insideDialogue(text1, at));
console.log('quote chars:', [...text1].filter(c => '「『“」』”'.includes(c)).map(c => c.codePointAt(0).toString(16)));

const chapters = [
  { n: 196, text: text1 },
  { n: 198, text: '一身金丝软甲已被扯得残破不堪的二皇子李泰，正被金万两与钱四海合力死死按在冰冷的青石砖上。' },
  { n: 199, text: '景泰帝沉声道：「李泰大逆不道，削去亲王爵位，交宗人府终身圈禁。」' },
];
console.log(JSON.stringify(scanProseDeadResurrection(chapters, ['李泰'])));
