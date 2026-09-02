import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'));
const out = [];
const projects = store.projects;
const pid = Object.keys(projects)[0];
const proj = projects[pid];
out.push('projectId: ' + pid + ', keys: ' + Object.keys(proj).join(','));

const cms = proj.chapterMemories || [];
out.push('chapterMemories length: ' + cms.length);
const c186 = cms.find((c) => (c.chapterNo ?? c.chapter ?? c.no) === 186) || cms[185];
out.push('ch186 keys: ' + Object.keys(c186 || {}).join(','));
out.push('ch186 characterStateChanges: ' + JSON.stringify(c186?.characterStateChanges ?? null).slice(0, 2500));
out.push('ch186 summary(前600字): ' + String(c186?.summary ?? '').slice(0, 600));

// 全书扫描:林铁锋 相关死亡态
const hits = [];
for (const c of cms) {
  const s = JSON.stringify(c?.characterStateChanges ?? null);
  if (s.includes('林铁锋')) {
    const no = c.chapterNo ?? c.chapter ?? c.no;
    if (/(死|亡|殒|毙|诛|斩|尸)/.test(s)) hits.push(`ch${no}: ` + s.slice(0, 400));
  }
}
out.push('\n===== 全书 characterStateChanges 中 林铁锋+死亡词 命中 =====');
out.push(hits.join('\n---\n') || '(无命中)');

// 命运表(overlayCharacterFates / fates)里林铁锋
for (const key of ['characterFates', 'fates', 'overlayCharacterFates', 'foreshadows']) {
  const v = proj[key];
  if (v) {
    const s = JSON.stringify(v);
    const i = s.indexOf('林铁锋');
    if (i >= 0) out.push(`\n===== ${key} 中林铁锋上下文 =====\n` + s.slice(Math.max(0, i - 200), i + 400));
    else out.push(`\n${key}: (无林铁锋)`);
  }
}

writeFileSync('temp/r2a-ch186-memory-evidence.txt', out.join('\n'), 'utf8');
console.log('written');
