const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/typesetting.ts', 'utf8');
const m = t.match(/function repairOrphanClosingQuotes[\s\S]{0,1600}/);
console.log(m ? m[0] : '(not found)');
