// 书审定向取证工具（storyflow-release-loop）
// 用法: node bookreview-extract.mjs <书审目录> [matrix提供者目录(取 readerEvaluation)]
// 输出 <书审目录>/extract.txt（UTF-8），用 Read 工具读，勿走 CMD 控制台。
//
// 覆盖六类证据，均针对「跨章连续性」这类 precheck 测不到的问题：
//   A 回档嫌疑对：上章结尾 vs 下章开头 拼接
//   B 重点角色出场图谱（默认 严世宽；在 ENTITIES 里改）
//   C 命中「锁拿词+密谋词」双标的状态翻转嫌疑（钱万乘系）
//   D 数字/名称漂移线索（八百万/一百万、票号名、二皇子三皇子计数）
//   E outlines.txt 钩子占位符扫描
//   F 读者评分分布（min/p10/p25/median/max + 低分清单）
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
const providerDir = process.argv[3];
if (!dir || !fs.existsSync(dir)) {
  console.error('用法: node bookreview-extract.mjs <书审目录> [providerDir]');
  console.error('  书审目录须含 001.txt..NNN.txt 与 outlines.txt（assemble-matrix-bookreview 产物）');
  process.exit(1);
}
const ch = n => {
  try {
    return fs.readFileSync(path.join(dir, `${String(n).padStart(3, '0')}.txt`), 'utf8');
  } catch {
    return '';
  }
};
const lastChapter = (() => {
  for (let n = 200; n >= 1; n -= 1) if (ch(n)) return n;
  return 0;
})();
const tail = (n, len = 900) => ch(n).slice(-len);
const head = (n, len = 900) => ch(n).slice(0, len);
const out = [];

// A. 回档嫌疑对（按需改章节对）
out.push('========== A. 回档嫌疑对:上章尾 vs 下章头 ==========');
const pairs = [[15, 16], [47, 48], [60, 61], [65, 66], [66, 67], [89, 90], [90, 91]];
for (const [a, b] of pairs.filter(([pa, pb]) => pb <= lastChapter && ch(pa) && ch(pb))) {
  out.push(`\n----- 第${a}章结尾 -----\n${tail(a)}`);
  out.push(`\n----- 第${b}章开头 -----\n${head(b)}`);
}

// B. 重点角色出场图谱
const ENTITIES = ['严世宽'];
out.push('\n\n========== B. 出场图谱 ==========');
for (const name of ENTITIES) {
  out.push(`\n### ${name}`);
  for (let n = 1; n <= lastChapter; n += 1) {
    const t = ch(n);
    if (!t.includes(name)) continue;
    const hits = [];
    let idx = 0;
    while (hits.length < 6) {
      const i = t.indexOf(name, idx);
      if (i < 0) break;
      hits.push(t.slice(Math.max(0, i - 40), i + 42).replace(/\s+/g, ''));
      idx = i + name.length;
    }
    out.push(`第${n}章 ×${t.split(name).length - 1}: ${hits.join(' ┃ ')}`);
  }
}

// C. 状态翻转双标命中（锁拿词+密谋词同章）
out.push('\n\n========== C. 锁拿↔密谋 双标嫌疑 ==========');
for (let n = Math.max(1, Math.floor(lastChapter / 2)); n <= lastChapter; n += 1) {
  const t = ch(n);
  if (!/钱万乘/.test(t)) continue;
  const flags = [];
  if (/锁|枷|押|擒|拿下|归案/.test(t)) flags.push('有锁拿词');
  if (/水榭|围坐|品茶|密谋|聚会/.test(t)) flags.push('有密谋词');
  if (flags.length === 2) {
    out.push(`第${n}章 同时命中[${flags.join('+')}]`);
    const i = t.indexOf('钱万乘');
    out.push(`  上下文: ${t.slice(Math.max(0, i - 60), i + 80).replace(/\s+/g, '')}`);
  }
}

// D. 数字/名称漂移线索（换书时改这组关键词）
out.push('\n\n========== D. 数字/名称漂移线索 ==========');
{
  const probes = [
    ['八百万', 65, 67],
    ['一百万', 66, 67],
    ['天成元', 82, 82],
    ['同升和', 82, 82],
  ];
  for (const [kw, lo, hi] of probes) {
    const hits = [];
    for (let n = Math.max(1, lo); n <= Math.min(lastChapter, hi); n += 1) {
      if (ch(n).includes(kw)) hits.push(n);
    }
    if (hits.length) out.push(`"${kw}" 出现于章节: ${hits.join(',')}`);
  }
  const t90 = ch(90);
  if (t90) {
    out.push(
      `ch90 "二皇子"×${t90.split('二皇子').length - 1} / "三皇子"×${t90.split('三皇子').length - 1}`
    );
  }
}

// E. outlines 钩子占位符
out.push('\n\n========== E. 大纲钩子占位符扫描 ==========');
{
  const olPath = path.join(dir, 'outlines.txt');
  const ol = fs.existsSync(olPath) ? fs.readFileSync(olPath, 'utf8') : '';
  const bad = [];
  for (const block of ol.split('=== ')) {
    const m = block.match(/^第(\d+)章/);
    if (m && /hookText[^]{0,40}爽点类型|- 爽点类型：[^\n]{0,6}\n/.test(block)) bad.push(m[1]);
  }
  out.push(bad.length ? `含占位符残留的章: ${bad.join(',')}` : '未见占位符形态');
}

// F. 读者评分分布
out.push('\n\n========== F. 读者评分分布 ==========');
{
  let ev = null;
  for (const p of [
    providerDir && path.join(providerDir, 'storyflow.closed-loop.summary.json'),
    path.join('temp', 'storyflow.closed-loop.summary.json'),
  ]) {
    if (p && fs.existsSync(p)) {
      ev = JSON.parse(fs.readFileSync(p, 'utf8')).readerEvaluation;
      break;
    }
  }
  if (ev?.chapters) {
    const scored = ev.chapters
      .map((c, i) => ({ chapter: c.chapter ?? i + 1, score: Number(c.score ?? c.total ?? NaN) }))
      .filter(x => Number.isFinite(x.score))
      .sort((a, b) => a.score - b.score);
    const pick = p => scored[Math.min(scored.length - 1, Math.floor(p * scored.length))];
    out.push(
      `n=${scored.length} min=${scored[0].score}(ch${scored[0].chapter}) p10=${pick(0.1).score} median=${pick(0.5).score} max=${scored[scored.length - 1].score}`
    );
    out.push(
      `<60: ${scored.filter(s => s.score < 60).length} | <70: ${scored.filter(s => s.score < 70).length} | <80: ${scored.filter(s => s.score < 80).length}`
    );
    out.push(
      `低于70明细: ${scored.filter(s => s.score < 70).map(s => `ch${s.chapter}=${s.score}`).join(' ') || '无'}`
    );
  } else {
    out.push('未找到 readerEvaluation.chapters（传 providerDir 参数指向矩阵厂商子目录）');
  }
}

fs.writeFileSync(path.join(dir, 'extract.txt'), out.join('\n'), 'utf8');
console.log(`written: ${path.join(dir, 'extract.txt')} (${lastChapter} chapters scanned)`);
