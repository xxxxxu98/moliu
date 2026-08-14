#!/usr/bin/env node
/**
 * Storyflow 闭环多厂商矩阵冒烟：同一闭环按厂商顺序轮询，产出对比矩阵
 *
 *   npm run smoke:storyflow:real:multi                        # 自动取 App 设置中全部启用厂商
 *   MOLIU_PROVIDER_IDS=id1,id2 npm run smoke:storyflow:real:multi
 *   node scripts/agent-storyflow-real-multi.mjs id1 id2       # 显式指定厂商
 *   node scripts/agent-storyflow-real-multi.mjs --list        # 列出可用厂商（ID/类型/模型）
 *
 * 原理：复用 smoke:storyflow:real 全链路（开题大纲→应用→批量续写）不动一行测试代码——
 * resolveContinueWriteRealConfig 中 MOLIU_AI_PROVIDER_ID 环境变量优先于配置文件，
 * 每个厂商只需注入该变量重跑一次。把「厂商能力参差」变成可对比的矩阵数据。
 *
 * 产物（temp/storyflow-matrix/，gitignore，不入库）：
 * - <providerId>/          每厂商一轮的完整产物（summary/outline/prose/trace/project-store）
 * - matrix.json            全厂商对比矩阵（通过率/耗时/字数/后端/告警）
 *
 * 提示：
 * - 每厂商全程真实 AI（默认 5 章约 70-110 分钟），矩阵耗时 = 厂商数 × 单轮耗时；
 *   快速回归先 MOLIU_CHAPTER_COUNT=1 缩到单章。
 * - 设 MOLIU_OUTLINE_CACHE=temp/outline.shared.json 可让所有厂商共用同一份缓存大纲，
 *   只对比写作阶段的厂商差异（大纲阶段不重复跑）。
 * - 单厂商失败（配置错/断言挂/进程崩）不中断矩阵：记录失败继续下一家；
 *   任一厂商失败最终退出码非 0。厂商配置在跑前统一预检，ID 写错立即报出可用列表。
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = join(process.cwd(), 'temp');
const TRACE_DIR = join(TEMP_DIR, 'ai-traces');
const MATRIX_DIR = join(TEMP_DIR, 'storyflow-matrix');
const SMOKE_SCRIPT = join(process.cwd(), 'scripts', 'agent-storyflow-real-smoke.mjs');

// 与 src/renderer/src/services/writing/__tests__/continueWriteRealConfig.ts 的
// PROVIDER_SET 保持一致（该文件是 .ts，脚本无法直接 import，只能镜像维护）
const SUPPORTED_PROVIDERS = new Set([
  'openai', 'anthropic', 'gemini', 'moonshot', 'deepseek', 'ollama', 'groq',
  'qwen', 'mistral', 'cohere', 'nvidia', 'perplexity', 'together', 'cerebras',
  'azure', 'grok', 'fireworks', 'zhipu',
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
  console.log('App 设置中的厂商（带 ★ 的会进入自动轮询）：\n');
  for (const p of providers) {
    const type = (p.provider || 'openai').toLowerCase();
    const supported = SUPPORTED_PROVIDERS.has(type);
    const auto = supported && p.enabled !== false && !!p.apiKey;
    console.log(
      `  ${auto ? '★' : ' '} ${p.id}  ${type}${p.modelName ? ` / ${p.modelName}` : ''}` +
      `${p.enabled === false ? '  [已禁用]' : ''}${!p.apiKey ? '  [缺 apiKey]' : ''}` +
      `${!supported ? `  [类型不支持: ${type}]` : ''}`
    );
  }
}

/**
 * 把本轮 storyflow 冒烟产物移动归档到 matrix/<providerId>/。
 * 必须移动而非复制：下一厂商的冒烟跑前清理会清掉 temp 里的 storyflow-*，
 * 复制会把「还没归档就被清掉」的窗口留给时序，移动则天然无残留。
 */
export function archiveRunArtifacts(providerId) {
  const dest = join(MATRIX_DIR, providerId);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const moved = [];
  const moveInto = (from, to) => {
    if (!existsSync(from)) return;
    renameSync(from, to);
    moved.push(to);
  };
  moveInto(join(TEMP_DIR, 'storyflow.closed-loop.summary.json'), join(dest, 'storyflow.closed-loop.summary.json'));
  moveInto(join(TEMP_DIR, 'storyflow.closed-loop.outline.json'), join(dest, 'storyflow.closed-loop.outline.json'));
  moveInto(join(TEMP_DIR, 'storyflow.closed-loop.prose'), join(dest, 'prose'));
  if (existsSync(TRACE_DIR)) {
    for (const name of readdirSync(TRACE_DIR)) {
      if (name.startsWith('storyflow-') && name.endsWith('.jsonl')) {
        moveInto(join(TRACE_DIR, name), join(dest, name));
      }
    }
  }
  // harness 模拟主进程的项目存储（含全部正文），随轮归档供逐厂商对比
  for (const name of readdirSync(TEMP_DIR)) {
    if (/^storyflow-.*\.project-store\.json$/.test(name)) {
      moveInto(join(TEMP_DIR, name), join(dest, name));
    }
  }
  return moved;
}

function buildMatrixRow(providerMeta, exitCode, wallMs) {
  const row = {
    providerId: providerMeta.id,
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
      row.chaptersAccepted = `${batch.filter(item => item.accepted).length}/${batch.length}`;
      row.wordsMin = words.length ? Math.min(...words) : null;
      row.wordsAvg = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : null;
      row.wordsMax = words.length ? Math.max(...words) : null;
      row.runtimeBackend = s.runtimeBackend ?? null;
      row.warnings = (s.warnings ?? []).length;
    } catch {
      row.note = 'summary 解析失败';
    }
  } else {
    row.note = exitCode === 0 ? '未产出 summary' : '未产出 summary（前半段失败）';
  }
  return row;
}

function resolveProviderIds(argv) {
  const positional = argv.filter(arg => !arg.startsWith('--'));
  if (positional.length > 0) return [...new Set(positional)];
  const fromEnv = (process.env.MOLIU_PROVIDER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return [...new Set(fromEnv)];
  return readAppProviders()
    .filter(p => p.enabled !== false && !!p.apiKey && SUPPORTED_PROVIDERS.has((p.provider || 'openai').toLowerCase()))
    .map(p => p.id);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--list')) {
    printProviderList();
    return;
  }

  const ids = resolveProviderIds(argv);
  if (ids.length === 0) {
    console.error('[smoke:storyflow:real:multi] 没有可跑的厂商。用 --list 查看可用厂商，或用 MOLIU_PROVIDER_IDS=ID1,ID2 显式指定。');
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

  const perRunHint = process.env.MOLIU_CHAPTER_COUNT ? `（MOLIU_CHAPTER_COUNT=${process.env.MOLIU_CHAPTER_COUNT}，耗时相应缩短）` : '（默认 5 章，每厂商约 70-110 分钟）';
  console.log(`[smoke:storyflow:real:multi] 矩阵计划：${ids.length} 个厂商顺序轮询 ${perRunHint}`);
  ids.forEach((id, i) => {
    const meta = providers.find(p => p.id === id);
    console.log(`  ${i + 1}/${ids.length}  ${id}  ${(meta.provider || 'openai')}${meta.modelName ? ` / ${meta.modelName}` : ''}`);
  });
  console.log('');

  const rows = [];
  for (const id of ids) {
    const meta = providers.find(p => p.id === id);
    console.log(`[smoke:storyflow:real:multi] ===== ${id}（${meta.provider}/${meta.modelName || '默认模型'}）=====`);
    const startedAt = Date.now();
    const result = spawnSync(process.execPath, [SMOKE_SCRIPT], {
      stdio: 'inherit',
      env: { ...process.env, MOLIU_AI_PROVIDER_ID: id },
    });
    const wallMs = Date.now() - startedAt;
    const moved = archiveRunArtifacts(id);
    console.log(
      `[smoke:storyflow:real:multi] ${id} 完成：exit=${result.status ?? 'signal:' + result.signal}，` +
      `耗时 ${Math.round(wallMs / 60000)} 分钟，归档 ${moved.length} 个产物 → temp/storyflow-matrix/${id}/`
    );
    rows.push(buildMatrixRow(meta, result.status ?? 1, wallMs));
  }

  mkdirSync(MATRIX_DIR, { recursive: true });
  const matrix = {
    mode: 'storyflow-matrix',
    generatedAt: new Date().toISOString(),
    chapterCount: process.env.MOLIU_CHAPTER_COUNT ? Number(process.env.MOLIU_CHAPTER_COUNT) : 5,
    providers: rows,
  };
  writeFileSync(join(MATRIX_DIR, 'matrix.json'), JSON.stringify(matrix, null, 2), 'utf-8');

  console.log('\n[smoke:storyflow:real:multi] ===== 矩阵结果 =====');
  for (const row of rows) {
    console.log(
      `${row.pass ? '✓' : '✗'} ${row.providerId}  ${row.provider}/${row.model}` +
      `  ${Math.round(row.wallMinutes)}min` +
      (row.chaptersAccepted ? `  章节 ${row.chaptersAccepted}` : '') +
      (row.wordsAvg ? `  字数 ${row.wordsMin}/${row.wordsAvg}/${row.wordsMax}(min/avg/max)` : '') +
      (row.runtimeBackend ? `  backend=${row.runtimeBackend}` : '') +
      (row.warnings ? `  告警 ${row.warnings}` : '') +
      (row.note ? `  ⚠️ ${row.note}` : '')
    );
  }
  console.log(`\n[smoke:storyflow:real:multi] matrix: ${join(MATRIX_DIR, 'matrix.json')}`);
  process.exit(rows.some(row => !row.pass) ? 1 : 0);
}

const invokedDirectly = (process.argv[1] || '').replace(/\\/g, '/').endsWith('agent-storyflow-real-multi.mjs');
if (invokedDirectly) {
  main();
}
