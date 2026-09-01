import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/我在朝廷推行末位淘汰-0831';
const num = n => String(n).padStart(3, '0');
const out = [];

// 取各嫌疑边界:上章尾800字 + 下章头800字
const pairs = [
  [96, 109, '崔景渊 ch96革职下狱 → ch109当堂活跃?'],
  [148, 150, '崔景渊 ch148定罪下狱流放 → ch150后?'],
  [157, 181, '赵元泰 ch157削爵下狱 → ch181午门诬陷?'],
  [139, 141, '崔景渊 ch139停职收印 → ch141?'],
];
for (const [a, b, label] of pairs) {
  out.push(`\n===== ${label} =====`);
  const ta = readFileSync(join(dir, `${num(a)}.txt`), 'utf8');
  const tb = readFileSync(join(dir, `${num(b)}.txt`), 'utf8');
  out.push(`--- ch${a} 尾部600字 ---`);
  out.push(ta.slice(-600));
  out.push(`--- ch${b} 头部600字 ---`);
  out.push(tb.slice(0, 600));
}

// 全书崔景渊/赵元泰的章分布
for (const name of ['崔景渊', '赵元泰']) {
  const hits = [];
  for (let n = 1; n <= 200; n++) {
    try {
      const t = readFileSync(join(dir, `${num(n)}.txt`), 'utf8');
      const c = t.split(name).length - 1;
      if (c > 0) hits.push(`ch${n}×${c}`);
    } catch { /* 空洞 */ }
  }
  out.push(`\n===== ${name} 章分布 =====\n${hits.join(' ')}`);
}

writeFileSync('temp/b-villain-reset.md', out.join('\n'), 'utf8');
console.log('written temp/b-villain-reset.md');
