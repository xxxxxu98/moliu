import { describe, expect, it } from 'vitest';

import type {
  ChapterBlueprint,
  ExecutableOutline,
} from '../../types/executable-outline';
import {
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
} from '../outlineCompleteness';

function makeBlueprint(orderIndex: number): ChapterBlueprint {
  return {
    orderIndex,
    title: `第${orderIndex}章 账本里的破绽`,
    summary: `推进第${orderIndex}章事件`,
    CBN: `主角发现第${orderIndex}条异常`,
    CPNs: [`核对第${orderIndex}笔账目`],
    CEN: `主角取得第${orderIndex}条线索`,
    mustCover: [`主角当场核对第${orderIndex}笔账目`],
    forbiddenZones: [],
    hookType: 'discovery',
  };
}

function makeOutline(): ExecutableOutline {
  return {
    startupPack30: { openingHook: '账本少了一页，门外催罪声已经到了。' },
    keyCharacters: Array.from(
      { length: OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters },
      (_, index) => ({ id: `character-${index}`, name: `角色${index}` }),
    ),
    foreshadowPlan: Array.from(
      { length: OUTLINE_COMPLETENESS_POLICY.minimumForeshadows },
      (_, index) => ({ id: `foreshadow-${index}` }),
    ),
    chapterBlueprints: Array.from(
      { length: OUTLINE_COMPLETENESS_POLICY.startupChapterCount },
      (_, index) => makeBlueprint(index + 1),
    ),
  } as unknown as ExecutableOutline;
}

describe('inspectOutlineCompleteness', () => {
  it('30章、10角色、10伏笔且章节节点完整时允许应用', () => {
    const result = inspectOutlineCompleteness(makeOutline());

    expect(result.canApply).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('残缺章节、角色和伏笔同时阻断应用', () => {
    const outline = makeOutline();
    outline.chapterBlueprints = outline.chapterBlueprints?.slice(0, 15);
    outline.keyCharacters = outline.keyCharacters.slice(0, 1);
    outline.foreshadowPlan = [];

    const result = inspectOutlineCompleteness(outline);

    expect(result.canApply).toBe(false);
    expect(result.blockers.map(blocker => blocker.kind)).toEqual(
      expect.arrayContaining(['chapter-count', 'character-count', 'foreshadow-count']),
    );
  });

  it('占位标题或缺少关键节点时阻断应用', () => {
    const outline = makeOutline();
    outline.chapterBlueprints![0] = {
      ...outline.chapterBlueprints![0],
      title: '第1章',
      CPNs: [],
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.canApply).toBe(false);
    expect(result.blockers.map(blocker => blocker.kind)).toEqual(
      expect.arrayContaining(['placeholder-title', 'incomplete-blueprint']),
    );
  });

  it('开篇钩子为空时阻断应用', () => {
    const outline = makeOutline();
    outline.startupPack30.openingHook = '';

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.map(blocker => blocker.kind)).toContain('opening-hook');
  });

  it('标题、CBN、CEN 长度和 CPN 数量违反提示词契约时阻断应用', () => {
    const outline = makeOutline();
    outline.chapterBlueprints![0] = {
      ...outline.chapterBlueprints![0],
      title: '短题',
      CBN: '太短',
      CPNs: ['一', '二', '三', '四'],
      CEN: '这个章尾钩子被故意写得非常非常非常非常非常长以触发硬门禁',
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.canApply).toBe(false);
    expect(result.blockers.map(blocker => blocker.kind)).toEqual(
      expect.arrayContaining([
        'invalid-title-length',
        'invalid-hook-length',
        'invalid-cpn-count',
      ]),
    );
  });

  it('章号重复或缺号时阻断应用', () => {
    const outline = makeOutline();
    outline.chapterBlueprints![1] = {
      ...outline.chapterBlueprints![1],
      orderIndex: 1,
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.canApply).toBe(false);
    expect(result.blockers.map(blocker => blocker.kind)).toContain('invalid-chapter-order');
  });

  it('已羁押反派恢复权力行为、已结束期限重启时阻断应用', () => {
    const outline = makeOutline();
    outline.keyCharacters[1] = { ...outline.keyCharacters[1], name: '赵崇文' };
    outline.chapterBlueprints![9] = {
      ...outline.chapterBlueprints![9],
      title: '三日之期终局',
      CEN: '赵崇文被押解州府候审',
    };
    outline.chapterBlueprints![12] = {
      ...outline.chapterBlueprints![12],
      title: '三日期限已至',
      CBN: '赵崇文带着衙役堵在县衙门口',
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.canApply).toBe(false);
    expect(result.blockers.filter(blocker => blocker.kind === 'chronology-regression'))
      .toHaveLength(2);
  });

  it('不会把其他主语的行动误判为已入狱角色重新行动', () => {
    const outline = makeOutline();
    outline.keyCharacters[1] = { ...outline.keyCharacters[1], name: '孙半城' };
    outline.chapterBlueprints![9] = {
      ...outline.chapterBlueprints![9],
      CEN: '孙半城入狱，但在牢门合上前留下威胁性遗言。',
    };
    outline.chapterBlueprints![10] = {
      ...outline.chapterBlueprints![10],
      CBN: '孙半城入狱次日，州府通判的幕僚带着一纸调令闯进县衙。',
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.some(blocker => blocker.kind === 'chronology-regression')).toBe(false);
  });

  it('不会把角色谈论他人被革职误判为角色本人失去官职', () => {
    const outline = makeOutline();
    outline.keyCharacters[0] = { ...outline.keyCharacters[0], name: '沈舟' };
    outline.chapterBlueprints![2] = {
      ...outline.chapterBlueprints![2],
      mustCover: ['沈舟用“前任被革职”的反问震慑老吏。'],
    };
    outline.chapterBlueprints![9] = {
      ...outline.chapterBlueprints![9],
      CBN: '沈舟从御书房出来，召集众人拆解新的查案目标。',
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.some(blocker => blocker.kind === 'chronology-regression')).toBe(false);
  });

  it('目标字数与章数乘单章字数偏差过大时阻断应用', () => {
    const outline = makeOutline();
    outline.storyScale = {
      targetWordCount: '45万字',
      estimatedChapterCount: 180,
      averageWordsPerChapter: 3000,
      suggestedVolumeCount: 3,
      estimatedChaptersPerVolume: 60,
      startupPhaseRatio: '28%',
      longformProgressionNote: '',
    };

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.map(blocker => blocker.kind)).toContain('inconsistent-story-scale');
  });

  it('支线与伏笔章节超出全书总章数时阻断应用', () => {
    const outline = makeOutline();
    outline.storyScale = {
      targetWordCount: '45万字',
      estimatedChapterCount: 180,
      averageWordsPerChapter: 2500,
      suggestedVolumeCount: 3,
      estimatedChaptersPerVolume: 60,
      startupPhaseRatio: '28%',
      longformProgressionNote: '',
    };
    outline.subplots = [{
      title: '旧案线',
      functionInStory: '推动主线',
      relatedCharacters: [],
      startChapter: 20,
      endChapter: 188,
      relationToMainPlot: '提供证据',
    }];
    outline.foreshadowPlan[0] = {
      ...outline.foreshadowPlan[0],
      hint: '终局密档',
      setupChapter: 30,
      payoffChapter: 214,
    } as never;

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.filter(blocker => blocker.kind === 'chapter-reference-out-of-range'))
      .toHaveLength(2);
  });

  it('卷纲引用未登记具名角色时阻断应用', () => {
    const outline = makeOutline();
    outline.volumePlan = [{
      volumeIndex: 1,
      title: '第一卷',
      objective: '',
      coreConflict: '',
      climax: '',
      reversal: '',
      endingHook: '',
      protagonistGrowth: '',
      keyCharacters: ['郑伯昭'],
      setupForeshadows: [],
      payoffForeshadows: [],
      relationshipShifts: [],
    }];

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.map(blocker => blocker.kind)).toContain('unknown-character-reference');
  });

  it('关系短语/括号注解/职务/组织等非姓名引用不产生未登记角色 blocker', () => {
    // 2026-08-16 矩阵实测：mimo/ds-pro 大纲把关系整句写进角色字段，40+ 条此类
    // blocker 把整轮 fail-closed 且无修复通道（补登记救不了整句，重试格式惯性复现）
    const outline = makeOutline();
    outline.volumePlan = [{
      volumeIndex: 1,
      title: '第一卷',
      objective: '',
      coreConflict: '',
      climax: '',
      reversal: '',
      endingHook: '',
      protagonistGrowth: '',
      keyCharacters: ['忠诚执行者）', '韩尚书（六部尚书，务实官僚集团的代表，态度复杂）。', '临川商会会长'],
      setupForeshadows: [],
      payoffForeshadows: [],
      relationshipShifts: [],
    }];
    outline.subplots = [{
      title: '商税新政',
      description: '',
      purpose: '',
      relatedCharacters: ['府衙通判', '与通判从施政冲突，到生死博弈的对手'],
      startChapter: null,
      endChapter: null,
    }];
    outline.keyCharacters = [
      ...outline.keyCharacters,
      {
        id: 'extra-1',
        name: '林溪',
        relationshipChanges: [
          { targetName: '与皇帝从工具利用，到复杂危险的相互依存。' },
          { targetName: '顾清焉' },
        ],
      },
    ] as ExecutableOutline['keyCharacters'];

    const result = inspectOutlineCompleteness(outline);

    const unknownRefs = result.blockers.filter(
      blocker => blocker.kind === 'unknown-character-reference',
    );
    // 非姓名形态全部放行；真实姓名「顾清焉」仍应产生 blocker
    expect(unknownRefs.map(blocker => blocker.message)).toEqual([
      '角色「林溪」关系引用了未登记角色「顾清焉」；必须补入关键角色规划或改用已登记角色',
    ]);
  });

  it('阵营标签+身份泛称组合不产生未登记角色 blocker（r2 百章占位符实证）', () => {
    // 2026-08-28 r2 百章实测：「户部革新派年轻官员」被判成可建档姓名，补登记后
    // 标签词以角色名身份 9+ 处进入正文。此类功能性描述不是姓名，不应产生 blocker
    const outline = makeOutline();
    outline.volumePlan = [{
      volumeIndex: 1,
      title: '第一卷',
      objective: '',
      coreConflict: '',
      climax: '',
      reversal: '',
      endingHook: '',
      protagonistGrowth: '',
      keyCharacters: ['户部革新派年轻官员', '维新派老臣', '年轻御史'],
      setupForeshadows: [],
      payoffForeshadows: [],
      relationshipShifts: [],
    }];

    const result = inspectOutlineCompleteness(outline);

    expect(
      result.blockers.filter(blocker => blocker.kind === 'unknown-character-reference'),
    ).toEqual([]);
  });

  describe('unknown-location-reference（地名漂移门禁）', () => {
    function makeOutlineWithLocations(): ExecutableOutline {
      const outline = makeOutline();
      outline.worldBuilding = {
        locations: [
          { name: '江城市' },
          { name: '清河县' },
          { name: '汉东省' },
        ],
      } as ExecutableOutline['worldBuilding'];
      return outline;
    }

    it('卷纲引用表外行政地名（南江市）产生 blocker', () => {
      const outline = makeOutlineWithLocations();
      outline.volumePlan = [{
        volumeIndex: 3,
        title: '第三卷',
        objective: '主角在南江市揭开最终真相',
        coreConflict: '',
        climax: '',
        reversal: '',
        endingHook: '',
        protagonistGrowth: '',
        keyCharacters: [],
        setupForeshadows: [],
        payoffForeshadows: [],
        relationshipShifts: [],
      }];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.map(blocker => blocker.kind)).toContain('unknown-location-reference');
    });

    it('人名+介词的弱后缀误切（陆衡在京）不产生 blocker（2026-08-23 真实冒烟误报）', () => {
      const outline = makeOutlineWithLocations();
      outline.keyCharacters = [
        ...outline.keyCharacters,
        { id: 'lu-heng', name: '陆衡' },
      ] as ExecutableOutline['keyCharacters'];
      outline.volumePlan = [{
        volumeIndex: 3,
        title: '第三卷',
        objective: '陆衡在京统筹全局，主角在江城市配合行动',
        coreConflict: '',
        climax: '',
        reversal: '',
        endingHook: '',
        protagonistGrowth: '',
        keyCharacters: [],
        setupForeshadows: [],
        payoffForeshadows: [],
        relationshipShifts: [],
      }];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('以已登记角色名开头的候选（陆衡在济南市）不产生 blocker', () => {
      const outline = makeOutlineWithLocations();
      outline.keyCharacters = [
        ...outline.keyCharacters,
        { id: 'lu-heng', name: '陆衡' },
      ] as ExecutableOutline['keyCharacters'];
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(31),
          CBN: '陆衡在济南市发来密电，主角连夜出发',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('已登记地点的包含式引用（江城市·南郊）不产生 blocker', () => {
      const outline = makeOutlineWithLocations();
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(32),
          CBN: '江城市南郊冷库的锁被人动过',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('行政后缀是组词修饰语的动词短语（利用市级权限/比对市局台账）不产生 blocker（2026-08-25 矩阵实测）', () => {
      const outline = makeOutlineWithLocations();
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(33),
          CBN: '利用市级权限调走卷宗，比对市局台账发现两处涂改',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('动词开头的叙事短语（遭遇商帮罢市/依赖顾青舟救市/拼出跨省）不登记为地点 blocker（2026-08-27 百章书审两轮实证）', () => {
      const outline = makeOutlineWithLocations();
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(35),
          CBN: '盐商联手发动遭遇商帮罢市，官府不得不依赖顾青舟救市平息风波',
        },
        {
          ...makeBlueprint(36),
          CEN: '他从残页中拼出跨省走私的完整路线图',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('叙述概念盲区（造成的视觉盲区/市政道路盲区）不产生 blocker（2026-08-25 矩阵实测）', () => {
      const outline = makeOutlineWithLocations();
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(34),
          CBN: '凶手利用市政道路监控盲区撤离，造成了视觉盲区之外的第二现场',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('与已登记地点共享字符的动词黏连变体（东押解至青河市/梳理出老街片区）不产生 blocker（2026-08-25 矩阵实测）', () => {
      const outline = makeOutline();
      outline.worldBuilding = {
        locations: [
          { name: '青河大桥北江滩与废弃404路总站' },
          { name: '光明路派出所及老街片区' },
          { name: '青河市公安局刑侦支队指挥中心' },
        ],
      } as ExecutableOutline['worldBuilding'];
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(35),
          CBN: '嫌疑人耀东押解至青河市途中翻供，警方梳理出老街片区的新目击证词',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('真实矩阵蓝图文本回放（fair-mystery 08-25）不产生垃圾地点 blocker', () => {
      const outline = makeOutline();
      outline.worldBuilding = {
        locations: [
          { name: '青河大桥北江滩与废弃404路总站' },
          { name: '光明路派出所及老街片区' },
          { name: '青河市公安局刑侦支队指挥中心' },
        ],
      } as ExecutableOutline['worldBuilding'];
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(37),
          CBN: '陈淮当众演示高流明光影投射在老街夹角造成的视觉盲区',
          CPNs: [
            '市局技术员伸手去关录像，陈淮一把按住了暂停键',
            '陈淮梳理出老街片区避开监控的物理岔道',
            '陈淮在青河市公安局刑侦支队指挥中心推演倒车盲区打脸技术员',
          ],
          CEN: '天网抓拍图放大十倍，一辆白色货车正拐进暗巷',
          mustCover: [
            '陈淮结合公房压痕与道路盲区算出改装车间具体门牌',
            '陈淮利用路口时间戳数据推翻刑侦技术员的设备故障论',
          ],
          forbiddenZones: ['陈淮比对时间戳证实货车曾与幽灵公交同秒擦肩而过'],
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });

    it('组词过滤不影响真漂移（南江市）检出', () => {
      const outline = makeOutlineWithLocations();
      outline.chapterBlueprints = [
        ...(outline.chapterBlueprints ?? []),
        {
          ...makeBlueprint(36),
          CBN: '证据链指向南江市，主角连夜赶往南州市级党校外围蹲守',
        },
      ];

      const result = inspectOutlineCompleteness(outline);
      const locations = result.blockers.filter(b => b.kind === 'unknown-location-reference');
      expect(locations.length).toBeGreaterThan(0);
    });

    it('登记地点不足 3 个时门禁关闭（旧大纲兼容）', () => {
      const outline = makeOutline();
      outline.worldBuilding = { locations: [{ name: '江城市' }] } as ExecutableOutline['worldBuilding'];
      outline.volumePlan = [{
        volumeIndex: 1,
        title: '第一卷',
        objective: '主角在南江市调查案件',
        coreConflict: '',
        climax: '',
        reversal: '',
        endingHook: '',
        protagonistGrowth: '',
        keyCharacters: [],
        setupForeshadows: [],
        payoffForeshadows: [],
        relationshipShifts: [],
      }];

      const result = inspectOutlineCompleteness(outline);
      expect(result.blockers.filter(b => b.kind === 'unknown-location-reference')).toEqual([]);
    });
  });
});
