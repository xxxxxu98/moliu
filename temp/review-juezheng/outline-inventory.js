const fs = require('fs');
const files = [
  'D:/project/2026/moliu/src/renderer/src/services/outline/rolling/outline-roller.ts',
  'D:/project/2026/moliu/src/renderer/src/services/outline/generators/outline-reviewer.ts',
];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const header = t.slice(0, t.indexOf('*/'));
  console.log('===== ' + f.split('/').pop() + ' =====');
  console.log(header.split(/\r?\n/).slice(0, 16).join('\n'));
  const fns = [...t.matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1]);
  console.log('导出函数: ' + fns.join(', '));
  console.log();
}
// repairChapterBlueprints 的触发条件
const t2 = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/outline/generators/outline-completer.ts', 'utf8');
const m = t2.match(/export function findIncompleteChapterNumbers[\s\S]{0,700}/);
console.log('===== findIncompleteChapterNumbers(补全触发条件) =====');
console.log(m ? m[0].slice(0, 650) : 'not found');
