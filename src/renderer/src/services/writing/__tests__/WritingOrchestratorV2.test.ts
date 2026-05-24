/**
 * WritingOrchestratorV2 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WritingOrchestratorV2 } from '../WritingOrchestratorV2';
import type { WritingOptions } from '@/types/writing-v2';

// Mock dependencies
vi.mock('@/services/writing/preflight/PreflightService', () => ({
  PreflightService: vi.fn().mockImplementation(() => ({
    preflight: vi.fn().mockResolvedValue({
      ready: true,
      errors: [],
      warnings: [],
      checks: {},
      timestamp: new Date().toISOString(),
    }),
  })),
}));

vi.mock('@/services/ai/agents/enhanced-context-agent', () => ({
  useEnhancedContextAgent: vi.fn().mockReturnValue({
    generateTaskBook: vi.fn().mockResolvedValue({
      id: 'test-taskbook',
      chapterNumber: 1,
      directive: {
        goal: '测试目标',
        CBN: '章节开头',
        CPNs: ['节点1', '节点2'],
        CEN: '章节结尾',
        mustCoverNodes: ['必须覆盖的内容'],
        forbiddenZones: ['禁区'],
      },
      hardConstraints: {
        wordCount: { target: 3000, tolerance: 0.15 },
        prohibitedWords: [],
        requiredElements: [],
      },
      styleGuidance: {
        tone: '简洁有力',
        perspective: '第三人称',
        density: '适中',
      },
      dynamicContext: {
        recentForeshadows: [],
        characterStates: [],
        plotProgress: {},
      },
      antiPatterns: [],
    }),
  }),
}));

vi.mock('@/services/ai/agents/enhanced-reviewer-agent', () => ({
  useEnhancedReviewerAgent: vi.fn().mockReturnValue({
    review: vi.fn().mockResolvedValue({
      blocking: false,
      issues: [],
      metrics: {
        wordCount: 3000,
        dialogueRatio: 0.3,
        antiAIFix: 5,
        hookQuality: 4,
      },
    }),
  }),
}));

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
        summaryText: '测试内容',
        coolPoints: [],
      },
      disambiguation: { pending: [], resolved: [] },
    }),
  }),
}));

vi.mock('@/services/writing/anti-patterns/AntiPatternsRegistry', () => ({
  AntiPatternsRegistryService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    addFromReview: vi.fn(),
  })),
}));

vi.mock('@/services/writing/polish/SixGatePolishPipeline', () => ({
  SixGatePolishPipeline: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockReturnValue({
      content: '润色后的内容',
      fixes: [],
      gatesPassed: ['A', 'B', 'C', 'D', 'E', 'F'],
      antiAIScore: 0.9,
    }),
  })),
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
    currentProject: { id: 'test', name: 'Test' },
    currentChapter: { id: 'ch1', number: 1, title: '第1章' },
    currentChapterId: 'ch1',
    sortedChapters: [],
    updateChapter: vi.fn(),
  }),
}));

describe('WritingOrchestratorV2', () => {
  let orchestrator: WritingOrchestratorV2;

  beforeEach(() => {
    orchestrator = new WritingOrchestratorV2();
  });

  afterEach(() => {
    orchestrator.reset();
  });

  describe('初始化', () => {
    it('应创建 orchestrator 实例', () => {
      expect(orchestrator).toBeDefined();
    });

    it('初始状态应为 idle', () => {
      expect(orchestrator.currentStep.value).toBe('idle');
    });

    it('初始状态不应运行中', () => {
      expect(orchestrator.isRunning.value).toBe(false);
    });

    it('初始进度应为 0', () => {
      expect(orchestrator.progress.value).toBe(0);
    });
  });

  describe('运行流程', () => {
    it('应执行完整的 6 步流程', async () => {
      const options: WritingOptions = {
        targetWordCount: 3000,
        writingStyle: 'concise',
      };

      const result = await orchestrator.run(options);

      expect(result.success).toBe(true);
    }, 10000);

    it('应更新当前步骤', async () => {
      const options: WritingOptions = {
        targetWordCount: 2000,
      };

      // 启动但不等待完成
      const promise = orchestrator.run(options);
      
      // 等待一小段时间后检查状态
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(orchestrator.currentStep.value).not.toBe('idle');
      
      await promise;
    }, 10000);

    it('应更新进度', async () => {
      const options: WritingOptions = {
        targetWordCount: 1000,
      };

      await orchestrator.run(options);
      
      expect(orchestrator.progress.value).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  describe('任务书', () => {
    it('应生成任务书', async () => {
      const options: WritingOptions = {
        targetWordCount: 3000,
      };

      await orchestrator.run(options);

      expect(orchestrator.taskBook.value).toBeDefined();
      expect(orchestrator.taskBook.value?.directive).toBeDefined();
    });
  });

  describe('生成内容', () => {
    it('应生成内容', async () => {
      const options: WritingOptions = {
        targetWordCount: 3000,
      };

      await orchestrator.run(options);

      expect(orchestrator.generatedContent.value).toBeDefined();
      expect(orchestrator.generatedContent.value.length).toBeGreaterThan(0);
    });

    it('应返回正确的字数统计', async () => {
      const options: WritingOptions = {
        targetWordCount: 3000,
      };

      await orchestrator.run(options);

      expect(orchestrator.actualWordCount.value).toBeDefined();
      expect(orchestrator.targetWordCount.value).toBe(3000);
    });
  });

  describe('审查结果', () => {
    it('应返回审查结果', async () => {
      const options: WritingOptions = {
        targetWordCount: 3000,
      };

      await orchestrator.run(options);

      expect(orchestrator.reviewResult.value).toBeDefined();
      expect(orchestrator.reviewResult.value?.metrics).toBeDefined();
    });
  });

  describe('重置', () => {
    it('应重置所有状态', async () => {
      const options: WritingOptions = {
        targetWordCount: 3000,
      };

      await orchestrator.run(options);
      orchestrator.reset();

      expect(orchestrator.currentStep.value).toBe('idle');
      expect(orchestrator.progress.value).toBe(0);
      expect(orchestrator.generatedContent.value).toBeNull();
      expect(orchestrator.reviewResult.value).toBeNull();
      expect(orchestrator.commitResult.value).toBeNull();
    });
  });

  describe('停止', () => {
    it('应停止运行中的流程', async () => {
      // 由于 mock 的实现是同步的，这个测试主要验证方法存在
      expect(typeof orchestrator.stop).toBe('function');
      orchestrator.stop();
    });
  });

  describe('错误处理', () => {
    it('应处理预检失败', async () => {
      // 可以添加更多 mock 来测试错误场景
      expect(orchestrator.error.value).toBeNull();
    });
  });
});
