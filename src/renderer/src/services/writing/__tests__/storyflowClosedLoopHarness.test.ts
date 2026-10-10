import { describe, expect, it } from 'vitest';

import type { Project, PlotNode } from '@/types/project';
import {
  ensureStoryflowWritingCapacity,
  firstUnwrittenChapterNumber,
  parseExecutableOutlineCache,
  resolveStoryflowArtifactPaths,
  shouldKeepStoryflowStore,
  storyflowBatchChapterNumber,
  storyflowChaptersRemaining,
  storyflowRunCoversRequestedEnd,
  storyflowStoreHasWrittenProse,
  summarizeWriterRun,
} from './storyflowClosedLoopHarness';

function makeProject(): Project {
  const now = '2026-08-19T00:00:00.000Z';
  return {
    id: 'storyflow-capacity-test',
    name: '容量测试',
    description: '',
    genre: [],
    wordCount: 0,
    status: 'writing',
    volumes: [{ id: 'volume-1', name: '第一卷', orderIndex: 0 }],
    chapters: [1, 2].map(number => ({
      id: `chapter-${number}`,
      volumeId: 'volume-1',
      title: `第${number}章`,
      content: '',
      wordCount: 0,
      orderIndex: number - 1,
      version: 1,
      status: 'draft' as const,
      createdAt: now,
      updatedAt: now,
    })),
    characters: [],
    worldSchema: { locations: [], rules: [], factions: [] },
    foreshadows: [],
    plotOutline: [1, 2].map(number => ({
      id: `plot-${number}`,
      title: `第${number}章`,
      type: 'chapter' as const,
      orderIndex: number - 1,
      chapterId: `chapter-${number}`,
      CBN: `第${number}章起点`,
      CPNs: [`第${number}章推进`],
      CEN: `第${number}章终点`,
      mustCover: [`第${number}章必须节点`],
    })),
    chapterMemories: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('ensureStoryflowWritingCapacity', () => {
  it('无 AI 调用器时占位兜底补齐请求章数，不伪造结构化质量合同', async () => {
    const original = makeProject();
    const expanded = await ensureStoryflowWritingCapacity(original, 4);
    const chapterNodes = expanded.plotOutline.filter(node => node.type === 'chapter');

    expect(original.chapters).toHaveLength(2);
    expect(expanded.chapters).toHaveLength(4);
    expect(chapterNodes).toHaveLength(4);
    expect(chapterNodes[2]).toMatchObject({
      orderIndex: 2,
      chapterId: expanded.chapters[2].id,
    });
    expect(chapterNodes[2].mustCover).toBeUndefined();
    expect(expanded.metadata?.plannedChapterCount).toBe(4);
    expect(expanded.outlineRoll).toMatchObject({
      requestedChapters: 4,
      rolledCount: 0,
      placeholderCount: 2,
    });
  });

  it('重复补齐保持幂等，不产生重复章节或大纲节点', async () => {
    const once = await ensureStoryflowWritingCapacity(makeProject(), 4);
    const twice = await ensureStoryflowWritingCapacity(once, 4);

    expect(twice.chapters).toHaveLength(4);
    expect(twice.plotOutline.filter(node => node.type === 'chapter')).toHaveLength(4);
    expect(new Set(twice.chapters.map(chapter => chapter.id)).size).toBe(4);
  });

  it('真实 AI 路径：滚动续纲产出的蓝图落库，补不出的章才占位兜底', async () => {
    const blockFor = (n: number) => `### 第${n}章
- 标题：第${n}章夜审惊变
- 概要：概要内容填写足够长以通过基本校验要求第${n}章概要补充说明文字。
- CBN：三更灯下账页缺角第${n}章
- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面
- CEN：主簿身后闪出禁军影子第${n}章
- mustCover：查清军资缺口；逼退巡夜主簿
- 禁区：不得揭示玉印来历
- 章尾钩子文案：账还没查完，刀已经架到脖子上了
- 爽点类型：解谜`;

    const expanded = await ensureStoryflowWritingCapacity(makeProject(), 5, {
      // 只为第 3 章返回可用蓝图，第 4/5 章返回垃圾 → 滚动产出 1 章，占位兜底 2 章。
      // 分流锚定「只需补写的章号」行(4、5 起批)——2026-10-03 P2.2 相位建议会给
      // user 注入「第N章:」字样的相位行,includes('第4章') 会误命中首批请求
      callStructuredText: async (_system, user) => {
        if (/【只需补写的章号】\s*\n\s*4、5/u.test(user)) return '无法解析的输出';
        return blockFor(3);
      },
    });

    const chapterNodes = expanded.plotOutline
      .filter(node => node.type === 'chapter')
      .sort((a, b) => a.orderIndex - b.orderIndex);
    expect(expanded.chapters).toHaveLength(5);
    expect(chapterNodes).toHaveLength(5);
    // 第 3 章是滚动蓝图：带结构化合同
    expect(chapterNodes[2].CBN).toContain('账页缺角');
    expect(chapterNodes[2].mustCover?.length).toBeGreaterThan(0);
    // 第 4/5 章是占位兜底：不伪造合同
    expect(chapterNodes[3].mustCover).toBeUndefined();
    expect(chapterNodes[4].mustCover).toBeUndefined();
    expect(expanded.outlineRoll).toMatchObject({
      rolledFromChapter: 3,
      rolledToChapter: 3,
      rolledCount: 1,
      placeholderCount: 2,
    });
    expect(expanded.outlineRoll!.warnings.join('\n')).toMatch(/4-5 章|第 4-5 章/);
  });

  it('真实 AI 路径：细纲槽已满足目标时不触发滚动', async () => {
    const project = makeProject();
    const expanded = await ensureStoryflowWritingCapacity(project, 2, {
      callStructuredText: async () => {
        throw new Error('不应发起请求');
      },
    });
    expect(expanded.outlineRoll!.rolledCount).toBe(0);
    expect(expanded.outlineRoll!.warnings[0]).toContain('未触发');
  });

  it('真实 AI 路径：单批截断后循环续滚直到补满，不留占位槽', async () => {
    const blockFor = (n: number) => `### 第${n}章
- 标题：第${n}章夜审惊变
- 概要：概要内容填写足够长以通过基本校验要求第${n}章概要补充说明文字。
- CBN：三更灯下账页缺角第${n}章
- CPNs：比对旧账发现缺口；主簿带人围库房；以印信压住场面
- CEN：主簿身后闪出禁军影子第${n}章
- mustCover：查清军资缺口；逼退巡夜主簿
- 禁区：不得揭示玉印来历
- 章尾钩子文案：账还没查完，刀已经架到脖子上了
- 爽点类型：解谜`;

    // 首批只解出第 3-4 章（第 5 章缺失截断）→ 循环从第 5 章续滚第二批补满 3-5
    let call = 0;
    const expanded = await ensureStoryflowWritingCapacity(makeProject(), 5, {
      callStructuredText: async (_system, user) => {
        call += 1;
        if (call === 1) return `${blockFor(3)}\n${blockFor(4)}`;
        return user.includes('第5章') ? blockFor(5) : blockFor(4);
      },
    });

    const chapterNodes = expanded.plotOutline
      .filter(node => node.type === 'chapter')
      .sort((a, b) => a.orderIndex - b.orderIndex);
    expect(call).toBeGreaterThanOrEqual(2);
    expect(chapterNodes).toHaveLength(5);
    // 循环续滚的章节同样带结构化合同，不再是「滚动续写槽位」占位
    for (const node of chapterNodes.slice(2)) {
      expect(node.CBN).toContain('账页缺角');
      expect(node.mustCover?.length).toBeGreaterThan(0);
    }
    expect(expanded.outlineRoll).toMatchObject({
      rolledFromChapter: 3,
      rolledToChapter: 5,
      rolledCount: 3,
      placeholderCount: 0,
    });
  });
});

describe('parseExecutableOutlineCache', () => {
  it('拒绝旧 GeneratedOutline（无 storyEngine），避免适配器读 coreConflict 崩掉', () => {
    expect(() =>
      parseExecutableOutlineCache(
        {
          title: '旧缓存',
          genres: ['朝堂'],
          synopsis: '简介',
          volumes: [],
          characters: [],
          chapters: [],
        },
        'temp/outline-cache-p2writer.json',
      ),
    ).toThrow(/必须是裸 ExecutableOutline/);
  });

  it('检查点包缺 outline.storyEngine 时同样拒绝', () => {
    expect(() =>
      parseExecutableOutlineCache(
        {
          version: 1,
          prompt: 'x',
          outline: { title: '检查点', volumes: [], chapters: [] },
        },
        'temp/storyflow-checkpoints/default.outline.json',
      ),
    ).toThrow(/必须是裸 ExecutableOutline/);
  });
});

describe('summarizeWriterRun', () => {
  it('初稿即过或未注入 writerAgent 时返回 null', () => {
    expect(summarizeWriterRun(undefined)).toBeNull();
    expect(summarizeWriterRun(null)).toBeNull();
    expect(summarizeWriterRun({})).toBeNull();
  });

  it('抽出改稿回合字段，供终态 summary 与 checkpoint 共用', () => {
    expect(
      summarizeWriterRun({
        writer: {
          finishReason: 'model-finish',
          checksUsed: 1,
          revertedUnchecked: false,
          rounds: 3,
          toolCalls: 4,
          byTool: { run_checks: 1, revise_paragraphs: 1 },
          ms: 1200,
        },
      }),
    ).toEqual({
      finishReason: 'model-finish',
      checksUsed: 1,
      revertedUnchecked: false,
      rounds: 3,
      toolCalls: 4,
      byTool: { run_checks: 1, revise_paragraphs: 1 },
      ms: 1200,
    });
  });
});

describe('storyflow 长跑续写定位', () => {
  it('按 orderIndex 找第一篇空白章节，纯空白也算未写', () => {
    expect(
      firstUnwrittenChapterNumber([
        { orderIndex: 2, content: '' },
        { orderIndex: 0, content: '已经落笔' },
        { orderIndex: 1, content: '  \n' },
      ]),
    ).toBe(2);
  });

  it('全部已有正文时返回下一章章号', () => {
    expect(
      firstUnwrittenChapterNumber([
        { orderIndex: 0, content: '甲' },
        { orderIndex: 1, content: '乙' },
      ]),
    ).toBe(3);
    expect(firstUnwrittenChapterNumber([])).toBe(1);
  });

  it('没有正文或未开续写时不保留项目库', () => {
    const written = [{ chapters: [{ orderIndex: 0, content: '有正文' }] }];
    const empty = [{ chapters: [{ orderIndex: 0, content: '' }] }];
    expect(storyflowStoreHasWrittenProse(written)).toBe(true);
    expect(storyflowStoreHasWrittenProse(empty)).toBe(false);
    expect(shouldKeepStoryflowStore(true, written)).toBe(true);
    expect(shouldKeepStoryflowStore(true, empty)).toBe(false);
    expect(shouldKeepStoryflowStore(false, written)).toBe(false);
  });

  it('剩余章数含起始章，写满后为 0', () => {
    expect(storyflowChaptersRemaining(200, 187)).toBe(14);
    expect(storyflowChaptersRemaining(200, 1)).toBe(200);
    expect(storyflowChaptersRemaining(200, 201)).toBe(0);
  });

  it('续写结果用全书章号，本轮只需覆盖到请求末章', () => {
    expect(storyflowBatchChapterNumber(8, 0)).toBe(8);
    expect(storyflowBatchChapterNumber(undefined, 0)).toBe(1);
    expect(storyflowRunCoversRequestedEnd([1, 2, 3], 3)).toBe(true);
    expect(storyflowRunCoversRequestedEnd([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 20)).toBe(
      true,
    );
    expect(storyflowRunCoversRequestedEnd([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 20)).toBe(
      false,
    );
    expect(storyflowRunCoversRequestedEnd([8, 10], 10)).toBe(false);
  });

  it('续写库和 runtime 落在检查点目录，不在会被 storyflow- 前缀清掉的 temp 顶层', () => {
    const paths = resolveStoryflowArtifactPaths();
    expect(paths.resumeStorePath).toContain('storyflow-checkpoints');
    expect(paths.resumeStorePath.endsWith('.project-store.json')).toBe(true);
    expect(paths.resumeRuntimePath).toContain('storyflow-checkpoints');
    expect(paths.resumeRuntimePath.endsWith('.story-runtime')).toBe(true);
  });
});
