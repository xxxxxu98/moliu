// findings-lib / findings-ledger 回归测试（node --test）。
// 覆盖：schema 校验（证据、分类、回填豁免）、caught 不计数（防「改标签清零」）、
// 上线判定缺数据即阻断、跨轮升级信号（持续类/形态漂移/上游集中/未验证归零）、converge CLI 落盘。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 被测脚本在 release-loop skill 的 scripts/ 下（skill 专属工具按归属红线归位）
const SCRIPTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.agents/skills/storyflow-release-loop/scripts'
);
const lib = await import(pathToFileURL(path.join(SCRIPTS_DIR, 'findings-lib.mjs')).href);

/** 一份全部门禁通过的基线文档，用例按需覆写 */
function makeDoc(overrides = {}) {
  return {
    schemaVersion: 'findings/v1',
    round: 'rX',
    book: '测试书',
    reviewedAt: '2026-09-23T00:00:00+08:00',
    chapters: 100,
    review: { method: 'full-read-4ch', chaptersRead: 100, independentReviewer: true },
    gates: {
      precheckRedlines: 0,
      fateRealResurrection: 0,
      readerJudge: { outline: 86, mean: 86, median: 87, min: 70, independentFromWriter: true },
      ending: { complete: true, mainUnresolved: 0, closureSignals: 2 },
      humanIntervention: [],
      blindTest: 'pass',
    },
    findings: [],
    ...overrides,
  };
}

function s1(id, cls, rootLayer = 'writer', extra = {}) {
  return {
    id,
    severity: 'S1',
    class: cls,
    status: 'final',
    rootLayer,
    chapters: [10],
    summary: '样例',
    evidence: [{ chapter: 10, quote: '原文' }],
    ...extra,
  };
}

describe('validateFindingsDoc', () => {
  test('终稿 S1 缺原文证据报错，回填文档降级为警告', () => {
    const finding = { ...s1('a', 'state.custody'), evidence: [] };
    const strict = lib.validateFindingsDoc(makeDoc({ findings: [finding] }));
    assert.ok(strict.errors.some(e => e.includes('原文证据')));
    const backfilled = lib.validateFindingsDoc(makeDoc({ backfilledFrom: 'old.md', findings: [finding] }));
    assert.equal(backfilled.errors.length, 0);
    assert.ok(backfilled.warnings.some(w => w.includes('回填')));
  });

  test('分类不在固定表、id 重复、count 非法都报错', () => {
    const doc = makeDoc({
      findings: [
        s1('dup', 'state.whatever'),
        s1('dup', 'state.fate', 'writer', { count: 0 }),
      ],
    });
    const { errors } = lib.validateFindingsDoc(doc);
    assert.ok(errors.some(e => e.includes('不在分类表')));
    assert.ok(errors.some(e => e.includes('重复')));
    assert.ok(errors.some(e => e.includes('count')));
  });
});

describe('countFindings / computeReleaseVerdict', () => {
  test('caught 不计入 S2，但改标签无法绕过审法门禁（r9 形态）', () => {
    const caught = { ...s1('c', 'state.title'), severity: 'S2', status: 'caught' };
    const doc = makeDoc({
      review: { method: 'unverified', chaptersRead: 0 },
      findings: [caught],
    });
    assert.equal(lib.countFindings(doc).S2, 0);
    assert.equal(lib.countFindings(doc).caught, 1);
    const verdict = lib.computeReleaseVerdict(doc);
    assert.equal(verdict.ready, false);
    assert.ok(verdict.blockers.some(b => b.includes('审法不合格')));
  });

  test('聚合条目按 count 计数', () => {
    const doc = makeDoc({ findings: [{ ...s1('agg', 'state.title'), severity: 'S2', count: 19 }] });
    assert.equal(lib.countFindings(doc).S2, 19);
  });

  test('全部门禁达标时 READY', () => {
    assert.deepEqual(lib.computeReleaseVerdict(makeDoc()).blockers, []);
  });

  test('缺读者裁判、有补写干预、盲测未执行、needs-verify 均阻断', () => {
    const doc = makeDoc({
      gates: {
        ...makeDoc().gates,
        readerJudge: null,
        humanIntervention: ['repair-empty ch86'],
        blindTest: null,
      },
      findings: [{ ...s1('v', 'state.fate'), status: 'needs-verify' }],
    });
    const { ready, blockers } = lib.computeReleaseVerdict(doc);
    assert.equal(ready, false);
    for (const keyword of ['读者裁判', '人工/补写干预', '盲测', '待核实']) {
      assert.ok(blockers.some(b => b.includes(keyword)), `应含阻断：${keyword}`);
    }
  });

  test('读者裁判任一指标低于冻结阈值即阻断', () => {
    const doc = makeDoc({
      gates: { ...makeDoc().gates, readerJudge: { outline: 84.9, mean: 86, median: 87, min: 70 } },
    });
    assert.ok(lib.computeReleaseVerdict(doc).blockers.some(b => b.includes('outline=84.9')));
  });
});

describe('detectEscalationSignals', () => {
  test('同类连续两个全读轮出现 S1 → persistent-class', () => {
    const docs = [
      makeDoc({ round: 'r1', findings: [s1('1', 'state.custody')] }),
      makeDoc({ round: 'r2', findings: [s1('2', 'state.custody')] }),
    ];
    const kinds = lib.detectEscalationSignals(docs).map(s => s.kind);
    assert.ok(kinds.includes('persistent-class'));
  });

  test('未验证轮 S1=0 → review-downgrade + unverified-zero，且不参与持续类计算', () => {
    const docs = [
      makeDoc({ round: 'r1', findings: [s1('1', 'state.custody')] }),
      makeDoc({ round: 'r2', chapters: 78, review: { method: 'unverified', chaptersRead: 0 } }),
    ];
    const kinds = lib.detectEscalationSignals(docs).map(s => s.kind);
    assert.ok(kinds.includes('review-downgrade'));
    assert.ok(kinds.includes('unverified-zero'));
    assert.ok(!kinds.includes('persistent-class'));
  });

  test('最新全读轮 S1 多数根因在大纲/蓝图 → upstream-root', () => {
    const docs = [
      makeDoc({
        findings: [
          s1('1', 'structure.arc', 'blueprint'),
          s1('2', 'state.custody', 'outline'),
          s1('3', 'state.location', 'writer'),
        ],
      }),
    ];
    assert.ok(lib.detectEscalationSignals(docs).some(s => s.kind === 'upstream-root'));
  });

  test('最新轮 S1 多数是前两轮未见过的新类 → shape-shift', () => {
    const docs = [
      makeDoc({ round: 'r1', findings: [s1('1', 'time.era')] }),
      makeDoc({ round: 'r2', findings: [s1('2', 'number.arithmetic')] }),
      makeDoc({ round: 'r3', findings: [s1('3', 'structure.arc'), s1('4', 'structure.offscreen')] }),
    ];
    assert.ok(lib.detectEscalationSignals(docs).some(s => s.kind === 'shape-shift'));
  });

  test('同口径全读轮 S1 真实归零不报 unverified-zero', () => {
    const docs = [
      makeDoc({ round: 'r1', findings: [s1('1', 'state.custody')] }),
      makeDoc({ round: 'r2' }),
    ];
    assert.ok(!lib.detectEscalationSignals(docs).some(s => s.kind === 'unverified-zero'));
  });
});

describe('findings-ledger converge CLI', () => {
  test('按 reviewedAt 排序汇总并落盘收敛表', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'findings-ledger-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ledgerDir = path.join(dir, 'findings');
    fs.mkdirSync(ledgerDir);
    const later = makeDoc({ round: 'r2', reviewedAt: '2026-09-02', findings: [s1('b', 'state.custody')] });
    const earlier = makeDoc({ round: 'r1', reviewedAt: '2026-09-01', findings: [s1('a', 'state.custody')] });
    fs.writeFileSync(path.join(ledgerDir, 'a.json'), JSON.stringify(later), 'utf8');
    fs.writeFileSync(path.join(ledgerDir, 'b.json'), JSON.stringify(earlier), 'utf8');
    const out = path.join(dir, 'CONVERGENCE.md');
    execFileSync('node', [path.join(SCRIPTS_DIR, 'findings-ledger.mjs'), 'converge', '--dir', ledgerDir, '--out', out]);
    const report = fs.readFileSync(out, 'utf8');
    assert.ok(report.indexOf('| r1 |') < report.indexOf('| r2 |'));
    assert.ok(report.includes('persistent-class'));
  });
});
