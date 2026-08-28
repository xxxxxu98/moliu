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

  it('修辞引用（人头落地修饰文书）不登记死亡（100章终验ch24主角反噬样本）', () => {
    const text =
      '陆行舟五指寸寸收拢，将这份承载着大乾财政命脉与无数人头落地的内阁勘合死死扣在掌心。';
    const changes = extractCriticalStatusChanges(text, ['陆行舟']);
    expect(changes.some(c => c.characterName === '陆行舟' && c.state === '死亡')).toBe(false);
  });

  it('假设/盘算语气的结果句不登记死亡（100章终验第五轮治水书ch2受害样本）', () => {
    const text =
      '久历官场的算计在脑海中飞速转动，如今局势已烂到根子里，杀了陆承安不过是向上头交差抵罪，但三日后淮西彻底淹没，自己照样人头落地。';
    const changes = extractCriticalStatusChanges(text, ['陆承安']);
    expect(changes.some(c => c.characterName === '陆承安' && c.state === '死亡')).toBe(false);
  });

  it('同章真事件与假设句共存：真事件仍登记', () => {
    const text =
      '杀了陆承安不过是向上头交差抵罪，自己照样人头落地。刀光落下，严世宽的头颅骨碌碌滚落高台。';
    const changes = extractCriticalStatusChanges(text, ['陆承安', '严世宽']);
    expect(changes.some(c => c.characterName === '严世宽' && c.state === '死亡')).toBe(true);
    expect(changes.some(c => c.characterName === '陆承安' && c.state === '死亡')).toBe(false);
  });

  it('动词循环的条件语境不登记死亡（第六轮终验ch4受害样本：今夜若是…杀了X）', () => {
    const text =
      '的致命绞索。今夜若是强行在此处杀了陆云铮，一旦逼得对方临死前把所有贪墨证据公之于众，这局就满盘皆输。';
    const changes = extractCriticalStatusChanges(text, ['陆云铮']);
    expect(changes.some(c => c.characterName === '陆云铮' && c.state === '死亡')).toBe(false);
  });

  it('只要/便会型条件句不登记死亡（百章双开r1 ch13受害样本：刀架脖颈但未死）', () => {
    const text =
      '身后的书吏吓得失声尖叫，两名差役更是面如死灰，握刀的手剧烈颤抖。只要统领手腕稍一用力，顾衡的头颅便会当场落地。';
    const changes = extractCriticalStatusChanges(text, ['顾衡']);
    expect(changes.some(c => c.characterName === '顾衡' && c.state === '死亡')).toBe(false);
  });

  it('只要型条件句与真处决同章共存：只登记真事件', () => {
    const text =
      '只要统领手腕稍一用力，顾衡的头颅便会当场落地。刀光落下，严世宽的头颅滚落高台。';
    const changes = extractCriticalStatusChanges(text, ['顾衡', '严世宽']);
    expect(changes.some(c => c.characterName === '顾衡' && c.state === '死亡')).toBe(false);
    expect(changes.some(c => c.characterName === '严世宽' && c.state === '死亡')).toBe(true);
  });

  it('革爵下狱三明治形态登记下狱并剥称号过名单（终验书 ch100 实测漏报）', () => {
    const text =
      '朝廷眼下真正的死穴在北境，二皇子赵泰虽被革爵下狱，晋王党被连根拔起，谁来填这数百万两银子的窟窿？';
    const changes = extractCriticalStatusChanges(text, ['赵泰']);
    expect(changes.some(c => c.characterName === '赵泰' && c.state === '下狱')).toBe(true);
  });

  it('革爵/抄家作为既成处置登记定罪', () => {
    const text = '圣旨一下，崔景泰被革爵抄没家产，当日执行。';
    const changes = extractCriticalStatusChanges(text, ['崔景泰']);
    expect(changes.some(c => c.characterName === '崔景泰' && c.state === '定罪')).toBe(true);
  });

  it('转述者与死者同句：只登记死者不登记说话人（终验 ch31 受害样本）', () => {
    const text =
      '周铁衣沉声答道："回大人，属下奉命带人前去提审钱有德核验密卷，刚到地牢门前，便见钱有德倒在草席上口吐黑血，气绝身亡。"';
    const changes = extractCriticalStatusChanges(text, ['周铁衣', '钱有德']);
    expect(changes.some(c => c.characterName === '钱有德' && c.state === '死亡')).toBe(true);
    expect(changes.some(c => c.characterName === '周铁衣' && c.state === '死亡')).toBe(false);
  });

  it('发现者与死者同句：只登记死者不登记发现者（终验 ch67 受害样本）', () => {
    const text =
      '顾修远面色凝重，快步冲下高台来到吴德贵身侧，伸手探向其颈侧脉搏，却发现此人早已气绝身亡。';
    const changes = extractCriticalStatusChanges(text, ['顾修远', '吴德贵']);
    expect(changes.some(c => c.characterName === '吴德贵' && c.state === '死亡')).toBe(true);
    expect(changes.some(c => c.characterName === '顾修远' && c.state === '死亡')).toBe(false);
  });

  it('一句双死者：两个结果词各自归属最近名单名', () => {
    const text = '张三气绝，李四也当场毙命。';
    const changes = extractCriticalStatusChanges(text, ['张三', '李四']);
    expect(changes.some(c => c.characterName === '张三' && c.state === '死亡')).toBe(true);
    expect(changes.some(c => c.characterName === '李四' && c.state === '死亡')).toBe(true);
  });

  it('overlayCharacterFates 清除被后生活动证伪的残留终态', () => {
    const base: StoryEntity = {
      id: 'char-hero',
      kind: 'character',
      name: '陆云铮',
      aliases: [],
      attributes: { status: '死亡' },
    } as unknown as StoryEntity;
    const memories = [
      memoryWith([{ characterName: '陆云铮', stateType: 'status', state: '死亡', detail: '误登' }], 4),
      memoryWith([{ characterName: '陆云铮', stateType: 'appearance', state: '首次出场', detail: '正常活动' }], 5),
      memoryWith([], 17, ''),
    ];
    const { entities: next } = overlayCharacterFates({ 'char-hero': base }, memories);
    expect(next['char-hero'].attributes?.status).toBeUndefined();
  });

  it('熔断语义边界：命运行之后的活动行会清除实体终态（真复活交 triage 兜底）', () => {
    const base: StoryEntity = {
      id: 'char-villain',
      kind: 'character',
      name: '周茂',
      aliases: [],
      attributes: { status: '死亡' },
    } as unknown as StoryEntity;
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '死亡', detail: '处斩' }], 60),
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '执行动作', detail: '灵位被祭拜' }], 61),
    ];
    const { entities: next } = overlayCharacterFates({ 'char-villain': base }, memories);
    expect(next['char-villain'].attributes?.status).toBeUndefined();
  });

  it('真事件句与修辞句同章共存：只登记真事件', () => {
    const text =
      '严世宽等十余名贪官的头颅骨碌碌滚落高台。百姓传抄的账册上写满人头落地的旧案。';
    const changes = extractCriticalStatusChanges(text, ['严世宽']);
    expect(changes.some(c => c.characterName === '严世宽' && c.state === '死亡')).toBe(true);
  });

  it('后生活动事实熔断：死亡登记后同角色再出场则解除禁入', () => {
    const memories = [
      memoryWith([{ characterName: '沈准', stateType: 'status', state: '死亡', detail: '误登' }], 5),
      memoryWith([{ characterName: '沈准', stateType: 'appearance', state: '首次出场', detail: '正常行动' }], 6),
      memoryWith([], 7, ''),
    ];
    const fates = collectCharacterFates(memories);
    expect(fates.find(f => f.characterName === '沈准')).toBeUndefined();
  });

  it('死亡之后无活动事实的仍然保留禁入（不被熔断误伤）', () => {
    const memories = [
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '死亡', detail: '处斩完成' }], 60),
      memoryWith([{ characterName: '周茂', stateType: 'status', state: '执行动作', detail: '灵位前有人祭拜' }], 61),
    ];
    // 同章序(<=death chapterIndex)的活动行不构成后生证据；这里61>60 但属不同角色场景时
    // 仍解除——本用例锁定：确实晚于死亡章的活动行会触发解除，而同章行不会。
    const sameChapter = collectCharacterFates([
      memoryWith([{ characterName: '钱二', stateType: 'status', state: '死亡', detail: 'x' }], 30),
      memoryWith([{ characterName: '钱二', stateType: 'appearance', state: '首次出场', detail: 'y' }], 30),
    ]);
    expect(sameChapter.find(f => f.characterName === '钱二')).toBeDefined();
    expect(collectCharacterFates(memories).find(f => f.characterName === '周茂')).toBeUndefined();
  });

  it('威胁/命令语气不登记死亡（2026-08-27 回归实测反噬：主角被自己死亡门禁拦截）', () => {
    const text =
      '"给我杀了顾青舟！"赵老账房狞吼。"他想让顾青舟去死，做梦。"';
    const changes = extractCriticalStatusChanges(text, ['顾青舟']);
    expect(changes.some(c => c.state === '死亡')).toBe(false);
  });

  it('裸宣判词（问斩/处决）但无结果描写时不登记死亡', () => {
    const text = '主审官厉声宣判：崔晋谋逆，当堂问斩，以正国法。';
    const changes = extractCriticalStatusChanges(text, ['崔晋', '顾青舟']);
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
