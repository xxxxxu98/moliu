const fs = require('fs');
const path = require('path');
const root = 'D:/project/2026/moliu/src';
const hits = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!/__tests__|node_modules/.test(f)) walk(p); }
    else if (/\.ts$/.test(f) && !/test/.test(f)) {
      const t = fs.readFileSync(p, 'utf8');
      if (/class LongFormWritingEngine|previousChapter|recentScenes/.test(t)) {
        hits.push(p + (t.includes('class LongFormWritingEngine') ? '  [ENGINE]' : ''));
      }
    }
  }
}
walk(root);
console.log(hits.join('\n'));
