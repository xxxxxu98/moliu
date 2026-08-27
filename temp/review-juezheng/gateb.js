const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/polish/SixGatePolishPipeline.ts', 'utf8');
const m = t.match(/private gateB_Patterns\(content: string\): string \{[\s\S]{0,2200}/);
console.log(m ? m[0] : 'not found');
