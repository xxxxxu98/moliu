import { readFileSync, existsSync } from 'node:fs';

const j = JSON.parse(readFileSync('temp/storyflow-scenario-matrix/realist-no-cheat/triage/latest.json', 'utf8'));
const p = j.providers[0];
const sigKey = s => s.signature || s.id || s.name;
console.log('== realist-no-cheat 重写相关签名 ==');
for (const s of p.signatures.filter(x => /words-overlimit|ooc|node-unfulfilled|empty-response/.test(sigKey(x)))) {
  console.log(JSON.stringify({ sig: sigKey(s), count: s.count, evidence: String(s.evidence?.[0] ?? '').slice(0, 160) }));
}
console.log('verdictReason:', p.verdictReason);

console.log('\n== 各场景地点补登 warning ==');
const SCEN = ['court-power','cultivation-growth','urban-comeback','fair-mystery','relationship-burn','ensemble-survival','realist-no-cheat','foreshadow-network'];
for (const s of SCEN) {
  const f = `temp/storyflow-scenario-matrix/${s}/provider-1787039781123/storyflow.closed-loop.summary.json`;
  if (!existsSync(f)) { console.log(s, '(no summary)'); continue; }
  const sum = JSON.parse(readFileSync(f, 'utf8'));
  const loc = (sum.outlineWarnings || []).filter(w => String(w).includes('地点'));
  console.log(s + ':', loc.length ? loc.join(' || ').slice(0, 200) : '(无)');
}
