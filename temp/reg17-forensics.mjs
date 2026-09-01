import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/storyflow-matrix-agif200ch-fixreg20/provider-1787039781123';
const out = [];

// 找 ch17-20 的正文
const files = readdirSync(dir);
const proseFiles = files.filter(f => /ch1[7-9]|ch20/.test(f) && f.endsWith('.jsonl'));
out.push(`ch17-20 相关文件: ${proseFiles.filter(f => /-ch(17|18|19|20)-/.test(f)).join(', ')}`);

// project-store 拿正文
const psFile = files.find(f => f.includes('.project-store.json'));
const ps = JSON.parse(readFileSync(join(dir, psFile), 'utf8'));
const proj = ps.projects ? Object.values(ps.projects)[0] : ps;
const chapters = proj?.chapters ?? [];
out.push(`project chapters=${chapters.length}`);

for (const n of [17, 18, 19, 20]) {
  const ch = chapters.find(c => (c.orderIndex ?? c.index ?? -1) === n - 1 || c.chapterNumber === n);
  const text = ch?.content ?? ch?.text ?? '';
  if (!text) { out.push(`\n===== ch${n}: 未取到正文 =====`); continue; }
  out.push(`\n===== ch${n}(${text.length}字) 陆安死亡/活体相关段 =====`);
  const paras = text.split(/\n+/).filter(p => /死|杀|尸|气绝|毙命/.test(p) && p.includes('陆安'));
  for (const p of paras.slice(0, 8)) out.push(`【段】${p.slice(0, 260)}`);
  out.push(`--- ch${n} 尾部300字 ---`);
  out.push(text.slice(-300));
}

// 全书陆安分布
const dist = [];
for (let n = 1; n <= 20; n++) {
  const ch = chapters[n - 1];
  const text = ch?.content ?? ch?.text ?? '';
  if (text) dist.push(`ch${n}×${text.split('陆安').length - 1}`);
}
out.push(`\n陆安分布: ${dist.join(' ')}`);

writeFileSync('temp/reg17-forensics.md', out.join('\n'), 'utf8');
console.log('written temp/reg17-forensics.md');
