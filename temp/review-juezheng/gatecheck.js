const fs = require('fs');
const files = [
  'D:/project/2026/moliu/src/renderer/src/services/gates/types.ts',
];
// 找 gates 目录所有文件
const dir = 'D:/project/2026/moliu/src/renderer/src/services/gates';
for (const f of fs.readdirSync(dir)) {
  const p = dir + '/' + f;
  if (fs.statSync(p).isFile() && /\.ts$/.test(f) && !/test/.test(f)) files.push(p);
}
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const ls = t.split(/\r?\n/);
  console.log('===== ' + f.split('/').pop() + ' =====');
  ls.forEach((l, i) => {
    if (/gateId|G[1-7]|description|domain|门禁|检查|verify/i.test(l) && l.trim().length < 160) {
      console.log((i + 1) + ': ' + l.trim());
    }
  });
}
