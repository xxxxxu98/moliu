import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('temp/storyflow-scenario-matrix/fair-mystery/provider-1787039781123/storyflow.closed-loop.outline.json', 'utf8'));
const junk = ['利用市', '比对市', '盲区', '押解至青河市', '梳理出老街片区', '两张泛黄的市', '找出十年前市', '格户籍走访与市', '政道路盲区'];
const hits = [];
for (const ch of j.chapters ?? []) {
  const text = [ch.title, ch.CBN, ...(ch.CPNs ?? []), ch.CEN, ...(ch.mustCover ?? []), ...(ch.forbiddenZones ?? [])].filter(Boolean).join('｜');
  const matched = junk.filter(k => text.includes(k.slice(0, 2)));
  if (matched.length) hits.push(`第${ch.orderIndex ?? '?'}章 [${matched.join(',')}] ${text.slice(0, 160)}`);
}
console.log(hits.slice(0, 12).join('\n') || '(蓝图里未找到垃圾片段来源——可能来自卷纲)');
console.log('\n卷纲字段 keys:', Object.keys(j.volumes?.[0] ?? {}));
