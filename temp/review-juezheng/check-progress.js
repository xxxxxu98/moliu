const fs = require('fs');
const log = 'C:/Users/许保良/.zcode/cli/exec/sess_8eb71c48-c3d3-4bed-be95-138e830a8a43/call_7bd888a78f6f4c1e83954c0e-stdout.log';
const t = fs.readFileSync(log, 'utf8');
const lines = t.split(/\r?\n/);
const chs = [...t.matchAll(/chapter: .(\d+).,/g)].map(m => Number(m[1]));
console.log('日志当前最大章节:', chs.length ? Math.max(...chs) : 0);
console.log('日志行数:', lines.length);
console.log('--- 尾部12行 ---');
console.log(lines.slice(-12).join('\n').slice(0, 1800));
