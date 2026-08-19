import { describe, expect, it } from 'vitest';

import type { Project, PlotNode } from '@/types/project';
import { ensureStoryflowWritingCapacity } from './storyflowClosedLoopHarness';

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
      // 只为第 3 章返回可用蓝图，第 4/5 章返回垃圾 → 滚动产出 1 章，占位兜底 2 章
      callStructuredText: async (_system, user) => {
        if (user.includes('第4章') && user.includes('第5章')) return '无法解析的输出';
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
});
