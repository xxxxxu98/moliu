import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/社畜官场生存指南：从九品刀笔吏到摄政权臣-0902';
const out = [];

// ch186 结尾 1500 字(赵元澈最终命运)
const ch186 = readFileSync(join(dir, '186.txt'), 'utf8');
out.push('===== ch186 结尾 1500 字 =====');
out.push(ch186.slice(-1500));

// ch187 开头 800 字(赵元澈是否活体出场)
const ch187 = readFileSync(join(dir, '187.txt'), 'utf8');
out.push('\n\n===== ch187 开头 800 字 =====');
out.push(ch187.slice(0, 800));
const i = ch187.indexOf('赵元澈');
out.push('\n----- ch187 赵元澈 首现(偏移' + i + ') -----');
out.push(i >= 0 ? ch187.slice(Math.max(0, i - 150), i + 350) : '(未出现)');

// ch194/197 幼帝出场
for (const n of [194, 197]) {
  const t = readFileSync(join(dir, `${n}.txt`), 'utf8');
  const j = t.indexOf('幼帝');
  out.push(`\n----- ch${n} 幼帝 首现(偏移${j}) -----`);
  out.push(j >= 0 ? t.slice(Math.max(0, j - 100), j + 250) : '(未出现)');
}

writeFileSync('temp/r2a-ch186-fate-evidence.txt', out.join('\n'), 'utf8');
console.log('written');
