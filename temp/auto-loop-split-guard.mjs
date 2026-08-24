// 扫 rolling/story-runtime/outline 目录里无类型守卫的 .split 调用
import fs from 'node:fs';

const dirs = [
  'src/renderer/src/services/outline/rolling',
  'src/renderer/src/services/story-runtime',
  'src/renderer/src/services/outline/generators',
];
for (const d of dirs) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (!/\.(ts|mjs)$/.test(e.name)) continue;
    const path = `${d}/${e.name}`;
    const lines = fs.readFileSync(path, 'utf8').split('\n');
    lines.forEach((l, i) => {
      const m = /(\w+)\s*\.\s*split\s*\(/.exec(l);
      if (!m) return;
      const v = m[1];
      const block = lines.slice(Math.max(0, i - 6), i).join(' ');
      const guarded =
        new RegExp(`Array\\.isArray\\(${v}\\)|typeof ${v} === 'string'`).test(block) ||
        l.includes(`?${v}.split`) ||
        l.includes(`${v}?.`);
      if (!guarded) console.log(path, `L${i + 1}`, v, '|', l.trim().slice(0, 110));
    });
  }
}
console.log('scan done');
