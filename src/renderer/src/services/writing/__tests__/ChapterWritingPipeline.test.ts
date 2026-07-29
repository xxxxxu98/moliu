/**
 * ChapterWritingPipeline 测试
 *
 * 验证共享单章写作管道的核心编排逻辑：
 * 1. execute() 正确调用 orchestrator.writeChapter()
 * 2. 任务书生成与降级（useTaskBook=true/false/失败）
 * 3. 结果归一化（forceAccepted 标记）
 * 4. 预检失败短路
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChapterWritingPipeline } from '../ChapterWritingPipeline';
import type { Project, Chapter } from '@/types/project';

// ====== Mock orchestrator（管道的核心委托对象） ======
const mockInitialize = vi.fn().mockResolvedValue({ snapshot: {}, warnings: [] });
const mockWriteChapter = vi.fn();
const mockValidateSupplement = vi.fn();

function MockStateDrivenOrchestrator(this: any) {
  this.initialize = mockInitialize;
  this.writeChapter = mockWriteChapter;
  this.validateSupplement = mockValidateSupplement;
  this.addListener = vi.fn();
  this.removeListener = vi.fn();
}

vi.mock('@/services/orchestrator', () => ({
  StateDrivenWritingOrchestrator: MockStateDrivenOrchestrator,
}));

// ====== Mock stores / composables ======
vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => ({
    currentProject: { id: 'p1', name: '测试' },
    currentChapter: { id: 'ch1', title: '第1章', orderIndex: 0 },
    sortedChapters: [{ id: 'ch1', title: '第1章', orderIndex: 0 }],
  }),
}));

vi.mock('@/composables/useActiveAIProvider', () => ({
  useActiveAIProvider: () => ({
    requireAIService: vi.fn(),
    currentModel: { value: 'gpt-4o' },
  }),
}));

// ====== Mock preflight / contextAgent ======
const mockPreflight = vi.fn().mockResolvedValue({ valid: true, errors: [], warnings: [] });
const mockGetCurrentChapterContext = vi.fn().mockResolvedValue({
  chapterNumber: 1,
  previousChapterEnding: '',
  recentChaptersFullText: '',
});
vi.mock('../preflight/PreflightService', () => ({
  usePreflightService: () => ({
    preflight: mockPreflight,
    getCurrentChapterContext: mockGetCurrentChapterContext,
  }),
}));

const mockGenerateTaskBook = vi.fn();
vi.mock('@/services/ai/agents/enhanced-context-agent', () => ({
  useEnhancedContextAgent: () => ({ generateTaskBook: mockGenerateTaskBook }),
}));

vi.mock('@/services/writing/backup/GitBackupManager', () => ({
  GitBackupManager: vi.fn().mockImplementation(() => ({ backup: vi.fn() })),
}));

const mockPersistenceSave = vi.fn().mockResolvedValue({ oldContent: '' });
vi.mock('../chapterPersistenceAdapters', () => ({
  createChapterPersistenceClient: () => ({
    save: mockPersistenceSave,
  }),
  createChapterMemoryClient: () => ({
    extractAndSave: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('../supplement', async () => {
  const actual = await vi.importActual<typeof import('../supplement')>('../supplement');
  return {
    ...actual,
    runSupplementRounds: vi.fn().mockImplementation(async ({ prose }: { prose: string }) => ({
      prose,
      rounds: 0,
    })),
  };
});

// ====== 测试数据工厂 ======
function makeProject(): Project {
  return {
    id: 'p1',
    name: '测试项目',
    description: '',
    genre: [],
    wordCount: 0,
    status: 'writing',
    volumes: [],
    chapters: [],
    characters: [],
    worldSchema: undefined as any,
    foreshadows: [],
    plotOutline: [],
    chapterMemories: [],
    createdAt: '',
    updatedAt: '',
  };
}

function makeChapter(orderIndex = 0): Chapter {
  return {
    id: `ch${orderIndex + 1}`,
    title: `第${orderIndex + 1}章`,
    content: '',
    wordCount: 0,
    orderIndex,
    version: 1,
    status: 'draft',
    createdAt: '',
    updatedAt: '',
  };
}

describe('ChapterWritingPipeline', () => {
  let pipeline: ChapterWritingPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPreflight.mockResolvedValue({ valid: true, errors: [], warnings: [] });
    mockGenerateTaskBook.mockResolvedValue({
      success: true,
      taskBook: {
        CBN: '开头',
        CPNs: ['节点1'],
        CEN: '结尾',
        mustCover: ['必须覆盖'],
        forbiddenZones: ['禁区'],
        styleGuidance: { reasoning: ['节奏快'], pacingStrategy: '紧凑' },
        hardConstraints: { chapterEndOpenQuestion: '悬念' },
      },
    });
    mockWriteChapter.mockResolvedValue({
      success: true,
      chapter: 1,
      prose: '生成的正文',
      changes: { version: '1.0', chapter: 1, changes: [] },
      gateResult: { passed: true, allIssues: [], blockingCount: 0, highCount: 0 },
      commitResult: { success: true, chapter: 1, steps: [] },
      snapshot: {},
      attempts: 1,
      totalDurationMs: 100,
    });
    mockValidateSupplement.mockResolvedValue({
      passed: true,
      hasBlocking: false,
      blockingCount: 0,
      highCount: 0,
      totalIssues: 0,
      gates: [],
      allIssues: [],
      decision: {
        shouldBlock: false,
        reason: '通过',
        canAutoFix: false,
        nextAction: 'accept',
      },
      totalDurationMs: 1,
    });
    pipeline = new ChapterWritingPipeline();
  });

  describe('execute() 成功路径', () => {
    it('应调用 orchestrator.writeChapter 并归一化结果', async () => {
      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 3000,
        writingStyle: 'concise',
      });

      expect(result.success).toBe(true);
      expect(result.prose).toBe('生成的正文');
      expect(result.attempts).toBe(1);
      expect(result.forceAccepted).toBe(false); // 门禁通过
      expect(result.supplementRounds).toBe(0);
      expect(mockWriteChapter).toHaveBeenCalledTimes(1);
      expect(mockInitialize).toHaveBeenCalledTimes(1);
    });

    it('应生成任务书并转换为 blueprint/writingRules', async () => {
      await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'elegant',
        useTaskBook: true,
      });

      // 任务书被生成
      expect(mockGenerateTaskBook).toHaveBeenCalledTimes(1);
      // writeChapter 被调用，且 options 含 blueprint
      const callArgs = mockWriteChapter.mock.calls[0];
      const options = callArgs[3]; // 第4个参数是 options
      expect(options.blueprint).toBeDefined();
      expect(options.blueprint.mustCover).toEqual(['必须覆盖']);
      expect(options.writingRules).toContain('写作任务书');
    });
  });

  describe('严格门禁', () => {
    it('即使上游错误标记 success=true，门禁未过仍返回失败', async () => {
      mockWriteChapter.mockResolvedValueOnce({
        success: true,
        chapter: 1,
        prose: '兜底正文',
        changes: { version: '1.0', chapter: 1, changes: [] },
        gateResult: {
          passed: false,
          allIssues: [{ severity: 'critical', location: 'L1', description: '矛盾' }],
          blockingCount: 1,
          highCount: 0,
        },
        commitResult: { success: true, chapter: 1, steps: [] },
        snapshot: {},
        attempts: 3,
        totalDurationMs: 200,
      });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 3000,
        writingStyle: 'concise',
      });

      expect(result.success).toBe(false);
      expect(result.forceAccepted).toBe(false);
      expect(result.gateResult?.passed).toBe(false);
      expect(result.error).toContain('严格门禁');
    });
  });

  describe('任务书降级', () => {
    it('useTaskBook=false 时跳过任务书生成', async () => {
      await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        useTaskBook: false,
      });

      expect(mockGenerateTaskBook).not.toHaveBeenCalled();
      const options = mockWriteChapter.mock.calls[0][3];
      expect(options.blueprint).toBeUndefined();
      expect(options.writingRules).toBeUndefined();
    });

    it('任务书生成失败时降级为无任务书（不中断）', async () => {
      mockGenerateTaskBook.mockResolvedValueOnce({ success: false, error: '生成失败' });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        useTaskBook: true,
      });

      // 仍然成功（降级）
      expect(result.success).toBe(true);
      expect(result.taskBook).toBeNull();
    });
  });

  describe('预检失败', () => {
    it('enablePreflight=true 且预检失败时返回失败', async () => {
      mockPreflight.mockResolvedValueOnce({
        valid: false,
        errors: ['缺少项目设定'],
        warnings: [],
      });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        enablePreflight: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('预检失败');
      expect(mockWriteChapter).not.toHaveBeenCalled();
    });

    it('enablePreflight=false 时跳过预检', async () => {
      await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        enablePreflight: false,
      });

      expect(mockPreflight).not.toHaveBeenCalled();
    });
  });

  describe('补写开关', () => {
    it('enableSupplement=true 时调用 runSupplementRounds', async () => {
      const { runSupplementRounds } = await import('../supplement');
      const mockSupplement = vi.mocked(runSupplementRounds);
      mockSupplement.mockResolvedValueOnce({
        prose: '生成的正文' + '补写内容'.repeat(50),
        rounds: 1,
      });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        enableSupplement: true,
      });

      expect(mockSupplement).toHaveBeenCalledTimes(1);
      expect(result.supplementRounds).toBe(1);
      expect(result.prose).toContain('补写内容');
    });

    it('enableSupplement=false 时不补写', async () => {
      const { runSupplementRounds } = await import('../supplement');
      const mockSupplement = vi.mocked(runSupplementRounds);
      mockSupplement.mockClear();

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        enableSupplement: false,
      });

      expect(mockSupplement).not.toHaveBeenCalled();
      expect(result.supplementRounds).toBe(0);
    });

    it('补写校验失败时明确失败且不持久化增量', async () => {
      const { runSupplementRounds } = await import('../supplement');
      const mockSupplement = vi.mocked(runSupplementRounds);
      mockValidateSupplement.mockResolvedValueOnce({
        passed: false,
        hasBlocking: true,
        blockingCount: 1,
        highCount: 0,
        totalIssues: 1,
        gates: [],
        allIssues: [],
        decision: {
          shouldBlock: true,
          reason: '补写违反蓝图',
          canAutoFix: false,
          nextAction: 'rewrite',
        },
        totalDurationMs: 1,
      });
      mockSupplement.mockImplementationOnce(async params => {
        const delta = '包含禁区的补写';
        const fullProse = `${params.prose}\n\n${delta}`;
        const validationError = await params.validateRound?.(1, delta, fullProse);
        if (validationError) {
          return {
            prose: params.prose,
            rounds: 0,
            error: `第 1 轮补写校验失败：${validationError}`,
          };
        }
        await params.onRound?.(1, delta, fullProse);
        return { prose: fullProse, rounds: 1 };
      });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        enableSupplement: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('补写校验失败');
      expect(mockPersistenceSave).not.toHaveBeenCalled();
    });
  });

  describe('写作失败', () => {
    it('orchestrator 返回 success=false 时透传错误', async () => {
      mockWriteChapter.mockResolvedValueOnce({
        success: false,
        chapter: 1,
        prose: '',
        changes: null,
        gateResult: null,
        commitResult: null,
        snapshot: null,
        attempts: 0,
        error: '起草失败',
        totalDurationMs: 50,
      });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('起草失败');
      expect(result.forceAccepted).toBe(false);
    });
  });
});
