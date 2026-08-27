const fs = require('fs');
const path = require('path');
const root = 'D:/project/2026/moliu/src';
const needles = ['buildRecentChaptersFullText', 'recentChapterCount'];
const hits = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|mts)$/.test(f)) {
      const t = fs.readFileSync(p, 'utf8');
      for (const n of needles) if (t.includes(n)) hits.push(n + ' -> ' + p);
    }
  }
}
walk(root);
console.log(hits.length ? hits.join('\n') : '(no callers found)');
