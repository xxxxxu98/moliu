const fs = require('fs');
const f = 'D:/project/2026/moliu/src/renderer/src/services/story-runtime/ContextPackBuilder.ts';
const ls = fs.readFileSync(f, 'utf8').split(/\r?\n/);
const out = [];
ls.forEach((l, i) => {
  if (/recentScenes|上一章|前情|ending|结尾|sceneChunks|recent/i.test(l) && l.trim().length < 160) {
    out.push((i + 1) + ': ' + l.trim());
  }
});
console.log(out.slice(0, 40).join('\n'));
console.log('--- 行数: ' + ls.length);
