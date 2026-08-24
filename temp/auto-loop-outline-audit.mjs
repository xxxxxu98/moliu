// 大纲质量审计 v2(真实字段):伏笔时序/hook多样性/地点门禁/蓝图密度
import fs from 'node:fs';

const p = 'temp/storyflow-checkpoints/provider-1787039781123.outline.json';
const o = JSON.parse(fs.readFileSync(p, 'utf8')).outline;
const bp = o.chapterBlueprints;

// 1. 伏笔时序自洽
console.log('== 伏笔时序(setup→payoff) ==');
let bad = 0, beyond = 0;
for (const f of o.foreshadowPlan) {
  const s = f.setupChapter, t = f.payoffChapter;
  const ok = typeof s === 'number' && typeof t === 'number' && s < t;
  if (!ok) { bad++; console.log(`  ✗ ${f.id}: setup=${s} payoff=${t}`); }
  if (typeof t === 'number' && t > 100) beyond++;
  console.log(`  ${ok ? '✓' : '?'} ${f.id} ch${s}→ch${t} [${f.importance}] ${f.hint.slice(0, 30)}…`);
}
console.log(`  时序违例: ${bad} / 揭晓超100章(冒烟不可见): ${beyond}`);

// 2. hook 多样性(已知盲区:章末句跨章复读)
console.log('\n== hookType 分布(50 蓝图) ==');
const ht = {};
for (const b of bp) ht[b.hookType] = (ht[b.hookType] || 0) + 1;
console.log(' ', JSON.stringify(ht));
const hooks = bp.map((b) => b.hookText || '');
const dup = hooks.filter((h, i) => h && hooks.indexOf(h) !== i);
console.log('  hookText 完全重复:', dup.length);
// 句式近似检测:取 hookText 前8字做前缀聚类
const pref = {};
for (const h of hooks) { const k = h.slice(0, 8); pref[k] = (pref[k] || 0) + 1; }
const clustered = Object.entries(pref).filter(([, n]) => n >= 3);
if (clustered.length) console.log('  前8字聚类≥3:', JSON.stringify(clustered.slice(0, 8)));

// 3. 地点门禁:蓝图 summary/CBN 里出现的 worldBuilding 地名子串
console.log('\n== 地点门禁 ==');
const locs = (o.worldBuilding.locations || []).map((l) => typeof l === 'string' ? l : l.name);
console.log('  核心地点:', locs.join('、'));
const allText = bp.map((b) => [b.title, b.summary, b.CBN, ...(b.CPNs || [])].join(' ')).join(' ');
const hit = locs.filter((l) => allText.includes(l.slice(0, 4)));
console.log('  蓝图中出现(前4字匹配):', hit.length, '/', locs.length);

// 4. 蓝图间 title 重复与 mustCover 覆盖密度
console.log('\n== 蓝图质量 ==');
const titles = bp.map((b) => b.title);
const dupT = titles.filter((t, i) => titles.indexOf(t) !== i);
console.log('  title 重复:', dupT.length ? dupT : '无');
const noMust = bp.filter((b) => !(b.mustCover || []).length);
console.log('  mustCover 为空:', noMust.length);
const noFz = bp.filter((b) => !(b.forbiddenZones || []).length);
console.log('  forbiddenZones 为空:', noFz.length);

// 5. startupPack30 与 chapterBlueprints 的一致性(前50章应有对应)
console.log('\n== startupPack30 ==');
console.log('  blocks:', (o.startupPack30.chapterBlocks || []).length, '条');
console.log('  openingHook:', String(o.startupPack30.openingHook).slice(0, 80));

// 6. 卷/幕区间是否覆盖 180 章
console.log('\n== 卷区间 ==');
for (const v of o.volumePlan) console.log(`  卷${v.volumeIndex} ch${v.chapterRange.start}-${v.chapterRange.end} ${v.title}`);
