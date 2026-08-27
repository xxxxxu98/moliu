const fs = require('fs');
const path = require('path');
const root = 'D:/project/2026/moliu/src/renderer/src';
const hits = [];
function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (!/__tests__|node_modules/.test(f)) walk(p); }
    else if (/\.ts$/.test(f) && !/test/.test(f)) {
      const t = fs.readFileSync(p, 'utf8');
      const m = t.match(/export function normalizeWebnovelParagraphs[\s\S]{0,2000}/);
      if (m) hits.push({ file: p, body: m[0] });
    }
  }
}
walk(root);
for (const h of hits) {
  console.log('===== ' + h.file + ' =====');
  console.log(h.body.slice(0, 1800));
}
