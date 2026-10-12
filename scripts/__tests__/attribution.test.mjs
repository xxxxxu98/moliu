// 归因四分诊自动化回归：三态判定（复发待换机制/首现查修法/新签名）+ 修法表完整性。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.agents/skills/storyflow-release-loop/scripts'
);
const PATTERNS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/quality-ledger/fix-patterns.json'
);
const attribution = await import(pathToFileURL(path.join(SCRIPTS_DIR, 'attribution.mjs')).href);

function finding(id, cls, severity = 'S1') {
  return { id, severity, status: 'final', class: cls, rootLayer: 'writer', chapters: [3], summary: 'x', evidence: [{ chapter: 3, quote: 'y' }] };
}
function doc(round, findings) {
  return { round, reviewedAt: `2026-10-${round.padStart(2, '0')}T00:00:00+08:00`, findings };
}

describe('attributeFindings 三态判定', () => {
  const patterns = new Map([
    ['state.custody', { class: 'state.custody', expectedRootLayers: ['extraction', 'writer'], fixes: [
      { round: 'r8', mechanism: '影子状态账本：押地刷新/解除不连带', modules: ['scripts/state-ledger.mjs'] },
    ] }],
  ]);

  test('历史出现过且仍有 S1 → recurred-after-fix（§8 候选）', () => {
    const rows = attribution.attributeFindings(
      doc('r22', [finding('S1-01', 'state.custody')]),
      [doc('r21', [finding('a', 'state.custody')])],
      patterns
    );
    assert.equal(rows[0].verdict, 'recurred-after-fix');
    assert.ok(rows[0].advice.includes('换机制'));
    assert.deepEqual(rows[0].suggestedRootLayers, ['extraction', 'writer']);
  });

  test('历史上从未出现 → first-appearance（复用修法优先）', () => {
    const rows = attribution.attributeFindings(doc('r22', [finding('S1-01', 'state.custody')]), [], patterns);
    assert.equal(rows[0].verdict, 'first-appearance');
    assert.ok(rows[0].advice.includes('复用'));
  });

  test('修法表无记录 → novel-class（升级 AI，登记义务）', () => {
    const rows = attribution.attributeFindings(doc('r22', [finding('S1-01', 'prose.slop')]), [doc('r21', [])], patterns);
    assert.equal(rows[0].verdict, 'novel-class');
    assert.ok(rows[0].advice.includes('登记 fix-patterns'));
  });

  test('非终稿/S3/S4 不参与归因', () => {
    const rows = attribution.attributeFindings(
      doc('r22', [
        { ...finding('c1', 'state.custody'), status: 'caught' },
        { ...finding('c2', 'state.custody'), severity: 'S3' },
      ]),
      [],
      patterns
    );
    assert.equal(rows.length, 0);
  });

  test('报告渲染含三节与修法明细', () => {
    const rows = attribution.attributeFindings(doc('r22', [finding('S1-01', 'state.custody')]), [doc('r21', [finding('a', 'state.custody')])], patterns);
    const report = attribution.renderAttributionReport({ round: 'r22', book: '测' }, rows);
    assert.ok(report.includes('复发待换机制 1'));
    assert.ok(report.includes('历史 r8'));
    assert.ok(report.includes('state-ledger'));
  });
});

describe('fix-patterns.json 完整性（入库种子数据）', () => {
  test('全部分类合法、无重复、修复条目字段齐全', () => {
    const map = attribution.loadFixPatterns(PATTERNS_PATH);
    assert.ok(map.size >= 15);
    for (const pattern of map.values()) {
      assert.ok(pattern.fixes.length > 0, `${pattern.class} 无修法条目`);
      for (const fix of pattern.fixes) {
        assert.ok(fix.round && fix.mechanism && Array.isArray(fix.modules));
      }
    }
  });
});
