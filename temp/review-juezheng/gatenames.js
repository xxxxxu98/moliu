const fs = require('fs');
const dir = 'D:/project/2026/moliu/src/renderer/src/services/gates';
const out = [];
for (const f of fs.readdirSync(dir)) {
  if (/^Gate[1-8]/.test(f) && /\.ts$/.test(f) && !/test/.test(f)) {
    const t = fs.readFileSync(dir + '/' + f, 'utf8');
    const name = (t.match(/name:\s*'([^']+)'/) || [])[1] || '';
    const desc = (t.match(/\/\*\*([^*]+)\*\//) || [])[1] || '';
    out.push(f + '  ->  ' + name + '  |  ' + desc.replace(/\s+/g, ' ').trim().slice(0, 120));
  }
}
console.log(out.join('\n'));
