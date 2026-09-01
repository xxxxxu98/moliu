import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/storyflow-matrix-agif200ch-b/provider-1787039781123';
const file = readdirSync(dir).find(f => f.startsWith('storyflow-agif200b-ch72-'));
const lines = readFileSync(join(dir, file), 'utf8').split('\n').filter(Boolean);
const out = [`# ch72 trace ${file} 共${lines.length}行`];
for (const line of lines) {
  let j;
  try { j = JSON.parse(line); } catch { out.push(`[无法解析行] ${line.slice(0, 200)}`); continue; }
  const label = j.seq ?? j.step ?? j.stage ?? '';
  const kind = j.kind ?? j.type ?? j.event ?? '';
  out.push(`\n## seq=${label} kind=${kind}`);
  const resp = j.response ?? j.content ?? j.text ?? j.result ?? null;
  if (resp != null) {
    const s = typeof resp === 'string' ? resp : JSON.stringify(resp);
    out.push(`response(前1500字): ${s.slice(0, 1500)}`);
  }
  const err = j.error ?? j.lastError ?? null;
  if (err) out.push(`error: ${typeof err === 'string' ? err.slice(0, 400) : JSON.stringify(err).slice(0, 400)}`);
  if (resp == null && err == null) {
    out.push(`keys=${Object.keys(j).join(',')} 全文(前400字)=${line.slice(0, 400)}`);
  }
}
writeFileSync('temp/ch72-trace-digest.md', out.join('\n'), 'utf8');
console.log('written temp/ch72-trace-digest.md');
