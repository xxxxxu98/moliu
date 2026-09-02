import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/storyflow-matrix-agif20fatefix/provider-1787039781123';
const storeFile = readdirSync(dir).find(n => n.endsWith('.project-store.json'));
const store = JSON.parse(readFileSync(join(dir, storeFile), 'utf8'));
const proj = store.projects?.[0] ?? {};
const out = [];

// 1) 台账命运入账情况:全书章记忆的 characterStateChanges 统计
const cms = proj.chapterMemories ?? [];
const withChanges = cms.filter(c => (c.characterStateChanges ?? []).length > 0);
out.push(`chapterMemories: ${cms.length} 章,其中含状态变化: ${withChanges.length} 章`);
const fateStates = new Set(['死亡', '驾崩', '下狱', '定罪', '去职']);
const fateRows = [];
for (const c of cms) {
  for (const s of c.characterStateChanges ?? []) {
    const isFate = fateStates.has(s.state);
    if (isFate || s.stateType === 'status') {
      fateRows.push(`ch${(c.chapterIndex ?? 0) + 1} [${s.state}] ${s.characterName}: ${String(s.detail || '').slice(0, 60)}`);
    }
  }
}
out.push('\n===== 状态/命运账逐条 =====');
out.push(fateRows.join('\n') || '(空!)');

// 2) 实体 attributes 是否被命运 overlay 写入
const entities = Object.values(proj.chapters ? {} : {});
const entList = (proj.characters ?? proj.entities ?? []);
out.push('\n===== 角色卡状态(命运 overlay 目标) =====');
for (const c of entList.slice(0, 20)) {
  const st = c.attributes?.status;
  if (st) out.push(`${c.name}: ${st}`);
}

// 3) 台账驱动候选扫描实跑
const { scanLedgerDeathResurrection } = await import(new URL('file:///D:/project/2026/moliu/scripts/storyflow-triage.mjs'));
const chapters = proj.chapters
  .filter(ch => ch?.content && ch.content.trim())
  .map(ch => ({ n: (ch.orderIndex ?? 0) + 1, text: ch.content }))
  .sort((a, b) => a.n - b.n);
const roster = new Set((proj.characters ?? []).map(c => (c?.name || '').trim()).filter(n => n.length >= 2 && n.length <= 8));
const cands = scanLedgerDeathResurrection(cms, chapters, roster);
out.push(`\n===== 台账驱动死而复活候选: ${cands.length} 条 =====`);
for (const r of cands) {
  out.push(`${r.name} 于第${r.chapter}章${r.state} → 后文命中: ${r.activeChapters.slice(0, 10).join(',')}`);
}

writeFileSync('temp/fatefix-verify.txt', out.join('\n'), 'utf8');
console.log('written');
