import { readFileSync, writeFileSync } from 'node:fs';

const store = JSON.parse(
  readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow-agif200r2a-1788272534544.project-store.json', 'utf8'),
);
const proj = store.projects?.[0];
const cms = proj.chapterMemories ?? [];
const out = [];

// ch78 章记忆(索引 77 或按 chapterIndex)
const c78 = cms.find((c) => (c.chapterIndex ?? c.chapterNo ?? c.chapter) === 78) || cms[77];
out.push('chapterMemories length: ' + cms.length);
out.push('ch78 memory: ' + JSON.stringify(c78, null, 1).slice(0, 1200));

// ch77/79 记忆的 characterStateChanges 形态对照
for (const n of [77, 79]) {
  const c = cms.find((x) => (x.chapterIndex ?? x.chapterNo ?? x.chapter) === n) || cms[n - 1];
  out.push(`\nch${n} stateChanges: ` + JSON.stringify(c?.characterStateChanges ?? null).slice(0, 400));
  out.push(`ch${n} corePlot: ` + String(c?.corePlot ?? '').slice(0, 200));
}

// ch78 的 chapters[] 内容与大纲节点
const ch78 = (proj.chapters ?? []).find((c) => (c.orderIndex ?? 0) + 1 === 78);
out.push('\nch78 chapters[] keys: ' + Object.keys(ch78 ?? {}).join(','));
out.push('ch78 content len: ' + (ch78?.content || '').trim().length);
out.push('ch78 outline 字段: ' + JSON.stringify(ch78?.outline ?? ch78?.plotOutline ?? null).slice(0, 500));
out.push('ch78 mustCover: ' + JSON.stringify(ch78?.mustCover ?? ch78?.blueprint?.mustCover ?? null)?.slice(0, 400));

writeFileSync('temp/r2a-ch78-probe.txt', out.join('\n'), 'utf8');
console.log('written');
