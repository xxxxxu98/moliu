/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  extractChapterMemory,
  safeExtractChapterMemory,
  buildCharacterStateTable,
  buildPlotProgressTable,
  collectCharacterFates,
  collectFateForbiddenZones,
  overlayCharacterFates,
  mergeKeyEvents,
} from '../extract-plot-memory';
import type { Chapter, ChapterMemory } from '@/types/project';
import type { StoryEntity } from '@/types/story-runtime';

function createMockChapter(overrides?: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    volumeId: 'vol-1',
    title: '第一章：开始',
    content: '张三走进长安城，他是一个勇敢的修士。',
    wordCount: 30,
    orderIndex: 0,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Chapter;
}

describe('extractChapterMemory', () => {
  it('should extract memory from chapter content', async () => {
    const chapter = createMockChapter({
      content: '张三走进长安城，他是一个勇敢的修士。',
    });

    const result = await extractChapterMemory(chapter, 0, {
      enableAIEnhancement: false,
      enableFileBackup: false,
    });

    expect(result).toBeDefined();
    expect(result.chapterId).toBe(chapter.id);
    expect(result.chapterIndex).toBe(0);
  });

  // 2026-09-06 g38f-200chr2 实证退役：动作动词前缀扒名把「沈怀安快步」「沈怀安
  // 反手」等动宾粘连串当角色名入账，主角在第 55/61/101 章被重复登记「首次出场」，
  // 「执行动作」条目持续污染状态摘要。规则层出场/动作提取整体停用——语义归 AI
  // 提取合同（FactExtractor 契约 7-13）。
  it('角色状态变更规则提取已退役：不再产出「首次出场/执行动作」类条目', async () => {
    const chapter = createMockChapter({
      content: '沈怀安快步走到公堂，抬头看向匾额。他转身吩咐差役，随后走进偏厅。',
    });

    const result = await extractChapterMemory(chapter, 54, {
      enableAIEnhancement: false,
      enableFileBackup: false,
    });

    expect(result.characterStateChanges).toEqual([]);
  });

  it('should handle empty content gracefully', async () => {
    const chapter = createMockChapter({
      content: '',
    });
    
    const result = await extractChapterMemory(chapter, 0, {
      enableAIEnhancement: false,
      enableFileBackup: false,
    });
    
    expect(result).toBeDefined();
    expect(result.corePlot).toBeDefined();
  });
});

describe('safeExtractChapterMemory', () => {
  it('should extract memory successfully', async () => {
    const chapter = createMockChapter({
      content: '张三在长安城修炼。',
    });
    
    const result = await safeExtractChapterMemory(chapter, 0, {
      enableAIEnhancement: false,
      enableFileBackup: false,
    });
    
    expect(result).toBeDefined();
    expect(result.chapterId).toBe(chapter.id);
  });
});

describe('buildCharacterStateTable', () => {
  it('should build character state table from memories', () => {
    const memories: ChapterMemory[] = [
      {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        chapterIndex: 0,
        corePlot: 'Test',
        keyEvents: [],
        locations: [],
        characterStateChanges: [
          { characterName: '张三', stateType: 'ability', state: '筑基二层', detail: '突破到筑基二层' },
        ],
        revealedForeshadows: [],
        newForeshadows: [],
        wordCount: 100,
        createdAt: new Date().toISOString(),
      },
    ];
    
    const result = buildCharacterStateTable(memories);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('张三');
  });

  it('should handle empty memories', () => {
    const result = buildCharacterStateTable([]);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

describe('buildPlotProgressTable', () => {
  it('should build plot progress table from memories', () => {
    const memories: ChapterMemory[] = [
      {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        chapterIndex: 0,
        corePlot: 'Test plot',
        keyEvents: ['Event 1', 'Event 2'],
        locations: [],
        characterStateChanges: [],
        revealedForeshadows: [],
        newForeshadows: ['Foreshadow 1'],
        wordCount: 100,
        createdAt: new Date().toISOString(),
      },
    ];
    
    const result = buildPlotProgressTable(memories);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('Chapter');
  });

  it('should handle empty memories', () => {
    const result = buildPlotProgressTable([]);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

// ---------- 去职/受难入牢命运提取（2026-09-01 B 书 200 章书审实锤） ----------
// B 书反派被削爵/停职后仍连续多章当朝履职：禁入名单无去职态可依、
// 进牢形态漏检、后生活动熔断反向洗掉真实命运，三因叠加致重置矛盾零检出。


function memoryWith(changes: ChapterMemory['characterStateChanges'], index: number, corePlot = ''): ChapterMemory {
  return {
    chapterId: `ch-${index}`,
    chapterTitle: `第${index + 1}章`,
    chapterIndex: index,
    corePlot: corePlot || `第${index + 1}章剧情`,
    keyEvents: [],
    locations: [],
    characterStateChanges: changes,
    revealedForeshadows: [],
    newForeshadows: [],
    wordCount: 3000,
    createdAt: new Date().toISOString(),
  };
}

describe('collectCharacterFates / collectFateForbiddenZones', () => {
  it('死亡事件跨百章后仍保留在命运表，并生成禁入条目', () => {
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '下狱', detail: '圣旨定罪' }], 58),
      ...Array.from({ length: 300 }, (_, i) => memoryWith([], 59 + i)),
    ];
    const fates = collectCharacterFates(memories);
    expect(fates.some(f => f.characterName === '周茂' && f.state === '下狱')).toBe(true);

    const zones = collectFateForbiddenZones(memories, ['裴修远', '周茂', '沈宛君']);
    const zone = zones.find(z => z.includes('周茂'));
    expect(zone).toBeDefined();
    expect(zone).toContain('第59章');
    expect(zone).toContain('下狱');
    // 白名单外的名字不生成禁入（规则提取的非人名命中被过滤）
    expect(zones.every(z => !z.includes('当场'))).toBe(true);
  });

  it('后续平反/赦免会解除命运禁入', () => {
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '下狱', detail: '定罪' }], 58),
      memoryWith([{ characterName: '齐王', stateType: 'status', state: '下狱', detail: '圈禁' }], 58),
      memoryWith([], 90, '新皇登基大赦天下，周茂冤案平反昭雪，官复原职。'),
    ];
    const zones = collectFateForbiddenZones(memories, ['周茂', '齐王']);
    expect(zones.some(z => z.includes('周茂'))).toBe(false);
    expect(zones.some(z => z.includes('齐王'))).toBe(true);
  });
});

describe('overlayCharacterFates（runtime 实体命运状态接线）', () => {
  function entityOf(id: string, name: string, aliases: string[] = []): StoryEntity {
    return {
      id,
      kind: 'character',
      name,
      aliases,
      attributes: {},
      knownBy: [id],
      sourceTrace: [],
    };
  }

  it('命运终态映射到实体 attributes.status，别名命中同一实体', () => {
    const entities: Record<string, StoryEntity> = {
      'char-zhou': entityOf('char-zhou', '周茂', ['周大人']),
      'char-hero': entityOf('char-hero', '裴修远'),
      'char-item': { ...entityOf('char-item', '传国玉玺'), kind: 'item' },
    };
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '下狱', detail: '圣旨定罪' }], 58),
    ];
    const { entities: next, applied } = overlayCharacterFates(entities, memories);
    expect(applied).toBe(1);
    expect(next['char-zhou'].attributes.status).toBe('下狱');
    // 未命中的实体不被改动；非 character 不参与
    expect(next['char-hero'].attributes.status).toBeUndefined();
    expect(next['char-item'].attributes.status).toBeUndefined();
  });

  it('平反后不再写 status（解除检测复用 collectCharacterFates）', () => {
    const entities: Record<string, StoryEntity> = {
      'char-zhou': entityOf('char-zhou', '周茂'),
    };
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '下狱', detail: '定罪' }], 58),
      memoryWith([], 90, '新皇登基大赦天下，周茂冤案平反昭雪。'),
    ];
    const { applied } = overlayCharacterFates(entities, memories);
    expect(applied).toBe(0);
  });

  it('已有不同显式终态时保守跳过，不互相覆盖', () => {
    const base = entityOf('char-zhou', '周茂');
    base.attributes = { status: '死亡' };
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '下狱', detail: '定罪' }], 58),
    ];
    const { entities: next, applied } = overlayCharacterFates({ 'char-zhou': base }, memories);
    expect(applied).toBe(0);
    expect(next['char-zhou'].attributes.status).toBe('死亡');
  });
});

describe('mergeKeyEvents（keyEvents 真源合并）', () => {
  // 2026-09-04：规则层 keyEvents 正则 25-43% 章节空转占位符，AI 事件摘要成为真源
  it('AI 条目在前、规则层补漏；占位符被清除；超集句去重', () => {
    const merged = mergeKeyEvents(
      ['沈准用借贷平衡表当堂揭穿伪证', '三法司驾帖护人出狱'],
      ['（本章无明显关键事件）', '沈准用借贷平衡表当堂揭穿伪证并定案'],
    );
    expect(merged[0]).toBe('沈准用借贷平衡表当堂揭穿伪证');
    expect(merged.some(item => item.includes('无明显关键事件'))).toBe(false);
    // 规则层的超集句（包含 AI 短句）被去重，只留两条独立事件
    expect(merged).toHaveLength(2);
  });

  it('AI 为空时保留规则层非占位条目；双方全空返回空数组', () => {
    expect(mergeKeyEvents([], ['王成栋下令封仓。'])).toEqual(['王成栋下令封仓。']);
    expect(mergeKeyEvents([], ['（本章无明显关键事件）'])).toEqual([]);
    expect(mergeKeyEvents([], [])).toEqual([]);
  });

  it('上限 8 条，超出截断', () => {
    const many = Array.from({ length: 12 }, (_, i) => `第${i + 1}件独立事件发生了`);
    expect(mergeKeyEvents(many, [])).toHaveLength(8);
  });
});
