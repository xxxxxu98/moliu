import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/大理寺打工人：用现代审计整顿大奉朝堂-0831';
const out = [];
const num = n => String(n).padStart(3, '0');

for (const ch of [195, 196, 197, 198, 199, 200]) {
  const file = join(dir, `${num(ch)}.txt`);
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { out.push(`\n===== ch${ch}: 文件缺失 =====`); continue; }
  out.push(`\n===== ch${ch}（共${text.length}字，李泰命中 ${text.split('李泰').length - 1} 处）=====`);
  // 抽出所有含 李泰 的完整段落
  const paras = text.split(/\n+/).filter(p => p.includes('李泰'));
  for (const p of paras) {
    out.push(`【段】${p.slice(0, 500)}${p.length > 500 ? '…[截断]' : ''}`);
  }
  if (paras.length === 0) out.push('（本章无李泰出场段落）');
}

// 全书扫:每章李泰出现次数
out.push(`\n\n===== 全书 李泰 出场分布（有命中的章）=====`);
const hits = [];
for (let ch = 1; ch <= 200; ch++) {
  try {
    const text = readFileSync(join(dir, `${num(ch)}.txt`), 'utf8');
    const n = text.split('李泰').length - 1;
    if (n > 0) hits.push(`ch${ch}×${n}`);
  } catch { hits.push(`ch${ch}×空洞`); }
}
out.push(hits.join(' '));

writeFileSync('temp/litai-resurrection.md', out.join('\n'), 'utf8');
console.log('written temp/litai-resurrection.md');
