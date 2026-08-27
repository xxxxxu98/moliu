const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/supplement.ts', 'utf8');
const ls = t.split(/\r?\n/);
const out = [];
ls.forEach((l, i) => {
  if (/merge|拼接|append|衔接|引号|quote|slice|existingContent/i.test(l) && l.trim().length < 160) {
    out.push((i + 1) + ': ' + l.trim());
  }
});
console.log(out.slice(0, 40).join('\n'));
console.log('--- 总命中: ' + out.length + ' / 文件行数: ' + ls.length);
