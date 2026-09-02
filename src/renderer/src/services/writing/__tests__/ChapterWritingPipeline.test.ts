/**
 * ChapterWritingPipeline 测试
 *
 * 验证共享单章写作管道的编排边界与纯函数：
 * 1. 预检失败短路、任务书开关
 * 2. storyRuntime 缺失时显式失败（无降级链，§16.1）
 * 3. 角色放行 / 近章场景选取 / 伏笔候选 / 蓝图文本合并等纯函数
 *
 * LongFormWritingEngine 正式路径由 continueWrite harness 假 AI 测试覆盖（同一条生产链）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ChapterWritingPipeline,
  resolveAllowedChapterCharacters,
  selectRecentScenesByChapter,
  buildPayoffCandidates,
  mergeChapterBlueprintText,
} from '../ChapterWritingPipeline';
import type { Project, Chapter } from '@/types/project';
import type { SceneChunk } from '@/types/story-runtime';

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

const mockPersistenceSave = vi.fn().mockResolvedValue({ oldContent: '' });
vi.mock('../chapterPersistenceAdapters', () => ({
  createChapterPersistenceClient: () => ({
    save: mockPersistenceSave,
  }),
  createChapterMemoryClient: () => ({
    extractAndSave: vi.fn().mockResolvedValue(null),
  }),
}));

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

describe('resolveAllowedChapterCharacters', () => {
  it('仅允许主角和本章明确提及人物，并阻止后期人物提前登场', () => {
    const project = makeProject();
    project.characters = [
      {
        id: 'hero',
        name: '林夜',
        role: '主角',
        profile: { personality: [] },
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'guard',
        name: '周成',
        role: '配角',
        profile: { personality: [] },
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'future',
        name: '贺冲',
        role: '反派',
        profile: { personality: [], revealTiming: '第20章首次登场' },
        createdAt: '',
        updatedAt: '',
      },
    ];

    const result = resolveAllowedChapterCharacters({
      project,
      chapterNumber: 2,
      chapterText: '周成拦住林夜盘问，大纲误提了贺冲。',
    });

    expect(result.allowedNames).toEqual(['林夜', '周成']);
    expect(result.futureReveals).toEqual([
      expect.objectContaining({ notBeforeChapter: 20 }),
    ]);
  });

  it('登场时点已到的角色即使合同只用泛称指代也放行', () => {
    const project = makeProject();
    project.characters = [
      {
        id: 'hero',
        name: '沈哲',
        role: '主角',
        profile: { personality: [] },
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'ally',
        name: '萧景',
        role: 'ally',
        profile: { personality: [], revealTiming: '第1章' },
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'future',
        name: '崔浩',
        role: '反派',
        profile: { personality: [], revealTiming: '第60章' },
        createdAt: '',
        updatedAt: '',
      },
    ];

    const result = resolveAllowedChapterCharacters({
      project,
      chapterNumber: 1,
      // 合同只写“皇子”泛称，不含“萧景”本名
      chapterText: '穿越到金殿外听候发落，不可让皇子此刻展现出任何自救能力。',
    });

    expect(result.allowedNames).toEqual(['沈哲', '萧景']);
    expect(result.futureReveals).toEqual([
      expect.objectContaining({ notBeforeChapter: 60 }),
    ]);
  });

  it('履约要求点名的后期角色必须放行，避免“必须写到”与“不许露面”自相矛盾', () => {
    const project = makeProject();
    project.characters = [
      {
        id: 'hero',
        name: '曹玉梁',
        role: '主角',
        profile: { personality: [] },
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'judge',
        name: '温伯衡',
        role: '导师',
        profile: { personality: [], revealTiming: '第5章正式登场' },
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'boss',
        name: '钱墨渊',
        role: '反派',
        profile: { personality: [], revealTiming: '第30章' },
        createdAt: '',
        updatedAt: '',
      },
    ];

    const result = resolveAllowedChapterCharacters({
      project,
      chapterNumber: 1,
      chapterText: '禁区：不得点出盐引底档与钱墨渊的关系。\n当众亮证，岑述被温伯衡锁走。',
      fulfillmentText: '当众亮证，岑述被温伯衡锁走。',
    });

    expect(result.allowedNames).toEqual(['曹玉梁', '温伯衡']);
    // 只在禁区文本里被提到的钱墨渊不解锁，仍按计划保护
    expect(result.futureReveals).toEqual([
      expect.objectContaining({ notBeforeChapter: 30 }),
    ]);
  });
});

describe('selectRecentScenesByChapter', () => {
  function scene(chapterIndex: number, order: number): SceneChunk {
    return {
      id: `c${chapterIndex}:s${order}`,
      chapterId: `c${chapterIndex}`,
      chapterIndex,
      order,
      title: `第${chapterIndex}章场景${order}`,
      text: '正文',
      participants: [],
      locations: [],
      sourceTrace: [],
    };
  }

  it('一章一场景块形态下按章取足近 N 章（旧 slice(-4) 只覆盖 1 章出头）', () => {
    // 《绝症当虫治》实测形态:每章只切成 1 个场景块
    const chunks = Array.from({ length: 10 }, (_, i) => scene(i + 1, 0));
    const selected = selectRecentScenesByChapter(chunks, 11, 3);
    expect(selected.map(c => c.chapterIndex)).toEqual([8, 9, 10]);
  });

  it('一章多场景块时同样覆盖 N 章的全部块', () => {
    const chunks = [
      scene(7, 0), scene(7, 1),
      scene(8, 0), scene(8, 1), scene(8, 2),
      scene(9, 0),
    ];
    const selected = selectRecentScenesByChapter(chunks, 10, 2);
    expect(selected.map(c => c.chapterIndex)).toEqual([8, 8, 8, 9]);
  });

  it('不包含本章及之后的场景块', () => {
    const chunks = [scene(9, 0), scene(10, 0), scene(11, 0)];
    const selected = selectRecentScenesByChapter(chunks, 10, 3);
    expect(selected.map(c => c.chapterIndex)).toEqual([9]);
  });

  it('空列表与无前章时返回空', () => {
    expect(selectRecentScenesByChapter([], 5, 3)).toEqual([]);
    expect(selectRecentScenesByChapter([scene(5, 0)], 1, 3)).toEqual([]);
  });
});

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
    // vitest 环境无 window.electronAPI.storyRuntime，也不注入 forceStoryRuntime
    pipeline = new ChapterWritingPipeline();
  });

  describe('storyRuntime 缺失（无降级链）', () => {
    it('显式失败并说明装配方式，不写正文、不落库', async () => {
      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 3000,
        writingStyle: 'concise',
      });

      expect(result.success).toBe(false);
      expect(result.prose).toBe('');
      expect(result.error).toContain('storyRuntime 不可用');
      expect(result.error).toContain('forceStoryRuntime');
      expect(result.forceAccepted).toBe(false);
      expect(mockPersistenceSave).not.toHaveBeenCalled();
    });

    it('任务书阶段仍先执行（失败原因不被任务书成功掩盖）', async () => {
      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 3000,
        writingStyle: 'concise',
        useTaskBook: true,
      });

      expect(mockGenerateTaskBook).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.error).toContain('storyRuntime 不可用');
    });
  });

  describe('任务书开关', () => {
    it('useTaskBook=false 时跳过任务书生成', async () => {
      await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        useTaskBook: false,
      });

      expect(mockGenerateTaskBook).not.toHaveBeenCalled();
    });

    it('任务书生成失败不中断（降级为无任务书继续走引擎装配）', async () => {
      mockGenerateTaskBook.mockResolvedValueOnce({ success: false, error: '生成失败' });

      const result = await pipeline.execute({
        project: makeProject(),
        chapter: makeChapter(0),
        targetWordCount: 2000,
        writingStyle: 'concise',
        useTaskBook: true,
      });

      // 任务书失败本身不是终止原因；终止原因仍是环境缺 storyRuntime
      expect(result.taskBook).toBeNull();
      expect(result.error).toContain('storyRuntime 不可用');
    });
  });

  describe('预检', () => {
    it('enablePreflight=true 且预检失败时短路返回', async () => {
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
      expect(mockGenerateTaskBook).not.toHaveBeenCalled();
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
});

describe('ChapterWritingPipeline.parseStructuredJson', () => {
  it('SupplementParagraphs 偶发返回裸正文时安全包装为追加段落', () => {
    expect(
      ChapterWritingPipeline.parseStructuredJson(
        '他沿着账目继续追查。\n线索最终指向县衙档房。',
        'SupplementParagraphs'
      )
    ).toEqual({
      paragraphs: ['他沿着账目继续追查。', '线索最终指向县衙档房。'],
    });
  });

  it('其他 schema 的非 JSON 仍严格拒绝', () => {
    expect(() =>
      ChapterWritingPipeline.parseStructuredJson('这不是合法 JSON 正文返回。', 'SceneDraft')
    ).toThrow('结构化 JSON');
  });
});

// 回归自 r9 基线书审 Findings①：payoff=110 的锦缎密账在 ch99 被正文提前回收，
// 旧口径（payoffChapter <= chapterNumber）让判官看不到候选，台账永远 planned。
describe('buildPayoffCandidates（伏笔判官候选口径）', () => {
  const foreshadows = [
    { id: 'fs-a', hint: '提前回收线', status: 'planned', setupChapter: 42, createdChapter: 42 },
    { id: 'fs-b', hint: '未到埋设线', status: 'planned', setupChapter: 105, createdChapter: 105 },
    { id: 'fs-c', hint: '已回收线', status: 'resolved', setupChapter: 2, createdChapter: 2 },
    { id: 'fs-d', hint: '无setup线', status: 'buried' },
  ];

  it('回收时点在写作范围之外但埋设点已到 → 进候选（提前回收可见）', () => {
    const ids = buildPayoffCandidates(foreshadows, 99).map(f => f.id);
    expect(ids).toContain('fs-a'); // payoff=110 > 99，但 setup=42 已到
    expect(ids).toContain('fs-d'); // 无 setup 视为已埋设
  });

  it('埋设点未到仍排除；已回收排除', () => {
    const ids = buildPayoffCandidates(foreshadows, 99).map(f => f.id);
    expect(ids).not.toContain('fs-b');
    expect(ids).not.toContain('fs-c');
  });

  it('undefined 台账安全返回空数组', () => {
    expect(buildPayoffCandidates(undefined, 1)).toEqual([]);
  });
});

// 回归自 r9 基线：批量续写章的 outline 是「滚动续写槽位」34 字占位，
// 只用章表字段做词面共现则 planned→buried 永不触发。
describe('mergeChapterBlueprintText（埋设检测共现源）', () => {
  const slotChapter = {
    outline: '滚动续写槽位：承接第99章既有状态，由续写引擎根据当前合同推进主线。',
    plotSummary: '滚动续写槽位：承接第99章既有状态。',
  };

  it('槽位占位章以 taskBook 蓝图为主文本源', () => {
    const taskBook = {
      CBN: '沈清霜取出贴身锦缎密账',
      CPNs: ['微缩复式流水密账当众展开'],
      CEN: '线索交到陆准手中。',
      mustCover: ['锦缎密账兑现'],
    };
    const text = mergeChapterBlueprintText(taskBook, slotChapter);
    expect(text).toContain('锦缎密账');
    expect(text).toContain('微缩复式流水密账');
  });

  it('taskBook 缺失时回落章表字段，全缺返回空串', () => {
    expect(mergeChapterBlueprintText(null, slotChapter)).toContain('滚动续写槽位');
    expect(mergeChapterBlueprintText(undefined, undefined)).toBe('');
  });
});
