#!/usr/bin/env node
/**
 * Storyflow 矩阵产物确定性 triage：把 temp/storyflow-matrix/ 的 run.log / summary /
 * trace 解析成结构化「失败签名」清单，供 storyflow-auto-loop 循环做诊断决策与回归 diff。
 *
 *   node scripts/storyflow-triage.mjs                      # triage 当前矩阵产物
 *   node scripts/storyflow-triage.mjs --provider id1,id2   # 只看指定厂商
 *   node scripts/storyflow-triage.mjs --diff               # 对比最近两份历史报告
 *   node scripts/storyflow-triage.mjs --diff a.json b.json # 对比指定两份报告
 *   node scripts/storyflow-triage.mjs --json               # 报告 JSON 直接打到 stdout
 *
 * 产物：temp/storyflow-triage/report-<时间戳>.json（每次 triage 追加）+ latest.json。
 * --diff 默认取历史目录里最近两份报告；签名身份键 = model|签名id|章节，
 * 输出 已消失/持续存在/新增 三组，新增中出现红签名（阻断级）时退出码 1。
 *
 * 签名分级：
 * - 红（阻断）：未被 accept 的章节的质量拒绝（未履约节点/语义问题）、断言失败
 * - 黄（已恢复）：被重试/压缩兜住的瞬态网络错误、字数超限、空响应、大纲阶段告警
 *
 * 判定（verdict）优先级：
 *   model-capability-suspect > quality-rejection > infra-failure > pipeline-bug
 *   > passed-with-repairs > clean-with-noise > clean
 * 其中 model-capability-suspect = 同章节质量拒绝 ≥3 轮（重试无法收敛，修代码无意义，
 * 应换模型或调合同并人工确认）——这是自动循环的「停止 patch」信号。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = join(process.cwd(), 'temp');
const MATRIX_DIR = join(TEMP_DIR, 'storyflow-matrix');
const TRIAGE_DIR = join(TEMP_DIR, 'storyflow-triage');
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const EVIDENCE_MAX = 160;

// ---------- 单条 reviewer 问题文本 → 签名 ----------
function parseIssue(text) {
  const t = text.trim();
  let m = t.match(/^语义问题\[(\w+)\]\s*([^：]+)[:：]\s*([\s\S]+)$/);
  if (m) {
    const type = m[1];
    const id =
      type === 'logic_gap'
        ? 'quality.logic-gap'
        : type === 'foreshadow'
          ? 'quality.foreshadow-premature'
          : `quality.semantic-${type}`;
    return { id, evidence: `${m[2].trim()}: ${m[3].trim()}` };
  }
  m = t.match(/^字数(?:严重)?超限：当前约\s*(\d+)\s*字，?最多允许\s*(\d+)\s*字（目标\s*(\d+)）?/);
  if (m) {
    return {
      id: 'quality.words-overlimit',
      evidence: `当前 ${m[1]} / 上限 ${m[2]} / 目标 ${m[3]}`,
    };
  }
  m = t.match(/^未履约节点[:：]\s*([^（(]+)/);
  if (m) {
    return { id: 'quality.node-unfulfilled', evidence: `未履约节点：${m[1].trim()}` };
  }
  if (t.includes('未在角色表登记')) {
    return { id: 'quality.unregistered-character', evidence: t };
  }
  m = t.match(/^字数(?:严重)?不足：当前约\s*(\d+)\s*字，?至少需\s*(\d+)/);
  if (m) {
    return { id: 'quality.words-underlimit', evidence: `当前 ${m[1]} / 下限 ${m[2]}` };
  }
  if (t.includes('对话未使用中文引号')) {
    return { id: 'quality.dialogue-quotes', evidence: t };
  }
  return { id: 'quality.review-other', evidence: t };
}

function classifyTransient(reason) {
  if (reason.includes('502')) return 'infra.transient.http-502';
  if (reason.includes('429')) return 'infra.transient.http-429';
  // 网关上游地区路由拦截（实测反重力 400 "User location is not supported"）：
  // 通道轮换级抖动，重试常即恢复。单独成签名，别落进 400 大类被误读为业务错误。
  if (/user location is not supported/i.test(reason)) return 'infra.transient.geo-block';
  if (reason.includes('ETIMEDOUT')) return 'infra.transient.etimedout';
  if (reason.includes('ECONNRESET')) return 'infra.transient.econnreset';
  if (reason.includes('流式响应提前中断')) return 'infra.transient.stream-interrupted';
  return 'infra.transient.other';
}

// ---------- run.log 解析 ----------
/**
 * 计数单位是「审核轮次」：一个 审核未通过[...] 块与其后紧跟的 持久错误 行算同一轮
 * （持久错误行内嵌的判定就是该轮 block 的问题拼接），避免同一轮被数两次。
 * 章节归属：最近一次 任务书生成成功 chapter:N / LongFormWritingEngine chN 锚点。
 */
function parseRunLog(logText, acc) {
  const lines = logText.split('\n').map(l => l.replace(ANSI_RE, ''));
  let currentChapter = null;
  let openRound = null; // { chapter, issues: [{id, evidence}] , closed: false }
  const rounds = []; // { chapter, kinds: Map(id -> evidence) }

  const closeRound = () => {
    if (openRound && !openRound.closed) {
      rounds.push(openRound);
      openRound = null;
    }
  };
  const mergeIntoRound = (chapter, issueList) => {
    if (openRound && openRound.chapter === chapter && !openRound.closed) {
      for (const it of issueList) if (!openRound.kinds.has(it.id)) openRound.kinds.set(it.id, it);
    } else {
      closeRound();
      const kinds = new Map(issueList.map(it => [it.id, it]));
      openRound = { chapter, kinds, closed: false };
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 章节锚点：terra 单行 / gemini 换行两种格式
    if (line.includes('任务书生成成功')) {
      let m = line.match(/chapter:\s*(\d+)/);
      if (!m && i + 1 < lines.length) m = lines[i + 1].match(/chapter:\s*(\d+)/);
      if (m) {
        closeRound();
        currentChapter = Number(m[1]);
      }
      continue;
    }
    let m = line.match(/\[LongFormWritingEngine\] ch(\d+)\s/);
    if (m) currentChapter = Number(m[1]);

    // 瞬态网络失败（统一入口日志）。502 单独由下方 POST 行计数，这里跳过避免重复
    m = line.match(/\[unified\.service\] chat 瞬态失败，(\d+)ms 后重试 (\d+)\/(\d+):?\s*(.*)/);
    if (m && !m[4].includes('502')) {
      acc.add(classifyTransient(m[4]), null, `重试 ${m[2]}/${m[3]}：${m[4]}`.slice(0, EVIDENCE_MAX));
    }

    // 原始 HTTP 失败行（大纲阶段批量修复的 502 只在这出现）。
    // 400 且近邻有 max_tokens 降级重试日志 = 网关上限协商（UnifiedOutlineGenerator
    // 按网关报的上限降参重试，属预期兜底），不计入故障红签名
    m = line.match(/^POST\s+\S+\s+(\d{3})\s/);
    if (m) {
      const nearby = lines.slice(i + 1, i + 4).join('\n');
      if (m[1] === '400' && /超网关上限[^\n]*降级/.test(nearby)) {
        acc.add('infra.maxtokens-downgrade', null, 'max_tokens 超网关上限，降级重试');
      } else {
        acc.add(`infra.transient.http-${m[1]}`, null, `HTTP ${m[1]}`);
      }
    }

    // 原始网络错误块（Error: read ECONNRESET 等）
    m = line.match(/^Error:\s+(?:read|connect)\s+(ECONNRESET|ETIMEDOUT)/);
    if (m) acc.add(classifyTransient(m[1]), null, m[0]);

    // 审核未通过 block 开始：收集后续 '...' 问题行直到 ]
    if (line.includes('审核未通过') && line.includes('重写 [')) {
      const blockIssues = [];
      for (let j = i + 1; j < lines.length && j <= i + 30; j++) {
        const bl = lines[j].trim();
        if (bl === ']' || bl.startsWith(']')) break;
        const q = bl.match(/^'(.+)'[,;]?$/);
        if (q) blockIssues.push(parseIssue(q[1]));
      }
      mergeIntoRound(currentChapter, blockIssues);
      continue;
    }

    // 压缩兜底（超限但保留压缩稿）
    m = line.match(/AI 压缩后仍超上限（(\d+)\/(\d+)），保留压缩稿/);
    if (m) {
      acc.add(
        'quality.words-overlimit-survived',
        currentChapter,
        `压缩后仍 ${m[1]}/${m[2]}，保留压缩稿`,
      );
    }

    // 章级持久错误（unknown 是分类占位；立即重试/连续 N 次结束批量）
    m = line.match(/\[runContinueWriteChapters\] 第(\d+)章持久错误.*?(?:，立即重试|，结束批量)[:：]\s*(.*)/);
    if (m) {
      const ch = Number(m[1]);
      currentChapter = ch;
      const reason = m[2].trim();
      if (/^aborted/.test(reason) || reason.length <= 3) {
        acc.add('model.empty-response', ch, `章级重试原因：${reason.slice(0, 60)}`);
        closeRound();
      } else {
        // 内嵌判定 = 该轮问题的拼接；拆 ； 逐段解析，与已开轮次合并
        const embedded = reason
          .split(/；(?=语义问题|未履约节点|字数)/)
          .map(s => s.trim())
          .filter(Boolean)
          .map(parseIssue);
        mergeIntoRound(ch, embedded);
      }
      closeRound();
      acc.chapterAttempts[ch] = (acc.chapterAttempts[ch] || 0) + 1;
      continue;
    }

    // vitest 断言失败
    m = line.match(/AssertionError: expected (\d+) to be (\d+)/);
    if (m) {
      acc.add(
        'assert.chapters-accepted',
        null,
        `断言 expected ${m[2]} to be ${m[1]}（期望 ${m[2]} 章，实际 ${m[1]} 章）`,
      );
    }
  }
  closeRound();

  // 轮次 → 签名计数：每种签名在该轮出现计 1 次
  for (const round of rounds) {
    for (const [id, issue] of round.kinds) {
      acc.add(id, round.chapter, issue.evidence.slice(0, EVIDENCE_MAX));
    }
  }
}

// ---------- trace 解析：延迟统计 + 空响应 ----------
function parseTraces(dir, acc) {
  for (const name of readdirSync(dir).filter(n => n.endsWith('.jsonl')).sort()) {
    const chMatch = name.match(/-ch(\d+)-/);
    const chapter = chMatch ? Number(chMatch[1]) : null;
    for (const line of readFileSync(join(dir, name), 'utf8').trim().split('\n')) {
      if (!line.trim()) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      const purpose = j.purpose || 'unknown';
      const ms = Number(j.ms) || 0;
      const len =
        typeof j.response === 'string' ? j.response.length : JSON.stringify(j.response ?? '').length;
      acc.latency[purpose] = acc.latency[purpose] || [];
      acc.latency[purpose].push(ms);
      if (len <= 3) {
        acc.add('model.empty-response', chapter, `trace ${name} seq${j.seq} ${purpose} 响应 ${len} 字符`);
      }
    }
  }
}

// ---------- summary / outlineWarnings ----------
function parseSummary(dir, acc) {
  const p = join(dir, 'storyflow.closed-loop.summary.json');
  if (!existsSync(p)) return null;
  const s = JSON.parse(readFileSync(p, 'utf8'));
  for (const w of s.outlineWarnings ?? []) {
    if (w.includes('瞬态失败')) acc.add('outline.repair-transient', null, w.slice(0, EVIDENCE_MAX));
    else if (w.includes('本地收缩')) acc.add('outline.titles-shrunk-local', null, w.slice(0, EVIDENCE_MAX));
    else acc.add('outline.warning-other', null, w.slice(0, EVIDENCE_MAX));
  }
  return s;
}

// ---------- 单厂商聚合 ----------
function triageProvider(providerId, meta) {
  const dir = join(MATRIX_DIR, providerId);
  const signatures = new Map(); // key = id|chapter → {id, chapter, count, evidence[]}
  const acc = {
    chapterAttempts: {},
    latency: {},
    add(id, chapter, evidence) {
      const key = `${id}|${chapter ?? '-'}`;
      const sig = signatures.get(key) || { id, chapter, count: 0, evidence: [] };
      sig.count += 1;
      if (sig.evidence.length < 3 && evidence) sig.evidence.push(evidence);
      signatures.set(key, sig);
    },
  };

  const logPath = join(dir, 'run.log');
  if (existsSync(logPath)) parseRunLog(readFileSync(logPath, 'utf8'), acc);
  if (existsSync(dir)) parseTraces(dir, acc);
  const summary = parseSummary(dir, acc);

  const acceptedChapters = new Set(
    (summary?.batch ?? []).filter(it => it.accepted).map(it => it.ch),
  );
  const words = (summary?.batch ?? []).map(it => it.words).filter(w => typeof w === 'number');

  // 分级：章节最终 accepted → 黄（已恢复）；否则红（阻断）。infra/outline/assert 恒定分级
  const RED_ALWAYS = new Set(['assert.chapters-accepted']);
  const YELLOW_ALWAYS = new Set([
    'infra.maxtokens-downgrade',
    'infra.transient.http-502',
    'infra.transient.http-429',
    'infra.transient.etimedout',
    'infra.transient.econnreset',
    'infra.transient.stream-interrupted',
    'infra.transient.other',
    'outline.repair-transient',
    'outline.titles-shrunk-local',
    'outline.warning-other',
    'quality.words-overlimit-survived',
  ]);
  for (const sig of signatures.values()) {
    if (RED_ALWAYS.has(sig.id)) sig.severity = 'red';
    else if (YELLOW_ALWAYS.has(sig.id)) sig.severity = 'yellow';
    else if (sig.id === 'model.empty-response' || sig.id === 'quality.words-overlimit') {
      // 章级空响应/超限且该章最终未通过 → 红；大纲阶段或已恢复 → 黄
      sig.severity = sig.chapter != null && !acceptedChapters.has(sig.chapter) ? 'red' : 'yellow';
    } else {
      // 质量拒绝：所属章节最终被接受 → 已恢复；未接受/整轮失败 → 阻断
      const chapterAccepted = sig.chapter != null && acceptedChapters.has(sig.chapter);
      sig.severity = meta.pass && chapterAccepted ? 'yellow' : 'red';
    }
    sig.stalled =
      sig.severity === 'red' &&
      sig.chapter != null &&
      (acc.chapterAttempts[sig.chapter] || 0) >= 3 &&
      !sig.id.startsWith('infra.');
  }

  const has = pred => [...signatures.values()].some(pred);
  const stalledSig = [...signatures.values()].find(s => s.stalled);
  let verdict;
  let verdictReason;
  if (stalledSig) {
    verdict = 'model-capability-suspect';
    verdictReason = `第${stalledSig.chapter}章质量拒绝连续 ${acc.chapterAttempts[stalledSig.chapter]} 轮未收敛，重试无意义，考虑换模型或调合同（需人工确认）`;
  } else if (has(s => s.severity === 'red' && s.id.startsWith('quality.'))) {
    verdict = 'quality-rejection';
    verdictReason = '存在质量拒绝且未恢复，但未达 3 轮停滞';
  } else if (!meta.pass && has(s => s.id.startsWith('infra.'))) {
    verdict = 'infra-failure';
    verdictReason = '失败由网络/网关错误主导';
  } else if (!meta.pass && has(s => s.id.startsWith('assert.'))) {
    verdict = 'pipeline-bug';
    verdictReason = '断言失败但无质量/网络签名，优先排查管线代码';
  } else if (has(s => s.id.startsWith('quality.') || s.id === 'model.empty-response')) {
    verdict = 'passed-with-repairs';
    verdictReason = '质量问题/空响应均被章内压缩或重试兜住，最终通过';
  } else if (has(s => s.severity === 'yellow')) {
    verdict = 'clean-with-noise';
    verdictReason = '只有瞬态噪音，全部被重试兜住';
  } else {
    verdict = 'clean';
    verdictReason = '无异常签名';
  }

  const latency = {};
  for (const [purpose, arr] of Object.entries(acc.latency)) {
    const sorted = [...arr].sort((a, b) => a - b);
    latency[purpose] = {
      count: sorted.length,
      avgMs: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p50Ms: sorted[Math.floor(sorted.length / 2)],
      maxMs: sorted[sorted.length - 1],
    };
  }

  const requested = Number.isFinite(Number(summary?.requestedChapterCount))
    ? Number(summary.requestedChapterCount)
    : null;
  return {
    providerId,
    model: meta.model,
    pass: meta.pass,
    exitCode: meta.exitCode,
    wallMinutes: meta.wallMinutes,
    chaptersAccepted: requested ? `${acceptedChapters.size}/${requested}` : String(acceptedChapters.size),
    words: words.length
      ? { min: Math.min(...words), avg: Math.round(words.reduce((a, b) => a + b, 0) / words.length), max: Math.max(...words) }
      : null,
    phaseTimings: summary?.phaseTimings ?? null,
    runtimeBackend: summary?.runtimeBackend ?? null,
    verdict,
    verdictReason,
    signatures: [...signatures.values()].sort(
      (a, b) => a.severity.localeCompare(b.severity) || b.count - a.count,
    ),
    latency,
  };
}

// ---------- 控制台输出 ----------
function printProvider(row) {
  const mark = row.pass ? '✓' : '✗';
  console.log(
    `\n== ${row.providerId} / ${row.model}  ${mark} exit=${row.exitCode}` +
      `${row.wallMinutes != null ? `  ${row.wallMinutes}min` : ''}  章节 ${row.chaptersAccepted}` +
      `${row.words ? `  字数 ${row.words.min}/${row.words.avg}/${row.words.max}` : ''}` +
      `${row.runtimeBackend ? `  backend=${row.runtimeBackend}` : ''} ==`,
  );
  console.log(`  判定: ${row.verdict} —— ${row.verdictReason}`);
  for (const s of row.signatures) {
    const icon = s.severity === 'red' ? '🔴' : '🟡';
    const ch = s.chapter != null ? ` ch${s.chapter}` : '';
    const stalled = s.stalled ? ' [stalled]' : '';
    const ev = s.evidence[0] ? `  ${s.evidence[0]}` : '';
    console.log(`  ${icon} ${s.id}${ch} ×${s.count}${stalled}${ev}`);
  }
  const latParts = Object.entries(row.latency)
    .filter(([, v]) => v.count >= 2)
    .map(([k, v]) => `${k} n=${v.count} avg=${Math.round(v.avgMs / 1000)}s p50=${Math.round(v.p50Ms / 1000)}s`);
  if (latParts.length) console.log(`  耗时: ${latParts.join(' | ')}`);
}

// ---------- diff ----------
function sigKey(model, sig) {
  return `${model}|${sig.id}|${sig.chapter ?? 0}`;
}
function runDiff(oldReport, newReport) {
  const oldKeys = new Map();
  for (const p of oldReport.providers ?? [])
    for (const s of p.signatures) oldKeys.set(sigKey(p.model, s), { provider: p.providerId, sig: s });
  const newKeys = new Map();
  for (const p of newReport.providers ?? [])
    for (const s of p.signatures) newKeys.set(sigKey(p.model, s), { provider: p.providerId, sig: s });

  const resolved = [...oldKeys.keys()].filter(k => !newKeys.has(k));
  const persisted = [...oldKeys.keys()].filter(k => newKeys.has(k));
  const added = [...newKeys.keys()].filter(k => !oldKeys.has(k));
  const fmt = k => `${k.replace('|0', '|-')}${newKeys.get(k) || oldKeys.get(k) ? '' : ''}`;

  console.log(`\n[storyflow-triage] 回归 diff：${oldReport.generatedAt} → ${newReport.generatedAt}`);
  console.log(`\n已消失 (${resolved.length})：`);
  for (const k of resolved) console.log(`  ✓ ${fmt(k)}`);
  console.log(`\n持续存在 (${persisted.length})：`);
  for (const k of persisted) console.log(`  = ${fmt(k)}`);
  console.log(`\n新增 (${added.length})：`);
  let newRed = false;
  for (const k of added) {
    const item = newKeys.get(k);
    const isRed = item?.sig.severity === 'red';
    if (isRed) newRed = true;
    console.log(`  ${isRed ? '🔴 +' : '+ '} ${fmt(k)}`);
  }
  // 厂商判定变化摘要
  for (const p of newReport.providers ?? []) {
    const old = (oldReport.providers ?? []).find(o => o.model === p.model);
    if (old && old.verdict !== p.verdict)
      console.log(`  判定变化 ${p.model}: ${old.verdict} → ${p.verdict}`);
  }
  return newRed;
}

// ---------- main ----------
function readMatrixMeta() {
  const p = join(MATRIX_DIR, 'matrix.json');
  if (!existsSync(p)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    return new Map((raw.providers ?? []).map(r => [r.providerId, r]));
  } catch {
    return new Map();
  }
}

function main() {
  const argv = process.argv.slice(2);
  const diffIdx = argv.indexOf('--diff');
  if (diffIdx !== -1) {
    const rest = argv.slice(diffIdx + 1).filter(a => !a.startsWith('--'));
    let oldPath;
    let newPath;
    if (rest.length >= 2) {
      [oldPath, newPath] = rest;
    } else {
      const reports = readdirSync(TRIAGE_DIR)
        .filter(n => n.startsWith('report-') && n.endsWith('.json'))
        .sort();
      if (reports.length < 2) {
        console.error('[storyflow-triage] 历史报告不足两份，无法 diff。先多跑几次 triage。');
        process.exit(2);
      }
      oldPath = join(TRIAGE_DIR, reports[reports.length - 2]);
      newPath = join(TRIAGE_DIR, reports[reports.length - 1]);
    }
    const newRed = runDiff(JSON.parse(readFileSync(oldPath, 'utf8')), JSON.parse(readFileSync(newPath, 'utf8')));
    process.exit(newRed ? 1 : 0);
  }

  if (!existsSync(MATRIX_DIR)) {
    console.error(`[storyflow-triage] 找不到 ${MATRIX_DIR}，先跑 smoke:storyflow:real:multi。`);
    process.exit(2);
  }
  const matrixMeta = readMatrixMeta();
  let ids;
  if (matrixMeta.size > 0) {
    // 只分析最近一轮矩阵登记的厂商：归档目录会累积历史轮次，混入会稀释报告
    ids = [...matrixMeta.keys()];
  } else {
    ids = readdirSync(MATRIX_DIR).filter(n => {
      const p = join(MATRIX_DIR, n);
      try {
        return statSync(p).isDirectory() && existsSync(join(p, 'run.log'));
      } catch {
        return false;
      }
    });
  }
  const provIdx = argv.indexOf('--provider');
  if (provIdx !== -1 && argv[provIdx + 1]) {
    const want = new Set(argv[provIdx + 1].split(',').map(s => s.trim()));
    // matrix.json 只登记最近一轮矩阵；单跑失败轮/更早轮次的归档目录可能不在其中。
    // 显式点名的厂商只要归档目录完整（有 run.log）就放行分析，否则失败轮无法 triage。
    const archived = new Set(
      readdirSync(MATRIX_DIR).filter(n => {
        try {
          return statSync(join(MATRIX_DIR, n)).isDirectory() && existsSync(join(MATRIX_DIR, n, 'run.log'));
        } catch {
          return false;
        }
      }),
    );
    const unknown = [...want].filter(w => !ids.includes(w) && !archived.has(w));
    if (unknown.length) {
      console.error(`[storyflow-triage] 未知的厂商目录：${unknown.join(', ')}（可用：${[...new Set([...ids, ...archived])].join(', ')}）`);
      process.exit(2);
    }
    ids = [...want].filter(w => ids.includes(w) || archived.has(w));
  }
  if (ids.length === 0) {
    console.error('[storyflow-triage] 没有可分析的厂商目录（需要 run.log）。');
    process.exit(2);
  }

  const providers = ids.map(id => {
    const m = matrixMeta.get(id) ?? {};
    return triageProvider(id, {
      model: m.model ?? '(未知模型)',
      pass: m.pass ?? false,
      exitCode: m.exitCode ?? -1,
      wallMinutes: m.wallMinutes ?? null,
    });
  });

  const report = {
    mode: 'storyflow-triage',
    generatedAt: new Date().toISOString(),
    source: MATRIX_DIR,
    providers,
  };

  mkdirSync(TRIAGE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 17);
  const reportPath = join(TRIAGE_DIR, `report-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  writeFileSync(join(TRIAGE_DIR, 'latest.json'), JSON.stringify(report, null, 2) + '\n', 'utf-8');

  if (argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[storyflow-triage] 分析 ${providers.length} 个厂商，报告: ${reportPath}`);
    for (const row of providers) printProvider(row);
    const redCount = providers.reduce(
      (n, p) => n + p.signatures.filter(s => s.severity === 'red').length,
      0,
    );
    console.log(`\n[storyflow-triage] 红签名 ${redCount} 个；判定：${providers.map(p => `${p.model}=${p.verdict}`).join('，')}`);
  }
  process.exit(providers.some(p => !p.pass) ? 1 : 0);
}

main();
