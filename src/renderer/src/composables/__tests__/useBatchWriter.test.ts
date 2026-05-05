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

vi.mock('./useActiveAIProvider', () => ({
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
    extractAndValidateTitle: vi.fn().mockReturnValue({ titleValid: false }),
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
      expect(writer.config.value.useTaskBook).toBe(false);
      expect(writer.config.value.useReview).toBe(false);
      expect(writer.config.value.useCommit).toBe(false);
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

describe('BatchConfig interface', () => {
  it('should have correct type definition', async () => {
    const { BatchConfig } = await import('@/composables/useBatchWriter');
    
    const validConfig: BatchConfig = {
      wordsPerChapter: 3000,
      writingStyle: 'concise',
      temperature: 0.5,
      deAIEnabled: true,
      useTaskBook: false,
      useReview: false,
      useCommit: false,
    };

    expect(validConfig.wordsPerChapter).toBe(3000);
    expect(validConfig.writingStyle).toBe('concise');
  });
});
