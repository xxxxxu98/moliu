import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'temp/book-review/社畜官场生存指南：从九品刀笔吏到摄政权臣-0902';
const out = [];

// 1) ch186 林铁锋 死亡取证:全文中含林铁锋的段落
const ch186 = readFileSync(join(dir, '186.txt'), 'utf8');
out.push('===== ch186 全文含「林铁锋/铁锋」的段落 =====');
for (const para of ch186.split(/\n+/)) {
  if (/林铁锋|铁锋/.test(para)) out.push(para.trim().slice(0, 400));
}

// 2) 后续章 188/189/191/192/195/196 中林铁锋出场首段
for (const n of [188, 189, 191, 192, 195, 196]) {
  try {
    const t = readFileSync(join(dir, `${n}.txt`), 'utf8');
    const i = t.indexOf('林铁锋');
    out.push(`\n===== ch${n} 林铁锋 首现(偏移${i}) =====`);
    out.push(i >= 0 ? t.slice(Math.max(0, i - 100), i + 200) : '(未出现)');
  } catch (e) {
    out.push(`ch${n} ERR ${e.message}`);
  }
}

// 3) 读者评分分布
try {
  const s = JSON.parse(readFileSync('temp/storyflow-matrix-agif200r2a/provider-1787039781123/storyflow.closed-loop.summary.json', 'utf8'));
  const chs = s.readerEvaluation?.chapters || [];
  const scores = chs.map((c) => c.score).filter((x) => typeof x === 'number').sort((a, b) => a - b);
  const q = (p) => scores[Math.min(scores.length - 1, Math.floor(p * scores.length))];
  out.push('\n===== A 读者评分分布 =====');
  out.push(`n=${scores.length} min=${scores[0]} p10=${q(0.1)} p25=${q(0.25)} median=${q(0.5)} p75=${q(0.75)} max=${scores[scores.length - 1]}`);
  const low = chs.filter((c) => typeof c.score === 'number' && c.score < 80).map((c) => `ch${c.chapter ?? c.index ?? '?'}=${c.score}`).join(', ');
  out.push('低于80分: ' + (low || '(无)'));
  const zero = chs.filter((c) => c.score === 0).map((c) => JSON.stringify(c).slice(0, 200));
  out.push('零分章: ' + zero.join(' || '));
} catch (e) {
  out.push('评分分布 ERR ' + e.message);
}

// 4) ch78 空洞确认(空洞章不落盘,列出文件名核实)
const files = readdirSync(dir).filter((f) => /^0?7[6-9]\.txt$/.test(f));
out.push('\n===== ch77-79 落盘文件 =====');
out.push(files.join(', ') + ' -> ch78 文件存在与否: ' + (files.some((f) => f.startsWith('078')) ? '存在' : '不存在(空洞)'));

import { writeFileSync } from 'node:fs';
writeFileSync('temp/r2a-evidence.txt', out.join('\n'), 'utf8');
console.log('written temp/r2a-evidence.txt, lines=' + out.length);
