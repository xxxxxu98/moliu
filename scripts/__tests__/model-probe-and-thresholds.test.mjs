// 换模型探测（④）+ 阈值有界自治（⑤）回归测试（node --test）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPTS_DIR = path.join(REPO_ROOT, '.agents/skills/storyflow-release-loop/scripts');
const probe = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/storyflow-model-probe.mjs')).href);
const thresholdsCli = await import(pathToFileURL(path.join(SCRIPTS_DIR, 'thresholds.mjs')).href);
const lib = await import(pathToFileURL(path.join(SCRIPTS_DIR, 'findings-lib.mjs')).href);

describe('model-probe 对比表（④）', () => {
  const triageRow = {
    providerId: 'p1', model: 'model-a', verdict: 'quality-rejection',
    chaptersAccepted: '20/20', wallMinutes: 84,
    repairMetrics: { firstPassRate: 0.42, averageRewriteRounds: 1.3 },
    readerMetrics: { chapterAverage: 85.2, chapterMinimum: 70 },
    readerOutlineScore: 84.3, readerEvalVersion: 'reader-eval-v1',
    signatures: [{ severity: 'red' }, { severity: 'red' }, { severity: 'yellow' }],
    latency: { 'scene-draft': { p50Ms: 21000 } },
  };

  test('triage 行 → 探测记录字段齐全', () => {
    const rec = probe.probeRecordFromTriage('probe-a', triageRow);
    assert.equal(rec.schemaVersion, 'model-probe/v1');
    assert.equal(rec.model, 'model-a');
    assert.equal(rec.redSignatures, 2);
    assert.equal(rec.yellowSignatures, 1);
    assert.equal(rec.sceneDraftP50Ms, 21000);
    assert.equal(rec.readerEvalVersion, 'reader-eval-v1');
  });

  test('对比表含列头与行；口径混用/低首过率出注记', () => {
    const a = probe.probeRecordFromTriage('probe-a', triageRow);
    const b = probe.probeRecordFromTriage('probe-b', { ...triageRow, model: 'model-b', readerEvalVersion: 'reader-eval-v2', repairMetrics: { firstPassRate: 0.2 } });
    const table = probe.buildComparisonTable([a, b]);
    assert.ok(table.includes('| tag | model |'));
    assert.ok(table.includes('model-a'));
    assert.ok(table.includes('口径不一致'));
    assert.ok(table.includes('probe-b')); // 首过率 <30% 注记
  });
});

describe('阈值有界自治（⑤）', () => {
  const active = { outline: 85, mean: 85, median: 86, min: 65 };

  test('±2 内自动可生效；超出须批准；低于硬下限一律拒绝', () => {
    assert.deepEqual(thresholdsCli.validateProposal(active, 'outline', 83, undefined), { errors: [], autoEligible: true });
    const big = thresholdsCli.validateProposal(active, 'outline', 82, undefined);
    assert.ok(big.errors[0].includes('--approved-by'));
    assert.equal(thresholdsCli.validateProposal(active, 'outline', 82, 'user').errors.length, 0);
    const floor = thresholdsCli.validateProposal(active, 'min', 59, 'user');
    assert.ok(floor.errors[0].includes('硬下限'));
    const bad = thresholdsCli.validateProposal(active, 'whatever', 84, undefined);
    assert.ok(bad.errors.length > 0);
  });

  test('propose→apply 全流程落 active+history（CLI，临时目录直改仓库文件后还原）', () => {
    const thresholdsPath = path.join(REPO_ROOT, 'docs/quality-ledger/thresholds.json');
    const backup = fs.readFileSync(thresholdsPath, 'utf8');
    try {
      execFileSync('node', [path.join(SCRIPTS_DIR, 'thresholds.mjs'), 'show'], { encoding: 'utf8' });
      // propose 84（-1，自动幅度内）→ apply → active.outline=84，history +1
      execFileSync('node', [
        path.join(SCRIPTS_DIR, 'thresholds.mjs'), 'propose',
        '--gate', 'outline', '--to', '84', '--evidence', 'unit-test',
      ], { encoding: 'utf8' });
      const afterPropose = JSON.parse(fs.readFileSync(thresholdsPath, 'utf8'));
      assert.equal(afterPropose.pending.to, 84);
      execFileSync('node', [path.join(SCRIPTS_DIR, 'thresholds.mjs'), 'apply'], { encoding: 'utf8' });
      const afterApply = JSON.parse(fs.readFileSync(thresholdsPath, 'utf8'));
      assert.equal(afterApply.active.readerJudge.outline, 84);
      assert.equal(afterApply.pending, null);
      assert.equal(afterApply.history.length, 2);
      assert.equal(afterApply.history[1].mode, 'auto');
    } finally {
      fs.writeFileSync(thresholdsPath, backup, 'utf8');
    }
  });

  test('resolveReaderJudgeGate：thresholds.json 优先；computeReleaseVerdict 接受注入门禁', () => {
    const dir = path.join(REPO_ROOT, 'docs/quality-ledger/findings');
    const { gate, source } = lib.resolveReaderJudgeGate(dir);
    assert.equal(source, 'thresholds.json');
    assert.equal(gate.outline, 85);
    const doc = {
      review: { method: 'full-read', chaptersRead: 10, independentReviewer: true },
      chapters: 10, gates: {
        precheckRedlines: 0, fateRealResurrection: 0,
        readerJudge: { outline: 84.5, mean: 86, median: 87, min: 70, independentFromWriter: true },
        ending: { complete: true, mainUnresolved: 0, closureSignals: 2 },
        humanIntervention: [], blindTest: 'pass',
      }, findings: [],
    };
    // 冻结值 85 下 84.5 阻断；放宽到 84 的门禁下通过（有界自治的判定一致性）
    assert.ok(lib.computeReleaseVerdict(doc).blockers.some(b => b.includes('outline=84.5')));
    assert.ok(!lib.computeReleaseVerdict(doc, { outline: 84, mean: 85, median: 86, min: 65 }).blockers.some(b => b.includes('outline')));
  });
});
