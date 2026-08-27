const fs = require('fs');
const log = 'C:/Users/许保良/.zcode/cli/exec/sess_8eb71c48-c3d3-4bed-be95-138e830a8a43/call_7bd888a78f6f4c1e83954c0e-stdout.log';
const t = fs.readFileSync(log, 'utf8');
const chs = [...t.matchAll(/chapter:\s*\x1b\[33m(\d+)/g)].map(m => Number(m[1]));
if (!chs.length) {
  // 退而求其次:找所有 "chapter: N" 形态
  const chs2 = [...t.matchAll(/chapter: (\d+)/g)].map(m => Number(m[1]));
  console.log('当前最大章节(宽松匹配):', chs2.length ? Math.max(...chs2) : 0, ' 共出现', chs2.length, '次');
} else {
  console.log('当前最大章节:', Math.max(...chs));
}
console.log('multi summary 存在:', fs.existsSync('D:/project/2026/moliu/temp/continue-write.real.multi.summary.json'));
