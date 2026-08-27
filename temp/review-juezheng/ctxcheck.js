const fs = require('fs');
const files = [
  'D:/project/2026/moliu/src/renderer/src/composables/useBatchWriter.ts',
  'D:/project/2026/moliu/src/renderer/src/composables/useChapterWriter.ts',
];
const pats = /buildRecentChaptersFullText|recentChapterCount|currentChapterOutline|CEN|上一章|结尾|ending/i;
for (const f of files) {
  console.log('===== ' + f.split('/').pop() + ' =====');
  const ls = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  ls.forEach((l, i) => { if (pats.test(l)) console.log((i + 1) + ': ' + l.trim()); });
}
