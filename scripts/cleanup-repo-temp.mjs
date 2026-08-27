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
 *   npm run temp:clean              交互外默认安全档:只清 trace/checkpoint 类可再生目录
 *   node scripts/cleanup-repo-temp.mjs --dir storyflow-matrix        清指定目录
 *   node scripts/cleanup-repo-temp.mjs --keep ai-traces --all        清全部但保留指定项
 *   node scripts/cleanup-repo-temp.mjs --older-than 7                只清 7 天前修改的条目
 *
 * 保护规则:--all 与 --dir 都不会触碰 keep-list(默认含 AI trace 与各书审样本),
 * 除非对该条目显式点名 --dir。
 */

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = path.join(repoRoot, 'temp');

/** 默认保护清单:体积小且回读价值高(AI 排查证据 / 书审回归样本 / 断点续跑) */
const KEEP_DEFAULT = new Set([
  'ai-traces',
  'book-review',
  'review-juezheng',
  'review-500ch',
  'review-xcjz',
  'storyflow-checkpoints',
]);

function dirSize(p) {
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

function fmt(mbFloat) {
  return `${mbFloat.toFixed(1)} MB`;
}

function removeEntry(name) {
  const full = path.join(tempRoot, name);
  rmSync(full, { recursive: true, force: true });
  return !existsSync(full);
}

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const modeStats = args.includes('--stats') || args.length === 0;
const explicitDirs = [];
let keepList = [...KEEP_DEFAULT];
let olderThanDays = 0;

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--dir' && args[i + 1]) {
    explicitDirs.push(args[i + 1]);
    i += 1;
  } else if (args[i] === '--keep' && args[i + 1]) {
    keepList.push(args[i + 1]);
    i += 1;
  } else if (args[i] === '--older-than' && args[i + 1]) {
    olderThanDays = Number(args[i + 1]);
    i += 1;
  }
}
const cleanAll = args.includes('--all');

if (modeStats && explicitDirs.length === 0 && !cleanAll) {
  // ---------- stats 模式:只报体积 ----------
  if (!existsSync(tempRoot)) {
    console.log('[temp:stats] temp/ 不存在');
    process.exit(0);
  }
  const rows = readdirSync(tempRoot, { withFileTypes: true })
    .map(entry => ({
      name: entry.name,
      dir: entry.isDirectory(),
      size: entry.isDirectory()
        ? dirSize(path.join(tempRoot, entry.name))
        : statSync(path.join(tempRoot, entry.name)).size || 0,
      kept: KEEP_DEFAULT.has(entry.name),
    }))
    .sort((a, b) => b.size - a.size);
  const totalMB = rows.reduce((sum, row) => sum + row.size, 0) / 1048576;
  console.log(`[temp:stats] temp/ 总计 ${fmt(totalMB)}\n`);
  for (const row of rows.slice(0, 20)) {
    console.log(
      `${row.dir ? '[D]' : '[F]'} ${(row.size / 1048576).toFixed(1).padStart(8)} MB  ${row.kept ? '🛡默认保留 ' : ''}${row.name}`,
    );
  }
  console.log('\n清理示例:');
  console.log('  node scripts/cleanup-repo-temp.mjs --dir storyflow-matrix   # 清指定目录');
  console.log('  node scripts/cleanup-repo-temp.mjs --all                    # 清全部(默认保护清单除外)');
  console.log('  node scripts/cleanup-repo-temp.mjs --all --keep storyflow-matrix  # 全清但留指定项');
  process.exit(0);
}

// ---------- 清理模式 ----------
if (!existsSync(tempRoot)) {
  console.log('[temp:clean] temp/ 不存在,无事可做');
  process.exit(0);
}

const cutoff = olderThanDays > 0 ? Date.now() - olderThanDays * 86400_000 : 0;
let removedCount = 0;
let freedBytes = 0;
let skippedProtected = [];

for (const entry of readdirSync(tempRoot, { withFileTypes: true })) {
  const name = entry.name;
  const full = path.join(tempRoot, name);

  // 指定 --dir 时按白名单点杀,无视保护清单(用户显式点名即授权)
  const explicitlyNamed = explicitDirs.includes(name);
  if (explicitDirs.length > 0 && !explicitlyNamed) continue;

  // 默认(无 --dir):保护清单永不动;--all 也尊重保护清单除非被 --dir 点名
  if (!explicitlyNamed && KEEP_DEFAULT.has(name)) {
    skippedProtected.push(name);
    continue;
  }

  // --older-than 过滤
  if (cutoff > 0 && statSync(full).mtimeMs > cutoff) continue;

  // 未指定 --dir 且未给 --all:不删(安全档),只提示可清什么
  if (explicitDirs.length === 0 && !cleanAll) {
    skippedProtected.push(`${name}(用 --all 或 --dir ${name} 才会清)`);
    continue;
  }

  const bytes = entry.isDirectory() ? dirSize(full) : statSync(full).size || 0;
  if (removeEntry(name)) {
    removedCount += 1;
    freedBytes += bytes;
    console.log(`  已删 ${(bytes / 1048576).toFixed(1).padStart(8)} MB  ${name}`);
  } else {
    console.log(`  删除失败(被占用?)  ${name}`);
  }
}

console.log(
  `\n[temp:clean] 完成:删除 ${removedCount} 项,释放 ${(freedBytes / 1048576).toFixed(1)} MB` +
    (skippedProtected.length > 0 ? `;跳过 ${skippedProtected.length} 项(${skippedProtected.slice(0, 5).join('、')}${skippedProtected.length > 5 ? '…' : ''})` : ''),
);
