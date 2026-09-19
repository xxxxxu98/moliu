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
  collectCharacterTitles,
  collectCharacterIdentityAnchors,
  collectFateForbiddenZones,
  collectNumericAnchors,
  overlayCharacterFates,
  overlayCharacterTitles,
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

  it('获释 delta 到账即解除禁入（合同8解除值不再被 FATE_STATES 丢弃）', () => {
    // 2026-09-12 终验受害样本：萧元瑾 ch79 下狱、ch150 AI 已按合同出账
    // state=「获释」，消费侧曾把该 delta 当未知态丢弃 → ch175 状态摘要仍是
    // 「下狱」，获释后监国剧情被三连拒成洞。
    const memories = [
      memoryWith([{ characterName: '萧元瑾', stateType: 'status', state: '下狱', detail: '不许踏出冷宫半步' }], 78),
      memoryWith([{ characterName: '萧元瑾', stateType: 'status', state: '获释', detail: '奉明旨卸去锁铐获释出狱' }], 149),
      memoryWith([], 160, '萧元瑾监国听政，新政推行。'),
    ];
    const fates = collectCharacterFates(memories);
    expect(fates.some(f => f.characterName === '萧元瑾')).toBe(false);
  });

  it('解除后再入终态自然重登禁入（越狱→再下狱）', () => {
    const memories = [
      memoryWith([{ characterName: '顾明章', stateType: 'status', state: '下狱', detail: '押入天牢' }], 126),
      memoryWith([{ characterName: '顾明章', stateType: 'status', state: '越狱', detail: '撬开天牢铁锁脱逃' }], 165),
      memoryWith([{ characterName: '顾明章', stateType: 'status', state: '下狱', detail: '监国明旨再押天牢' }], 166),
    ];
    const fates = collectCharacterFates(memories);
    const fate = fates.find(f => f.characterName === '顾明章');
    expect(fate?.state).toBe('下狱');
    expect(fate?.chapterIndex).toBe(166);
  });

  // ---------- 死亡族终态保护（2026-09-12 g38f 200 章 S1 实锤） ----------
  // 严开礼 ch179 撞柱气绝入账死亡，ch186 写手按过期滚纲节点写其越狱复活，
  // ch196「下狱」delta 顶掉死亡——命运表/禁入/裁决全部读到「下狱」，
  // 真复活信号被静默洗白。死亡不可逆：轻态覆盖、解除 delta、解除词共现三路全封。

  it('死亡终态不被后续下狱覆盖（死人不能再入狱，覆盖即复活信号）', () => {
    const memories = [
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '死亡', detail: '撞柱气绝，彻底断了生机' }], 178),
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '越狱', detail: '重囚牢里跑了' }], 186),
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '下狱', detail: '打入北镇抚司死牢' }], 195),
    ];
    const fates = collectCharacterFates(memories);
    const fate = fates.find(f => f.characterName === '严开礼');
    expect(fate?.state).toBe('死亡');
    expect(fate?.chapterIndex).toBe(178);
  });

  it('死亡终态不被获释/赦免 delta 解除（死人不能被释放）', () => {
    const memories = [
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '死亡', detail: '撞柱气绝' }], 178),
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '获释', detail: '奉旨出狱' }], 186),
    ];
    const fates = collectCharacterFates(memories);
    expect(fates.some(f => f.characterName === '严开礼' && f.state === '死亡')).toBe(true);
  });

  it('死亡终态不被解除词共现擦除（翻案词与死者同章共现不救死亡）', () => {
    const memories = [
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '死亡', detail: '撞柱气绝' }], 178),
      memoryWith([], 190, '百官议论严开礼旧案，有人主张为其翻案平反昭雪。'),
    ];
    const fates = collectCharacterFates(memories);
    expect(fates.some(f => f.characterName === '严开礼' && f.state === '死亡')).toBe(true);
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

  it('命运表死亡顶掉实体残留轻态（保守跳过对死亡族失效）', () => {
    // 2026-09-12 g38f 200 章 S1 受害样本：严开礼 runtime 残留「下狱」，
    // ch179 死亡入账后被保守跳过，判官全程读不到死亡，ch186 复活越狱一次过审
    const base = entityOf('char-yan', '严开礼');
    base.attributes = { status: '下狱' };
    const memories = [
      memoryWith([{ characterName: '严开礼', stateType: 'status', state: '死亡', detail: '撞柱气绝，彻底断了生机' }], 178),
    ];
    const { entities: next, applied } = overlayCharacterFates({ 'char-yan': base }, memories);
    expect(applied).toBe(1);
    expect(next['char-yan'].attributes.status).toBe('死亡');
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

describe('头衔锚（契约 14：collectCharacterTitles / overlayCharacterTitles）', () => {
  // 2026-09-15 g38f 200 章全文通读实证：主角官职五重漂移（参议→右通政→署理通政使→
  // 参议回摆→大学士→再自称参议），拜相爽点被 ch200 重复兑现——长程无头衔锚所致
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

  it('每角色取最新头衔入账（升迁链后值覆盖前值）', () => {
    const memories = [
      memoryWith(
        [{ characterName: '陆承渊', stateType: 'status', state: '头衔:通政司参议·正五品', detail: '圣旨' }],
        25,
      ),
      memoryWith(
        [{ characterName: '陆承渊', stateType: 'status', state: '头衔:文渊阁大学士·正二品', detail: '拜相' }],
        179,
      ),
    ];
    const titles = collectCharacterTitles(memories);
    expect(titles).toEqual([
      { characterName: '陆承渊', title: '文渊阁大学士·正二品' },
    ]);
  });

  it('命运族条目不进头衔锚，头衔条目不进命运表（两账互不污染）', () => {
    const memories = [
      memoryWith(
        [
          { characterName: '何文渊', stateType: 'status', state: '死亡', detail: '伏诛' },
          { characterName: '陆承渊', stateType: 'status', state: '头衔:钦差巡按·正四品', detail: '旨授' },
        ],
        66,
      ),
    ];
    expect(collectCharacterTitles(memories).map(item => item.characterName)).toEqual(['陆承渊']);
    expect(collectCharacterFates(memories).map(item => item.characterName)).toEqual(['何文渊']);
  });

  it('overlayCharacterTitles 把最新头衔写进 entities.attributes.title（别名命中）', () => {
    const entities: Record<string, StoryEntity> = {
      'char-lu': entityOf('char-lu', '陆承渊', ['陆大人']),
    };
    const memories = [
      memoryWith(
        [{ characterName: '陆大人', stateType: 'status', state: '头衔:佥都御史·正四品', detail: '旨授' }],
        138,
      ),
    ];
    const { entities: next, applied } = overlayCharacterTitles(entities, memories);
    expect(applied).toBe(1);
    expect(next['char-lu'].attributes.title).toBe('佥都御史·正四品');
    // 已同值时幂等不重写
    const again = overlayCharacterTitles(next, memories);
    expect(again.applied).toBe(0);
  });

  it('无头衔账时零写入（applied=0，实体原样保留）', () => {
    const entities: Record<string, StoryEntity> = {
      'char-lu': entityOf('char-lu', '陆承渊'),
    };
    const memories = [
      memoryWith([{ characterName: '陆承渊', stateType: 'status', state: '下狱', detail: 'x' }], 10),
    ];
    const result = overlayCharacterTitles(entities, memories);
    expect(result.applied).toBe(0);
    expect(result.entities['char-lu'].attributes.title).toBeUndefined();
  });
});

describe('数字锚（collectNumericAnchors，g38f r6 长程数字漂移实证）', () => {
  it('从近章 keyEvents/corePlot 抽「数字+单位」既成句，最近章优先，非数字句不进锚', () => {
    const memories = [
      memoryWith([], 98, '钱粮清点告一段落。'),
      memoryWith([], 99, '两淮盐税岁入实征二百二十万两。'),
      memoryWith([], 100, '押运车队共八十辆马车、每车一箱底册。'),
    ];
    // memoryWith 的 keyEvents 为空——直接在 corePlot 外再塞 keyEvents 需要构造完整对象，
    // 这里用 corePlot 覆盖核心行为；keyEvents 路径与 corePlot 同一循环
    const anchors = collectNumericAnchors(memories, 8);
    expect(anchors.some(a => a.includes('二百二十万两'))).toBe(true);
    expect(anchors.some(a => a.includes('八十辆'))).toBe(true);
    // memoryWith 的第二参是 0-based chapterIndex：99 → 前缀「第100章既成」
    expect(anchors.some(a => a.includes('第100章既成「两淮盐税'))).toBe(true);
    // 无数字句的章不产生锚
    expect(anchors.some(a => a.includes('钱粮清点'))).toBe(false);
  });

  it('上限 maxAnchors 生效且重复句去重', () => {
    const m = memoryWith([], 50, '库银共计白银三百万两。余粮仅四万石。兵额八千人。盐引二十万道。');
    const anchors = collectNumericAnchors([m, m], 2);
    expect(anchors).toHaveLength(2);
  });
});

describe('身份锚（collectCharacterIdentityAnchors，g38f r6 赵宣两身份实证）', () => {
  it('取 allowed 出场角色的角色卡身份首句，非出场角色不入锚', () => {
    const characters = [
      { name: '沈辞', description: '穿越者，户部度支司官员，用现代审计清算朝堂。后续升迁。' },
      { name: '赵宣', description: '前中期夺嫡争斗策动者，操控江南织造与两淮盐税两大聚宝盆，是沈辞东南推行审计的最大政治死敌。' },
      { name: '陆修远', description: '户部尚书，主角的上司。' },
    ];
    const anchors = collectCharacterIdentityAnchors(characters, ['沈辞', '赵宣']);
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toEqual({ name: '沈辞', identity: '穿越者，户部度支司官员，用现代审计清算朝堂' });
    expect(anchors[1].name).toBe('赵宣');
    expect(anchors[1].identity).toContain('夺嫡争斗策动者');
    // 陆修远不在 allowed 名单，不入锚
    expect(anchors.some(a => a.name === '陆修远')).toBe(false);
  });

  it('无 description 的角色跳过，空名单返回空数组', () => {
    expect(collectCharacterIdentityAnchors([{ name: '甲' }], ['甲'])).toEqual([]);
    expect(collectCharacterIdentityAnchors([{ name: '甲', description: '反派。' }], [])).toEqual([]);
  });
});
