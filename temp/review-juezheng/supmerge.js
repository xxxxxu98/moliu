const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/supplement.ts', 'utf8');
// 找“补写结果如何与原文合并”的代码：搜 concat/+/ 拼接 existingContent 的位置
const ls = t.split(/\r?\n/);
const out = [];
for (let i = 0; i < ls.length; i++) {
  const l = ls[i];
  if (/existingContent\s*(\+|\+=|\.concat)|\+\s*existingContent|merged|combined/i.test(l)) {
    for (let j = Math.max(0, i - 3); j <= Math.min(ls.length - 1, i + 5); j++) out.push((j + 1) + ': ' + ls[j]);
    out.push('---');
  }
}
console.log(out.join('\n') || '(未在 supplement.ts 内找到合并点,合并可能在调用方)');
