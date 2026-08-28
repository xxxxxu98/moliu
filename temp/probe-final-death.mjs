// 终验失败取证：顾修远/周铁衣 的死亡登记在哪章、detail 是什么
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/storyflow-matrix-agiffix1-final/provider-1787039781123';
const storeFile = readdirSync(dir).find(n => n.endsWith('.project-store.json'));
const store = JSON.parse(readFileSync(join(dir, storeFile), 'utf8'));
const proj = store.projects[0];
const lines = [];
for (const m of proj.chapterMemories ?? []) {
  for (const s of m.characterStateChanges ?? []) {
    if (['死亡', '下狱', '定罪', '驾崩'].includes(s.state)) {
      lines.push(`ch${(m.chapterIndex ?? '?') + 1} [${s.characterName}] ${s.state}: ${String(s.detail || '').slice(0, 120)}`);
    }
  }
}
lines.push(`(共 ${lines.length} 条，章记忆 ${proj.chapterMemories.length})`);
writeFileSync('temp/probe-final-death-report.txt', lines.join('\n'), 'utf8');
console.log('ok');
