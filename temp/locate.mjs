// 修复点定位：中文关键词用 node 搜（CMD findstr 编码不可靠）
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const targets = {
  硬门禁: ['scripts', 'src/renderer/src/services'],
  补登记: ['src/renderer/src/services', 'scripts'],
  未登记角色: ['src/renderer/src/services', 'scripts'],
  履约: ['src/renderer/src/services/story-runtime'],
  兑现: ['src/renderer/src/services/story-runtime'],
  在场: ['src/renderer/src/services/story-runtime'],
  逐字: ['src/renderer/src/services/story-runtime'],
  readerOutlineScore: ['src/renderer/src/services/writing/__tests__'],
  chapterWarningBelow: ['src/renderer/src/services'],
};
const out = [];
for (const [kw, roots] of Object.entries(targets)) {
  out.push(`\n########## ${kw} ##########`);
  for (const root of roots) {
    walk(root, (f) => {
      if (!/\.(ts|mjs)$/.test(f) || /__tests__\/(?!storyflow)/.test(f)) return;
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (l.includes(kw)) out.push(`${f}:${i + 1}: ${l.trim().slice(0, 150)}`);
      });
    });
  }
}
writeFileSync('temp/locate-report.txt', out.join('\n'), 'utf8');
console.log('ok');

function walk(dir, cb) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, cb);
    else cb(full);
  }
}
