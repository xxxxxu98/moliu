// 终验核销：死亡登记扫描（对照剧情真实性）+ 节点漏入形态抽验
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = [];
const dir = 'temp/storyflow-matrix-agif100ch-final/provider-1787039781123';
const storeFile = readdirSync(dir).find(n => n.endsWith('.project-store.json'));
const store = JSON.parse(readFileSync(join(dir, storeFile), 'utf8'));
const proj = store.projects[0];
const memories = proj.chapterMemories ?? [];

// 1) 全书死亡/下狱/定罪状态条目
out.push('===== 终验书 命运级状态登记 =====');
let deathCount = 0;
for (const m of memories) {
  for (const s of m.characterStateChanges ?? []) {
    if (['死亡', '下狱', '定罪', '驾崩'].includes(s.state)) {
      deathCount++;
      out.push(`ch${(m.chapterIndex ?? '?') + 1} [${s.characterName}] ${s.state}: ${String(s.detail || '').slice(0, 80)}`);
    }
  }
}
out.push(`(共 ${deathCount} 条；章记忆总数 ${memories.length})`);

// 2) 节点漏入形态抽验：009 CEN 与 015 CBN 在正文中的上下文
const bookDir = 'temp/book-review/帝师咨询案：从微末小吏到九五推手-0828';
for (const [file, frag] of [['009.txt', '寒铁重甲泛着幽光'], ['015.txt', '老皇帝对顾衍的名字画下朱红御圈']]) {
  const text = readFileSync(join(bookDir, file), 'utf8');
  const idx = text.indexOf(frag);
  out.push(`\n===== ${file} 漏入点上下文 =====`);
  out.push(idx >= 0 ? text.slice(Math.max(0, idx - 120), idx + 140) : '(未命中?)');
}

// 3) 尾章文风抽验
const c100 = readFileSync(join(bookDir, '100.txt'), 'utf8');
out.push('\n===== 100.txt 开头 350 字 =====');
out.push(c100.slice(0, 350));

writeFileSync('temp/final-verify-report.txt', out.join('\n'), 'utf8');
console.log('ok');
