import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyTransient, markdownReport, parseIssue, runDiff } from '../storyflow-triage.mjs';

test('geo-block 被确定性归为瞬态类别', () => {
  assert.equal(
    classifyTransient('400 User location is not supported'),
    'infra.transient.geo-block'
  );
});

test('读者与合同问题保留稳定签名', () => {
  assert.deepEqual(parseIssue('未履约节点：主角交出账本'), {
    id: 'quality.node-unfulfilled',
    evidence: '未履约节点：主角交出账本',
  });
  assert.equal(parseIssue('语义问题[logic_gap] 第3段：人物无理由离场').id, 'quality.logic-gap');
});

test('Markdown 报告包含读者质量和修复成本列', () => {
  const markdown = markdownReport({
    generatedAt: '2026-08-19T00:00:00.000Z',
    source: 'temp/storyflow-matrix',
    providers: [
      {
        model: 'judge-model',
        pass: true,
        verdict: 'clean-with-noise',
        verdictReason: '只有影子质量信号',
        chaptersAccepted: '3/3',
        repairMetrics: { firstPassRate: 2 / 3 },
        readerOutlineScore: 76,
        readerMetrics: { chapterAverage: 73, chapterMinimum: 61 },
        signatures: [],
      },
    ],
  });
  assert.match(markdown, /首过率/);
  assert.match(markdown, /76/);
  assert.match(markdown, /73\/61/);
});

test('数值劣化在影子模式下只报告，不直接阻断', () => {
  const original = process.env.MOLIU_READER_REGRESSION_BLOCK;
  delete process.env.MOLIU_READER_REGRESSION_BLOCK;
  const diff = runDiff(
    {
      generatedAt: 'old',
      providers: [
        {
          model: 'm',
          verdict: 'clean',
          signatures: [],
          readerMetrics: { chapterAverage: 80 },
          readerOutlineScore: 82,
          repairMetrics: { firstPassRate: 0.9, averageRewriteRounds: 0.2 },
          runtimeMetrics: { latencyP95Ms: 10_000 },
        },
      ],
    },
    {
      generatedAt: 'new',
      providers: [
        {
          model: 'm',
          verdict: 'clean-with-noise',
          signatures: [],
          readerMetrics: { chapterAverage: 70 },
          readerOutlineScore: 72,
          repairMetrics: { firstPassRate: 0.7, averageRewriteRounds: 0.3 },
          runtimeMetrics: { latencyP95Ms: 14_000 },
        },
      ],
    }
  );
  assert.equal(diff.newRed, false);
  assert.equal(diff.regressionFailed, false);
  if (original === undefined) delete process.env.MOLIU_READER_REGRESSION_BLOCK;
  else process.env.MOLIU_READER_REGRESSION_BLOCK = original;
});
