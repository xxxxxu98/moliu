const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/ChapterWritingPipeline.ts', 'utf8');
const ls = t.split(/\r?\n/);
const pats = /previousChapter|recentChaptersFullText|引号|quote|stateDriven|G[1-7]|gate|Gate|门禁|一致性|consistency/i;
const out = [];
ls.forEach((l, i) => { if (pats.test(l)) out.push((i + 1) + ': ' + l.trim().slice(0, 150)); });
console.log(out.slice(0, 80).join('\n'));
console.log('--- total hits: ' + out.length);
