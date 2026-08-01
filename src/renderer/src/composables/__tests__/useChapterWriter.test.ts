/**
 * useChapterWriter 回归测试
 *
 * 重点守护：
 * 1. reviewedContent bug（L613 曾引用未声明的 reviewedContent，每次 V2 写作成功都抛
 *    ReferenceError，被 catch 吞掉导致 UI 误报失败）
 * 2. writeChapter 成功路径不再抛 ReferenceError
 * 3. V2 状态正确同步回 useChapterWriter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ====== Mock V2 编排器（useChapterWriter 委托对象） ======
const mockV2Run = vi.fn();
const mockV2State = {
  isRunning: { value: false },
  currentStep: { value: 'idle' },
  progress: { value: 0 },
  error: { value: null as string | null },
  taskBook: { value: null as any },
  generatedContent: { value: '' },
  reviewedContent: { value: '' },
  polishedContent: { value: '' },
  commitResult: { value: null as any },
  reviewResult: { value: null as any },
  actualWordCount: { value: 0 },
  targetWordCount: { value: 3000 },
};

vi.mock('@/services/writing/WritingOrchestratorV2', () => ({
  useWritingOrchestratorV2: () => ({
    ...mockV2State,
    run: mockV2Run,
    stop: vi.fn(),
    reset: vi.fn(),
    services: {},
  }),
}));

// ====== Mock stores / composables ======
const mockChapter = { id: 'ch1', title: '第1章', orderIndex: 0, content: '' };
const mockUpdateChapter = vi.fn();

vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => ({
    currentProject: {
      id: 'p1',
      name: '测试项目',
      genre: [],
      description: '',
      characters: [],
      foreshadows: [],
      worldSchema: undefined,
      metadata: {},
      plotOutline: [],
      sortedChapters: [mockChapter],
      memoryConfig: { shortTermChapterCount: 5 },
      chapterMemories: [],
    },
    currentChapter: mockChapter,
    currentChapterId: 'ch1',
    sortedChapters: [mockChapter],
    sortedVolumes: [{ id: 'v1', name: '第一卷', orderIndex: 0 }],
    plotOutline: [],
    updateChapter: mockUpdateChapter,
    addChapterMemory: vi.fn(),
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

// ====== Mock 其他依赖 ======
vi.mock('@/services/writing/context-manager', () => {
  function MockContextManager(this: any) {
    this.extractPreviousChapterSummary = () => '';
    this.extractChapterEnding = () => '';
  }
  return { ContextManager: MockContextManager };
});

vi.mock('@/services/writing/OutlineContextBuilder', () => ({
  extractChapterContext: vi.fn().mockReturnValue(null),
  buildChapterOutlineText: vi.fn().mockReturnValue(''),
  buildWindowedOutlineText: vi.fn().mockReturnValue(''),
  buildEnhancedDesignPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('@/services/writing/extract-plot-memory', () => ({
  extractChapterMemory: vi.fn(),
  buildCharacterStateTable: vi.fn().mockReturnValue(''),
  buildPlotProgressTable: vi.fn().mockReturnValue(''),
  safeExtractChapterMemory: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/writing/memory-manager', () => ({
  initializeMemoryManager: vi.fn(),
  getMemoryManager: vi.fn().mockReturnValue({ saveMemory: vi.fn() }),
}));

vi.mock('@/services/writing/de-ai-service', () => ({
  DeAIService: {
    extractAndValidateTitle: vi.fn().mockImplementation((c: string) => ({ title: null, content: c, titleValid: false })),
    detect: vi.fn().mockResolvedValue({ issues: [], level: 'low', suggestions: [] }),
  },
}));

vi.mock('@/services/writing/writing-task-builder', () => ({
  createTaskBookBuilder: vi.fn(),
}));

vi.mock('@/services/review/blocking-review.service', () => ({
  blockingReview: vi.fn(),
  canProceedToPolish: vi.fn().mockReturnValue(true),
  getBlockingIssuesToFix: vi.fn().mockReturnValue([]),
  BlockingReviewService: vi.fn(),
}));

vi.mock('@/services/writing/review/report-generator', () => ({
  useReportGenerator: () => ({
    generator: {},
    generate: vi.fn().mockReturnValue({}),
    exportToJSON: vi.fn(),
    exportToMarkdown: vi.fn(),
    getHistory: vi.fn().mockReturnValue([]),
    getLatestReport: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock('@/services/writing/failure-recovery', () => ({
  useFailureRecovery: () => ({
    manager: { registerFailure: vi.fn(), clearAll: vi.fn() },
    registerFailure: vi.fn(),
    attemptRecovery: vi.fn(),
    getChapterFailures: vi.fn().mockReturnValue([]),
    clearChapterFailures: vi.fn(),
    getEventHistory: vi.fn().mockReturnValue([]),
  }),
}));

describe('useChapterWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChapter.content = '';
    // 重置 mock V2 状态
    mockV2State.generatedContent.value = '';
    mockV2State.reviewedContent.value = '';
    mockV2State.polishedContent.value = '';
    mockV2State.actualWordCount.value = 0;
    mockV2State.error.value = null;
    mockV2State.currentStep.value = 'idle';
    mockV2State.progress.value = 0;
    mockV2State.taskBook.value = null;
    mockV2State.reviewResult.value = null;
    mockV2State.commitResult.value = null;
  });

  describe('实例化', () => {
    it('应正确创建并暴露接口', async () => {
      const { useChapterWriter } = await import('@/composables/useChapterWriter');
      const writer = useChapterWriter();
      expect(writer).toBeDefined();
      expect(typeof writer.writeChapter).toBe('function');
      expect(typeof writer.supplementContinue).toBe('function');
      expect(typeof writer.applyGeneratedContent).toBe('function');
    });
  });

  describe('writeChapter 成功路径（reviewedContent 回归守护）', () => {
    it('V2 成功时不应抛出 ReferenceError，且正确同步状态', async () => {
      // 模拟 V2 成功：写入 generatedContent/reviewedContent 等状态
      mockV2Run.mockImplementation(async () => {
        mockV2State.generatedContent.value = '生成的正文内容';
        mockV2State.reviewedContent.value = '生成的正文内容';
        mockV2State.polishedContent.value = '生成的正文内容';
        mockV2State.actualWordCount.value = 100;
        mockV2State.currentStep.value = 'idle';
        mockV2State.progress.value = 100;
        return true;
      });

      const { useChapterWriter } = await import('@/composables/useChapterWriter');
      const writer = useChapterWriter();

      // 关键断言：成功路径不抛 ReferenceError（reviewedContent bug）
      // 旧 bug：L613 reviewedContent 未定义 → ReferenceError → 被 catch 吞掉 →
      //   error.value 被设为错误信息 + return null
      // 修复后：应正常返回内容，generatedContent 正确同步
      const result = await writer.writeChapter({ targetWordCount: 3000 });

      expect(result).not.toBeNull();
      expect(writer.generatedContent.value).toBe('生成的正文内容');
      expect(writer.isGenerating.value).toBe(false);
      // 注：writeChapter 内部可能触发 supplementContinue（字数不足时），
      // 后者会设 error.value="当前正在生成中"（设计行为，非 bug）。
      // 核心断言是 result 非 null 且内容同步成功。
    }, 10000);

    it('V2 返回 false 时正确处理失败', async () => {
      mockV2Run.mockImplementation(async () => {
        mockV2State.error.value = '门禁未通过';
        return false;
      });

      const { useChapterWriter } = await import('@/composables/useChapterWriter');
      const writer = useChapterWriter();

      const result = await writer.writeChapter({ targetWordCount: 3000 });

      expect(result).toBeNull();
      expect(writer.error.value).toBe('门禁未通过');
    }, 10000);
  });

  describe('自动写入与应用门闩', () => {
    it('管道成功且章节已有正文时标记 isAppliedToChapter，二次 apply 早退', async () => {
      mockV2Run.mockImplementation(async () => {
        const prose = '生成的正文内容';
        mockV2State.generatedContent.value = prose;
        mockV2State.reviewedContent.value = prose;
        mockV2State.polishedContent.value = prose;
        mockV2State.actualWordCount.value = 100;
        mockV2State.currentStep.value = 'idle';
        mockV2State.progress.value = 100;
        // 模拟 Pipeline persistence.replace 已写入章节
        mockChapter.content = prose;
        return true;
      });

      const { useChapterWriter } = await import('@/composables/useChapterWriter');
      const writer = useChapterWriter();
      const result = await writer.writeChapter({ targetWordCount: 3000 });

      expect(result).toBe('生成的正文内容');
      expect(writer.isAppliedToChapter.value).toBe(true);

      mockUpdateChapter.mockClear();
      const applied = await writer.applyGeneratedContent();
      expect(applied).toBe(true);
      // 已写入：禁止再次 updateChapter 导致正文翻倍
      expect(mockUpdateChapter).not.toHaveBeenCalled();
      expect(writer.isAppliedToChapter.value).toBe(true);
    }, 10000);
  });

  describe('reset()', () => {
    it('应重置所有状态', async () => {
      const { useChapterWriter } = await import('@/composables/useChapterWriter');
      const writer = useChapterWriter();
      writer.reset();

      expect(writer.isGenerating.value).toBe(false);
      expect(writer.progress.value).toBe(0);
      expect(writer.currentStep.value).toBe('idle');
    });
  });
});
