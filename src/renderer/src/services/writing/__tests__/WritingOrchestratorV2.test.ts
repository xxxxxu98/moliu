/**
 * WritingOrchestratorV2 测试（v3.1 委托架构）
 *
 * V2 的 run() 现委托给 ChapterWritingPipeline，本测试聚焦：
 * 1. V2 正确调用管道 execute()
 * 2. 管道输出正确映射到 V2 的响应式状态
 * 3. 门禁结果正确翻译为旧 ReviewerOutput 格式
 * 4. 兜底放行（forceAccepted）场景
 * 5. 失败场景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWritingOrchestratorV2 } from '../WritingOrchestratorV2';

// ====== Mock ChapterWritingPipeline（V2 委托对象） ======
// V2 用 `new ChapterWritingPipeline(...)` 实例化，mock 必须支持 new 调用
const mockExecute = vi.fn();
function MockPipeline(this: any) {
  this.execute = mockExecute;
  this.getOrchestrator = () => ({});
}
vi.mock('../ChapterWritingPipeline', () => ({
  ChapterWritingPipeline: MockPipeline,
  useChapterWritingPipeline: () => ({ execute: mockExecute, getOrchestrator: () => ({}) }),
}));

// ====== Mock stores ======
vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => ({
    currentProject: {
      id: 'p1',
      name: '测试项目',
      genre: [],
      description: '',
      characters: [],
    },
    currentChapter: {
      id: 'ch1',
      title: '第1章',
      orderIndex: 0,
      content: '',
      outline: '',
    },
    sortedChapters: [
      { id: 'ch1', title: '第1章', orderIndex: 0, content: '' },
    ],
    updateChapter: vi.fn(),
  }),
}));

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => ({ streamOutput: false }),
}));

vi.mock('@/composables/useActiveAIProvider', () => ({
  useActiveAIProvider: () => ({
    requireAIService: vi.fn(),
    currentModel: { value: 'gpt-4o' },
  }),
}));

// ====== Mock V2 内部依赖（管道未覆盖的） ======
vi.mock('@/services/writing/preflight/PreflightService', () => ({
  usePreflightService: vi.fn().mockReturnValue({
    preflight: vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] }),
    getCurrentChapterContext: vi.fn().mockResolvedValue({
      chapterNumber: 1,
      previousChapterEnding: '',
      recentChaptersFullText: '',
    }),
  }),
  PreflightService: vi.fn(),
}));

vi.mock('@/services/ai/agents/enhanced-context-agent', () => ({
  useEnhancedContextAgent: vi.fn().mockReturnValue({
    generateTaskBook: vi.fn().mockResolvedValue({ success: true }),
  }),
  EnhancedContextAgent: vi.fn(),
}));

vi.mock('@/services/ai/agents/enhanced-reviewer-agent', () => ({
  useEnhancedReviewerAgent: vi.fn().mockReturnValue({ review: vi.fn() }),
  EnhancedReviewerAgent: vi.fn(),
}));

vi.mock('@/services/ai/agents/enhanced-data-agent', () => ({
  useEnhancedDataAgent: vi.fn().mockReturnValue({ extract: vi.fn() }),
  EnhancedDataAgent: vi.fn(),
}));

vi.mock('@/services/writing/anti-patterns/AntiPatternsRegistry', () => ({
  useAntiPatternsRegistry: vi.fn().mockReturnValue({
    initialize: vi.fn(),
    addFromReview: vi.fn(),
    getPatternStrings: vi.fn().mockReturnValue([]),
  }),
  AntiPatternsRegistryService: vi.fn(),
}));

vi.mock('@/services/writing/polish/SixGatePolishPipeline', () => ({
  useSixGatePolishPipeline: vi.fn().mockReturnValue({ execute: vi.fn() }),
  SixGatePolishPipeline: vi.fn(),
}));

vi.mock('@/services/writing/commit/ProjectionWriters', () => ({
  useProjectionOrchestrator: vi.fn().mockReturnValue({ runAll: vi.fn() }),
  ProjectionOrchestrator: vi.fn(),
}));

vi.mock('@/services/writing/commit/ChapterCommitManagerV2', () => ({
  useChapterCommitManagerV2: vi.fn().mockReturnValue({
    commit: vi.fn().mockResolvedValue({ success: true, commit: {} }),
  }),
  ChapterCommitManagerV2: vi.fn(),
}));

vi.mock('@/services/writing/backup/GitBackupManager', () => ({
  GitBackupManager: vi.fn().mockImplementation(() => ({ backup: vi.fn() })),
}));

describe('WritingOrchestratorV2 (v3.1 委托架构)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('应创建 orchestrator 实例', () => {
      const orch = useWritingOrchestratorV2();
      expect(orch).toBeDefined();
      expect(typeof orch.run).toBe('function');
    });

    it('初始状态应为 idle', () => {
      const orch = useWritingOrchestratorV2();
      expect(orch.currentStep.value).toBe('idle');
    });

    it('初始状态不应运行中', () => {
      const orch = useWritingOrchestratorV2();
      expect(orch.isRunning.value).toBe(false);
    });
  });

  describe('run() 委托管道', () => {
    it('成功路径：应调用管道 execute 并映射状态', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        prose: '生成的正文',
        title: '提取的标题',
        taskBook: { CBN: '开头', CPNs: [], CEN: '结尾', mustCover: [], forbiddenZones: [] },
        gateResult: {
          passed: true,
          allIssues: [],
          blockingCount: 0,
          highCount: 0,
        },
        attempts: 1,
        forceAccepted: false,
      });

      const orch = useWritingOrchestratorV2();
      const result = await orch.run({ targetWordCount: 3000, writingStyle: 'concise' });

      expect(result).toBe(true);
      expect(mockExecute).toHaveBeenCalledTimes(1);
      // 状态映射
      expect(orch.generatedContent.value).toBe('生成的正文');
      expect(orch.taskBook.value).toBeDefined();
      expect(orch.actualWordCount.value).toBeGreaterThan(0);
      // 门禁通过 → reviewResult.blocking 为 false
      expect(orch.reviewResult.value?.blocking).toBe(false);
    }, 10000);

    it('门禁兜底放行：forceAccepted 时 reviewResult.blocking 应为 true', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        prose: '兜底正文',
        title: null,
        taskBook: null,
        gateResult: {
          passed: false,
          allIssues: [
            { severity: 'critical', location: 'L1', description: '矛盾', evidence: '', suggestion: '' },
          ],
          blockingCount: 1,
          highCount: 0,
        },
        attempts: 3,
        forceAccepted: true,
      });

      const orch = useWritingOrchestratorV2();
      const result = await orch.run({ targetWordCount: 2000 });

      expect(result).toBe(true); // 兜底放行仍算成功
      expect(orch.reviewResult.value?.blocking).toBe(true);
      expect(orch.generatedContent.value).toBe('兜底正文');
    }, 10000);

    it('失败路径：管道返回 success=false 时 run 应返回 false', async () => {
      mockExecute.mockResolvedValueOnce({
        success: false,
        prose: '',
        title: null,
        taskBook: null,
        gateResult: null,
        attempts: 0,
        forceAccepted: false,
        error: '起草失败',
      });

      const orch = useWritingOrchestratorV2();
      const result = await orch.run({ targetWordCount: 1000 });

      expect(result).toBe(false);
      expect(orch.error.value).toBe('起草失败');
    }, 10000);
  });

  describe('reset()', () => {
    it('应重置所有状态', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        prose: '内容',
        title: null,
        taskBook: null,
        gateResult: { passed: true, allIssues: [], blockingCount: 0, highCount: 0 },
        attempts: 1,
        forceAccepted: false,
      });

      const orch = useWritingOrchestratorV2();
      await orch.run({ targetWordCount: 3000 });
      orch.reset();

      expect(orch.currentStep.value).toBe('idle');
      expect(orch.progress.value).toBe(0);
      expect(orch.generatedContent.value).toBe('');
      expect(orch.error.value).toBeNull();
    });
  });

  describe('stop()', () => {
    it('应提供 stop 方法', () => {
      const orch = useWritingOrchestratorV2();
      expect(typeof orch.stop).toBe('function');
      expect(() => orch.stop()).not.toThrow();
    });
  });
});
