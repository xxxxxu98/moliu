// 回归分级路由 advisor + S1→回放用例桥回归测试（node --test）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const advisor = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/storyflow-regression-advisor.mjs')).href);
const bridge = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts/storyflow-replay-from-finding.mjs')).href);

describe('regression-advisor 路由', () => {
  test('大纲层→L3，编排层→L3+，判官→L3，脚本→L1，就高不就低', () => {
    const { level } = advisor.routeRegression([
      'scripts/storyflow-triage.mjs',
      'src/renderer/src/services/outline/generators/outline-stepper.ts',
    ]);
    assert.equal(level, 'L3');

    const pipeline = advisor.routeRegression([
      'src/renderer/src/services/writing/ChapterWritingPipeline.ts',
      'docs/quality-ledger/CONVERGENCE.md',
    ]);
    assert.equal(pipeline.level, 'L3+');

    const judge = advisor.routeRegression(['src/renderer/src/services/story-runtime/AIChapterJudge.ts']);
    assert.equal(judge.level, 'L3');

    const docs = advisor.routeRegression(['.agents/skills/storyflow-release-loop/SKILL.md']);
    assert.equal(docs.level, 'L1');
  });

  test('渲染输出含等级与逐级命令', () => {
    const advice = advisor.renderAdvice(advisor.routeRegression(['src/renderer/src/services/outline/prompts/system/core-principles.ts']));
    assert.ok(advice.includes('建议等级：L3'));
    assert.ok(advice.includes('vitest run'));
    assert.ok(advice.includes('replay-chapter.mjs run all'));
    assert.ok(advice.includes('MOLIU_CHAPTER_COUNT=20'));
  });

  test('CLI：--files 传入时可用', () => {
    const out = execFileSync('node', [
      path.join(REPO_ROOT, 'scripts/storyflow-regression-advisor.mjs'),
      '--files', 'scripts/x.mjs,src/main/index.ts',
    ], { encoding: 'utf8' });
    assert.ok(out.includes('建议等级：L1'));
  });
});

describe('replay-from-finding 桥', () => {
  const doc = {
    round: 'rX',
    matrixDir: 'temp/storyflow-matrix-rx',
    findings: [
      {
        id: 'S1-01', severity: 'S1', status: 'final', class: 'state.custody',
        summary: '在押角色顾珩于第10章自由活动无释放叙述', chapters: [10],
        evidence: [{ chapter: 10, quote: '顾珩走出诏狱大门' }],
      },
      { id: 'S2-01', severity: 'S2', status: 'final', class: 'state.title', summary: 'x', chapters: [3], evidence: [{ chapter: 3, quote: 'y' }] },
      { id: 'S1-02', severity: 'S1', status: 'caught', class: 'time.era', summary: 'x', chapters: [4], evidence: [{ chapter: 4, quote: 'y' }] },
      { id: 'S1-03', severity: 'S1', status: 'final', class: 'prose.slop', summary: 'AI 腔复读', chapters: [7], evidence: [] },
    ],
  };

  test('只沉淀终稿 S1 且带证据；探针问题按分类表生成', () => {
    const { specs, skipped } = bridge.buildReplaySpecs(doc);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].id, 'rX-S1-01');
    assert.equal(specs[0].fromChapter, 9);
    assert.equal(specs[0].window, 2);
    assert.ok(specs[0].probe.question.includes('在押'));
    assert.equal(skipped.length, 3);
  });

  test('findLargestProjectStore：多 store 取体积最大；空目录返回 null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-bridge-'));
    try {
      fs.mkdirSync(path.join(dir, 'providerA'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'providerA', 'a.project-store.json'), '{}');
      fs.writeFileSync(path.join(dir, 'providerB.project-store.json'), '{}'.padEnd(64, ' '));
      const store = bridge.findLargestProjectStore(dir);
      assert.ok(store.endsWith('providerB.project-store.json'));
      assert.equal(bridge.findLargestProjectStore(path.join(dir, 'nothing')), null);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('CLI：写 spec 落盘，无源 store 时 sourceStore 缺省不 make', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-bridge-cli-'));
    try {
      const docPath = path.join(dir, 'findings.json');
      fs.writeFileSync(docPath, JSON.stringify(doc), 'utf8');
      const outDir = path.join(dir, 'specs');
      const out = execFileSync('node', [
        path.join(REPO_ROOT, 'scripts/storyflow-replay-from-finding.mjs'),
        docPath, '--matrix-dir', path.join(dir, 'no-matrix'), '--out', outDir,
      ], { encoding: 'utf8' });
      assert.ok(out.includes('只写 spec 不 make'));
      const spec = JSON.parse(fs.readFileSync(path.join(outDir, 'rX-S1-01.json'), 'utf8'));
      assert.equal(spec.id, 'rX-S1-01');
      assert.equal(spec.sourceStore, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
