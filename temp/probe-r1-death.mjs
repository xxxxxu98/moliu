// 取证 v2：字段名适配（章用 orderIndex，记忆章号字段现场探测）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/storyflow-matrix-agif100ch-r1/provider-1787039781123';
const storeFile = readdirSync(dir).find(n => n.endsWith('.project-store.json'));
const store = JSON.parse(readFileSync(join(dir, storeFile), 'utf8'));
const proj = store.projects[0];
const lines = [];
const log = s => lines.push(s);

const memories = proj.chapterMemories ?? [];
log(`chapterMemories=${memories.length}；首条键: ${memories[0] ? Object.keys(memories[0]).join(',') : '无'}`);
for (const m of memories) {
  const ch = m.orderIndex ?? m.chapterNumber ?? m.chapter ?? m.ch ?? m.index;
  log(`\n===== 记忆 ch${ch}（orderIndex=${m.orderIndex}）=====`);
  const states = m.characterStateChanges ?? [];
  log(`characterStateChanges=${states.length}`);
  for (const s of states) log(`  ${JSON.stringify(s)}`);
}

const chapters = [...(proj.chapters ?? [])].sort((a, b) => a.orderIndex - b.orderIndex);
const ch13 = chapters.find(c => c.orderIndex === 12);
if (ch13) {
  const prose = ch13.content ?? '';
  log(`\n===== ch13《${ch13.title}》prose（${prose.length} 字）死亡系关键词句 =====`);
  const kws = ['格杀', '斩', '毙命', '气绝', '人头落地', '头颅', '杀', '葬', '丧命', '阵亡', '活口'];
  for (const para of prose.split('\n')) {
    if (kws.some(k => para.includes(k))) log(`  [段] ${para.slice(0, 200)}`);
  }
  log(`\n===== ch13 末尾 500 字 =====\n${prose.slice(-500)}`);
}

writeFileSync('temp/probe-r1-death-report.txt', lines.join('\n'), 'utf8');
console.log('ok');
