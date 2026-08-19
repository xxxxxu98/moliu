import { describe, expect, it } from 'vitest';

import type { Project } from '@/types/project';
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
  it('补齐请求章数并保持新增槽位不伪造结构化质量合同', () => {
    const original = makeProject();
    const expanded = ensureStoryflowWritingCapacity(original, 4);
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
  });

  it('重复补齐保持幂等，不产生重复章节或大纲节点', () => {
    const once = ensureStoryflowWritingCapacity(makeProject(), 4);
    const twice = ensureStoryflowWritingCapacity(once, 4);

    expect(twice.chapters).toHaveLength(4);
    expect(twice.plotOutline.filter(node => node.type === 'chapter')).toHaveLength(4);
    expect(new Set(twice.chapters.map(chapter => chapter.id)).size).toBe(4);
  });
});
