import { readFileSync, writeFileSync } from 'node:fs';

// 把 outlines.txt 压缩为「章号 标题 | CBN | 必盖节点」紧凑清单,全量覆盖
const files = [
  'temp/book-review/大理寺打工人：用现代审计整顿大奉朝堂-0831/outlines.txt',
  'temp/book-review/我在朝廷推行末位淘汰-0831/outlines.txt',
];
const out = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const blocks = text.split(/=== /).filter(b => b.includes('orderIndex'));
  out.push(`\n##### ${file} 共${blocks.length}章 #####`);
  for (const b of blocks) {
    const lines = b.split('\n');
    const header = lines[0].replace(/\s*\(orderIndex=\d+\)\s*===/, '').trim();
    const cbn = (b.match(/【CBN】(.*)/) || [])[1]?.trim() ?? '';
    const must = (b.match(/【必须覆盖】(.*)/) || [])[1]?.trim() ?? '';
    out.push(`· ${header} || CBN:${cbn} || 盖:${must}`);
  }
}
writeFileSync('temp/outlines-compact.txt', out.join('\n'), 'utf8');
console.log('written temp/outlines-compact.txt', out.length, 'lines');
