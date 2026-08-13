/**
 * 审查反馈构建器测试
 */

import { describe, it, expect } from 'vitest';
import { RevisionHintBuilder, type RevisionContext } from '../RevisionHintBuilder';
import type { ReviewResult, ReviewIssue } from '../../orchestrator/types';

// ============================================================
// 测试数据构建
// ============================================================

function createMockReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    overall: {
      pass: false,
      blockingCount: 0,
      warningCount: 0,
      score: 70,
      summary: '',
      ...overrides.overall,
    },
    dimensions: {
      continuity: { score: 80, issues: [], warnings: [], isBlocking: false },
      hookScore: { score: 70, issues: [], warnings: [], isBlocking: false },
      coolpointScore: { score: 75, issues: [], warnings: [], isBlocking: false },
      paceScore: { score: 80, issues: [], warnings: [], isBlocking: false },
      antiAIScore: { score: 60, issues: [], warnings: [], isBlocking: false },
      contractScore: { score: 100, issues: [], warnings: [], isBlocking: false },
    },
    blockingIssues: [],
    warnings: [],
    suggestions: [],
    ...overrides,
  };
}

function createMockReviewIssue(
  type: string,
  severity: 'critical' | 'warning' | 'info' = 'warning',
  evidence?: string
): ReviewIssue {
  return {
    type,
    severity,
    location: '全文',
    description: `测试问题：${type}`,
    suggestion: `建议修复：${type}`,
    // extractMustFix 只在带证据时产出「必须覆盖/必须衔接」，无证据的问题进不了 mustFix
    ...(evidence ? { evidence } : {}),
  };
}

// ============================================================
// 测试用例
// ============================================================

describe('RevisionHintBuilder', () => {
  const builder = new RevisionHintBuilder();

  describe('build()', () => {
    it('应该处理空审查结果', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: true, blockingCount: 0, warningCount: 0, score: 85, summary: '' },
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      expect(hints.issues).toHaveLength(0);
      expect(hints.shouldRewrite).toBe(false);
    });

    it('应该正确分类阻断问题', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 2, score: 60, summary: '' },
        blockingIssues: [
          createMockReviewIssue('continuity_anchor', 'critical'),
          createMockReviewIssue('weak_chapter_end', 'high'),
        ],
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      expect(hints.issues.length).toBeGreaterThan(0);
      expect(hints.topPriority.length).toBeGreaterThan(0);
    });

    it('应该识别必须重新起草的问题', () => {
      const rewriteTypes = [
        'missing_must_cover',
        'forbidden_zone_violated',
        'continuity_anchor',
        'weak_chapter_end',
        'flat_pacing',
      ];

      rewriteTypes.forEach(type => {
        const reviewResult = createMockReviewResult({
          overall: { pass: false, blockingCount: 1, score: 50, summary: '' },
          blockingIssues: [createMockReviewIssue(type, 'critical')],
        });

        const hints = builder.build({
          reviewResult,
          chapterNumber: 1,
          attemptNumber: 1,
        });

        expect(hints.shouldRewrite).toBe(true);
      });
    });

    it('应该识别可自动修复的问题', () => {
      const autoFixableTypes = [
        'ai_sentence_patterns',
        'high_risk_patterns',
        'banned_content',
        'long_paragraphs',
      ];

      autoFixableTypes.forEach(type => {
        const reviewResult = createMockReviewResult({
          overall: { pass: false, blockingCount: 1, score: 65, summary: '' },
          blockingIssues: [createMockReviewIssue(type, 'warning')],
        });

        const hints = builder.build({
          reviewResult,
          chapterNumber: 1,
          attemptNumber: 1,
        });

        // 这些问题不需要重新起草
        expect(hints.shouldRewrite).toBe(false);
      });
    });

    it('应该识别 AI 味问题', () => {
      const aiFlavorTypes = [
        'ai_sentence_patterns',
        'high_risk_patterns',
        'banned_content',
      ];

      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 3, score: 55, summary: '' },
        blockingIssues: aiFlavorTypes.map(type => createMockReviewIssue(type, 'warning')),
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      expect(hints.mustAvoid.length).toBeGreaterThan(0);
    });
  });

  describe('buildPromptSupplement()', () => {
    it('应该为空问题返回空字符串', () => {
      const hints = builder.build({
        reviewResult: createMockReviewResult({
          overall: { pass: true, blockingCount: 0, score: 90, summary: '' },
        }),
        chapterNumber: 1,
        attemptNumber: 1,
      });

      const supplement = builder.buildPromptSupplement(hints);
      expect(supplement).toBe('');
    });

    it('应该生成包含所有部分的结构化提示', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 2, score: 60, summary: '' },
        blockingIssues: [
          createMockReviewIssue('continuity_anchor', 'critical'),
          createMockReviewIssue('weak_chapter_end', 'high'),
        ],
        warnings: [
          createMockReviewIssue('low_coolpoint_density', 'warning'),
        ],
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      const supplement = builder.buildPromptSupplement(hints);

      expect(supplement).toContain('⚠️ 上次审查未通过');
      expect(supplement).toContain('🔴 必须修复');
      expect(supplement).toContain('📋 发现的问题');
      expect(supplement).toContain('💡 修改建议');
    });

    it('应该包含重写说明', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 1, score: 50, summary: '' },
        blockingIssues: [createMockReviewIssue('missing_must_cover', 'critical')],
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      const supplement = builder.buildPromptSupplement(hints);

      expect(supplement).toContain('📝 重写说明');
      expect(supplement).toContain('需要重新起草');
    });
  });

  describe('问题优先级排序', () => {
    it('阻断问题应该排在最前面', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 1, score: 65, summary: '' },
        blockingIssues: [createMockReviewIssue('weak_chapter_end', 'critical')],
        warnings: [createMockReviewIssue('low_dialogue_ratio', 'warning')],
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      expect(hints.topPriority[0]).toContain('[阻断]');
    });

    it('应该限制 topPriority 的数量', () => {
      const manyIssues: ReviewIssue[] = [];
      for (let i = 0; i < 10; i++) {
        manyIssues.push(createMockReviewIssue(`issue_${i}`, 'critical'));
      }

      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 10, score: 50, summary: '' },
        blockingIssues: manyIssues,
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 1,
      });

      expect(hints.topPriority.length).toBeLessThanOrEqual(3);
    });
  });

  describe('重试次数影响', () => {
    it('第 2 次重试后不应该再建议重新起草', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 2, score: 60, summary: '' },
        blockingIssues: [
          createMockReviewIssue('continuity_anchor', 'critical'),
          createMockReviewIssue('weak_chapter_end', 'high'),
        ],
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 2,
      });

      expect(hints.shouldRewrite).toBe(false);
    });

    it('重试次数超过 2 次时不应该建议重新起草', () => {
      const reviewResult = createMockReviewResult({
        overall: { pass: false, blockingCount: 1, score: 55, summary: '' },
        blockingIssues: [createMockReviewIssue('missing_must_cover', 'critical')],
      });

      const hints = builder.build({
        reviewResult,
        chapterNumber: 1,
        attemptNumber: 3,
      });

      expect(hints.shouldRewrite).toBe(false);
    });
  });
});

// ============================================================
// 集成测试
// ============================================================

describe('RevisionHintBuilder 集成测试', () => {
  const builder = new RevisionHintBuilder();

  it('应该完整处理审查失败的场景', () => {
    // 模拟一个典型的审查失败场景
    const reviewResult: ReviewResult = {
      overall: {
        pass: false,
        blockingCount: 3,
        warningCount: 2,
        score: 58,
        summary: '3 个阻断问题，2 个警告',
      },
      dimensions: {
        continuity: { 
          score: 65, 
          issues: [createMockReviewIssue('continuity_anchor', 'critical')], 
          warnings: [], 
          isBlocking: true 
        },
        hookScore: { 
          score: 55, 
          issues: [createMockReviewIssue('weak_chapter_end', 'high')], 
          warnings: [], 
          isBlocking: true 
        },
        coolpointScore: { 
          score: 70, 
          issues: [], 
          warnings: [createMockReviewIssue('low_coolpoint_density', 'warning')], 
          isBlocking: false 
        },
        paceScore: { 
          score: 60, 
          issues: [], 
          warnings: [], 
          isBlocking: false 
        },
        antiAIScore: { 
          score: 50, 
          issues: [createMockReviewIssue('ai_sentence_patterns', 'warning')], 
          warnings: [], 
          isBlocking: false 
        },
        contractScore: { 
          score: 80, 
          issues: [], 
          warnings: [], 
          isBlocking: false 
        },
      },
      blockingIssues: [
        createMockReviewIssue('continuity_anchor', 'critical', '上章结尾停在牢门被推开'),
        createMockReviewIssue('weak_chapter_end', 'high'),
        createMockReviewIssue('missing_must_cover', 'critical', '当堂核对账册'),
      ],
      warnings: [
        createMockReviewIssue('low_coolpoint_density', 'warning'),
        createMockReviewIssue('low_dialogue_ratio', 'info'),
      ],
      suggestions: [
        { dimension: 'continuity', type: 'fix', description: '确保衔接前章', priority: 'high' },
        { dimension: 'hook', type: 'fix', description: '增加章尾悬念', priority: 'high' },
      ],
    };

    const hints = builder.build({
      reviewResult,
      chapterNumber: 5,
      attemptNumber: 1,
    });

    // 验证结果
    expect(hints.shouldRewrite).toBe(true);
    expect(hints.issues.length).toBeGreaterThan(0);
    expect(hints.mustFix.length).toBeGreaterThan(0);
    expect(hints.topPriority.length).toBeGreaterThan(0);
    expect(hints.focusAreas.length).toBeGreaterThan(0);

    // 生成提示词
    const supplement = builder.buildPromptSupplement(hints);
    expect(supplement.length).toBeGreaterThan(100);
    // buildPromptSupplement 只接收 hints，产出里不含章号（build 的 chapterNumber 目前未被使用）
    expect(supplement).toContain('上次审查未通过');
    expect(supplement).toContain('必须覆盖: 当堂核对账册');
    expect(supplement).toContain('必须衔接: 上章结尾停在牢门被推开');
  });

  it('应该正确处理纯 AI 味问题', () => {
    const reviewResult: ReviewResult = {
      overall: {
        pass: false,
        blockingCount: 2,
        warningCount: 1,
        score: 68,
        summary: 'AI 味问题',
      },
      dimensions: {
        continuity: { score: 90, issues: [], warnings: [], isBlocking: false },
        hookScore: { score: 85, issues: [], warnings: [], isBlocking: false },
        coolpointScore: { score: 80, issues: [], warnings: [], isBlocking: false },
        paceScore: { score: 75, issues: [], warnings: [], isBlocking: false },
        antiAIScore: { 
          score: 45, 
          issues: [
            createMockReviewIssue('ai_sentence_patterns', 'warning'),
            createMockReviewIssue('high_risk_patterns', 'warning'),
          ], 
          warnings: [], 
          isBlocking: true 
        },
        contractScore: { score: 100, issues: [], warnings: [], isBlocking: false },
      },
      blockingIssues: [
        createMockReviewIssue('ai_sentence_patterns', 'warning'),
        createMockReviewIssue('high_risk_patterns', 'warning'),
      ],
      warnings: [
        createMockReviewIssue('banned_content', 'info'),
      ],
      suggestions: [
        { dimension: 'antiAI', type: 'fix', description: '去除 AI 味', priority: 'medium' },
      ],
    };

    const hints = builder.build({
      reviewResult,
      chapterNumber: 3,
      attemptNumber: 1,
    });

    // AI 味问题不应该触发重新起草
    expect(hints.shouldRewrite).toBe(false);
    // 但应该标记为必须避免
    expect(hints.mustAvoid.length).toBeGreaterThan(0);
  });
});
