/**
 * WriterToolkit 单测：暂存写(revise/submit)、run_checks 预算与校验账本、finish 前置条件、
 * 最终稿回退到最后一次审查 revision、审查链致命错误冒泡。
 */
import { describe, expect, it, vi } from 'vitest';

import type { ContinuityReport, SceneDraft } from '@/types/story-runtime';

import { AgentToolFatalError } from '../../agent/AgentToolkit';
import { WriterToolkit, type ChapterReviewOutcome } from '../../agent/WriterToolkit';

function makeDrafts(paragraphs: string[]): SceneDraft[] {
  return [{ sceneId: 'b1:scene', beatId: 'b1', paragraphs, candidateEvents: [] }];
}

function report(blocking: string[] = []): ContinuityReport {
  return {
    accepted: blocking.length === 0,
    issues: blocking.map((message, index) => ({
      id: `issue-${index}`,
      domain: 'fulfillment',
      severity: 'blocking',
      message,
      evidence: [],
    })),
    checkedDomains: ['fulfillment'],
  };
}

const emptyFacts = { events: [], deltas: [], evidence: [] };

function makeToolkit(options?: {
  initialReview?: ChapterReviewOutcome;
  review?: (drafts: SceneDraft[]) => Promise<ChapterReviewOutcome>;
  maxChecks?: number;
}) {
  const review =
    options?.review ??
    (async (drafts: SceneDraft[]) => ({
      facts: emptyFacts,
      report: report(drafts[0].paragraphs.join('').includes('御剑') ? ['触发禁区:御剑入城'] : []),
    }));
  const reviewPort = { review: vi.fn(review) };
  const toolkit = new WriterToolkit({
    initialDrafts: makeDrafts(['开场。', '林夜御剑入城。', '收尾。']),
    initialReview: options?.initialReview ?? { facts: emptyFacts, report: report(['触发禁区:御剑入城']) },
    reviewPort,
    maxChecks: options?.maxChecks ?? 2,
    targetWordCount: 0,
  });
  return { toolkit, reviewPort };
}

describe('WriterToolkit', () => {
  it('初稿带初审:revision=1 已校验但 blocking>0,finish 被拒并给出修复指引', () => {
    const { toolkit } = makeToolkit();
    expect(toolkit.draft.revision()).toBe(1);
    expect(toolkit.draft.isVerified()).toBe(false);
    expect(toolkit.guardFinish()).toContain('未通过审查');
  });

  it('get_draft 返回带索引全文;revise_paragraphs 支持替换/删除/插入并使校验失效', async () => {
    const { toolkit } = makeToolkit();
    const read = await toolkit.call('get_draft', {});
    expect(read.ok && (read.result as { paragraphs: unknown[] }).paragraphs).toHaveLength(3);

    const revised = await toolkit.call('revise_paragraphs', {
      edits: [
        { index: 1, text: '林夜徒步入城。' },
        { index: 2, text: '' },
      ],
      insertAfter: [{ index: 0, paragraphs: ['守卫盘查。'] }],
    });
    expect(revised.ok).toBe(true);
    expect(toolkit.draft.get()?.[0].paragraphs).toEqual(['开场。', '守卫盘查。', '林夜徒步入城。']);
    expect(toolkit.draft.revision()).toBe(2);
    expect(toolkit.guardFinish()).toContain('尚未 run_checks');
  });

  it('revise_paragraphs 索引越界/空结果返回 ok:false 而不抛错', async () => {
    const { toolkit } = makeToolkit();
    const outOfRange = await toolkit.call('revise_paragraphs', { edits: [{ index: 9, text: 'x' }] });
    expect(outOfRange.ok).toBe(false);
    expect(!outOfRange.ok && outOfRange.error).toContain('越界');
    const emptied = await toolkit.call('revise_paragraphs', {
      edits: [0, 1, 2].map(index => ({ index, text: '' })),
    });
    expect(emptied.ok).toBe(false);
    expect(toolkit.draft.revision()).toBe(1);
  });

  it('run_checks 走注入审查端口,通过后 finish 放行;预算耗尽返回错误提示', async () => {
    const { toolkit, reviewPort } = makeToolkit({ maxChecks: 1 });
    await toolkit.call('revise_paragraphs', { edits: [{ index: 1, text: '林夜徒步入城。' }] });
    const checked = await toolkit.call('run_checks', {});
    expect(checked.ok).toBe(true);
    expect((checked.ok && checked.result) as { blocking: number }).toMatchObject({
      blocking: 0,
      accepted: true,
      checksRemaining: 0,
    });
    expect(reviewPort.review).toHaveBeenCalledOnce();
    expect(toolkit.guardFinish()).toBeNull();

    await toolkit.call('revise_paragraphs', { edits: [{ index: 0, text: '新开场。' }] });
    const exhausted = await toolkit.call('run_checks', {});
    expect(exhausted.ok).toBe(false);
    expect(!exhausted.ok && exhausted.error).toContain('预算已用尽');
    // 预算用尽时 finish 放行(提交仍走门禁),最终稿回退到已审查的 revision 2
    expect(toolkit.guardFinish()).toBeNull();
    const final = toolkit.resolveFinal();
    expect(final.revertedUnchecked).toBe(true);
    expect(final.revision).toBe(2);
    expect(final.drafts[0].paragraphs[0]).toBe('开场。');
    expect(final.report.accepted).toBe(true);
  });

  it('已通过校验的稿重复 run_checks 被拒(不浪费预算)', async () => {
    const { toolkit, reviewPort } = makeToolkit();
    await toolkit.call('revise_paragraphs', { edits: [{ index: 1, text: '林夜徒步入城。' }] });
    await toolkit.call('run_checks', {});
    const again = await toolkit.call('run_checks', {});
    expect(again.ok).toBe(false);
    expect(reviewPort.review).toHaveBeenCalledOnce();
    expect(toolkit.checksRemaining()).toBe(1);
  });

  it('submit_draft 整章替换并保留 sceneId/beatId', async () => {
    const { toolkit } = makeToolkit();
    const submitted = await toolkit.call('submit_draft', {
      paragraphs: ['全新开场。', '全新收尾。'],
      chapterTitle: '徒步入城',
    });
    expect(submitted.ok).toBe(true);
    const drafts = toolkit.draft.get();
    expect(drafts?.[0]).toMatchObject({ sceneId: 'b1:scene', beatId: 'b1', chapterTitle: '徒步入城' });
    expect(drafts?.[0].paragraphs).toEqual(['全新开场。', '全新收尾。']);
  });

  it('submit_draft 每次运行最多 maxFullRewrites 次,超出拒绝且不改暂存稿', async () => {
    const { toolkit } = makeToolkit();
    const limited = new WriterToolkit({
      initialDrafts: makeDrafts(['开场。']),
      initialReview: { facts: emptyFacts, report: report() },
      reviewPort: { review: vi.fn() },
      maxChecks: 2,
      targetWordCount: 0,
      maxFullRewrites: 1,
    });
    expect(toolkit.listTools().find(tool => tool.name === 'submit_draft')?.description).toContain('最多 2 次');
    expect(
      (await limited.call('submit_draft', { paragraphs: ['第一次。'] })).ok
    ).toBe(true);
    const rejected = await limited.call('submit_draft', { paragraphs: ['第二次。'] });
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.error).toContain('revise_paragraphs');
    expect(limited.draft.get()?.[0].paragraphs).toEqual(['第一次。']);
    expect(limited.draft.revision()).toBe(2);
  });

  it('submit_draft 参数非法不消耗整章重写次数', async () => {
    const limited = new WriterToolkit({
      initialDrafts: makeDrafts(['开场。']),
      initialReview: { facts: emptyFacts, report: report() },
      reviewPort: { review: vi.fn() },
      maxChecks: 2,
      targetWordCount: 0,
      maxFullRewrites: 1,
    });
    const invalid = await limited.call('submit_draft', { paragraphs: [] });
    expect(invalid.ok).toBe(false);
    expect((await limited.call('submit_draft', { paragraphs: ['有效。'] })).ok).toBe(true);
  });

  it('审查链抛错时包成 AgentToolFatalError 冒泡(AbortError 原样冒泡)', async () => {
    const { toolkit } = makeToolkit({
      review: async () => {
        throw new Error('[review-unavailable] 判官超时');
      },
    });
    await toolkit.call('revise_paragraphs', { edits: [{ index: 1, text: '改。' }] });
    await expect(toolkit.call('run_checks', {})).rejects.toBeInstanceOf(AgentToolFatalError);

    const aborted = makeToolkit({
      review: async () => {
        throw new DOMException('Aborted', 'AbortError');
      },
    });
    await aborted.toolkit.call('revise_paragraphs', { edits: [{ index: 1, text: '改。' }] });
    await expect(aborted.toolkit.call('run_checks', {})).rejects.toThrow('Aborted');
  });
});
