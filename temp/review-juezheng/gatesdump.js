const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/gates/deterministic-gates.ts', 'utf8');
const ls = t.split(/\r?\n/);
const out = [];
ls.forEach((l, i) => {
  if ((/class Gate|id = |name = |\/\*\*| \* /i.test(l)) && l.trim().length < 150) out.push((i + 1) + ': ' + l.trim());
});
console.log(out.slice(0, 100).join('\n'));
console.log('文件总行数: ' + ls.length);
