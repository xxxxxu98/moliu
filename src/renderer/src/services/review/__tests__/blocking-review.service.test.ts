/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import type { ReviewIssue } from '@/types/writing-task';
import type { SixDimensionReview } from '@/types/writing-task';
import {
  BlockingReviewService,
  canProceedToPolish,
  type BlockingReviewResult,
} from '../blocking-review.service';

function makeIssue(partial: Partial<ReviewIssue> & Pick<ReviewIssue, 'category' | 'severity'>): ReviewIssue {
  return {
    id: partial.id ?? `issue-${partial.category}-${partial.severity}`,
    severity: partial.severity,
    category: partial.category,
    location: partial.location ?? '全文',
    description: partial.description ?? '测试问题',
    evidence: partial.evidence ?? '',
    fixHint: partial.fixHint ?? '修复',
    blocking: partial.blocking ?? false,
  };
}

function emptyDimension(): SixDimensionReview['setting'] {
  return { passed: true, issues: [], checkedItems: [] };
}

function makeDetail(issues: ReviewIssue[]): SixDimensionReview {
  return {
    setting: emptyDimension(),
    timeline: emptyDimension(),
    continuity: emptyDimension(),
    character: emptyDimension(),
    logic: emptyDimension(),
    aiFlavor: emptyDimension(),
    overall: {
      issues,
      summary: 'test',
      blockingCount: 0,
      highPriorityCount: 0,
    },
  };
}

function analyze(
  issues: ReviewIssue[],
  strictness: 'relaxed' | 'normal' | 'strict' = 'relaxed'
): BlockingReviewResult {
  const service = new BlockingReviewService(
    {
      project: {} as never,
      chapter: { content: '正文' } as never,
      chapterIndex: 0,
    },
    {},
    strictness
  );
  return (service as unknown as { analyzeBlockingResult: (d: SixDimensionReview) => BlockingReviewResult })
    .analyzeBlockingResult(makeDetail(issues));
}

describe('BlockingReviewService', () => {
  it('relaxed 下非 critical 的 continuity 问题不应阻断应用', () => {
    const result = analyze(
      [
        makeIssue({
          category: 'continuity',
          severity: 'medium',
          blocking: false,
          description: '衔接略弱',
        }),
      ],
      'relaxed'
    );

    expect(result.blockingCount).toBe(0);
    expect(result.decision?.shouldBlock).toBe(false);
    expect(canProceedToPolish(result)).toBe(true);
  });

  it('relaxed 下 critical continuity 应强制阻断', () => {
    const result = analyze(
      [
        makeIssue({
          category: 'continuity',
          severity: 'critical',
          blocking: true,
          description: '前后矛盾',
        }),
      ],
      'relaxed'
    );

    expect(result.blockingCount).toBe(1);
    expect(result.decision?.shouldBlock).toBe(true);
    expect(canProceedToPolish(result)).toBe(false);
  });

  it('canProceedToPolish：blockingCount=0 时即使旧 decision 标阻断也放行', () => {
    const stale: BlockingReviewResult = {
      passed: false,
      hasBlocking: true,
      blockingCount: 0,
      highPriorityCount: 0,
      totalIssues: 1,
      issues: [],
      categoryStats: {} as BlockingReviewResult['categoryStats'],
      summary: 'stale',
      detail: makeDetail([]),
      strictness: 'relaxed',
      decision: {
        shouldBlock: true,
        reason: '陈旧 decision',
        canAutoFix: false,
      },
    };

    expect(canProceedToPolish(stale)).toBe(true);
  });
});
