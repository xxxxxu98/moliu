/**
 * ChapterCommitManagerV2 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChapterCommitManagerV2, type CommitInput } from '../ChapterCommitManagerV2';
import type { ReviewerOutput, ExtractionResult } from '@/types/writing-v2';

// Mock dependencies
vi.mock('@/services/ai/agents/enhanced-data-agent', () => ({
  useEnhancedDataAgent: vi.fn().mockReturnValue({
    extract: vi.fn().mockResolvedValue({
      success: true,
      extraction: {
        success: true,
        events: [],
        stateChanges: [],
        entitiesAppeared: [],
        scenes: [],
        summaryText: '测试内容摘要',
        coolPoints: [],
      },
      disambiguation: { pending: [], resolved: [] },
      error: null,
    }),
  }),
}));

vi.mock('@/services/writing/commit/ProjectionWriters', () => ({
  useProjectionOrchestrator: vi.fn().mockReturnValue({
    runAll: vi.fn().mockResolvedValue({
      state: 'done',
      index: 'done',
      summary: 'done',
      memory: 'done',
      vector: 'done',
    }),
  }),
}));

vi.mock('@/stores/project.store', () => ({
  useProjectStore: vi.fn().mockReturnValue({
    sortedChapters: [
      { id: 'ch1', orderIndex: 0 },
      { id: 'ch2', orderIndex: 1 },
    ],
    updateChapter: vi.fn(),
  }),
}));

describe('ChapterCommitManagerV2', () => {
  let manager: ChapterCommitManagerV2;

  const mockReviewResult: ReviewerOutput = {
    blocking: false,
    issues: [],
    metrics: {
      wordCount: 3000,
      dialogueRatio: 0.3,
      antiAIFix: 5,
      hookQuality: 4,
    },
    overallScore: 85,
  };

  const mockContract = {
    goal: '主角获得一件宝物',
    CBN: '主角进入遗迹',
    CPNs: ['发现机关', '触发陷阱'],
    CEN: '成功获得宝物',
    mustCover: ['宝物外观', '使用方法'],
    forbiddenZones: ['提前剧透宝物能力'],
  };

  beforeEach(() => {
    manager = new ChapterCommitManagerV2();
  });

  describe('基础功能', () => {
    it('应创建 manager 实例', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('提交流程', () => {
    it('应成功提交章节', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '这是测试章节内容。',
        reviewResult: mockReviewResult,
        contract: mockContract,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit).toBeDefined();
      expect(result.commit?.status).toBe('accepted');
    });

    it('应包含提取结果', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.extractionResult).toBeDefined();
    });

    it('应包含完成度评估', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
        contract: mockContract,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.fulfillmentResult).toBeDefined();
    });

    it('应包含歧义处理结果', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.disambiguationResult).toBeDefined();
    });

    it('应包含投影状态', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.projectionStatus).toBeDefined();
    });

    it('应包含原因列表', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
        contract: mockContract,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.reasons).toBeDefined();
      expect(Array.isArray(result.commit?.reasons)).toBe(true);
    });
  });

  describe('状态判定', () => {
    it('有 blocking 问题应返回 rejected', async () => {
      const blockingReview: ReviewerOutput = {
        ...mockReviewResult,
        blocking: true,
      };

      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: blockingReview,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.status).toBe('rejected');
    });

    it('无 contract 应接受提交', async () => {
      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.status).toBe('accepted');
    });
  });

  describe('错误处理', () => {
    it('应处理提取失败', async () => {
      // 重置 mock 使其返回失败
      vi.doMock('@/services/ai/agents/enhanced-data-agent', () => ({
        useEnhancedDataAgent: vi.fn().mockReturnValue({
          extract: vi.fn().mockResolvedValue({
            success: false,
            error: '提取失败',
          }),
        }),
      }));

      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应处理异常', async () => {
      vi.doMock('@/services/ai/agents/enhanced-data-agent', () => ({
        useEnhancedDataAgent: vi.fn().mockReturnValue({
          extract: vi.fn().mockRejectedValue(new Error('系统错误')),
        }),
      }));

      const input: CommitInput = {
        chapterNumber: 1,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('章节编号', () => {
    it('应正确处理章节编号', async () => {
      const input: CommitInput = {
        chapterNumber: 5,
        content: '测试内容',
        reviewResult: mockReviewResult,
      };

      const result = await manager.commit(input);

      expect(result.success).toBe(true);
      expect(result.commit?.chapter).toBe(5);
    });
  });
});
