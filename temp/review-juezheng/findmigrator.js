const fs = require('fs');
// 1) LegacyProjectMigrator 的 sceneChunks 从项目正文怎么生成——决定 recentScenes 内容
const path = require('path');
const root = 'D:/project/2026/moliu/src/renderer/src';
const hits = [];
function walk(d) {
  let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
  for (const e of es) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.ts$/.test(e.name)) {
      try {
        const t = fs.readFileSync(p, 'utf8');
        if (/sceneChunks\s*[:=]/.test(t) && /split|slice|paragraph|\\n/.test(t)) hits.push(p);
      } catch (_) { }
    }
  }
}
walk(root);
console.log(hits.join('\n') || '(none)');
