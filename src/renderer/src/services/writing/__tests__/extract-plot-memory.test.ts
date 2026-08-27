/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  extractChapterMemory,
  safeExtractChapterMemory,
  buildCharacterStateTable,
  buildPlotProgressTable,
  extractCriticalStatusChanges,
  collectCharacterFates,
  collectFateForbiddenZones,
  overlayCharacterFates,
  mergeCharacterStateChanges,
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

// ---------- 命运级状态提取（死亡/驾崩/下狱/定罪/官职） ----------
// 500 章实测：滑动窗口状态摘要完全丢掉命运事件，已死角色大面积复活。
// 这里锁定规则提取的召回与关键误报形态。

describe('extractCriticalStatusChanges', () => {
  it('提取主语式死亡与鸩杀', () => {
    const changes = extractCriticalStatusChanges('酒过三巡，周茂气绝身亡，倒在案前。');
    const zhou = changes.find(c => c.characterName === '周茂' && c.state === '死亡');
    expect(zhou).toBeDefined();
    expect(zhou?.detail).toContain('周茂');
  });

  it('提取逆序式（被杀/处死+人名）', () => {
    const changes = extractCriticalStatusChanges('三皇子败露，圣旨当夜将其处死，沈文渊被鸩杀灭口。');
    expect(changes.some(c => c.state === '死亡')).toBe(true);
  });

  it('提取驾崩/下狱/定罪/官职', () => {
    const text = [
      '崇仁帝驾崩，丧钟响彻宫城。',
      '齐王被押入宗人府，沦为阶下囚。',
      '户部侍郎被判斩立决。',
      '裴修远升任户部尚书，统领天下钱粮。',
    ].join('');
    const changes = extractCriticalStatusChanges(text);
    const states = new Set(changes.map(c => c.state));
    expect(states.has('驾崩')).toBe(true);
    expect(states.has('下狱')).toBe(true);
    expect(states.has('定罪')).toBe(true);
    expect(states.has('官职变更')).toBe(true);
  });

  it('悬赏/假设语境不产生死亡状态', () => {
    const changes = extractCriticalStatusChanges('「斩杀裴修远者，赏银万两！」叛军头目嘶吼。');
    expect(changes.some(c => c.characterName === '裴修远' && c.state === '死亡')).toBe(false);
  });

  it('传入角色白名单时只保留名单内命中，过滤谓语前缀噪声', () => {
    const text = '昏暗的死牢重新陷入一片死寂，只有墙角渗水滴落。赵德禄被押入死牢，跪地求饶。';
    // 有白名单：只认名单内的赵德禄，其余前缀噪声全部被滤掉
    const filtered = extractCriticalStatusChanges(text, ['赵德禄', '沈淮']);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(c => ['赵德禄', '沈淮'].includes(c.characterName))).toBe(true);
  });

  it('处决完成体：主语与斩立决/头颅滚落隔十余字也登记死亡（100章矩阵第60章受害样本）', () => {
    const text =
      '"两淮盐运使严世宽，勾结奸商，吞没国家正税七百万两！按大齐律，着即斩立决！"' +
      '刀光凌空划过一道刺目的匹练，严世宽等十余名贪官的头颅骨碌碌滚落高台。';
    const changes = extractCriticalStatusChanges(text, ['严世宽', '沈淮安']);
    const dead = changes.find(c => c.characterName === '严世宽' && c.state === '死亡');
    expect(dead).toBeDefined();
    expect(dead?.detail).toContain('头颅');
  });

  it('圣旨表彰句「斩杀巨贪严世宽」剥称号前缀后命中白名单', () => {
    const text = '御史沈淮安忠勇无双，斩杀巨贪严世宽，护国本于危难，功莫大焉。';
    const changes = extractCriticalStatusChanges(text, ['严世宽', '沈淮安']);
    expect(changes.some(c => c.characterName === '严世宽' && c.state === '死亡')).toBe(true);
  });

  it('幸免于斩立决的改判句不登记死亡', () => {
    const text = '大理寺卿当堂求情，崔晋幸免于斩立决，改判流放三千里。';
    const changes = extractCriticalStatusChanges(text, ['崔晋']);
    expect(changes.some(c => c.characterName === '崔晋' && c.state === '死亡')).toBe(false);
  });

  it('mergeCharacterStateChanges 同角色同状态去重且保持首条优先', () => {
    const merged = mergeCharacterStateChanges([
      { characterName: '严世宽', stateType: 'status', state: '死亡', detail: 'AI提取' },
      { characterName: '严世宽', stateType: 'status', state: '死亡', detail: '规则补扫' },
      { characterName: '钱万乘', stateType: 'status', state: '下狱', detail: '锁拿归案' },
    ]);
    expect(merged.filter(c => c.characterName === '严世宽').length).toBe(1);
    expect(merged.length).toBe(2);
  });
});

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
