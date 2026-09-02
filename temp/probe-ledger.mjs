import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2b/provider-1787039781123/storyflow-agif200r2b-1788272534546.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const cms = proj.chapterMemories ?? [];
const out = [];

// ch16 记忆全文(崔炳坤暴毙章)
const c16 = cms.find((c) => (c.chapterIndex ?? c.chapterNo ?? c.chapter) === 16);
out.push('===== ch16 chapterMemory =====');
out.push(JSON.stringify(c16, null, 1).slice(0, 2000));

// 全书章记忆里 崔炳坤 的全部状态变化
out.push('\n===== 全书章记忆中 崔炳坤 stateChanges =====');
for (const c of cms) {
  const changes = c.characterStateChanges ?? [];
  const hits = changes.filter((x) => JSON.stringify(x).includes('崔炳坤'));
  if (hits.length) out.push(`ch${c.chapterIndex}: ` + JSON.stringify(hits).slice(0, 300));
}

// ch130 赵煜
const c130 = cms.find((c) => (c.chapterIndex ?? c.chapterNo ?? c.chapter) === 130);
out.push('\n===== ch130 赵煜 stateChanges =====');
const z130 = (c130?.characterStateChanges ?? []).filter((x) => JSON.stringify(x).includes('赵煜'));
out.push(JSON.stringify(z130).slice(0, 500) || '(无)');

// A 书对照:ch157 顾成化(全族伏诛章)与 ch50 王庸(伏诛章)的记忆
const storeA = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const cmsA = storeA.projects?.[0]?.chapterMemories ?? [];
out.push('\n===== A 书 ch157 顾成化 stateChanges =====');
const c157 = cmsA.find((c) => (c.chapterIndex ?? 0) === 157);
out.push(JSON.stringify((c157?.characterStateChanges ?? []).filter((x) => JSON.stringify(x).includes('顾成化'))).slice(0, 500) || '(无)');
out.push('\n===== A 书 ch50 王庸 stateChanges =====');
const c50 = cmsA.find((c) => (c.chapterIndex ?? 0) === 50);
out.push(JSON.stringify((c50?.characterStateChanges ?? []).filter((x) => JSON.stringify(x).includes('王庸'))).slice(0, 500) || '(无)');

writeFileSync('temp/ledger-probe.txt', out.join('\n'), 'utf8');
console.log('written');
