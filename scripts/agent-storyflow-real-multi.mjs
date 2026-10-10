#!/usr/bin/env node
/**
 * Storyflow 闭环多厂商矩阵冒烟：同一闭环多厂商并发/顺序执行，产出对比矩阵
 *
 *   npm run smoke:storyflow:real:multi                        # 配置文件里的厂商列表（默认并发）
 *   MOLIU_PROVIDER_IDS=id1,id2 npm run smoke:storyflow:real:multi   # 环境变量临时指定
 *   node scripts/agent-storyflow-real-multi.mjs id1 id2       # 位置参数临时指定
 *   node scripts/agent-storyflow-real-multi.mjs --list        # 列出可用厂商（ID/类型/模型）
 *   node scripts/agent-storyflow-real-multi.mjs --init        # 生成 temp/storyflow.matrix.config.json 模板
 *   node scripts/agent-storyflow-real-multi.mjs --prune       # 清理旧轮产物（dry-run 预览；--exec 真删）
 *
 * 配置（temp/storyflow.matrix.config.json，gitignore 不入库，--init 生成模板）：
 *   { "providerIds": ["id1", "id2"], "concurrency": 3 }
 * 优先级：位置参数 > MOLIU_PROVIDER_IDS > 配置文件 > App 设置中全部启用厂商。
 * concurrency=1 即顺序执行；建议 ≤3：每轮是一个 Electron+Vitest 进程跑真实 AI，
 * 并发过高会挤占 CPU/内存，且各厂商网关限流独立、并发不省 AI 时间只省等待。
 *
 * 并发安全（每轮互不干扰）：
 * - 每轮注入 MOLIU_RUN_SUFFIX=<providerId>：summary/outline/prose/trace/project-store
 *   文件名全部带后缀，跑前清理只匹配自己的后缀（见 storyflow-run-suffix.mjs）
 * - 每轮独立 vitest 缓存目录（node_modules/.vitest 的临时缓存按进程隔离）
 * - SQLite ABI 重建用锁文件互斥（见 ensure-electron-sqlite-abi.mjs）
 * - 每轮 stdout 落盘 temp/storyflow-matrix/<id>/run.log（并发时控制台必然交错，
 *   逐轮完整日志在各自文件里，结束后摘要仍打控制台）
 *
 * 产物（temp/storyflow-matrix/，gitignore，不入库）：
 * - <providerId>/          每厂商一轮的完整产物（summary/outline/prose/trace/project-store/run.log）
 * - matrix.json            全厂商对比矩阵（通过率/耗时/字数/后端/告警）
 *
 * 提示：
 * - 每厂商全程真实 AI（默认 80 章，耗时随模型而变）；快速回归先 MOLIU_CHAPTER_COUNT=1。
 * - 设 MOLIU_OUTLINE_CACHE=temp/outline.shared.json 可让所有厂商共用同一份缓存大纲，
 *   只对比写作阶段的厂商差异（大纲阶段不重复跑）。
 * - 设 MOLIU_RESUME_STORYFLOW=1 后，大纲检查点、项目库和 StoryRuntime 都留在
 *   temp/storyflow-checkpoints/。墙钟杀进程后用同一环境变量再跑，从第一篇空章接上，
 *   不调用 storyflow-repair-empty。未设置时仍全新生成，避免旧大纲掩盖回归。
 * - 单厂商失败（配置错/断言挂/进程崩）不中断矩阵：记录失败继续其它；
 *   任一厂商失败最终退出码非 0。厂商配置在跑前统一预检，ID 写错立即报出可用列表。
 */
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { sanitizeRunSuffix, storyflowArtifactNames } from './storyflow-run-suffix.mjs';
import { cumulativeChaptersWritten } from './storyflow-triage.mjs';

const TEMP_DIR = join(process.cwd(), 'temp');
const TRACE_DIR = join(TEMP_DIR, 'ai-traces');
const matrixDirOverride = (process.env.MOLIU_STORYFLOW_MATRIX_DIR || '').trim();
const MATRIX_DIR = matrixDirOverride
  ? resolve(process.cwd(), matrixDirOverride)
  : join(TEMP_DIR, 'storyflow-matrix');
const SAFE_MATRIX_ROOT = `${resolve(TEMP_DIR)}${sep}`;
if (`${MATRIX_DIR}${sep}`.startsWith(SAFE_MATRIX_ROOT) === false) {
  throw new Error(`MOLIU_STORYFLOW_MATRIX_DIR 必须位于 ${TEMP_DIR} 内：${MATRIX_DIR}`);
}
const MATRIX_CONFIG_PATH = join(TEMP_DIR, 'storyflow.matrix.config.json');
const SMOKE_SCRIPT = join(process.cwd(), 'scripts', 'agent-storyflow-real-smoke.mjs');
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_CHAPTER_COUNT = 80;
// 同厂商并行多轮：两轮共用同一 providerId 时，temp 根目录产物/trace/project-store
// 文件名都按 providerId 后缀派生，会互相覆盖，且先归档方会把兄弟轮的在写文件抢走。
// 设 MOLIU_STORYFLOW_RUN_SUFFIX 给本轮一个独立后缀即可并行；不设时行为不变。
const RUN_SUFFIX_OVERRIDE = sanitizeRunSuffix(process.env.MOLIU_STORYFLOW_RUN_SUFFIX || '');

// 与 src/renderer/src/services/writing/__tests__/continueWriteRealConfig.ts 的
// PROVIDER_SET 保持一致（该文件是 .ts，脚本无法直接 import，只能镜像维护）
const SUPPORTED_PROVIDERS = new Set([
  'openai',
  'anthropic',
  'gemini',
  'moonshot',
  'deepseek',
  'ollama',
  'groq',
  'qwen',
  'mistral',
  'cohere',
  'nvidia',
  'perplexity',
  'together',
  'cerebras',
  'azure',
  'grok',
  'fireworks',
  'zhipu',
]);

function readAppProviders() {
  const settingsPath = join(process.env.APPDATA || '', 'moliu', 'moliu-settings.json');
  if (!existsSync(settingsPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return raw.aiProviders ?? [];
  } catch {
    return [];
  }
}

function printProviderList() {
  const providers = readAppProviders();
  if (providers.length === 0) {
    console.log('App 设置中没有任何厂商配置（%APPDATA%/moliu/moliu-settings.json）');
    return;
  }
  console.log('App 设置中的厂商（带 ★ 的可进入矩阵）：\n');
  for (const p of providers) {
    const type = (p.provider || 'openai').toLowerCase();
    const supported = SUPPORTED_PROVIDERS.has(type);
    const usable = supported && p.enabled !== false && !!p.apiKey;
    console.log(
      `  ${usable ? '★' : ' '} ${p.id}  ${type}${p.modelName ? ` / ${p.modelName}` : ''}` +
        `${p.enabled === false ? '  [已禁用]' : ''}${!p.apiKey ? '  [缺 apiKey]' : ''}` +
        `${!supported ? `  [类型不支持: ${type}]` : ''}`
    );
  }
}

function writeMatrixConfigTemplate() {
  if (existsSync(MATRIX_CONFIG_PATH)) {
    console.log(`配置已存在：${MATRIX_CONFIG_PATH}（不覆盖）`);
    return;
  }
  mkdirSync(TEMP_DIR, { recursive: true });
  writeFileSync(
    MATRIX_CONFIG_PATH,
    JSON.stringify(
      {
        providerIds: [
          'provider-1781144900790',
          'provider-1781145026571',
          'provider-1781144969420',
          'provider-1781145001549',
          'provider-1781144847239',
          'provider-1785859077824',
          'provider-1786762880239',
          'provider-1786762462935',
          'provider-1785758934445',
          'provider-1786762630678',
          'provider-1786762713932',
          'provider-1786762978054',
          'provider-1786762979344',
        ],
        concurrency: DEFAULT_CONCURRENCY,
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );
  console.log(`已生成配置模板：${MATRIX_CONFIG_PATH}`);
  console.log(
    '把 providerIds 改成你要测的厂商 ID 列表（--list 查看），concurrency 为并发数（1=顺序）。'
  );
}

function readMatrixConfig() {
  if (!existsSync(MATRIX_CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(MATRIX_CONFIG_PATH, 'utf8'));
    if (!Array.isArray(raw.providerIds)) return null;
    const concurrency = Number(raw.concurrency);
    return {
      providerIds: raw.providerIds.map(s => String(s).trim()).filter(Boolean),
      concurrency:
        Number.isFinite(concurrency) && concurrency >= 1
          ? Math.floor(concurrency)
          : DEFAULT_CONCURRENCY,
    };
  } catch (err) {
    console.warn(`[smoke:storyflow:real:multi] 配置文件解析失败（${err.message}），忽略配置`);
    return null;
  }
}

/**
 * 归档一轮产物到 matrix/<providerId>/（移动而非复制：下一轮清理不留时序窗口）。
 * 并发模式下产物文件名带 providerId 后缀（MOLIU_RUN_SUFFIX），这里按后缀名收敛为
 * 矩阵目录内的规范名（summary/outline/prose 恢复固定名，便于横向对比）。
 * 只逐文件移动、不整目录重建：run.log 在归档前已写入 dest，重建目录会把它删掉。
 */
function archiveRunArtifacts(providerId, suffixOverride) {
  const suffix = suffixOverride ?? sanitizeRunSuffix(providerId);
  const names = storyflowArtifactNames(suffix);
  const dest = join(MATRIX_DIR, providerId);
  // 清掉上一轮同名矩阵目录里「可被本轮覆盖的归档产物」；run.log 是本轮刚写的，必须保留。
  // trace（*.jsonl）与 project-store 也必须清：归档只按前缀收敛，上一轮的旧 trace
  // 会原样残留（2026-08-16 实测 gemini 目录混入两个 ch5 trace，分不清哪轮是哪轮，
  // 分析时曾被误导）。清完只剩 run.log，本轮归档再逐个写入。
  for (const stale of [
    'storyflow.closed-loop.summary.json',
    'storyflow.closed-loop.outline.json',
    'prose',
  ]) {
    rmSync(join(dest, stale), { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });
  if (existsSync(dest)) {
    for (const name of readdirSync(dest)) {
      if (name.endsWith('.jsonl') || name.endsWith('.project-store.json')) {
        rmSync(join(dest, name), { force: true });
      }
    }
  }
  const moved = [];
  const moveInto = (from, to) => {
    if (!existsSync(from)) return;
    renameSync(from, to);
    moved.push(to);
  };
  moveInto(join(TEMP_DIR, names.summary), join(dest, 'storyflow.closed-loop.summary.json'));
  moveInto(join(TEMP_DIR, names.outline), join(dest, 'storyflow.closed-loop.outline.json'));
  moveInto(join(TEMP_DIR, names.proseDir), join(dest, 'prose'));
  const tracePrefix = suffix ? `storyflow-${suffix}-` : 'storyflow-';
  if (existsSync(TRACE_DIR)) {
    for (const name of readdirSync(TRACE_DIR)) {
      if (name.startsWith(tracePrefix) && name.endsWith('.jsonl')) {
        moveInto(join(TRACE_DIR, name), join(dest, name));
      }
    }
  }
  // harness 模拟主进程的项目存储（含全部正文），随轮归档供逐厂商对比
  const storePrefix = suffix ? `storyflow-${suffix}-` : 'storyflow-';
  for (const name of readdirSync(TEMP_DIR)) {
    if (name.startsWith(storePrefix) && name.endsWith('.project-store.json')) {
      moveInto(join(TEMP_DIR, name), join(dest, name));
    }
  }
  // 续写项目库在检查点目录里，不能 move，否则下一轮接不上。复制一份进归档供 triage 读正文。
  const resumeOn = /^(?:1|true|yes)$/iu.test(process.env.MOLIU_RESUME_STORYFLOW?.trim() ?? '');
  const checkpointStore = join(
    TEMP_DIR,
    'storyflow-checkpoints',
    `${suffix || 'default'}.project-store.json`,
  );
  if (resumeOn && existsSync(checkpointStore)) {
    const destName = suffix
      ? `storyflow-${suffix}-resume.project-store.json`
      : 'storyflow-resume.project-store.json';
    const destStore = join(dest, destName);
    copyFileSync(checkpointStore, destStore);
    moved.push(destStore);
  }
  return moved;
}

function buildMatrixRow(providerMeta, exitCode, wallMs) {
  const row = {
    providerId: providerMeta.id,
    scenarioId: process.env.MOLIU_STORYFLOW_SCENARIO_ID || null,
    provider: (providerMeta.provider || 'openai').toLowerCase(),
    model: providerMeta.modelName || '(未配置模型)',
    pass: exitCode === 0,
    exitCode,
    wallMinutes: Math.round(wallMs / 60000),
    note: '',
  };
  const summaryPath = join(MATRIX_DIR, providerMeta.id, 'storyflow.closed-loop.summary.json');
  if (existsSync(summaryPath)) {
    try {
      const s = JSON.parse(readFileSync(summaryPath, 'utf8'));
      const batch = s.batch ?? [];
      const words = batch.map(item => item.words).filter(w => typeof w === 'number');
      const requested = Number.isFinite(Number(s.requestedChapterCount))
        ? Number(s.requestedChapterCount)
        : batch.length;
      row.chaptersAccepted = `${cumulativeChaptersWritten(s)}/${requested}`;
      row.status = s.status ?? null;
      row.wordsMin = words.length ? Math.min(...words) : null;
      row.wordsAvg = words.length
        ? Math.round(words.reduce((a, b) => a + b, 0) / words.length)
        : null;
      row.wordsMax = words.length ? Math.max(...words) : null;
      row.runtimeBackend = s.runtimeBackend ?? null;
      row.warnings = (s.warnings ?? []).length;
      row.firstPassRate = s.repairMetrics?.firstPassRate ?? null;
      row.totalRewriteRounds = s.repairMetrics?.totalRewriteRounds ?? null;
      row.requestCount = s.runtimeMetrics?.requestCount ?? null;
      row.readerOutlineScore = s.readerEvaluation?.outline?.score ?? null;
      row.readerChapterAverage = s.readerEvaluation?.metrics?.chapterAverage ?? null;
      row.readerChapterMinimum = s.readerEvaluation?.metrics?.chapterMinimum ?? null;
      row.readerIndependent = s.readerEvaluation?.evaluator?.independentFromWriter ?? null;
    } catch {
      row.note = 'summary 解析失败';
    }
  } else {
    row.note = exitCode === 0 ? '未产出 summary' : '未产出 summary（前半段失败）';
  }
  return row;
}

/** 启动一轮冒烟子进程（后台异步），resolve 该轮的矩阵行 */
function launchRun(meta) {
  return new Promise(resolve => {
    const dest = join(MATRIX_DIR, meta.id);
    mkdirSync(dest, { recursive: true });
    const logPath = join(dest, 'run.log');
    // 子进程结束前日志先保存在内存，若不清空旧文件，运行中的进度检查会误读上一轮结果。
    writeFileSync(logPath, '', 'utf-8');
    console.log(
      `[smoke:storyflow:real:multi] 启动 ${meta.id}（${meta.provider}/${meta.modelName || '默认模型'}），日志: ${logPath}`
    );
    const startedAt = Date.now();
    const child = spawn(process.execPath, [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        MOLIU_AI_PROVIDER_ID: meta.id,
        MOLIU_RUN_SUFFIX: RUN_SUFFIX_OVERRIDE || sanitizeRunSuffix(meta.id),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const log = [];
    const sink = chunk => {
      const text = chunk.toString();
      log.push(text);
      // 并发时逐行转发会交错成噪音；只透传带进度语义的行，完整日志在 run.log
      for (const line of text.split('\n')) {
        if (/完成|失败|WARNING|Error|error|✓|✗|exit/.test(line) && line.trim()) {
          process.stdout.write(`[${meta.id}] ${line}\n`);
        }
      }
    };
    child.stdout.on('data', sink);
    child.stderr.on('data', sink);
    child.on('close', code => {
      const exitCode = code ?? 1;
      const wallMs = Date.now() - startedAt;
      try {
        writeFileSync(logPath, log.join(''), 'utf-8');
      } catch {
        /* 日志落盘失败不影响矩阵 */
      }
      const moved = archiveRunArtifacts(meta.id, RUN_SUFFIX_OVERRIDE || undefined);
      console.log(
        `[smoke:storyflow:real:multi] ${meta.id} 完成：exit=${exitCode}，` +
          `耗时 ${Math.round(wallMs / 60000)} 分钟，归档 ${moved.length} 个产物 → temp/storyflow-matrix/${meta.id}/`
      );
      resolve(buildMatrixRow(meta, exitCode, wallMs));
    });
  });
}

function resolveProviderIdsAndConcurrency(argv) {
  const positional = argv.filter(arg => !arg.startsWith('--'));
  const fromEnv = (process.env.MOLIU_PROVIDER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const fileConfig = readMatrixConfig();
  let ids;
  let concurrency = fileConfig?.concurrency ?? DEFAULT_CONCURRENCY;
  if (positional.length > 0) ids = positional;
  else if (fromEnv.length > 0) ids = fromEnv;
  else if (fileConfig) ids = fileConfig.providerIds;
  else {
    ids = readAppProviders()
      .filter(
        p =>
          p.enabled !== false &&
          !!p.apiKey &&
          SUPPORTED_PROVIDERS.has((p.provider || 'openai').toLowerCase())
      )
      .map(p => p.id);
  }
  const fromEnvConc = Number(process.env.MOLIU_MATRIX_CONCURRENCY);
  if (Number.isFinite(fromEnvConc) && fromEnvConc >= 1) concurrency = Math.floor(fromEnvConc);
  return { ids: [...new Set(ids)], concurrency };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    printProviderList();
    return;
  }
  if (argv.includes('--init')) {
    writeMatrixConfigTemplate();
    return;
  }
  if (argv.includes('--prune')) {
    // 跨轮产物清理（旧 provider 归档/孤儿 trace/崩跑残留）。默认 dry-run，
    // --exec 才真删；范围与保护清单详见 storyflow-prune.mjs 头注释。
    const { runPrune } = await import('./storyflow-prune.mjs');
    const { count, freedBytes, dryRun, targets } = runPrune({ dryRun: !argv.includes('--exec') });
    console.log(
      `[smoke:storyflow:real:multi] prune${dryRun ? ' [dry-run]' : ''}：命中 ${count} 项，可释放 ${(freedBytes / 1048576).toFixed(1)} MB`
    );
    for (const t of targets) console.log(`  ${t.kind.padEnd(18)} ${t.path}`);
    if (dryRun) console.log('确认后执行：node scripts/agent-storyflow-real-multi.mjs --prune --exec');
    return;
  }

  const { ids, concurrency } = resolveProviderIdsAndConcurrency(argv);
  if (ids.length === 0) {
    console.error(
      '[smoke:storyflow:real:multi] 没有可跑的厂商。用 --list 查看可用厂商，--init 生成配置模板，或用 MOLIU_PROVIDER_IDS=ID1,ID2 显式指定。'
    );
    process.exit(1);
  }

  // 跑前统一预检：ID 写错 / 缺 apiKey / 类型不支持立即报出，不浪费任何一轮真实 AI
  const providers = readAppProviders();
  const invalid = ids
    .map(id => {
      const meta = providers.find(p => p.id === id);
      if (!meta) return { id, reason: 'App 设置中不存在该 ID' };
      if (!meta.apiKey) return { id, reason: '缺少 apiKey' };
      const type = (meta.provider || 'openai').toLowerCase();
      if (!SUPPORTED_PROVIDERS.has(type)) return { id, reason: `不支持的 provider 类型：${type}` };
      return null;
    })
    .filter(Boolean);
  if (invalid.length > 0) {
    console.error('[smoke:storyflow:real:multi] 以下厂商配置无效，已全部中止（跑前预检）：');
    for (const item of invalid) console.error(`  - ${item.id}：${item.reason}`);
    console.error('\n可用厂商（--list 查看详情）：');
    printProviderList();
    process.exit(1);
  }

  const perRunHint = process.env.MOLIU_CHAPTER_COUNT
    ? `（MOLIU_CHAPTER_COUNT=${process.env.MOLIU_CHAPTER_COUNT}，耗时相应缩短）`
    : `（默认 ${DEFAULT_CHAPTER_COUNT} 章）`;
  console.log(
    `[smoke:storyflow:real:multi] 矩阵计划：${ids.length} 个厂商，并发 ${concurrency} ${perRunHint}`
  );
  ids.forEach((id, i) => {
    const meta = providers.find(p => p.id === id);
    console.log(
      `  ${i + 1}/${ids.length}  ${id}  ${meta.provider || 'openai'}${meta.modelName ? ` / ${meta.modelName}` : ''}`
    );
  });
  console.log('');

  // 简单工作池：前 concurrency 个先跑，完成一个补一个（Provider 限流独立，无需全局节流）
  const queue = ids.map(id => providers.find(p => p.id === id));
  const rows = [];
  const inflight = new Set();
  while (queue.length > 0 || inflight.size > 0) {
    while (inflight.size < concurrency && queue.length > 0) {
      const meta = queue.shift();
      const p = launchRun(meta).then(row => {
        rows.push(row);
        inflight.delete(p);
      });
      inflight.add(p);
    }
    await Promise.race(inflight);
  }

  // 保持计划顺序输出矩阵；单跑/补跑时与既有 matrix.json 合并而非整份覆盖——
  // 覆盖会把之前轮次的厂商登记清掉，triage --provider 就找不到它们的归档目录
  const ordered = ids.map(id => rows.find(row => row.providerId === id));
  const matrixPath = join(MATRIX_DIR, 'matrix.json');
  let previousProviders = [];
  try {
    const prev = JSON.parse(readFileSync(matrixPath, 'utf8'));
    if (Array.isArray(prev.providers)) previousProviders = prev.providers;
  } catch {
    /* 首轮或损坏：无既有登记 */
  }
  const runIds = new Set(ids);
  const merged = [
    ...ordered,
    ...previousProviders.filter(row => row?.providerId && !runIds.has(row.providerId)),
  ];
  writeFileSync(
    matrixPath,
    JSON.stringify(
      {
        mode: 'storyflow-matrix',
        generatedAt: new Date().toISOString(),
        concurrency,
        chapterCount: process.env.MOLIU_CHAPTER_COUNT
          ? Number(process.env.MOLIU_CHAPTER_COUNT)
          : DEFAULT_CHAPTER_COUNT,
        scenarioId: process.env.MOLIU_STORYFLOW_SCENARIO_ID || null,
        providers: merged,
      },
      null,
      2
    ),
    'utf-8'
  );

  console.log('\n[smoke:storyflow:real:multi] ===== 矩阵结果 =====');
  for (const row of ordered) {
    console.log(
      `${row.pass ? '✓' : '✗'} ${row.providerId}  ${row.provider}/${row.model}` +
        `  ${Math.round(row.wallMinutes)}min` +
        (row.chaptersAccepted ? `  章节 ${row.chaptersAccepted}` : '') +
        (row.wordsAvg
          ? `  字数 ${row.wordsMin}/${row.wordsAvg}/${row.wordsMax}(min/avg/max)`
          : '') +
        (row.runtimeBackend ? `  backend=${row.runtimeBackend}` : '') +
        (row.firstPassRate != null ? `  首过=${Math.round(row.firstPassRate * 100)}%` : '') +
        (row.readerChapterAverage != null ? `  读者均分=${row.readerChapterAverage}` : '') +
        (row.warnings ? `  告警 ${row.warnings}` : '') +
        (row.note ? `  ⚠️ ${row.note}` : '')
    );
  }
  console.log(`\n[smoke:storyflow:real:multi] matrix: ${join(MATRIX_DIR, 'matrix.json')}`);
  process.exit(ordered.some(row => !row.pass) ? 1 : 0);
}

const invokedDirectly = (process.argv[1] || '')
  .replace(/\\/g, '/')
  .endsWith('agent-storyflow-real-multi.mjs');
if (invokedDirectly) {
  await main();
}
