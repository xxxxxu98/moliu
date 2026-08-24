// 查看 reviewer 状态告警章的中间轮 issues 与终判结果
import fs from 'node:fs';

const dir = process.env.TRACE_DIR || 'temp/ai-traces';
const PROV = 'provider-1787039781123';
for (const n of process.argv.slice(2).map(Number)) {
  const f = fs.readdirSync(dir).filter((x) => x.includes(PROV) && x.includes(`-ch${n}-`)).sort().at(-1);
  if (!f) { console.log(`ch${n}: no trace`); continue; }
  const events = fs.readFileSync(`${dir}/${f}`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const drafts = events.filter((e) => e.purpose === 'scene-draft');
  const judges = events.filter((e) => e.purpose === 'chapter-judge');
  console.log(`\n== ch${n}: ${drafts.length} 轮草稿, ${judges.length} 轮判定 ==`);
  judges.forEach((j, i) => {
    const r = j.response || {};
    const issues = (r.issues || []).map((x) => String(x.message || x.reason || JSON.stringify(x)).slice(0, 90));
    const unful = (r.fulfillment || []).filter((x) => !x.fulfilled).map((x) => x.node.slice(0, 40));
    const viol = (r.forbidden || []).filter((x) => x.violated).map((x) => x.zone.slice(0, 40));
    console.log(`  judge#${i + 1}: issues=${issues.length}${issues.length ? ' | ' + issues.join(' | ') : ''}${unful.length ? ' | 未履约:' + unful.join(';') : ''}${viol.length ? ' | 违禁:' + viol.join(';') : ''}`);
  });
}
