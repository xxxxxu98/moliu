// 大纲读者判官闭环编排回归（⑥ 判官反向闭环第一期）：
// 首评通过零修复 / blocking→修复→复评 / 修复改坏回 fail-closed / 判官不可用降级。
import { describe, expect, it, vi } from 'vitest';

import { parseExpandedOutline } from '../../parser/expanded-outline-parser';
import type { ExecutableOutline } from '../../types/executable-outline';
import {
  runOutlineReaderJudgeLoop,
  type ReaderJudgeLoopRepairResult,
} from '../outline-reader-judge-loop';
import { buildOutlineFixture } from '../../agent/__tests__/outlineFixture';

function judgement(overrides: Partial<{ score: number; wouldStartReading: boolean; blocking: number }> = {}) {
  const blocking = overrides.blocking ?? 0;
  return {
    version: 'reader-eval-v1',
    score: overrides.score ?? 88,
    wouldStartReading: overrides.wouldStartReading ?? true,
    confidence: 0.8,
    issues: Array.from({ length: blocking }, (_, i) => ({
      id: `reader.issue-${i}`,
      severity: 'critical',
      description: `blocking 问题 ${i}`,
      blocking: true,
      suggestion: '改写对应章节',
    })),
    summary: '测试评语',
  };
}

function makeJudge(judgements: Array<ReturnType<typeof judgement>>, onError?: (call: number) => never) {
  let call = 0;
  return {
    evaluateOutline: vi.fn(async () => {
      call += 1;
      if (onError && call === judgements.length + 1) {
        // 预留：全部脚本评完再调用即报错（用例自行控制）
      }
      const next = judgements[Math.min(call - 1, judgements.length - 1)];
      if (next === undefined && onError) onError(call);
      return next;
    }),
  };
}

const RAW = buildOutlineFixture();
const OUTLINE = parseExpandedOutline(RAW)!;

function repairedResult(rawText = RAW, overrides: Partial<ReaderJudgeLoopRepairResult> = {}): ReaderJudgeLoopRepairResult {
  return {
    rawText,
    outline: parseExpandedOutline(rawText)! as ExecutableOutline,
    canApply: true,
    blockers: [],
    warnings: ['修复回合已跑'],
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    rawText: RAW,
    outline: OUTLINE,
    context: { title: '验尸官升官记' },
    ...overrides,
  };
}

describe('runOutlineReaderJudgeLoop', () => {
  it('首评通过（无 blocking 且愿意开读）→ 零修复，summary.rounds=1', async () => {
    const judge = makeJudge([judgement()]);
    const repair = vi.fn();
    const result = await runOutlineReaderJudgeLoop({ ...baseInput(), judge, repair });
    expect(repair).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({ score: 88, blockingIssues: 0, judgeRounds: 1, repaired: false });
    expect(result.severelyTruncated).toBe(false);
    expect(result.rawText).toBe(RAW);
  });

  it('首评 blocking → 修复 → 复评通过：finds 传入修复、采用修复稿、rounds=2', async () => {
    const judge = makeJudge([judgement({ score: 72, blocking: 2, wouldStartReading: false }), judgement({ score: 86, blocking: 0 })]);
    const REPAIRED_RAW = buildOutlineFixture({ chapterOverrides: { 1: { CBN: '命案现场当场验尸打脸县丞' } } });
    const repair = vi.fn(async (input: { readerFeedback: { issues: unknown[]; score: number } }) => {
      expect(input.readerFeedback.issues).toHaveLength(2);
      expect(input.readerFeedback.score).toBe(72);
      return repairedResult(REPAIRED_RAW);
    });
    const result = await runOutlineReaderJudgeLoop({ ...baseInput(), judge, repair });
    expect(repair).toHaveBeenCalledOnce();
    expect(result.rawText).toBe(REPAIRED_RAW);
    expect(result.summary).toMatchObject({ score: 86, judgeRounds: 2, repaired: true });
    expect(result.warnings.some(w => w.includes('72→86'))).toBe(true);
  });

  it('wouldStartReading=false 也触发修复（blocking=0 但读者不开读）', async () => {
    const judge = makeJudge([judgement({ wouldStartReading: false }), judgement({ wouldStartReading: true })]);
    const repair = vi.fn(async () => repairedResult());
    const result = await runOutlineReaderJudgeLoop({ ...baseInput(), judge, repair });
    expect(repair).toHaveBeenCalledOnce();
    expect(result.summary?.repaired).toBe(true);
  });

  it('修复把结构改坏（canApply=false）→ severelyTruncated 交回 fail-closed', async () => {
    const judge = makeJudge([judgement({ blocking: 1 }), judgement({ blocking: 1 })]);
    const repair = vi.fn(async () => repairedResult(RAW, { canApply: false, blockers: ['章号断裂'] }));
    const result = await runOutlineReaderJudgeLoop({ ...baseInput(), judge, repair });
    expect(result.severelyTruncated).toBe(true);
    expect(result.blockers).toEqual(['章号断裂']);
    expect(result.summary).toBeUndefined(); // 不再复评
  });

  it('判官不可用 → 降级 warning 不阻断', async () => {
    const judge = {
      evaluateOutline: vi.fn(async () => {
        throw new Error('网关 503');
      }),
    };
    const repair = vi.fn();
    const result = await runOutlineReaderJudgeLoop({ ...baseInput(), judge, repair });
    expect(repair).not.toHaveBeenCalled();
    expect(result.warnings[0]).toContain('读者判官不可用');
    expect(result.severelyTruncated).toBe(false);
  });

  it('修复后复评失败 → 保留修复稿 + warning', async () => {
    let call = 0;
    const judge = {
      evaluateOutline: vi.fn(async () => {
        call += 1;
        if (call === 1) return judgement({ blocking: 1 });
        throw new Error('复评 429');
      }),
    };
    const REPAIRED_RAW = buildOutlineFixture();
    const repair = vi.fn(async () => repairedResult(REPAIRED_RAW));
    const result = await runOutlineReaderJudgeLoop({ ...baseInput(), judge, repair });
    expect(result.rawText).toBe(REPAIRED_RAW);
    expect(result.warnings.some(w => w.includes('复评失败'))).toBe(true);
    expect(result.severelyTruncated).toBe(false);
  });
});
