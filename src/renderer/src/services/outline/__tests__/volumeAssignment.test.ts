import { describe, expect, it } from 'vitest';
import {
  reassignChapterVolumes,
  volumeIdForChapter,
  volumeIndexForChapter,
} from '../volumeAssignment';
import type { Chapter, Volume } from '@/types/project';

function makeVolumes(count: number): Volume[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `vol-${index}`,
    name: `第${index + 1}卷`,
    orderIndex: index,
  }));
}

function makeChapter(orderIndex: number, volumeId?: string): Chapter {
  return {
    id: `ch-${orderIndex}`,
    volumeId,
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

describe('volumeIndexForChapter', () => {
  it('真实区间:章号落在声明区间内', () => {
    const volumes = makeVolumes(3);
    const volumePlans = [
      { volumeIndex: 1, chapterRange: { start: 1, end: 60 } },
      { volumeIndex: 2, chapterRange: { start: 61, end: 120 } },
      { volumeIndex: 3, chapterRange: { start: 121, end: 180 } },
    ];
    expect(volumeIndexForChapter(1, { volumes, volumePlans })).toBe(0);
    expect(volumeIndexForChapter(60, { volumes, volumePlans })).toBe(0);
    expect(volumeIndexForChapter(61, { volumes, volumePlans })).toBe(1);
    expect(volumeIndexForChapter(120, { volumes, volumePlans })).toBe(1);
    expect(volumeIndexForChapter(121, { volumes, volumePlans })).toBe(2);
    expect(volumeIndexForChapter(180, { volumes, volumePlans })).toBe(2);
  });

  it('真实区间:章号越过末卷区间时钳到最后一卷(滚动续写超规划规模)', () => {
    const volumes = makeVolumes(2);
    const volumePlans = [
      { volumeIndex: 1, chapterRange: { start: 1, end: 60 } },
      { volumeIndex: 2, chapterRange: { start: 61, end: 120 } },
    ];
    expect(volumeIndexForChapter(200, { volumes, volumePlans })).toBe(1);
  });

  it('区间不完整(部分卷缺失)时整体回退估算', () => {
    const volumes = makeVolumes(3);
    const volumePlans = [
      { volumeIndex: 1, chapterRange: { start: 1, end: 60 } },
      { volumeIndex: 2 },
      { volumeIndex: 3, chapterRange: { start: 121, end: 180 } },
    ];
    // 估算:40章/卷 → 第61章 = 卷2
    expect(volumeIndexForChapter(61, { volumes, volumePlans, estimatedChaptersPerVolume: 40 })).toBe(1);
  });

  it('无区间(旧项目)按 estimatedChaptersPerVolume 估算', () => {
    const volumes = makeVolumes(3);
    expect(
      volumeIndexForChapter(1, { volumes, volumePlans: [], estimatedChaptersPerVolume: 40 }),
    ).toBe(0);
    expect(
      volumeIndexForChapter(41, { volumes, volumePlans: [], estimatedChaptersPerVolume: 40 }),
    ).toBe(1);
    expect(
      volumeIndexForChapter(81, { volumes, volumePlans: [], estimatedChaptersPerVolume: 40 }),
    ).toBe(2);
  });

  it('无区间且无估算字段时按默认40章/卷', () => {
    const volumes = makeVolumes(2);
    expect(volumeIndexForChapter(41, { volumes, volumePlans: [] })).toBe(1);
  });

  it('估算章号越过末卷时钳到最后一卷', () => {
    const volumes = makeVolumes(2);
    expect(
      volumeIndexForChapter(500, { volumes, volumePlans: [], estimatedChaptersPerVolume: 40 }),
    ).toBe(1);
  });

  it('单卷项目始终返回 0', () => {
    expect(volumeIndexForChapter(999, { volumes: makeVolumes(1), volumePlans: [] })).toBe(0);
  });

  it('无卷规划无卷实体返回 0(调用方兜底建默认卷)', () => {
    expect(volumeIndexForChapter(5, { volumes: [], volumePlans: [] })).toBe(0);
  });
});

describe('volumeIdForChapter', () => {
  it('卷实体乱序时按 orderIndex 排序后取卷', () => {
    const volumes: Volume[] = [
      { id: 'vol-b', name: '第2卷', orderIndex: 1 },
      { id: 'vol-a', name: '第1卷', orderIndex: 0 },
    ];
    const volumePlans = [
      { volumeIndex: 1, chapterRange: { start: 1, end: 60 } },
      { volumeIndex: 2, chapterRange: { start: 61, end: 120 } },
    ];
    expect(volumeIdForChapter(1, { volumes, volumePlans })).toBe('vol-a');
    expect(volumeIdForChapter(61, { volumes, volumePlans })).toBe('vol-b');
  });

  it('空卷列表返回 undefined', () => {
    expect(volumeIdForChapter(1, { volumes: [], volumePlans: [] })).toBeUndefined();
  });
});

describe('reassignChapterVolumes', () => {
  it('按全局章序重挂到区间对应卷,只返回有变化的章', () => {
    const volumes = makeVolumes(2);
    const volumePlans = [
      { volumeIndex: 1, chapterRange: { start: 1, end: 2 } },
      { volumeIndex: 2, chapterRange: { start: 3, end: 4 } },
    ];
    const chapters = [
      makeChapter(0, 'vol-0'),
      makeChapter(1, 'vol-0'),
      makeChapter(2, 'vol-0'), // 第3章应挂卷2
      makeChapter(3, 'vol-0'), // 第4章应挂卷2
    ];
    const changed = reassignChapterVolumes(chapters, { volumes, volumePlans });
    expect(changed).toHaveLength(2);
    expect(changed.map(c => c.orderIndex)).toEqual([2, 3]);
    expect(changed.every(c => c.volumeId === 'vol-1')).toBe(true);
  });

  it('无区间时不改挂(估算口径可能改变历史章归属,保持不动由建章时决定)', () => {
    const volumes = makeVolumes(2);
    const chapters = [makeChapter(0, 'vol-0'), makeChapter(1, 'vol-0')];
    // 40章/卷估算下前2章仍在卷1 → 无变化
    const changed = reassignChapterVolumes(chapters, {
      volumes,
      volumePlans: [],
      estimatedChaptersPerVolume: 40,
    });
    expect(changed).toHaveLength(0);
  });
});
