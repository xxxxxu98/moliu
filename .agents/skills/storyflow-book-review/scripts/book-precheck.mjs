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

// ---- 2026-10-05 新增三族的正文侧确定性扫描（数字漂移/时间标记/生理节律）----
// 离线预检是分析工具不是运行时门禁，允许宽词面网；判定仍由 AI 通读结合语境做。
const NUM_TOKEN_RE =
  /([0-9]+(?:\.[0-9]+)?|[一二三四五六七八九十百千万零]{1,8})(万|亿)?(吨|千米|公里|米|公斤|千克|克|斤|两|石|亩|岁|年|天|日|小时|时辰|刻钟|次|届|名|人|个|只|头|条|艘|辆|箱|倍|折|成|点|信用点|学分|灵币|金币|银币)/g;
const CURRENCY_UNITS = new Set(['信用点', '学分', '灵币', '金币', '银币', '两', '石']);
// 漂移报告只收敏感单位（金额/重量/倍数/时长/年龄）：只/头/个/次/条等通用量词
// 的多值是正常场景描写，列出来全是噪音（2026-10-05 首跑实证 16 单位大半无用）
const SENSITIVE_DRIFT_UNITS = new Set([
  '吨', '斤', '公斤', '千克', '克', '万', '亿', '倍', '折', '成',
  '年', '个月', '月', '天', '日', '小时', '时辰', '刻钟', '岁', '点',
  ...CURRENCY_UNITS,
]);
const TIME_MARKER_RE =
  /(次日|翌日|当夜|当晚|深夜|半夜|凌晨|黎明|清晨|清晨|黄昏|傍晚|入夜|当日|[一二三四五六七八九十\d]+\s*(?:个?天|日|小时|时辰)(?:后|内|之?[前后])?)/g;
const PHYSIO_RE =
  /(吃饭|进餐|用餐|吃了|啃[了口个]|扒[了口]饭|馒头|面包|泡面|食堂|早餐|早饭|午饭|晚饭|晚餐|宵夜|喝[水了一口]|水壶|水杯|饥饿|饿得|肚子叫|睡[觉一二个得着]|入睡|补眠|打盹|困意|哈欠|洗漱|梳洗|擦拭|擦把脸|疲惫|疲劳|歇[了口下]|喘息|旧伤|伤口|换药|包扎)/;

function scanChapterExtras(body) {
  const numericTokens = [];
  let m;
  NUM_TOKEN_RE.lastIndex = 0;
  while ((m = NUM_TOKEN_RE.exec(body)) !== null) {
    numericTokens.push({ raw: m[0], value: m[1], unit: m[3], ctx: body.slice(Math.max(0, m.index - 10), m.index + m[0].length + 4).replace(/\s/g, '') });
  }
  const timeMarkers = [...new Set((body.match(TIME_MARKER_RE) || []).map(s => s.trim()))];
  const physioHits = (body.match(new RegExp(PHYSIO_RE.source, 'g')) || []).length;
  return { numericTokens, timeMarkers, physioHits };
}

function analyzeChapter(file, raw) {
  const body = chapterBody(raw);
  const extras = scanChapterExtras(body);
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const lens = paras.map(p => p.replace(/\s/g, '').length);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1);
  // 叙述段（无引号段）单列：对话段混在全体里会拉低均值、拉高 CV，「全章叙述段
  // 都是 200 字墙」在 avgParaLen/paraCV 上全绿（2026-09-27 与 typesetting
  // NARRATIVE_MEDIAN_CHARS_THRESHOLD=120 同源，跑一轮真实回归后统一冻结）
  const narrativeLens = paras
    .filter(p => !/["'\u201C\u201D\u2018\u2019「」『』]/u.test(p))
    .map(p => p.replace(/\s/g, '').length)
    .sort((a, b) => a - b);
  const narrativeMedian = narrativeLens.length
    ? narrativeLens.length % 2 === 1
      ? narrativeLens[(narrativeLens.length - 1) / 2]
      : (narrativeLens[narrativeLens.length / 2 - 1] + narrativeLens[narrativeLens.length / 2]) / 2
    : 0;
  const narrativeWallRatio = narrativeLens.length
    ? narrativeLens.filter(l => l > 160).length / narrativeLens.length
    : 0;
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
    narrativeParaCount: narrativeLens.length,
    narrativeMedian: Math.round(narrativeMedian),
    narrativeWallRatio: Number(narrativeWallRatio.toFixed(2)),
    sceneChunks: body.split(SCENE_BREAK).map(s => s.trim()).filter(Boolean).length,
    aiWords,
    numericTokens: extras.numericTokens,
    timeMarkers: extras.timeMarkers,
    physioHits: extras.physioHits,
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
  const report = { generatedAt: new Date().toISOString(), dir, chapters: [], hookIssues: [], nodeLeaks: [], boundaryOverlaps: [], aiWordTotals: {}, numericDriftSuspects: [], physioZeros: [], timeMarkerTable: [] };
  const files = listChapterFiles(dir);
  const chapters = files.map(f => analyzeChapter(f, fs.readFileSync(path.join(dir, f), 'utf8')));
  report.chapters = chapters.map(({ head, tail, ...rest }) => rest);

  // ---- 数字漂移候选（2026-10-05 都市文书审实证：债务 30万/300万/30万三说、
  // 蛮牛两吨/三十吨）：同单位出现多个不同数值 → 列成事实表交 AI 通读复核。
  // 货币类单位一律列出（金额漂移读者最敏感）；其他单位数值比 ≥2 才列。
  const byUnit = new Map();
  for (const c of chapters) {
    for (const t of c.numericTokens || []) {
      if (!byUnit.has(t.unit)) byUnit.set(t.unit, []);
      byUnit.get(t.unit).push({ ch: c.file, value: t.value, ctx: t.ctx });
    }
  }
  const parseNum = v => {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const cn = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (/^[十百千万零一两二三四五六七八九]+$/.test(v)) {
      // 简化中文数字解析（十/百/千/万 量级），预检用途足够
      let total = 0, current = 0;
      for (const ch of v) {
        if (ch in cn) { current = cn[ch]; if (ch === '十') { total += (current || 1) * 10; current = 0; } }
        else if (ch === '十') { total += (current || 1) * 10; current = 0; }
        else if (ch === '百') { total += (current || 1) * 100; current = 0; }
        else if (ch === '千') { total += (current || 1) * 1000; current = 0; }
        else if (ch === '万') { total = (total + current) * 10000; current = 0; }
      }
      return total + current;
    }
    return NaN;
  };
  for (const [unit, tokens] of byUnit) {
    const values = [...new Set(tokens.map(t => t.value))];
    if (values.length < 2) continue;
    const nums = values.map(parseNum).filter(Number.isFinite);
    const spread = nums.length >= 2 ? Math.max(...nums) / Math.min(...nums) : 1;
    if ((CURRENCY_UNITS.has(unit) || spread >= 2) && SENSITIVE_DRIFT_UNITS.has(unit)) {
      report.numericDriftSuspects.push({
        unit,
        values: tokens.map(t => `${t.ch}:${t.value}${unit}「${t.ctx.slice(0, 24)}」`),
      });
    }
  }

  // ---- 生理节律覆盖：零命中章清单（主角活人感体检）----
  report.physioZeros = chapters.filter(c => (c.physioHits || 0) === 0).map(c => c.file);

  // ---- 时间标记表：每章的显式时间词（时间流逝可感知性体检）----
  report.timeMarkerTable = chapters.map(c => ({ ch: c.file, markers: c.timeMarkers || [] }));

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
  // 残句判定只看终止符：旧 sanitize「剥终止符不补回」bug 修复后，长度落在旧硬切
  // 区间(24-26字)的完整钩子是合格钩子——r9 基线 100 章实证单凭长度误报 15/100 章。
  const outlinePath = path.join(dir, 'outlines.txt');
  if (fs.existsSync(outlinePath)) {
    const hooks = parseHooks(fs.readFileSync(outlinePath, 'utf8'));
    for (const h of hooks) {
      if (!HOOK_TERMINAL.test(h.text)) {
        report.hookIssues.push({ ...h, length: h.text.length, reason: '未以终止符收尾' });
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
  // 双触发与 typesetting NARRATIVE_* 同源：中位 ≥120（默认节奏就是墙）或
  // 墙占比 ≥0.15（散点墙：中位正常但 160+ 墙成片）
  const isNarrativeHeavy = c =>
    (c.narrativeMedian ?? 0) >= 120 || (c.narrativeWallRatio ?? 0) >= 0.15;
  const narrativeHeavy = written.filter(c => isNarrativeHeavy(c) && (c.narrativeParaCount ?? 0) >= 8);
  const narrativeMedians = written.map(c => c.narrativeMedian).sort((a, b) => a - b);
  const bookNarrativeMedian = narrativeMedians.length
    ? narrativeMedians[Math.floor((narrativeMedians.length - 1) / 2)]
    : 0;
  const sceneShape = written.map(c => c.sceneChunks);
  console.log(`== 书籍产物预检(${written.length} 章有正文) ==`);
  console.log(`引号不配对章节: ${quoteMismatch.length}${quoteMismatch.length ? ' -> ' + quoteMismatch.map(c => `${c.file}(${c.quoteOpen}/${c.quoteClose})`).join(' ') : ''}`);
  console.log(`含ASCII直引号章节: ${straight.length}${straight.length ? ' -> ' + straight.map(c => `${c.file}(${c.straightQuotes})`).join(' ') : ''}`);
  console.log(`段落CV过低(<0.15,AI腔): ${cvRed.length}${cvRed.length ? ' -> ' + cvRed.map(c => `${c.file}(cv=${c.paraCV})`).join(' ') : ''}`);
  console.log(`叙述段过重(中位≥120或墙占比≥15%): ${narrativeHeavy.length}/${written.length}，全书叙述段中位数中位=${bookNarrativeMedian}${narrativeHeavy.length ? ' -> 最重 ' + narrativeHeavy.sort((a, b) => (b.narrativeWallRatio ?? 0) - (a.narrativeWallRatio ?? 0) || b.narrativeMedian - a.narrativeMedian).slice(0, 8).map(c => `${c.file}(中位${c.narrativeMedian}/墙${Math.round((c.narrativeWallRatio ?? 0) * 100)}%)`).join(' ') : ''}`);
  console.log(`钩子问题(残句/同拍复述): ${r.hookIssues.length}`);
  for (const h of r.hookIssues.slice(0, 12)) console.log(`  [${h.title}] ${h.kind}: ${h.text.slice(0, 40)} (${h.reason})`);
  console.log(`大纲节点原句漏入正文: ${r.nodeLeaks.length}`);
  for (const n of r.nodeLeaks.slice(0, 12)) console.log(`  [${n.title}] ${n.kind}: ${n.text.slice(0, 40)}`);
  console.log(`章界重演嫌疑: ${r.boundaryOverlaps.length}`);
  for (const b of r.boundaryOverlaps) console.log(`  ${b.at} sim=${b.similarity} [${b.level}] ${b.chapterHead}`);
  const aiSorted = Object.entries(r.aiWordTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(`AI词频Top10: ${aiSorted.map(([w, n]) => `${w}x${n}`).join(' ') || '(无)'}`);
  console.log(`场景切分形态(每章块数): ${sceneShape.join(',')}`);
  // ---- 2026-10-05 三族新检查 ----
  console.log(`数字漂移候选(同单位多值,交AI复核): ${(r.numericDriftSuspects || []).length} 个单位`);
  for (const d of (r.numericDriftSuspects || []).slice(0, 10)) {
    console.log(`  [${d.unit}] ${d.values.length} 处: ${d.values.slice(0, 6).join(' | ')}${d.values.length > 6 ? ' ...' : ''}`);
  }
  const zeroTime = (r.timeMarkerTable || []).filter(t => (t.markers || []).length === 0).map(t => t.ch);
  console.log(`生理节律零锚点章: ${(r.physioZeros || []).length}/${written.length}${(r.physioZeros || []).length ? ' -> ' + r.physioZeros.join(' ') : ''}`);
  console.log(`零时间标记章: ${zeroTime.length}/${written.length}${zeroTime.length ? ' -> ' + zeroTime.join(' ') : ''}`);
}

function diffReports(oldR, newR) {
  console.log('== 两轮对比 ==');
  const bookNarrativeMedian = r => {
    const medians = r.chapters.map(c => c.narrativeMedian ?? 0).sort((a, b) => a - b);
    return medians.length ? medians[Math.floor((medians.length - 1) / 2)] : 0;
  };
  const agg = r => ({
    引号不配对: r.chapters.filter(c => c.quoteOpen !== c.quoteClose).length,
    直引号章节: r.chapters.filter(c => c.straightQuotes > 0).length,
    钩子问题: r.hookIssues.length,
    节点漏入: r.nodeLeaks.length,
    章界重演high: r.boundaryOverlaps.filter(b => b.level === 'high').length,
    章界重演watch: r.boundaryOverlaps.length,
    CV红章: r.chapters.filter(c => c.paraCV < 0.15 && c.paraCount >= 8).length,
    叙述段过重章: r.chapters.filter(c => ((c.narrativeMedian ?? 0) >= 120 || (c.narrativeWallRatio ?? 0) >= 0.15) && (c.narrativeParaCount ?? 0) >= 8).length,
    叙述段中位: bookNarrativeMedian(r),
    AI词总量: Object.values(r.aiWordTotals).reduce((a, b) => a + b, 0),
    有正文字数中位: (() => { const w = r.chapters.map(c => c.words).sort((a, b) => a - b); return w.length ? w[Math.floor((w.length - 1) / 2)] : 0; })(),
    有正文章数: r.chapters.length,
  });
  const a = agg(oldR);
  const b = agg(newR);
  // 字数中位下降=恶化：段落机制合同的风险是模型砍字数应付拆段，diff 必须盯住
  const higherIsBetter = new Set(['有正文字数中位', '有正文章数']);
  for (const k of Object.keys(a)) {
    const mark =
      b[k] === a[k]
        ? '持平'
        : higherIsBetter.has(k)
          ? b[k] > a[k] ? '改善' : '恶化'
          : b[k] < a[k] ? '改善' : '恶化';
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
