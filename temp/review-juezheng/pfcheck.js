const fs = require('fs');
const files = [
  'D:/project/2026/moliu/src/renderer/src/services/writing/preflight/PreflightService.ts',
  'D:/project/2026/moliu/src/renderer/src/services/writing/prompt-builder.ts',
];
for (const f of files) {
  console.log('===== ' + f.split('/').pop() + ' =====');
  const ls = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  ls.forEach((l, i) => {
    if (/getCurrentChapterContext|recentChaptersFullText|previousChapterEnding|shortTermFullText|前情概要|previousChapter/i.test(l)) {
      console.log((i + 1) + ': ' + l.trim().slice(0, 150));
    }
  });
}
