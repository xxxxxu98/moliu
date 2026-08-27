const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/story-runtime/LegacyProjectMigrator.ts', 'utf8');
const m = t.match(/function splitChapter[\s\S]{0,1200}/);
console.log(m ? m[0] : '(splitChapter not found)');
