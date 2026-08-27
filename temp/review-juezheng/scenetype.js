const fs = require('fs');
// 查 SceneChunk 的 text 在 commit 时怎么生成:是全文还是摘要
const f = 'D:/project/2026/moliu/src/renderer/src/types/story-runtime.ts';
const t = fs.readFileSync(f, 'utf8');
const m = t.match(/interface SceneChunk[\s\S]{0,600}/);
console.log(m ? m[0] : '(SceneChunk not found in types)');
