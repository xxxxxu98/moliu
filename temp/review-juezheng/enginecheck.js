const fs = require('fs');
const f = 'D:/project/2026/moliu/src/renderer/src/services/story-runtime/LongFormWritingEngine.ts';
const ls = fs.readFileSync(f, 'utf8').split(/\r?\n/);
const out = [];
ls.forEach((l, i) => {
  if (/recentScenes|previousChapter|recentChaptersFullText|上一章|结尾|前情/i.test(l)) {
    out.push((i + 1) + ': ' + l.trim().slice(0, 150));
  }
});
console.log(out.slice(0, 50).join('\n'));
console.log('--- 文件行数: ' + ls.length);
