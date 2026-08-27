const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/temp/review-juezheng/06.txt', 'utf8');
const paras = t.split(/\n\n/).map(p => p.trim()).filter(Boolean);
console.log('总段数: ' + paras.length);
paras.forEach((p, i) => {
  const o = (p.match(/\u201C/g) || []).length;
  const c = (p.match(/\u201D/g) || []).length;
  if (o !== c) console.log('段' + (i + 1) + ' 开引号=' + o + ' 闭引号=' + c + ' | ' + p.slice(0, 70));
});
