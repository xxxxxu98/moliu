#!/usr/bin/env node
// 书籍产物确定性预检:引号配对/直引号、钩子截断、钩子链衔接、AI词频、段落CV、章界重演、场景切分形态。
// 用法:
//   node book-precheck.mjs <导出目录>               # 生成 metrics.json + 控制台摘要
//   node book-precheck.mjs --diff <旧目录> <新目录>  # 对比两轮 metrics.json(修复/续写前后)
// 所有阈值只是"要不要看一眼"的分界,不是 blocker;最终判定由 AI 结合语境做。
import fs from 'node:fs';
import path from 'node:path';

const AI_WORDS = [
  '瞬间', '如同', '轻轻', '突然', '缓缓', '微微', '一抹', '仿佛', '此刻', '一丝',
  '犹如', '淡淡', '深吸了一口气', '眼中闪过', '嘴角勾起', '不由得', '不容置疑',
  '他知道', '这一刻', '以肉眼可见的速度',
];
const HOOK_TERMINAL = /[。！？…；）】」』”』]$/u;
const HOOK_HARD_CUT_LEN = [24, 25, 26]; // 旧 sanitize 硬切口径,命中即高概率残句
const SCENE_BREAK = /\n\s*(?:---+|={3,}|#{1,3}\s*场景[^\n]*|\*{3,})\s*\n|\n{3,}/u;

function listChapterFiles(dir) {
  return fs.readdirSync(dir).filter(f => /^\d{3}\.txt$/.test(f)).sort();
}

function chapterBody(raw) {
  const idx = raw.indexOf('\n\n');
  return idx >= 0 ? raw.slice(idx + 2) : raw;
}

function bigrams(text) {
  const s = text.replace(/\s/g, '');
  const set = new Set();
  for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
  return set;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

function analyzeChapter(file, raw) {
  const body = chapterBody(raw);
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const lens = paras.map(p => p.replace(/\s/g, '').length);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1);
  const aiWords = {};
  for (const w of AI_WORDS) {
    const n = body.split(w).length - 1;
    if (n > 0) aiWords[w] = n;
  }
  return {
    file,
    words: body.replace(/\s/g, '').length,
    quoteOpen: (body.match(/\u201C/g) || []).length,
    quoteClose: (body.match(/\u201D/g) || []).length,
    straightQuotes: (body.match(/"/g) || []).length,
    paraCount: paras.length,
    avgParaLen: Math.round(mean),
    paraCV: mean > 0 ? Number((Math.sqrt(variance) / mean).toFixed(2)) : 0,
    sceneChunks: body.split(SCENE_BREAK).map(s => s.trim()).filter(Boolean).length,
    aiWords,
    head: body.slice(0, 150),
    tail: body.slice(-200),
  };
}

function parseHooks(outlineText) {
  const hooks = [];
  const re = /=== (.*?)(?: \(orderIndex=\d+\))? ===[\s\S]*?【(CBN|CEN)】(.+)/g;
  let m;
  while ((m = re.exec(outlineText)) !== null) {
    hooks.push({ title: m[1], kind: m[2], text: m[3].trim() });
  }
  return hooks;
}

// 按章解析大纲节点原句（CBN/CPNs/CEN），供"节点漏入正文"扫描。
// 【必须覆盖】/【禁区】是指令性文字，刻意不扫（逐字进正文属正常改写来源，误报高）。
function parseOutlineNodes(outlineText) {
  const chapters = [];
  const chapterRe = /=== (.*?)(?: \(orderIndex=\d+\))? ===\n([\s\S]*?)(?=\n=== |$)/g;
  let cm;
  while ((cm = chapterRe.exec(outlineText)) !== null) {
    const title = cm[1];
    const nodes = [];
    const nodeRe = /【(CBN|CEN|CPNs)】([\s\S]*?)(?=\n【|$)/g;
    let nm;
    while ((nm = nodeRe.exec(cm[2])) !== null) {
      const kind = nm[1];
      for (const line of nm[2].split('\n')) {
        const text = line.trim();
        if (!text) continue;
        if (kind === 'CPNs' && /^【|^---/.test(text)) break;
        nodes.push({ kind, text });
      }
    }
    chapters.push({ title, nodes });
  }
  return chapters;
}

function runChecks(dir) {
  const report = { generatedAt: new Date().toISOString(), dir, chapters: [], hookIssues: [], nodeLeaks: [], boundaryOverlaps: [], aiWordTotals: {} };
  const files = listChapterFiles(dir);
  const chapters = files.map(f => analyzeChapter(f, fs.readFileSync(path.join(dir, f), 'utf8')));
  report.chapters = chapters.map(({ head, tail, ...rest }) => rest);

  // 章界重演:上一章结尾 vs 本章开头 bigram 相似度
  for (let i = 1; i < chapters.length; i += 1) {
    const sim = jaccard(bigrams(chapters[i - 1].tail), bigrams(chapters[i].head));
    if (sim >= 0.15) {
      report.boundaryOverlaps.push({
        at: `${chapters[i - 1].file}→${chapters[i].file}`,
        similarity: Number(sim.toFixed(2)),
        level: sim >= 0.3 ? 'high' : 'watch',
        chapterHead: chapters[i].head.slice(0, 60),
      });
    }
  }

  // 钩子检查:未以终止符收尾(残句嫌疑) + 钩子链同拍复述
  const outlinePath = path.join(dir, 'outlines.txt');
  if (fs.existsSync(outlinePath)) {
    const hooks = parseHooks(fs.readFileSync(outlinePath, 'utf8'));
    for (const h of hooks) {
      if (!HOOK_TERMINAL.test(h.text) || HOOK_HARD_CUT_LEN.includes(h.text.length)) {
        report.hookIssues.push({ ...h, length: h.text.length, reason: !HOOK_TERMINAL.test(h.text) ? '未以终止符收尾' : '长度落在旧硬切口径' });
      }
    }
    for (let i = 1; i < hooks.length; i += 1) {
      const prev = hooks[i - 1];
      const cur = hooks[i];
      if (prev.kind === 'CEN' && cur.kind === 'CBN') {
        const sim = jaccard(bigrams(prev.text), bigrams(cur.text));
        if (sim >= 0.55) {
          report.hookIssues.push({ title: cur.title, kind: 'CBN', text: cur.text, length: cur.text.length, reason: sim >= 0.95 ? '与上章CEN同拍逐字复述' : `与上章CEN高度相似(${sim.toFixed(2)})` });
        }
      }
    }

    // 节点原句漏入正文：大纲 CBN/CPNs/CEN 逐句去空白后 ≥10 字逐字命中本章正文
    // （2026-08-28 r2 百章 ch20 实测两处大纲节点整句漏进终稿，读者评审标记为
    // "大纲/分镜提示词残留"）。正文必须情节兑现节点，不是逐字抄节点。
    const outlineChapters = parseOutlineNodes(fs.readFileSync(outlinePath, 'utf8'));
    for (let i = 0; i < chapters.length; i += 1) {
      const meta = outlineChapters[i];
      if (!meta || meta.nodes.length === 0) continue;
      const raw = fs.readFileSync(path.join(dir, chapters[i].file), 'utf8');
      const bodyNormText = chapterBody(raw).replace(/\s/g, '');
      for (const node of meta.nodes) {
        const norm = node.text.replace(/\s/g, '');
        if (norm.length >= 10 && bodyNormText.includes(norm)) {
          report.nodeLeaks.push({ title: meta.title, file: chapters[i].file, kind: node.kind, text: node.text });
        }
      }
    }
  }

  // AI 词频汇总
  for (const c of chapters) {
    for (const [w, n] of Object.entries(c.aiWords || {})) {
      report.aiWordTotals[w] = (report.aiWordTotals[w] || 0) + n;
    }
  }
  return report;
}

function printSummary(r) {
  const written = r.chapters;
  const quoteMismatch = written.filter(c => c.quoteOpen !== c.quoteClose);
  const straight = written.filter(c => c.straightQuotes > 0);
  const cvRed = written.filter(c => c.paraCV < 0.15 && c.paraCount >= 8);
  const sceneShape = written.map(c => c.sceneChunks);
  console.log(`== 书籍产物预检(${written.length} 章有正文) ==`);
  console.log(`引号不配对章节: ${quoteMismatch.length}${quoteMismatch.length ? ' -> ' + quoteMismatch.map(c => `${c.file}(${c.quoteOpen}/${c.quoteClose})`).join(' ') : ''}`);
  console.log(`含ASCII直引号章节: ${straight.length}${straight.length ? ' -> ' + straight.map(c => `${c.file}(${c.straightQuotes})`).join(' ') : ''}`);
  console.log(`段落CV过低(<0.15,AI腔): ${cvRed.length}${cvRed.length ? ' -> ' + cvRed.map(c => `${c.file}(cv=${c.paraCV})`).join(' ') : ''}`);
  console.log(`钩子问题(残句/同拍复述): ${r.hookIssues.length}`);
  for (const h of r.hookIssues.slice(0, 12)) console.log(`  [${h.title}] ${h.kind}: ${h.text.slice(0, 40)} (${h.reason})`);
  console.log(`大纲节点原句漏入正文: ${r.nodeLeaks.length}`);
  for (const n of r.nodeLeaks.slice(0, 12)) console.log(`  [${n.title}] ${n.kind}: ${n.text.slice(0, 40)}`);
  console.log(`章界重演嫌疑: ${r.boundaryOverlaps.length}`);
  for (const b of r.boundaryOverlaps) console.log(`  ${b.at} sim=${b.similarity} [${b.level}] ${b.chapterHead}`);
  const aiSorted = Object.entries(r.aiWordTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`AI词频Top10: ${aiSorted.map(([w, n]) => `${w}x${n}`).join(' ') || '(无)'}`);
  console.log(`场景切分形态(每章块数): ${sceneShape.join(',')}`);
}

function diffReports(oldR, newR) {
  console.log('== 两轮对比 ==');
  const agg = r => ({
    引号不配对: r.chapters.filter(c => c.quoteOpen !== c.quoteClose).length,
    直引号章节: r.chapters.filter(c => c.straightQuotes > 0).length,
    钩子问题: r.hookIssues.length,
    节点漏入: r.nodeLeaks.length,
    章界重演high: r.boundaryOverlaps.filter(b => b.level === 'high').length,
    章界重演watch: r.boundaryOverlaps.length,
    CV红章: r.chapters.filter(c => c.paraCV < 0.15 && c.paraCount >= 8).length,
    AI词总量: Object.values(r.aiWordTotals).reduce((a, b) => a + b, 0),
    有正文章数: r.chapters.length,
  });
  const a = agg(oldR);
  const b = agg(newR);
  for (const k of Object.keys(a)) {
    const mark = b[k] < a[k] ? '改善' : b[k] > a[k] ? '恶化' : '持平';
    console.log(`  ${k}: ${a[k]} -> ${b[k]} (${mark})`);
  }
}

const argv = process.argv.slice(2);
if (argv[0] === '--diff') {
  if (argv.length < 3) {
    console.error('用法: node book-precheck.mjs --diff <旧目录> <新目录>');
    process.exit(1);
  }
  const oldR = JSON.parse(fs.readFileSync(path.join(argv[1], 'metrics.json'), 'utf8'));
  const newR = fs.existsSync(path.join(argv[2], 'metrics.json'))
    ? JSON.parse(fs.readFileSync(path.join(argv[2], 'metrics.json'), 'utf8'))
    : runChecks(argv[2]);
  diffReports(oldR, newR);
} else {
  if (argv.length < 1) {
    console.error('用法: node book-precheck.mjs <导出目录>');
    process.exit(1);
  }
  const r = runChecks(argv[0]);
  fs.writeFileSync(path.join(argv[0], 'metrics.json'), JSON.stringify(r, null, 1), 'utf8');
  printSummary(r);
  console.log(`metrics.json 已写入 ${argv[0]}`);
}
