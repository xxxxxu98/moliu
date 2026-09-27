#!/usr/bin/env node
/**
 * 章节回放 runner：把书审 S1 固化为回放用例，并用当前代码分钟级回归。
 *
 *   node scripts/storyflow-replay-chapter.mjs make --spec <spec.json>
 *       按 spec 建用例：源 store 以内容哈希 gzip 进 temp/replay-cases/_stores/（多用例共享），
 *       用例写 temp/replay-cases/<id>/case.json。spec 用文件而非命令行参数传中文探针，
 *       规避 PowerShell/CMD 参数编码问题。
 *   node scripts/storyflow-replay-chapter.mjs run <用例id|case.json|all> [--samples 2]
 *       Electron 作为 Node 跑 vitest（SQLite ABI 与生产一致），执行
 *       storyflow.replay-chapter.test.ts；结果落 <用例>/runs/<时间戳>/result.json。
 *
 * spec 字段：id、findingId?、sourceStore、fromChapter、window、targetWordCount?、
 *   probe{context, question}（question 回答「是」= 缺陷复现）。
 * 通道沿用 temp/continue-write.real.config.json 的 providerId。
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { ensureElectronSqliteAbi } from './ensure-electron-sqlite-abi.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CASES_ROOT = join(repoRoot, 'temp/replay-cases');
const STORES_DIR = join(CASES_ROOT, '_stores');
const CASE_SCHEMA_VERSION = 'replay-case/v1';
const TEST_FILE = 'src/renderer/src/services/writing/__tests__/storyflow.replay-chapter.test.ts';

function fail(message) {
  console.error(`[replay] ${message}`);
  process.exit(1);
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/** store 根有三种历史形态，与 projectStoreFile.parseProjectStore 同口径 */
function projectOf(root) {
  if (Array.isArray(root.projects)) return root.projects[0];
  if (root.projects && typeof root.projects === 'object') return Object.values(root.projects)[0];
  return root;
}

function makeCase(args) {
  const specPath = argValue(args, '--spec');
  if (!specPath) fail('用法: make --spec <spec.json>');
  const spec = JSON.parse(readFileSync(resolve(specPath), 'utf8'));
  const missing = ['id', 'sourceStore', 'fromChapter', 'window'].filter(key => spec[key] === undefined);
  if (!spec.probe?.context || !spec.probe?.question) missing.push('probe.context/question');
  if (missing.length) fail(`spec 缺字段：${missing.join(', ')}`);
  if (!/^[\w.-]+$/u.test(spec.id)) fail(`id 只允许字母数字._-：${spec.id}`);

  const storePath = resolve(spec.sourceStore);
  if (!existsSync(storePath)) fail(`源 store 不存在：${storePath}`);
  const bytes = readFileSync(storePath);
  const project = projectOf(JSON.parse(bytes.toString('utf8')));
  const target = (project?.chapters ?? []).find(chapter => chapter.orderIndex + 1 === spec.fromChapter);
  if (!target) fail(`store 中不存在第 ${spec.fromChapter} 章`);

  mkdirSync(STORES_DIR, { recursive: true });
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 12);
  const snapshotPath = join(STORES_DIR, `${hash}.json.gz`);
  if (!existsSync(snapshotPath)) writeFileSync(snapshotPath, gzipSync(bytes));

  const caseDir = join(CASES_ROOT, spec.id);
  mkdirSync(caseDir, { recursive: true });
  const replayCase = {
    schemaVersion: CASE_SCHEMA_VERSION,
    id: spec.id,
    ...(spec.findingId ? { findingId: spec.findingId } : {}),
    createdAt: new Date().toISOString(),
    sourceStore: relative(repoRoot, storePath).replace(/\\/g, '/'),
    snapshot: relative(caseDir, snapshotPath).replace(/\\/g, '/'),
    fromChapter: spec.fromChapter,
    window: spec.window,
    ...(spec.targetWordCount ? { targetWordCount: spec.targetWordCount } : {}),
    probe: spec.probe,
  };
  writeFileSync(join(caseDir, 'case.json'), JSON.stringify(replayCase, null, 2), 'utf8');
  console.log(`[replay] case ${spec.id} -> ${join(caseDir, 'case.json')} (snapshot ${hash})`);
}

function resolveCasePaths(target) {
  if (target === 'all') {
    if (!existsSync(CASES_ROOT)) fail(`无用例目录：${CASES_ROOT}`);
    return readdirSync(CASES_ROOT, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
      .map(entry => join(CASES_ROOT, entry.name, 'case.json'))
      .filter(path => existsSync(path));
  }
  const direct = resolve(target);
  if (target.endsWith('.json') && existsSync(direct)) return [direct];
  const byId = join(CASES_ROOT, target, 'case.json');
  if (existsSync(byId)) return [byId];
  fail(`找不到用例：${target}`);
  return [];
}

function runCases(args) {
  const target = args.find(arg => !arg.startsWith('--') && arg !== argValue(args, '--samples'));
  if (!target) fail('用法: run <用例id|case.json|all> [--samples N]');
  const casePaths = resolveCasePaths(target);
  if (casePaths.length === 0) fail('没有可运行的用例');

  const config = JSON.parse(readFileSync(join(repoRoot, 'temp/continue-write.real.config.json'), 'utf8'));
  if (!config?.enabled) fail('temp/continue-write.real.config.json 未启用（enabled!=true）');
  if (!ensureElectronSqliteAbi('storyflow:replay-chapter')) fail('SQLite 后端不可用，中止');

  const require = createRequire(import.meta.url);
  const result = spawnSync(
    require('electron'),
    [join(repoRoot, 'scripts/electron-vitest-runner.mjs'), TEST_FILE],
    {
      stdio: 'inherit',
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        REAL_AI: '1',
        MOLIU_REPLAY_CASES: casePaths.join(';'),
        MOLIU_REPLAY_SAMPLES: argValue(args, '--samples') ?? '2',
      },
    }
  );
  console.log(`[replay] suite summary: ${join(CASES_ROOT, '_last-suite.json')}`);
  process.exit(result.status ?? 1);
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'make') makeCase(rest);
else if (command === 'run') runCases(rest);
else fail('usage: storyflow-replay-chapter.mjs <make --spec f | run <id|case.json|all> [--samples N]>');
