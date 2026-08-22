import { describe, expect, it } from 'vitest';
import { extractRecentEndingSnippets } from '../LongFormWritingEngine';
import type { SceneChunk } from '@/types/story-runtime';

function makeScene(chapterIndex: number, order: number, text: string): SceneChunk {
  return {
    id: `scene-${chapterIndex}-${order}`,
    chapterId: `ch-${chapterIndex}`,
    chapterIndex,
    order,
    title: `第${chapterIndex}章场景${order}`,
    text,
    participants: [],
    locations: [],
    sourceTrace: [],
  };
}

describe('extractRecentEndingSnippets', () => {
  it('取本章之前最近 3 章的末段尾句，按章号倒序', () => {
    const scenes = [
      makeScene(1, 0, '第一章开头。'.repeat(20) + '第一章的结尾收束在此。'),
      makeScene(4, 0, '第四章前段。'),
      makeScene(4, 1, '第四章后段正文。'.repeat(10) + '毅然跃入暗涌深处，迎向苍溟杀局。'),
      makeScene(5, 0, '第五章内容。'.repeat(10) + '第五章的收尾句。'),
      makeScene(6, 0, '第六章内容。'.repeat(10) + '第六章不该被提取（等于当前章）。'),
    ];
    const result = extractRecentEndingSnippets(scenes, 6);
    expect(result.map(item => item.chapterIndex)).toEqual([5, 4, 1]);
    expect(result[0].ending).toContain('第五章的收尾句');
    expect(result[1].ending).toContain('苍溟杀局');
  });

  it('同章多场景时取 order 最大的场景文本', () => {
    const scenes = [
      makeScene(2, 0, '早段场景，不是结尾。'.repeat(5)),
      makeScene(2, 3, '最终场景的最后一句话。'),
    ];
    const result = extractRecentEndingSnippets(scenes, 3);
    expect(result).toHaveLength(1);
    expect(result[0].ending).toContain('最终场景的最后一句话');
  });

  it('空场景或无前置章时返回空数组', () => {
    expect(extractRecentEndingSnippets([], 5)).toEqual([]);
    expect(
      extractRecentEndingSnippets([makeScene(5, 0, '当前章自身不提取')], 5)
    ).toEqual([]);
  });

  it('尾句截断到 40 字并折叠空白', () => {
    const longTail = 'X'.repeat(120);
    const result = extractRecentEndingSnippets(
      [makeScene(1, 0, '正文' + longTail)],
      2
    );
    expect(result).toHaveLength(1);
    expect(result[0].ending.length).toBeLessThanOrEqual(40);
    expect(result[0].ending.endsWith('X')).toBe(true);
  });
});
