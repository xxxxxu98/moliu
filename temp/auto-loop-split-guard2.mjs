// 终极扫描:全 renderer 里所有 .split 调用,报出无守卫且参数非 string 类型的
import fs from 'node:fs';

const guardRe = (v) =>
  new RegExp(`Array\\.isArray\\(${v}\\)|typeof ${v} === 'string'|\\?\\.${v}|${v}\\?\\.`);

function scan(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`;
    if (e.isDirectory()) { if (!/node_modules|dist|__tests__/.test(e.name)) scan(p); continue; }
    if (!/\.(ts|mjs)$/.test(e.name)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => {
      const m = /(\w+)\s*\.\s*split\s*\(/.exec(l);
      if (!m) return;
      const v = m[1];
      const block = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      // 已知安全:守卫块、可选链、参数类型标注 string、for-of 字符串数组元素
      if (guardRe(v).test(block) || l.includes(`?${v}`)) return;
      // 回溯声明行,看变量是否声明为 string
      for (let k = i; k >= Math.max(0, i - 12); k--) {
        const decl = new RegExp(`(const|let|function\\s+\\w+|\\()\\s*\\??\\s*${v}\\s*(:|\\)|=|,)`).exec(lines[k]);
        if (decl) {
          if (/:\s*string|string\)/.test(lines[k].slice(decl.index))) return; // 声明带 string 类型
          break;
        }
      }
      console.log(p, `L${i + 1}`, v, '|', l.trim().slice(0, 110));
    });
  }
}
scan('src/renderer/src');
console.log('done');
