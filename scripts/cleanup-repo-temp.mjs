/**
 * 仓库 temp/ 业务归档清理 CLI(与 npm run cleanup:test-data 互补)。
 *
 * 背景:真实冒烟(storyflow-matrix / scenario-matrix / continue-write.real 等)
 * 会把整本项目快照、逐章正文、步骤日志写进仓库 temp/,单轮矩阵可达数百 MB。
 * 这些产物不是垃圾——triage 签名对比与书审回归需要回读,因此绝不自动清理;
 * 本 CLI 只在显式调用时按用户选择的范围删除。
 *
 * 用法:
 *   npm run temp:stats              仅列体积排行,不删任何东西
 *   npm run temp:clean              清全部(KEEP 除外);ai-traces 按天裁剪 jsonl
 *   node scripts/cleanup-repo-temp.mjs --dir storyflow-matrix        清指定目录
 *   node scripts/cleanup-repo-temp.mjs --keep ai-traces --all        清全部但整目录保留 traces
 *   node scripts/cleanup-repo-temp.mjs --all --older-than 7          根条目与 traces 都用 7 天
 *
 * 保护规则:--all 不碰 KEEP(配置 / 书审样本 / 断点)。单轮矩阵目录禁止写入 KEEP。
 * --dir 点名即授权,可删 KEEP 与 ai-traces 整目录。
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTempRoot = path.join(repoRoot, 'temp');

/**
 * 默认保护清单:harness 配置(体积近零,清掉下轮真实冒烟直接启动失败)。
 * 禁止登记单轮矩阵目录——写进去会永占数百 MB,退役只能改代码。
 * book-review / storyflow-checkpoints 曾在 KEEP 里被永久保护,34 个退役轮次
 * 书审目录累积 38MB(2026-09-12 实测)——已改为 SUBDIR_AGE_PRUNE 按天裁剪:
 * 近期轮次保留、退役轮次自动清、历史基线具名白名单永留。
 * review-juezheng/review-500ch/review-xcjz(08-26/27 书审工作正文,结论已入
 * memory;juezheng 基线在 book-review/juezheng-* 白名单有副本)同样移出。
 */
export const KEEP_DEFAULT = new Set([
  'continue-write.real.config.json',
  'continue-write.real.config.example.json',
  'storyflow.matrix.config.json',
]);

/** --all 时按文件 mtime 裁剪、不整目录删除的目录。 */
export const AGE_PRUNE_DIRS = new Set(['ai-traces']);

/**
 * --all 时按「子条目 mtime」裁剪的目录:退役轮次自动清,近期与基线白名单保留。
 * - book-review:每轮书审目录(书名-MMDD)轮次结束后回读价值归零;书审/triage
 *   复查都在当天~次日完成,3 天窗口与 traces 对齐;baseline、juezheng、xcjz、
 *   500ch、fixN 前缀的是跨轮 diff 基线样本,具名永留。
 * - storyflow-checkpoints:大纲断点供同通道跨轮 resume(MOLIU_RESUME_STORYFLOW),
 *   14 天内有效;退役通道的断点无 resume 价值,清。
 */
export const SUBDIR_AGE_PRUNE = new Map([
  ['book-review', { keepDays: 3, preserve: /^(baseline|juezheng|xcjz|500ch|fix\d)/u }],
  ['storyflow-checkpoints', { keepDays: 14 }],
]);

/**
 * temp:clean 对 ai-traces/*.jsonl 的默认保留天数。
 * 短于 storyflow-prune 的 7 天:本命令是显式腾盘,近 3 天够排当前故障。
 */
export const TRACE_KEEP_DAYS = 3;

/**
 * ai-traces 内按文件名前缀的差异化保留窗口:长跑写作 agent 过程 trace
 * (longform-agent-*,每章 2-3 个,含正文草稿全文,单轮 200 章可达 60+MB——
 * 2026-09-12 实测占 ai-traces 总量 88%)只在轮次进行时排障有价值,当天窗口
 * 足够;未匹配前缀的 jsonl(逐章/大纲/滚纲/裁判 trace)沿用 TRACE_KEEP_DAYS。
 */
export const TRACE_KIND_KEEP_DAYS = [['longform-agent-', 1]];

/**
 * 计算文件或目录体积(字节)。目录不可读时返回 0。
 * @param {string} p
 * @returns {number}
 */
export function dirSize(p) {
  let total = 0;
  let entries = [];
  try {
    entries = readdirSync(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else {
      try {
        total += statSync(full).size;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

/**
 * 按文件名前缀匹配差异化保留窗口(TRACE_KIND_KEEP_DAYS);未命中返回 fallbackDays。
 * @param {string} name
 * @param {number} fallbackDays
 * @returns {number}
 */
function keepDaysForTraceName(name, fallbackDays) {
  for (const [prefix, days] of TRACE_KIND_KEEP_DAYS) {
    if (name.startsWith(prefix)) return days;
  }
  return fallbackDays;
}

/**
 * 按 mtime 删除目录内过期 .jsonl(只动 jsonl,防误伤索引文件)。
 * cutoffMs 为默认保留线的时刻;TRACE_KIND_KEEP_DAYS 命中前缀的文件用更短窗口
 * (各 kind 的 cutoff = baseCutoff + (fallbackDays - kindDays) 天)。
 * @param {string} dir
 * @param {number} cutoffMs 早于此时刻的 jsonl 删除(默认窗口)
 * @param {number} fallbackDays 默认窗口天数(供 kind 差异换算)
 * @returns {{ files: string[], bytes: number }}
 */
export function pruneTraceJsonl(dir, cutoffMs, fallbackDays = TRACE_KEEP_DAYS) {
  const files = [];
  let bytes = 0;
  if (!existsSync(dir)) return { files, bytes };
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const kindDays = keepDaysForTraceName(name, fallbackDays);
    const kindCutoff = kindDays === fallbackDays
      ? cutoffMs
      : cutoffMs + (fallbackDays - kindDays) * 86400_000;
    if (st.mtimeMs >= kindCutoff) continue;
    bytes += st.size;
    rmSync(full, { force: true });
    files.push(name);
  }
  return { files, bytes };
}

/**
 * 按子条目 mtime 删除目录内过期子目录/文件(SUBDIR_AGE_PRUNE 的执行体)。
 * preserve 命中的子条目(基线白名单)无条件保留;mtime 新于 cutoff 的保留。
 * @param {string} dir
 * @param {number} cutoffMs 早于此时刻的子条目删除
 * @param {(name: string) => boolean} [preserve] 白名单谓词
 * @returns {{ entries: string[], bytes: number }}
 */
export function pruneSubdirsByAge(dir, cutoffMs, preserve) {
  const entries = [];
  let bytes = 0;
  if (!existsSync(dir)) return { entries, bytes };
  for (const name of readdirSync(dir)) {
    if (preserve && preserve.test(name)) continue;
    const full = path.join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.mtimeMs >= cutoffMs) continue;
    const size = st.isDirectory() ? dirSize(full) : st.size || 0;
    rmSync(full, { recursive: true, force: true });
    if (!existsSync(full)) {
      entries.push(name);
      bytes += size;
    }
  }
  return { entries, bytes };
}

/**
 * 执行一次 temp 清理。tempRoot 可注入,供单测隔离真实仓库 temp/。
 *
 * @param {{
 *   tempRoot: string,
 *   cleanAll?: boolean,
 *   explicitDirs?: string[],
 *   extraKeep?: string[],
 *   olderThanDays?: number,
 *   traceKeepDays?: number,
 *   nowMs?: number,
 * }} options
 * @returns {{
 *   removed: string[],
 *   skippedProtected: string[],
 *   prunedTraceFiles: string[],
 *   prunedSubdirEntries: string[],
 *   freedBytes: number,
 * }}
 */
export function runClean(options) {
  const tempRoot = options.tempRoot;
  const cleanAll = Boolean(options.cleanAll);
  const explicitDirs = options.explicitDirs ?? [];
  const olderThanDays = options.olderThanDays ?? 0;
  const nowMs = options.nowMs ?? Date.now();
  const traceKeepDays =
    olderThanDays > 0 ? olderThanDays : (options.traceKeepDays ?? TRACE_KEEP_DAYS);
  const keepSet = new Set(KEEP_DEFAULT);
  for (const name of options.extraKeep ?? []) keepSet.add(name);

  const removed = [];
  const skippedProtected = [];
  let prunedTraceFiles = [];
  let prunedSubdirEntries = [];
  let freedBytes = 0;

  if (!existsSync(tempRoot)) {
    return { removed, skippedProtected, prunedTraceFiles, prunedSubdirEntries, freedBytes };
  }

  const cutoff = olderThanDays > 0 ? nowMs - olderThanDays * 86400_000 : 0;
  const traceCutoff = nowMs - traceKeepDays * 86400_000;

  for (const entry of readdirSync(tempRoot, { withFileTypes: true })) {
    const name = entry.name;
    const full = path.join(tempRoot, name);
    const explicitlyNamed = explicitDirs.includes(name);
    if (explicitDirs.length > 0 && !explicitlyNamed) continue;

    // --dir 点名绕过 KEEP / 按天裁剪,整条目删除
    if (!explicitlyNamed && keepSet.has(name)) {
      skippedProtected.push(name);
      continue;
    }

    if (!explicitlyNamed && AGE_PRUNE_DIRS.has(name)) {
      if (!cleanAll) {
        skippedProtected.push(
          `${name}(用 --all 按 ${traceKeepDays} 天裁剪,或 --dir ${name} 整目录删除)`,
        );
        continue;
      }
      const pruned = pruneTraceJsonl(full, traceCutoff, traceKeepDays);
      prunedTraceFiles = prunedTraceFiles.concat(pruned.files);
      freedBytes += pruned.bytes;
      continue;
    }

    if (!explicitlyNamed && SUBDIR_AGE_PRUNE.has(name)) {
      const rule = SUBDIR_AGE_PRUNE.get(name);
      const subdirCutoff = olderThanDays > 0
        ? nowMs - olderThanDays * 86400_000
        : nowMs - rule.keepDays * 86400_000;
      if (!cleanAll) {
        skippedProtected.push(
          `${name}(用 --all 按子条目 ${rule.keepDays} 天裁剪,或 --dir ${name} 整目录删除)`,
        );
        continue;
      }
      const pruned = pruneSubdirsByAge(full, subdirCutoff, rule.preserve);
      prunedSubdirEntries = prunedSubdirEntries.concat(
        pruned.entries.map(sub => `${name}/${sub}`),
      );
      freedBytes += pruned.bytes;
      continue;
    }

    if (cutoff > 0 && statSync(full).mtimeMs > cutoff) continue;

    if (explicitDirs.length === 0 && !cleanAll) {
      skippedProtected.push(`${name}(用 --all 或 --dir ${name} 才会清)`);
      continue;
    }

    const bytes = entry.isDirectory() ? dirSize(full) : statSync(full).size || 0;
    rmSync(full, { recursive: true, force: true });
    if (!existsSync(full)) {
      removed.push(name);
      freedBytes += bytes;
    }
  }

  return { removed, skippedProtected, prunedTraceFiles, prunedSubdirEntries, freedBytes };
}

function fmt(mbFloat) {
  return `${mbFloat.toFixed(1)} MB`;
}

function printStats(tempRoot) {
  if (!existsSync(tempRoot)) {
    console.log('[temp:stats] temp/ 不存在');
    return;
  }
  const rows = readdirSync(tempRoot, { withFileTypes: true })
    .map(entry => ({
      name: entry.name,
      dir: entry.isDirectory(),
      size: entry.isDirectory()
        ? dirSize(path.join(tempRoot, entry.name))
        : statSync(path.join(tempRoot, entry.name)).size || 0,
      kept: KEEP_DEFAULT.has(entry.name),
      agePrune: AGE_PRUNE_DIRS.has(entry.name),
    }))
    .sort((a, b) => b.size - a.size);
  const totalMB = rows.reduce((sum, row) => sum + row.size, 0) / 1048576;
  console.log(`[temp:stats] temp/ 总计 ${fmt(totalMB)}\n`);
  for (const row of rows.slice(0, 20)) {
    const subdirPrune = SUBDIR_AGE_PRUNE.get(row.name);
    const tag = row.kept
      ? '🛡默认保留 '
      : row.agePrune
        ? `⏱${TRACE_KEEP_DAYS}天裁剪 `
        : subdirPrune
          ? `⏱子条目${subdirPrune.keepDays}天裁剪 `
          : '';
    console.log(
      `${row.dir ? '[D]' : '[F]'} ${(row.size / 1048576).toFixed(1).padStart(8)} MB  ${tag}${row.name}`,
    );
  }
  console.log('\n清理示例:');
  console.log('  node scripts/cleanup-repo-temp.mjs --dir storyflow-matrix   # 清指定目录');
  console.log('  node scripts/cleanup-repo-temp.mjs --all                    # 清全部(KEEP 除外;traces 按天裁剪)');
  console.log('  node scripts/cleanup-repo-temp.mjs --all --keep ai-traces   # 全清但整目录留 traces');
  console.log('  node scripts/cleanup-repo-temp.mjs --dir ai-traces          # 整目录删除 traces');
}

function isCli() {
  const argv1 = process.argv[1];
  return Boolean(argv1 && argv1.replace(/\\/g, '/').endsWith('cleanup-repo-temp.mjs'));
}

if (isCli()) {
  const args = process.argv.slice(2);
  const modeStats = args.includes('--stats') || args.length === 0;
  const explicitDirs = [];
  const extraKeep = [];
  let olderThanDays = 0;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--dir' && args[i + 1]) {
      explicitDirs.push(args[i + 1]);
      i += 1;
    } else if (args[i] === '--keep' && args[i + 1]) {
      extraKeep.push(args[i + 1]);
      i += 1;
    } else if (args[i] === '--older-than' && args[i + 1]) {
      olderThanDays = Number(args[i + 1]);
      i += 1;
    }
  }
  const cleanAll = args.includes('--all');

  if (modeStats && explicitDirs.length === 0 && !cleanAll) {
    printStats(defaultTempRoot);
    process.exit(0);
  }

  if (!existsSync(defaultTempRoot)) {
    console.log('[temp:clean] temp/ 不存在,无事可做');
    process.exit(0);
  }

  const result = runClean({
    tempRoot: defaultTempRoot,
    cleanAll,
    explicitDirs,
    extraKeep,
    olderThanDays,
  });

  for (const name of result.removed) {
    console.log(`  已删根条目  ${name}`);
  }
  if (result.prunedTraceFiles.length > 0) {
    console.log(
      `  已裁剪 ai-traces jsonl ${result.prunedTraceFiles.length} 个`,
    );
  }
  if (result.prunedSubdirEntries.length > 0) {
    console.log(
      `  已裁剪退役子条目 ${result.prunedSubdirEntries.length} 个`,
    );
    for (const entry of result.prunedSubdirEntries) {
      console.log(`    - ${entry}`);
    }
  }

  console.log(
    `\n[temp:clean] 完成:删除 ${result.removed.length} 个根条目` +
      (result.prunedTraceFiles.length > 0
        ? `、裁剪 ${result.prunedTraceFiles.length} 个 jsonl`
        : '') +
      `,释放 ${(result.freedBytes / 1048576).toFixed(1)} MB` +
      (result.skippedProtected.length > 0
        ? `;跳过 ${result.skippedProtected.length} 项(${result.skippedProtected.slice(0, 5).join('、')}${result.skippedProtected.length > 5 ? '…' : ''})`
        : ''),
  );
}
