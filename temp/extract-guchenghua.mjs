import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/社畜官场生存指南：从九品刀笔吏到摄政权臣-0902';
const files = readdirSync(dir).filter((f) => /^\d{3}\.txt$/.test(f)).sort();
const out = [];

// 顾成化 状态动词 arc:每章该角色名与状态词的共现
const statePat = /(押入|下狱|死牢|诏狱|革职|革去|剥去|剥除|摘去|罢(免|官|相)|囚|擒|被捕|拿(下|问)|拖出|乌纱|顶戴|首辅|相袍|圈禁|斩|伏诛|枭首)/g;
for (const f of files) {
  const no = parseInt(f.slice(0, 3), 10);
  const t = readFileSync(join(dir, f), 'utf8');
  if (!t.includes('顾成化')) continue;
  const snippets = [];
  let m;
  const seen = new Set();
  const re = new RegExp(statePat.source, 'g');
  while ((m = re.exec(t)) !== null) {
    const ctx = t.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' ');
    // 只要片段含顾成化或距顾成化<80字才收
    const near = t.slice(Math.max(0, m.index - 120), m.index + 120);
    if (!near.includes('顾成化')) continue;
    const key = ctx.slice(50, 90);
    if (seen.has(key)) continue;
    seen.add(key);
    snippets.push(`[${m[1]}] …${ctx}…`);
  }
  if (snippets.length) {
    out.push(`--- ch${no} ---`);
    out.push(snippets.join('\n'));
  }
}
writeFileSync('temp/r2a-guchenghua-arc.txt', out.join('\n'), 'utf8');
console.log('written, chapters with hits: ' + out.filter((l) => l.startsWith('---')).length);
