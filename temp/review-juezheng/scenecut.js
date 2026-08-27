const fs = require('fs');
// 查 commit 时 sceneChunks.text 是怎么切片落库的:确认 recentScenes 里是否有上一章完整结尾
const f = 'D:/project/2026/moliu/src/renderer/src/services/writing/ChapterWritingPipeline.ts';
const t = fs.readFileSync(f, 'utf8');
const idx = t.indexOf('recentScenes');
console.log('--- ChapterWritingPipeline recentScenes 相关 ---');
const ls = t.split(/\r?\n/);
ls.forEach((l, i) => { if (/sceneChunks|recentScenes/.test(l)) console.log((i + 1) + ': ' + l.trim().slice(0, 140)); });

// 再查 story-runtime 侧 commit 投影:sceneChunks 从正文怎么生成
const f2 = 'D:/project/2026/moliu/src/main';
const path = require('path');
const hits = [];
function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!node_modules_.test(name)) walk(p); }
    else if (/\.ts$/.test(name)) {
      const tt = fs.readFileSync(p, 'utf8');
      if (/sceneChunks/.test(tt) && /text/.test(tt)) hits.push(p);
    }
  }
}
var node_modules_ = /node_modules|__tests__/;
try { walk(f2); } catch (e) { console.log('(main walk: ' + e.message + ')'); }
console.log('--- main 侧含 sceneChunks 的文件 ---');
console.log(hits.slice(0, 10).join('\n'));
