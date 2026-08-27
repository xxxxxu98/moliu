const fs = require('fs');
const f = 'D:/project/2026/moliu/src/renderer/src/services/story-runtime/ContextPackBuilder.ts';
const t = fs.readFileSync(f, 'utf8');
const m = t.match(/function compactScenes[\s\S]{0,900}/);
console.log(m ? m[0] : '(not found)');
