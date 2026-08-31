// 临时排查脚本：解析 ch39 判官 trace 的引号问题形态（用完即删）
import fs from 'node:fs';
const path = 'temp/storyflow-matrix-fix2-final100ch/provider-1787039781123/storyflow-provider-1787039781123-ch39-1788148434461.jsonl';
const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
console.log('entries:', lines.length);
const parsed = lines.map(l => JSON.parse(l));
console.log('purposes:', parsed.map(e => `${e.purpose}:${e.seq ?? '?'}:${e.ms ?? 0}ms`).join(' | '));
const judges = parsed.filter(e => e.purpose === 'chapter-judge');
for (const j of judges) {
  let resp = j.response;
  try { resp = typeof resp === 'string' ? JSON.parse(resp) : resp; } catch { /* keep raw */ }
  const issues = (resp && resp.issues) || [];
  console.log(`judge seq=${j.seq} issues=${issues.length}`);
  for (const issue of issues.slice(0, 4)) {
    console.log('  -', String(issue.type ?? issue.kind ?? '?'), '|', String(issue.description ?? '').slice(0, 120));
  }
}
// 统计每次 scene-draft 响应的引号配对
const drafts = parsed.filter(e => e.purpose === 'scene-draft');
drafts.forEach((d, i) => {
  const text = String(d.response ?? '');
  const open = (text.match(/“/gu) || []).length;
  const close = (text.match(/”/gu) || []).length;
  console.log(`draft#${i + 1} len=${text.length} open=${open} close=${close}`);
});
