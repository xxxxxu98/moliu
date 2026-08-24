// 验证所有 raw.split(字面量) 的守卫状态
import fs from 'node:fs';

function scan(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) { if (!/node_modules|dist/.test(e.name)) scan(p); continue; }
    if (!/\.(ts|mjs)$/.test(e.name)) continue;
    const s = fs.readFileSync(p, 'utf8');
    const re = /(\w+)\s*\.\s*split\s*\(/g;
    let m;
    while ((m = re.exec(s))) {
      const before = s.slice(Math.max(0, m.index - 200), m.index);
      if (m[1] !== 'raw') continue;
      const guarded = /typeof raw === 'string'|Array\.isArray\(raw\)|raw\?\./.test(before);
      const line = s.slice(s.lastIndexOf('\n', m.index) + 1, s.indexOf('\n', m.index));
      console.log(guarded ? 'GUARDED' : 'UNGUARDED', p, '|', line.trim().slice(0, 110));
    }
  }
}
scan('src');
scan('scripts');
console.log('done');
