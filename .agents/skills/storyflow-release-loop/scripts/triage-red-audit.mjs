// final2 两个 dead-resurrection 红签名的定性取证 → 落盘 UTF-8
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node triage-red-audit.mjs <书审目录>');
  process.exit(1);
}
const ch = n => {
  const p = path.join(dir, `${String(n).padStart(3, '0')}.txt`);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
const out = [];
const show = (label, text, kw, span = 140) => {
  const i = text.indexOf(kw);
  if (i < 0) {
    out.push(`${label}: 未命中「${kw}」`);
    return;
  }
  out.push(`${label}: …${text.slice(Math.max(0, i - span / 2), i + kw.length + span / 2).replace(/\s+/g, '')}…`);
};

out.push('===== 严嵩平：下狱事件与后期出场 =====');
for (const n of [56, 57, 58]) {
  const t = ch(n);
  if (t) show(`ch${n}`, t, '严嵩平');
}
for (const n of [70, 71, 72, 94, 95]) {
  const t = ch(n);
  if (!t) continue;
  const count = t.split('严嵩平').length - 1;
  out.push(`\nch${n} 严嵩平×${count}`);
  show(`ch${n}首现`, t, '严嵩平');
}
// 解除信号扫描：越狱/平反/赦免/官复原职
out.push('\n解除信号扫描（60章后）:');
for (let n = 58; n <= 99; n += 1) {
  const t = ch(n);
  if (!t) continue;
  if (/(?:越狱|劫狱|劫出|救出|平反|翻案|赦免|大赦|官复原职|起复)/.test(t) && t.includes('严嵩平')) {
    show(`ch${n}`, t, '严嵩平', 200);
  }
}

out.push('\n\n===== 顾成舟：ch75 死亡 vs ch76+ 存活 =====');
for (const n of [74, 75, 76, 77]) {
  const t = ch(n);
  if (!t) continue;
  const count = t.split('顾成舟').length - 1;
  out.push(`\nch${n} 顾成舟×${count}`);
  for (const kw of ['顾成舟']) {
    let idx = 0;
    let hits = 0;
    while (hits < 3) {
      const i = t.indexOf(kw, idx);
      if (i < 0) break;
      out.push(`  …${t.slice(Math.max(0, i - 70), i + 90).replace(/\s+/g, '')}…`);
      idx = i + kw.length;
      hits += 1;
    }
  }
}
out.push('\n假死/替身信号扫描（70-90章）:');
for (let n = 70; n <= 90; n += 1) {
  const t = ch(n);
  if (!t) continue;
  if (/(?:假死|诈死|替身|金蝉脱壳|尸首|遗体|棺椁|发丧|举丧|死讯)/.test(t) && t.includes('顾成舟')) {
    const i = Math.max(
      ...['假死', '诈死', '替身', '金蝉脱壳', '死讯'].map(k => t.lastIndexOf(k))
    );
    out.push(`ch${n}: …${t.slice(Math.max(0, i - 80), i + 80).replace(/\s+/g, '')}…`);
  }
}

fs.writeFileSync(path.join(dir, 'triage-red-audit.txt'), out.join('\n'), 'utf8');
console.log('written triage-red-audit.txt');
