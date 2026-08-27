const fs = require('fs');
const path = require('path');
const dir = __dirname;
const words = { '仿佛': 0, '犹如': 0, '宛若': 0, '如同': 0, '一丝': 0, '一抹': 0, '深吸了一口气': 0, '深吸一口气': 0, '缓缓': 0, '不禁': 0, '微微': 0, '轻轻': 0, '淡淡': 0, '眼中闪过': 0, '嘴角勾起': 0, '眉头微皱': 0, '心中一动': 0, '心头一震': 0, '心下了然': 0, '不由得': 0, '不容置疑': 0, '不易察觉': 0, '深邃': 0, '凛冽': 0, '瞬间': 0, '突然': 0, '——': 0, '……': 0, '他知道': 0, '这一刻': 0, '不由自主': 0, '情不自禁': 0, '此刻': 0, '般的': 0 };
const perChapter = {};
for (let i = 1; i <= 10; i++) {
  const f = String(i).padStart(2, '0') + '.txt';
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  perChapter[f] = {};
  for (const k of Object.keys(words)) {
    const m = t.split(k).length - 1;
    if (m > 0) { words[k] += m; perChapter[f][k] = m; }
  }
}
const ent = Object.entries(words).filter(([k, v]) => v > 0).sort((a, b) => b[1] - a[1]);
ent.forEach(([k, v]) => {
  const detail = Object.entries(perChapter).filter(([f, w]) => w[k]).map(([f, w]) => f.replace('.txt', '') + ':' + w[k]).join(' ');
  console.log(k + ' x' + v + '  [' + detail + ']');
});
let total = 0;
for (let i = 1; i <= 10; i++) total += fs.readFileSync(path.join(dir, String(i).padStart(2, '0') + '.txt'), 'utf8').replace(/\s/g, '').length;
console.log('--- 正文总字数(不含空白): ' + total);
