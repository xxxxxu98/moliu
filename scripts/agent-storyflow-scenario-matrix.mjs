#!/usr/bin/env node
/**
 * Storyflow 题材场景矩阵：逐场景调用既有多厂商真实冒烟，并把产物隔离到
 * temp/storyflow-scenario-matrix/<scenarioId>/。场景之间顺序执行，场景内部沿用厂商并发。
 *
 *   node scripts/agent-storyflow-scenario-matrix.mjs --list
 *   MOLIU_STORYFLOW_SCENARIO_IDS=court-power,fair-mystery npm run smoke:storyflow:scenario-matrix
 *   node scripts/agent-storyflow-scenario-matrix.mjs <providerId1> <providerId2>
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE_PATH = join(process.cwd(), 'scripts', 'fixtures', 'storyflow-scenarios.json');
const OUTPUT_ROOT = join(process.cwd(), 'temp', 'storyflow-scenario-matrix');
const MULTI_SCRIPT = join(process.cwd(), 'scripts', 'agent-storyflow-real-multi.mjs');
const TRIAGE_SCRIPT = join(process.cwd(), 'scripts', 'storyflow-triage.mjs');

function readScenarios() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

function selectedScenarios(all) {
  const requested = (process.env.MOLIU_STORYFLOW_SCENARIO_IDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (requested.length === 0) return all;
  const unknown = requested.filter(id => !all.some(item => item.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `未知场景：${unknown.join(', ')}（可用：${all.map(item => item.id).join(', ')}）`
    );
  }
  return requested.map(id => all.find(item => item.id === id));
}

function runScenario(scenario, providerIds) {
  return new Promise(resolveRun => {
    const relativeMatrixDir = join('temp', 'storyflow-scenario-matrix', scenario.id);
    console.log(`\n[storyflow-scenarios] 开始 ${scenario.id} / ${scenario.name}`);
    const child = spawn(process.execPath, [MULTI_SCRIPT, ...providerIds], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MOLIU_STORYFLOW_SCENARIO_ID: scenario.id,
        MOLIU_STORYFLOW_MATRIX_DIR: relativeMatrixDir,
        MOLIU_READER_EVAL: process.env.MOLIU_READER_EVAL || '1',
      },
      stdio: 'inherit',
    });
    child.on('close', code =>
      resolveRun({
        scenarioId: scenario.id,
        name: scenario.name,
        exitCode: code ?? 1,
        matrixDir: relativeMatrixDir,
      })
    );
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const all = readScenarios();
  if (argv.includes('--list')) {
    for (const scenario of all) {
      console.log(`${scenario.id}\t${scenario.name}\t${scenario.targetReader}`);
    }
    return;
  }
  const scenarios = selectedScenarios(all);
  const providerIds = argv.filter(arg => !arg.startsWith('--'));
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, providerIds);
    const relativeTriageDir = join('temp', 'storyflow-scenario-matrix', scenario.id, 'triage');
    const triage = spawnSync(process.execPath, [TRIAGE_SCRIPT], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MOLIU_STORYFLOW_MATRIX_DIR: result.matrixDir,
        MOLIU_STORYFLOW_TRIAGE_DIR: relativeTriageDir,
      },
      stdio: 'inherit',
    });
    results.push({ ...result, triageExitCode: triage.status ?? 1, triageDir: relativeTriageDir });
  }
  const report = {
    mode: 'storyflow-scenario-matrix',
    generatedAt: new Date().toISOString(),
    chapterCount: Number(process.env.MOLIU_CHAPTER_COUNT || 20),
    results,
  };
  writeFileSync(join(OUTPUT_ROOT, 'index.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const failed = results.filter(result => result.exitCode !== 0);
  console.log(`\n[storyflow-scenarios] 完成 ${results.length} 个场景，失败 ${failed.length} 个`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(error => {
  console.error(`[storyflow-scenarios] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
