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
      expect(writer.config.value.maxRetries).toBe(3);
    });

    it('should expose retry state refs', async () => {
      const { useBatchWriter } = await import('@/composables/useBatchWriter');
      const writer = useBatchWriter();

      expect(writer.maxRetries.value).toBe(3);
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

  it('失败时立即停止且不新建空章节（核心 bug 修复）', async () => {
    setupProjectWithEmptyChapters(1);
    mockRequireAIService.mockImplementation(() => {
      throw new Error('AI service unavailable');
    });

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(1, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 1,
      useReview: false,
    });

    // 批量写作已停止
    expect(writer.isWriting.value).toBe(false);
    // 错误信息已设置
    expect(writer.error.value).toContain('失败');
    // 【关键】没有新建任何空章节
    expect(mockProjectStore.createChapter).not.toHaveBeenCalled();
    // 【关键】没有写入占位内容到失败章节
    expect(mockProjectStore.updateChapter).not.toHaveBeenCalled();
  });

  it('失败时按 maxRetries 重试本章，重试耗尽后停止', async () => {
    setupProjectWithEmptyChapters(1);
    mockRequireAIService.mockImplementation(() => {
      throw new Error('AI service unavailable');
    });

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(1, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 2,
      useReview: false,
    });

    // 重试了 2 次（每次都调用 requireAIService）
    expect(mockRequireAIService).toHaveBeenCalledTimes(2);
    // 批量写作已停止
    expect(writer.isWriting.value).toBe(false);
    expect(writer.error.value).toContain('连续 2 次失败');
    // 没有新建空章节
    expect(mockProjectStore.createChapter).not.toHaveBeenCalled();
    // 失败章节保持空白
    expect(mockProjectStore.updateChapter).not.toHaveBeenCalled();
  }, 15000);

  it('失败重试成功后继续写下一章', async () => {
    setupProjectWithEmptyChapters(2);
    // 第 1 章第 1 次失败、第 2 次成功；第 2 章一次成功
    let aiCallCount = 0;
    mockRequireAIService.mockImplementation(() => {
      aiCallCount++;
      if (aiCallCount === 1) {
        throw new Error('transient error');
      }
      return { continueWriting: () => Promise.resolve({ content: '生成的章节内容' }) };
    });

    const { useBatchWriter } = await import('@/composables/useBatchWriter');
    const writer = useBatchWriter();

    await writer.startBatchWriting(2, {
      wordsPerChapter: 2000,
      writingStyle: 'concise',
      maxRetries: 2,
      useReview: false,
    });

    // 两章都成功写入（updateChapter 被调用 2 次）
    expect(mockProjectStore.updateChapter).toHaveBeenCalledTimes(2);
    expect(writer.writtenChapters.value).toBe(2);
  }, 15000);
});
