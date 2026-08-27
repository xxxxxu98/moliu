// 复现 Gate E 前发生了什么:重点看 gateD_Rhythm(节奏打碎)是否截断了句子
const fs = require('fs');
const t = fs.readFileSync('D:/project/2026/moliu/src/renderer/src/services/writing/polish/SixGatePolishPipeline.ts', 'utf8');
const m = t.match(/private gateD_Rhythm\(content: string\): string \{[\s\S]{0,1800}/);
console.log(m ? m[0] : 'not found');
