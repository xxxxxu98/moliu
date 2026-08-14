/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock stores
const mockProjectStore = {
  sortedChapters: [],
  sortedVolumes: [],
  currentProject: null,
  plotOutline: [],
  memoryConfig: { shortTermChapterCount: 5 },
  updateChapter: vi.fn(),
  addChapterMemory: vi.fn(),
  createChapter: vi.fn(),
  addVolume: vi.fn(),
};

const mockSettingsStore = {
  streamOutput: false,
};

const mockRequireAIService = vi.fn();

// Mock modules
vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => mockProjectStore,
}));

vi.mock('@/stores/settings.store', () => ({
  useSettingsStore: () => mockSettingsStore,
}));

vi.mock('@/composables/useActiveAIProvider', () => ({
  useActiveAIProvider: () => ({
    requireAIService: mockRequireAIService,
    currentModel: { value: 'gpt-4o' },
  }),
}));

vi.mock('@/services/writing/extract-plot-memory', () => ({
  extractChapterMemory: vi.fn(),
  buildCharacterStateTable: vi.fn(),
  buildPlotProgressTable: vi.fn(),
  safeExtractChapterMemory: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/writing/memory-manager', () => ({
  initializeMemoryManager: vi.fn(),
  getMemoryManager: vi.fn().mockReturnValue({
    saveMemory: vi.fn(),
  }),
}));

vi.mock('@/services/writing/context-manager', () => {
  class MockContextManager {
    extractPreviousChapterSummary = vi.fn().mockReturnValue('');
    extractChapterEnding = vi.fn().mockReturnValue('');
  }
  return {
    ContextManager: MockContextManager,
  };
});

vi.mock('@/services/writing/de-ai-service', () => ({
  DeAIService: {
    fix: vi.fn().mockResolvedValue({ content: '', fixedCount: 0 }),
    extractAndValidateTitle: vi.fn().mockImplementation((content: string) => ({
      content,
      title: null,
    })),
  },
}));

vi.mock('@/services/writing/writing-task-builder', () => ({
  createTaskBookBuilder: vi.fn().mockReturnValue({
    buildTaskBook: vi.fn().mockResolvedValue({
      CBN: '',
      CPNs: [],
      CEN: '',
      mustCover: [],
      forbiddenZones: [],
      styleGuidance: { pacingStrategy: '' },
      endingSensation: '',
      openQuestion: '',
    }),
  }),
}));

vi.mock('@/services/review/review-service', () => ({
  reviewChapter: vi.fn().mockResolvedValue({
    overall: { blockingCount: 0, summary: '' },
  }),
}));

vi.mock('@/services/writing/chapter-commit', () => ({
  createChapterCommit: vi.fn().mockResolvedValue({ status: 'accepted' }),
  extractChapterFacts: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/writing/foreshadow-tracker', () => ({
  createForeshadowTracker: vi.fn(),
  analyzeForeshadows: vi.fn().mockReturnValue([]),
}));

// v3.1：useBatchWriter 现在通过 ChapterWritingPipeline 执行单章写作
// mock 管道，默认返回成功结果；具体用例可在 beforeEach 里覆盖
const mockPipelineExecute = vi.fn().mockResolvedValue({
  success: true,
  prose: '生成的正文内容',
  title: null,
  taskBook: null,
  gateResult: { passed: true, allIssues: [], blockingCount: 0, highCount: 0 },
  attempts: 1,
  forceAccepted: false,
  supplementRounds: 0,
});

vi.mock('@/services/writing/ChapterWritingPipeline', () => ({
  useChapterWritingPipeline: () => ({
    execute: mockPipelineExecute,
    getOrchestrator: () => ({}),
  }),
}));

describe('useBatchWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('service instantiation', () => {
    it('should be importable', async () => {
      const module = await import('@/composables/useBatchWriter');
      expect(module.useBatchWriter).toBeDefined();
      expect(typeof module.useBatchWriter).toBe('function');
    });

    it('should return correct interface', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const result = useBatchWriter();

      // Check return types
      expect(result.isWriting).toBeDefined();
      expect(result.isPaused).toBeDefined();
      expect(result.currentChapterIndex).toBeDefined();
      expect(result.currentChapterTitle).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.totalChapters).toBeDefined();
      expect(result.writtenChapters).toBeDefined();
      expect(result.remainingChapters).toBeDefined();
      expect(result.writtenWordCount).toBeDefined();
      expect(result.progress).toBeDefined();
      expect(result.target).toBeDefined();
      expect(result.config).toBeDefined();
      expect(result.startBatchWriting).toBeDefined();
      expect(result.pauseWriting).toBeDefined();
      expect(result.resumeWriting).toBeDefined();
      expect(result.stopWriting).toBeDefined();
      expect(result.getNextChapterIndex).toBeDefined();
      expect(result.getTotalChapters).toBeDefined();
    });
  });

  describe('initial state', () => {
    it('should initialize with default values', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.isWriting.value).toBe(false);
      expect(writer.isPaused.value).toBe(false);
      expect(writer.currentChapterIndex.value).toBe(-1);
      expect(writer.currentChapterTitle.value).toBe('');
      expect(writer.error.value).toBe(null);
    });

    it('should have default config values', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.config.value.wordsPerChapter).toBe(3000);
      expect(writer.config.value.writingStyle).toBe('concise');
      expect(writer.config.value.temperature).toBe(0.5);
      expect(writer.config.value.deAIEnabled).toBe(true);
      expect(writer.config.value.useTaskBook).toBe(true);
      expect(writer.config.value.useReview).toBe(true);
      expect(writer.config.value.useCommit).toBe(true);
      expect(writer.config.value.requireBlockingPass).toBe(true);
      expect(writer.config.value.initialStrictness).toBe('normal');
      expect(writer.config.value.maxRetries).toBe(5);
    });

    it('should expose retry state refs', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.maxRetries.value).toBe(5);
      expect(writer.currentRetryCount.value).toBe(0);
    });
  });

  describe('getNextChapterIndex', () => {
    it('should return -1 when no chapters exist', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      const index = writer.getNextChapterIndex();
      expect(index).toBe(-1);
    });

    it('should return first empty chapter index', async () => {
      mockProjectStore.sortedChapters = [
        { id: '1', content: 'content', orderIndex: 0 },
        { id: '2', content: '', orderIndex: 1 },
        { id: '3', content: 'content', orderIndex: 2 },
      ];

      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      const index = writer.getNextChapterIndex();
      expect(index).toBe(1);
    });

    it('should return -1 when all chapters have content', async () => {
      mockProjectStore.sortedChapters = [
        { id: '1', content: 'content', orderIndex: 0 },
        { id: '2', content: 'content', orderIndex: 1 },
      ];

      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      const index = writer.getNextChapterIndex();
      expect(index).toBe(-1);
    });
  });

  describe('computed properties', () => {
    it('should calculate totalChapters correctly', async () => {
      mockProjectStore.sortedChapters = [
        { id: '1', content: '', orderIndex: 0 },
        { id: '2', content: '', orderIndex: 1 },
        { id: '3', content: '', orderIndex: 2 },
      ];

      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.totalChapters.value).toBe(3);
    });

    it('should calculate writtenChapters correctly', async () => {
      mockProjectStore.sortedChapters = [
        { id: '1', content: 'content', orderIndex: 0, wordCount: 100 },
        { id: '2', content: '', orderIndex: 1, wordCount: 0 },
        { id: '3', content: 'content', orderIndex: 2, wordCount: 200 },
      ];

      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.writtenChapters.value).toBe(2);
    });

    it('should calculate remainingChapters correctly', async () => {
      mockProjectStore.sortedChapters = [
        { id: '1', content: 'content', orderIndex: 0 },
        { id: '2', content: '', orderIndex: 1 },
        { id: '3', content: '', orderIndex: 2 },
      ];

      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.remainingChapters.value).toBe(2);
    });

    it('should calculate writtenWordCount correctly', async () => {
      mockProjectStore.sortedChapters = [
        { id: '1', content: 'content', orderIndex: 0, wordCount: 100 },
        { id: '2', content: 'content', orderIndex: 1, wordCount: 200 },
        { id: '3', content: '', orderIndex: 2, wordCount: 0 },
      ];

      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.writtenWordCount.value).toBe(300);
    });
  });

  describe('pause/resume/stop', () => {
    it('should pause writing', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      writer.pauseWriting();

      expect(writer.isPaused.value).toBe(true);
    });

    it('should resume writing', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      writer.pauseWriting();
      writer.resumeWriting();

      expect(writer.isPaused.value).toBe(false);
    });

    it('should stop writing', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      writer.stopWriting();

      expect(writer.isWriting.value).toBe(false);
      expect(writer.isPaused.value).toBe(false);
    });
  });
});

describe('BatchConfig 类型与失败重试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 公共项目/章节 mock 设置
  function setupProjectWithEmptyChapters(emptyCount: number) {
    mockProjectStore.currentProject = {
      id: 'p1',
      name: '测试项目',
      genre: [],
      description: '',
      metadata: { plannedChapterCount: 100 },
      plotOutline: [],
      characters: [],
      foreshadows: [],
      volumes: [],
    };
    mockProjectStore.sortedVolumes = [{ id: 'v1', name: '第一卷', orderIndex: 0 }];
    mockProjectStore.chapterMemories = [];
    mockProjectStore.sortedChapters = Array.from({ length: emptyCount }, (_, i) => ({
      id: `c${i + 1}`,
      content: '',
      title: `第${i + 1}章`,
      orderIndex: i,
    }));
    // 让 updateChapter 真正写入章节内容，以便 writtenChapters 计算属性正确反映
    mockProjectStore.updateChapter.mockImplementation(async (id: string, data: any) => {
      const ch = mockProjectStore.sortedChapters.find((c: any) => c.id === id);
      if (ch) Object.assign(ch, data);
    });
    mockProjectStore.createChapter.mockClear();
    mockProjectStore.updateChapter.mockClear();
  }

  it('持久失败时重试耗尽后结束整批且不新建空章节', async () => {
    setupProjectWithEmptyChapters(1);
    // 管道执行失败（'AI service unavailable' 归为 unknown/持久）
    mockPipelineExecute.mockRejectedValueOnce(new Error('AI service unavailable'));

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(1, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 1,
      useReview: false,
    });

    // 批量写作已结束（重试耗尽后结束整批）
    expect(writer.isWriting.value).toBe(false);
    // 错误信息已设置（新行为：重试耗尽结束批量，而非跳过继续）
    expect(writer.error.value).toContain('重试耗尽');
    // 失败章节被标记为 failed 状态（供 UI 红标 + 事后 retryFailedChapters 补）
    expect(mockProjectStore.updateChapter).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ writeStatus: 'failed', lastError: 'AI service unavailable' })
    );
    // 失败章节被收集到 failedChapters + batchSummary
    expect(writer.failedChapters.value).toHaveLength(1);
    expect(writer.failedChapters.value[0].errorKind).toBe('unknown');
    expect(writer.batchSummary.value).not.toBeNull();
    expect(writer.batchSummary.value?.written).toBe(0);
    expect(writer.batchSummary.value?.failed).toHaveLength(1);
  });

  it('forceAccepted 或门禁失败不得计为批量成功', async () => {
    setupProjectWithEmptyChapters(1);
    mockPipelineExecute.mockResolvedValueOnce({
      success: true,
      prose: '未通过门禁的正文',
      title: null,
      taskBook: null,
      gateResult: {
        passed: false,
        allIssues: [{ severity: 'critical', description: '状态冲突' }],
        blockingCount: 1,
        highCount: 0,
      },
      attempts: 3,
      forceAccepted: true,
      supplementRounds: 0,
    });

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();
    await writer.startBatchWriting(1, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 1,
    });

    expect(writer.progress.value.writtenChapters).toBe(0);
    // 门禁失败（review/持久）重试耗尽后结束整批
    expect(writer.error.value).toContain('重试耗尽');
    // 门禁失败（review/持久）会标记章节为 failed
    expect(mockProjectStore.updateChapter).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ writeStatus: 'failed', lastErrorKind: 'review' })
    );
  });

  it('瞬态错误按 maxRetries 重试本章，重试耗尽后结束整批', async () => {
    setupProjectWithEmptyChapters(1);
    // 管道每次都失败，且是瞬态网络错误（被分类为 network/retryable，会指数退避重试）
    mockPipelineExecute.mockRejectedValue(new Error('network error: fetch failed'));

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(1, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 2,
      useReview: false,
    });

    // 瞬态错误重试了 2 次（每次都调 pipeline.execute）
    expect(mockPipelineExecute).toHaveBeenCalledTimes(2);
    // 批量写作已结束（重试耗尽后结束整批）
    expect(writer.isWriting.value).toBe(false);
    // 新行为：重试耗尽结束批量，而非跳过继续
    expect(writer.error.value).toContain('重试耗尽');
    expect(writer.failedChapters.value[0].errorKind).toBe('network');
    // 失败章节被标记为 failed（writeStatus），正文保持空白
    expect(mockProjectStore.updateChapter).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ writeStatus: 'failed', lastErrorKind: 'network' })
    );
    // batchSummary 汇总
    expect(writer.batchSummary.value?.failed).toHaveLength(1);
    expect(writer.batchSummary.value?.failed[0].attempts).toBe(2);
  }, 15000);

  // 截断/空响应以异常抛出（无 gateResult），上面「提取门禁 critical 作反馈种子」的
  // 分支提不到反馈。此前下一轮重试是原样盲发同一 prompt；现在必须注入固定引导种子，
  // 让重试带着「一次性输出完整 JSON」的教训定向重写（与 continueWriteHarness 对齐）。
  it('截断失败后重试时注入固定引导种子（seedRevisionHints）', async () => {
    setupProjectWithEmptyChapters(1);
    // 第 1 次截断失败、第 2 次成功
    mockPipelineExecute
      .mockRejectedValueOnce(
        new Error('AI 返回的结构化 JSON 无法解析：Unexpected end of JSON input')
      )
      .mockResolvedValueOnce({
        success: true,
        prose: '重试后的完整正文',
        title: null,
        taskBook: null,
        gateResult: { passed: true, allIssues: [], blockingCount: 0, highCount: 0 },
        attempts: 2,
        forceAccepted: false,
      });

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(1, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 2,
      useReview: false,
    });

    // 截断分类为 truncated（瞬态），重试成功
    expect(mockPipelineExecute).toHaveBeenCalledTimes(2);
    expect(writer.progress.value.writtenChapters).toBe(1);
    // 第 2 次调用携带了截断引导种子，而非 undefined（原样盲发）
    const secondCall = mockPipelineExecute.mock.calls[1][0] as {
      seedRevisionHints?: string[];
    };
    expect(secondCall.seedRevisionHints).toBeDefined();
    expect(secondCall.seedRevisionHints?.[0]).toContain('完整的 JSON 对象');
  }, 15000);

  it('失败重试成功后继续写下一章', async () => {
    setupProjectWithEmptyChapters(2);
    // 第 1 章第 1 次 pipeline 瞬态失败、第 2 次成功；第 2 章一次成功
    mockPipelineExecute
      .mockRejectedValueOnce(new Error('network error: fetch failed'))
      .mockResolvedValueOnce({
        success: true,
        prose: '第1章内容',
        title: null,
        taskBook: null,
        gateResult: { passed: true, allIssues: [], blockingCount: 0, highCount: 0 },
        attempts: 2,
        forceAccepted: false,
      })
      .mockResolvedValueOnce({
        success: true,
        prose: '第2章内容',
        title: null,
        taskBook: null,
        gateResult: { passed: true, allIssues: [], blockingCount: 0, highCount: 0 },
        attempts: 1,
        forceAccepted: false,
      });

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(2, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 2,
      useReview: false,
    });

    // 两章都成功（pipeline.execute 被调用 3 次：第1章2次 + 第2章1次）
    expect(mockPipelineExecute).toHaveBeenCalledTimes(3);
    // v3.1：writtenChapters 依赖 store 中 chapter.content，而管道是 mock 的不写 store；
    // 改为验证 progress.writtenChapters（批量层自己维护的计数）
    expect(writer.progress.value.writtenChapters).toBe(2);
  }, 15000);
});
