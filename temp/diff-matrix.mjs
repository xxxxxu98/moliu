import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCEN = ['court-power','cultivation-growth','urban-comeback','fair-mystery','relationship-burn','ensemble-survival','realist-no-cheat','foreshadow-network'];
const load = (scen, want) => {
  const dir = join('temp','storyflow-scenario-matrix',scen,'triage');
  const file = readdirSync(dir).filter(f => (want === 'old' && f.startsWith('report-2026-08-25-00')) || (want === 'new' && f === 'latest.json')).filter(f=>f.endsWith('.json'))[0];
  if (!file) return null;
  return JSON.parse(readFileSync(join(dir,file),'utf8')).providers[0];
};

console.log('== 上轮(00:57) vs 本轮(03:22) 红签名 diff ==');
const sigKey = s => s.signature || s.id || s.name;
for (const s of SCEN) {
  const old = load(s,'old'), cur = load(s,'new');
  const oldRed = old ? (old.signatures||[]).filter(x=>x.severity==='red').map(sigKey) : [];
  const oldFail = old ? !old.pass : null;
  const curRed = cur ? (cur.signatures||[]).filter(x=>x.severity==='red').map(sigKey) : [];
  const gone = oldRed.filter(x=>!curRed.includes(x));
  const added = curRed.filter(x=>!oldRed.includes(x));
  console.log(`${s}: 上轮 pass=${old?old.pass:'(无报告)'} 红${oldRed.length} → 本轮 pass=${cur.pass} 红${curRed.length}${gone.length?' 已消失:'+gone.join(','):''}${added.length?' ⚠️新增:'+added.join(','):''}`);
}

console.log('\n== 本轮黄签名分类统计（8场景合计） ==');
const cat = {};
for (const s of SCEN) {
  const cur = load(s,'new');
  for (const sig of (cur.signatures||[]).filter(x=>x.severity==='yellow')) {
    const k = sigKey(sig);
    cat[k] = (cat[k]||0)+1;
  }
}
const rows = Object.entries(cat).sort((a,b)=>b[1]-a[1]);
for (const [k,n] of rows) console.log(String(n).padStart(3), k);

console.log('\n== 本轮 outlineWarnings 地点补登相关（遗留观察项） ==');
for (const s of SCEN) {
  const cur = load(s,'new');
  const locs = (cur.signatures||[]).filter(x=>String(sigKey(x)).includes('location')||String(sigKey(x)).includes('unregistered-loc'));
  if (locs.length) console.log(s, locs.map(x=>sigKey(x)+'×'+x.count).join(', '));
}
