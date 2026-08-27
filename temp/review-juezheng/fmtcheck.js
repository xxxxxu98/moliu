const fs = require('fs');
const path = require('path');
// 1) ch6 引号配对检查
for (let i = 1; i <= 10; i++) {
  const f = String(i).padStart(2, '0') + '.txt';
  const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const open = (t.match(/"/g) || []).length;
  const close = (t.match(/"/g) || []).length;
  console.log(f + ' 前引号=' + open + ' 后引号=' + close + (open !== close ? '  <-- 不配对!' : ''));
}
// 2) 大纲钩子截断检测:不以标点结尾且超过一定长度的 CBN/CEN
const o = fs.readFileSync(path.join(__dirname, 'outlines.txt'), 'utf8');
const hooks = [...o.matchAll(/【(CBN|CEN)】(.+)/g)];
console.log('--- 不以终止符结尾的钩子 ---');
for (const h of hooks) {
  const s = h[2].trim();
  if (!/[。！？…）】"」]$/.test(s)) console.log(h[1] + ': [' + s + ']');
}
