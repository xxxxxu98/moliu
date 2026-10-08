/**
 * outline-reviewer 单测
 *
 * 覆盖：
 * - inspectOutlineQuality：占位事件 / 模板话术 / 禁区全块复制 / 卷卖点未覆盖 / 区间断档 / 括号未配对 六类质检
 * - parseChapterRange：区间解析
 * （「审查+修正」整份重写请求已由大纲 agent 回合取代，见 agent/__tests__/OutlineAgent.test.ts）
 */
import { describe, expect, it } from 'vitest';

import type { ExecutableOutline } from '../../types/executable-outline';

import { inspectOutlineQuality, parseChapterRange } from '../outline-reviewer';

function makeBlock(overrides: Record<string, unknown> = {}) {
  return {
    range: '1-5章',
    objective: '炼药入门',
    mustEvents: ['觉醒异火'],
    coolPoints: ['炼丹惊全场'],
    hookRequirement: '药老现身',
    pacing: 'fast',
    readerExpectation: '爽',
    ...overrides,
  };
}

describe('书名意象覆盖（title-imagery-missing，2026-10-05 都市文书审实证）', () => {
  it('书名核心意象在蓝图/卖点/金手指全文零出现时报 issue（巨龙/泰坦零出现形态）', () => {
    const outline = {
      ...makeDirtyOutline(),
      title: '全校都在契约巨龙，我的毒蜂蜇爆了泰坦',
    };
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'title-imagery-missing');
    // 契约巨龙/毒蜂/泰坦 全部零覆盖 → 三条（或至少命中巨龙/泰坦两条核心）
    expect(issues.some(i => i.detail.includes('泰坦'))).toBe(true);
    expect(issues.some(i => i.detail.includes('毒蜂'))).toBe(true);
    expect(issues[0].detail).toContain('标题对读者的承诺');
  });

  it('意象在 oneLiner/premise/蓝图中出现（含 2 字滑窗弱命中）不报', () => {
    const outline = {
      ...makeDirtyOutline(),
      title: '全校都在契约巨龙，我的毒蜂蜇爆了泰坦',
      oneLiner: '御兽世界里人人契约巨龙，主角的毒蜂一针刺穿泰坦级巨兽',
    };
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'title-imagery-missing');
    expect(issues).toHaveLength(0);
  });
});

/** 劣化大纲：五类问题全占 */
function makeDirtyOutline(): ExecutableOutline {
  return {
    title: '测试方案',
    oneLiner: '卖点',
    premise: '前提',
    positioning: {
      targetReaders: [],
      coreEmotions: [],
      sellingPoints: [],
      styleKeywords: [],
    },
    storyScale: {
      targetWordCount: '100万字',
      estimatedChapterCount: 400,
      averageWordsPerChapter: 2500,
      suggestedVolumeCount: 6,
      estimatedChaptersPerVolume: 67,
      startupPhaseRatio: '8%',
      longformProgressionNote: '',
    },
    storyEngine: {
      protagonistName: '主角',
      protagonistStart: '',
      protagonistGoalLongTerm: '',
      protagonistGoalShortTerm: '',
      coreConflict: '',
      escalationPath: [],
      failureCost: '',
    },
    keyCharacters: [
      {
        name: '药尘',
        role: 'antagonist' as const,
        functionInStory: '制造冲突',
        keyNeed: '夺宝',
        tensionWithProtagonist: '争夺异火',
        revealTiming: '第1卷',
        publicGoal: '炼丹',
        hiddenNeed: '长生',
        fearOrWound: '旧伤',
        secret: '真实身份',
        turningPoint: ' exposed',
        arcStart: '隐世',
        arcMid: '现世',
        arcEnd: '陨落',
        resources: ['丹炉'],
        relationshipChanges: [],
      },
    ],
    volumePlan: [
      {
        volumeIndex: 1,
        title: '第1卷',
        objective: '完成校园鬼域闭环',
        coreConflict: '',
        // climax 点名「药尘」（keyCharacters 里的对手角色），dirty 夹具的启动包
        // 全程不提这个名字 → 关键角色零登场，触发 missing-selling-point
        climax: '药尘当众厉鬼群自动让开一条路',
        reversal: '',
        endingHook: '',
        protagonistGrowth: '',
        keyCharacters: [],
        setupForeshadows: [],
        payoffForeshadows: [],
        relationshipShifts: [],
      },
    ],
    startupPack30: {
      openingHook: '主角在教室醒来',
      promiseToReader: '',
      protagonistFirstImpression: '',
      firstMajorCoolPoint: '',
      firstConflictCycle: '',
      chapterBlocks: [
        // 块1：占位事件 + 模板话术 + 禁区（与后两块相同 → 全章复制）
        makeBlock({
          mustEvents: ['推进主线'],
          hookRequirement: '承接上章结尾：药老现身',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        }),
        // 块2：区间断档（6-10 之后跳 11）+ 禁区与前块相同
        makeBlock({
          range: '11-15章',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        }),
        // 块3：禁区与前两块相同（三连 → 全章复制），卖点仍未出现
        makeBlock({
          range: '16-20章',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        }),
      ],
    },
    foreshadowPlan: [],
  } as ExecutableOutline;
}

/** 干净大纲：五类问题全无 */
function makeCleanOutline(): ExecutableOutline {
  const outline = makeDirtyOutline();
  // 书名意象与正文对齐（title-imagery-missing 检查）：「炼药」在块目标中出现
  outline.title = '炼药逆袭';
  // climax 点名的「药尘」必须在启动包登场（回响语义：块3 coolPoints 让他提前现身）
  outline.volumePlan[0].climax = '药尘当众厉鬼群自动让开一条路';
  outline.startupPack30.chapterBlocks = [
    makeBlock({
      objective: '完成校园鬼域闭环',
      mustEvents: ['主角在教室醒来'],
      hookRequirement: '药老现身',
    }),
    makeBlock({
      range: '6-10章',
      mustEvents: ['发现尸体异常'],
      hookRequirement: '内院名额揭晓',
      forbiddenZones: ['不能解释灵异源头'],
    }),
    makeBlock({
      range: '11-15章',
      mustEvents: ['厉鬼群自动让开一条路'],
      coolPoints: ['药尘现世，厉鬼群自动让开一条路'],
      forbiddenZones: ['不能让药老提前暴露真实身份'],
    }),
  ];
  return outline;
}

function makeStructurallyCompleteOutline(): ExecutableOutline {
  const outline = makeDirtyOutline();
  outline.chapterBlueprints = Array.from({ length: 30 }, (_, index) => ({
    orderIndex: index + 1,
    title: `账本暗线${index + 1}`,
    summary: `推进第${index + 1}章冲突`,
    CBN: `第${index + 1}章开场出现具体危机`,
    CPNs: [`主角处理第${index + 1}章的具体阻碍`],
    CEN: `新的证据指向第${index + 2}章危机`,
    mustCover: [`查清第${index + 1}章的一处账目异常`],
    forbiddenZones: ['不得提前揭示终局黑手'],
    hookType: 'reveal',
  }));
  outline.keyCharacters = Array.from({ length: 10 }, (_, index) => ({
    name: `角色${index + 1}`,
    role: index === 0 ? 'protagonist' as const : 'support' as const,
    functionInStory: '推动冲突',
    keyNeed: '守住秘密',
    tensionWithProtagonist: '利益冲突',
    revealTiming: '前30章',
    publicGoal: '查账',
    hiddenNeed: '自保',
    fearOrWound: '旧案',
    secret: '掌握证据',
    turningPoint: '选择站队',
    arcStart: '观望',
    arcMid: '合作',
    arcEnd: '承担代价',
    resources: ['人脉'],
    relationshipChanges: [],
  }));
  outline.foreshadowPlan = Array.from({ length: 10 }, (_, index) => ({
    id: `foreshadow-${index + 1}`,
    hint: `第${index + 1}条账目暗记`,
    type: 'item' as const,
    importance: 'main' as const,
    setupPhase: '开篇',
    payoffPhase: '中期',
    setupChapter: index + 1,
    payoffChapter: index + 31,
    carrierCharacter: '主角',
    linkedConflict: '旧案',
    payoffValue: '揭开真相',
  }));
  return outline;
}

describe('inspectOutlineQuality', () => {
  it('劣化大纲命中全部五类问题', () => {
    const issues = inspectOutlineQuality(makeDirtyOutline());
    const kinds = issues.map(issue => issue.kind);
    expect(kinds).toContain('placeholder-events');
    expect(kinds).toContain('template-cbn');
    expect(kinds).toContain('duplicated-forbidden');
    expect(kinds).toContain('missing-selling-point');
    expect(kinds).toContain('broken-range');
  });

  it('必出事件括号未配对命中 unbalanced-paren', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: ['他回溯玉佛照片（无血文物证'],
      }),
    ];
    const issues = inspectOutlineQuality(outline);
    expect(issues.some(issue => issue.kind === 'unbalanced-paren')).toBe(true);
  });

  it('括号配对的事件不误报', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: ['他回溯玉佛照片（无血文物证）'],
      }),
    ];
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'unbalanced-paren')).toBe(
      false
    );
  });

  it('括号跨事件拆分：单条未闭合但 block 合并配平，报跨事件拆分', () => {
    // 复刻 REAL AI smoke twist 模块的真实 case：一个括号被拆到两条事件
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: [
          '陈默在古战场边缘发现时间循环的肉眼可见效果（场景重复',
          '人物卡帧）',
        ],
      }),
    ];
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'unbalanced-paren');
    // 两条事件都未配对，各报一条
    expect(issues.length).toBe(2);
    // 文案含"跨事件拆分"，修正 prompt 据此给出针对性指令
    expect(issues.every(i => i.detail.includes('跨事件拆分'))).toBe(true);
  });

  it('括号真漏：单条未闭合且 block 合并仍不配平，报未配对（非跨事件）', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.chapterBlocks = [
      makeBlock({
        mustEvents: ['发现效果（场景重复', '人物卡帧'],
      }),
    ];
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'unbalanced-paren');
    expect(issues.length).toBe(1);
    // 文案不含"跨事件拆分"（合并后开1闭0仍不配平）
    expect(issues[0].detail.includes('跨事件拆分')).toBe(false);
  });

  it('开篇钩子为空或超过 35 字命中 opening-hook', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.openingHook = '钩'.repeat(50);
    expect(
      inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')
    ).toBe(true);

    outline.startupPack30.openingHook = '';
    expect(
      inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')
    ).toBe(true);

    // 纯空白串（reporter 先 trim，按“为空”更严格口径命中）
    outline.startupPack30.openingHook = '   ';
    expect(
      inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')
    ).toBe(true);
  });

  it('开篇钩子合规不误报', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.openingHook = '主角在教室醒来';
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')).toBe(false);
  });

  it('开篇钩子 35 字边界：35 不报、36 报', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30.openingHook = '钩'.repeat(35);
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')).toBe(false);

    outline.startupPack30.openingHook = '钩'.repeat(36);
    expect(inspectOutlineQuality(outline).some(issue => issue.kind === 'opening-hook')).toBe(true);
  });

  it('startupPack30 缺失不崩溃', () => {
    const outline = makeDirtyOutline();
    outline.startupPack30 = undefined as never;
    // 不抛异常；开篇钩子按“为空”报（可选链兜底），其余规则照常运行
    const issues = inspectOutlineQuality(outline);
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.some(issue => issue.kind === 'opening-hook')).toBe(true);
  });

  it('干净大纲零问题', () => {
    expect(inspectOutlineQuality(makeCleanOutline())).toEqual([]);
  });

  it('空大纲不崩溃', () => {
    expect(inspectOutlineQuality(null as unknown as ExecutableOutline)).toEqual([]);
  });

  // ---------- over-scoped-mustcover（缺陷修复） ----------
  // 真实回归：smoke:storyflow:real 实测——AI 把卷级 objective「完成临水县从空壳穷县到模范县的逆转」
  // 写进单章 mustCover，下游 chapter-judge 持续判未履约 → 持久错误重试耗尽 → 死循环。
  it('chapterBlueprints 单章 mustCover 含整卷/全书级跨章目标命中 over-scoped-mustcover', () => {
    const outline = makeCleanOutline();
    outline.chapterBlueprints = [
      {
        orderIndex: 1,
        title: '一睁眼官帽盖脸',
        summary: 'CBN',
        CBN: '沈知行醒来',
        CPNs: ['醒来'],
        CEN: '门外差役高喊',
        mustCover: [
          '醒来并承认自己成了临水县新任知县',
          '完成临水县从空壳穷县到模范县的逆转', // 整卷目标，应命中
        ],
        forbiddenZones: [],
        hookType: 'reveal',
      },
    ];
    const issues = inspectOutlineQuality(outline);
    const overScoped = issues.filter(i => i.kind === 'over-scoped-mustcover');
    expect(overScoped.length).toBe(1);
    expect(overScoped[0].chapterOrder).toBe(1);
    expect(overScoped[0].detail).toContain('完成临水县从空壳穷县到模范县的逆转');
  });

  it('chapterBlueprints mustCover 全是单章节点时不误报 over-scoped-mustcover', () => {
    const outline = makeCleanOutline();
    outline.chapterBlueprints = [
      {
        orderIndex: 1,
        title: '开局',
        summary: 'CBN',
        CBN: '沈知行醒来',
        CPNs: ['醒来'],
        CEN: '差役高喊',
        mustCover: ['醒来验尸', '当众指认', '翻案打脸'], // 全是单章节奏点
        forbiddenZones: [],
        hookType: 'reveal',
      },
    ];
    const issues = inspectOutlineQuality(outline);
    expect(issues.some(i => i.kind === 'over-scoped-mustcover')).toBe(false);
  });

  it('多章命中 over-scoped-mustcover 时整批最多报 3 条（避免修正 prompt 过长）', () => {
    const outline = makeCleanOutline();
    outline.chapterBlueprints = Array.from({ length: 5 }, (_, i) => ({
      orderIndex: i + 1,
      title: `第${i + 1}章`,
      summary: 'CBN',
      CBN: 'CBN',
      CPNs: [],
      CEN: 'CEN',
      mustCover: ['完成家族复兴'], // 每章都命中
      forbiddenZones: [],
      hookType: 'reveal',
    }));
    const issues = inspectOutlineQuality(outline);
    expect(issues.filter(i => i.kind === 'over-scoped-mustcover').length).toBe(3);
  });

  // ---------- missing-selling-point 误报收敛（2026-08-16 luna 冒烟回归） ----------
  // 卷 objective 里的弧线/范围陈述不是场景型卖点，不要求出现在启动包；
  // 不过滤会让几乎每份初稿都触发一次修正请求，弱模型场景白花 1-3 分钟。
  it('卷 objective 含章节范围/主线感情线世界线语句：不误报 missing-selling-point', () => {
    const outline = makeCleanOutline();
    outline.volumePlan[0].objective =
      '第1至60章，沈砚从无品户部书吏变成临时清查主官；查清京畿赈灾粮款亏空，取得正式官身，并拿到一省钱粮清查权。主线推进赈灾核账、官商勾连、盐运入口三层；感情线推进沈砚与顾清漪从互相试探到共同担责；世界线揭开朝廷用地方亏空掩盖军费调度的规则。';
    expect(
      inspectOutlineQuality(outline).some(i => i.kind === 'missing-selling-point'),
    ).toBe(false);
  });

  it('卷 climax 场景型卖点确实缺席启动包：照常报 missing-selling-point', () => {
    const outline = makeCleanOutline();
    // climax 点名登记角色「沈砚」（keyCharacters），启动包文本把该名字全部抹掉 → 零登场，触发
    outline.keyCharacters = [
      {
        name: '沈砚',
        role: 'protagonist' as const,
        functionInStory: '破局',
        keyNeed: '查账',
        tensionWithProtagonist: '体制对抗',
        revealTiming: '第1章',
        publicGoal: '洗冤',
        hiddenNeed: '改制',
        fearOrWound: '背锅',
        secret: '现代知识',
        turningPoint: '会审',
        arcStart: '底层',
        arcMid: '立足',
        arcEnd: '掌权',
        resources: ['算学'],
        relationshipChanges: [],
      },
    ];
    outline.volumePlan[0].climax =
      '沈砚在户部会审中用仓耗、运价和到货量反推出真实亏空，逼出仓场官员的供词';
    outline.startupPack30.chapterBlocks.forEach(block => {
      block.coolPoints = ['无关爽点'];
      block.objective = '无关目标';
      block.readerExpectation = '无关期待';
      block.mustEvents = ['无关事件'];
      block.hookRequirement = '无关钩子';
    });
    outline.startupPack30.openingHook = '一个人在教室醒来';
    const issues = inspectOutlineQuality(outline).filter(i => i.kind === 'missing-selling-point');
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].detail).toContain('沈砚');
  });

  it('卷 climax 关键角色已在启动包登场：不误报 missing-selling-point（回响语义）', () => {
    const outline = makeCleanOutline();
    // climax 场景细节（借贷底稿/银锭流转）开篇没有——但这些是卷末才揭示的内容，
    // 不该要求逐字出现；只要主角「陆渊」已在启动包登场就不算脱节
    outline.volumePlan[0].climax =
      '陆渊在户部会审中当众展示三联借贷底稿与银锭流转闭环，一举击溃户部侍郎与大理寺少卿的伪证防线';
    outline.startupPack30.chapterBlocks.forEach(block => {
      block.coolPoints = ['陆渊初显身手'];
    });
    expect(
      inspectOutlineQuality(outline).some(i => i.kind === 'missing-selling-point'),
    ).toBe(false);
  });
});

describe('parseChapterRange', () => {
  it('解析 "1-5章" / "11~15章"', () => {
    expect(parseChapterRange('1-5章')).toEqual({ start: 1, end: 5 });
    expect(parseChapterRange('11~15章')).toEqual({ start: 11, end: 15 });
  });

  it('非法区间返回 null', () => {
    expect(parseChapterRange('第1章')).toBeNull();
    expect(parseChapterRange('')).toBeNull();
  });
});

function makeBlueprint(orderIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    orderIndex,
    title: `第${orderIndex}章测试`,
    summary: `推进第${orderIndex}章冲突`,
    CBN: `第${orderIndex}章开场出现具体危机`,
    CPNs: [`主角处理第${orderIndex}章的具体阻碍`],
    CEN: `新的证据指向下一章危机`,
    mustCover: [`查清第${orderIndex}章的一处账目异常`],
    forbiddenZones: [],
    hookType: 'reveal',
    ...overrides,
  };
}

describe('初版伏笔时点×章蓝图交叉（2026-09-06 g38f-200chr2 ch36 形态）', () => {
  it('初版节点提前兑现伏笔载荷 → foreshadow-timing-violation', () => {
    const outline = makeDirtyOutline();
    outline.foreshadowPlan = [
      {
        id: 'f1',
        hint: '白麻布网格图卷三级网格考成法',
        type: 'item' as const,
        importance: 'main' as const,
        setupPhase: '',
        payoffPhase: '',
        setupChapter: 20,
        payoffChapter: 45,
        carrierCharacter: '顾明章',
        linkedConflict: '',
        payoffValue: '',
      },
    ];
    outline.chapterBlueprints = [
      makeBlueprint(36, {
        CPNs: ['沈怀安当众颁布三级网格考成法与末位罢黜令'],
        mustCover: ['沈怀安推行网格考成法'],
      }),
    ];
    const issues = inspectOutlineQuality(outline).filter(
      issue => issue.kind === 'foreshadow-timing-violation',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterOrder).toBe(36);
    expect(issues[0].detail).toContain('第45章');
  });

  it('伏笔计划与蓝图无冲突 → 无该类 issue', () => {
    const outline = makeDirtyOutline();
    outline.foreshadowPlan = [
      {
        id: 'f1',
        hint: '白麻布网格图卷三级网格考成法',
        type: 'item' as const,
        importance: 'main' as const,
        setupPhase: '',
        payoffPhase: '',
        setupChapter: 20,
        payoffChapter: 45,
        carrierCharacter: '顾明章',
        linkedConflict: '',
        payoffValue: '',
      },
    ];
    outline.chapterBlueprints = [makeBlueprint(30, { mustCover: ['沈怀安核对白麻布图卷批注'] })];
    expect(
      inspectOutlineQuality(outline).filter(issue => issue.kind === 'foreshadow-timing-violation'),
    ).toHaveLength(0);
  });
});

describe('重复节拍检测（reg20 擢升×2 受害形态）', () => {
  function outlineWithPair(chA: number, chB: number, mustA: string, mustB: string) {
    const outline = makeDirtyOutline();
    const key = { ...(outline.keyCharacters[0] as { name: string }), name: '顾明章' };
    outline.keyCharacters = [key];
    outline.chapterBlueprints = [
      makeBlueprint(chA, { mustCover: [mustA] }),
      makeBlueprint(chB, { mustCover: [mustB] }),
    ];
    return outline;
  }

  it('相隔 ≥3 章的两章共享 6 字连续段且同涉主要角色 → repeated-beat', () => {
    const outline = outlineWithPair(
      8,
      47,
      '特旨擢升顾明章为正五品通政司右参议',
      '特旨擢升顾明章为正五品通政司右参议',
    );
    const issues = inspectOutlineQuality(outline).filter(issue => issue.kind === 'repeated-beat');
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterOrder).toBe(47);
    expect(issues[0].detail).toContain('顾明章');
    expect(issues[0].detail).toContain('第8章');
  });

  it('相邻章承接性重叠（<3 章）与不同角色章节不误伤', () => {
    const adjacent = outlineWithPair(
      8,
      9,
      '特旨擢升顾明章为正五品通政司右参议',
      '特旨擢升顾明章为正五品通政司右参议',
    );
    expect(
      inspectOutlineQuality(adjacent).filter(issue => issue.kind === 'repeated-beat'),
    ).toHaveLength(0);

    const outline = makeDirtyOutline();
    const key = { ...(outline.keyCharacters[0] as { name: string }), name: '顾明章' };
    outline.keyCharacters = [key];
    outline.chapterBlueprints = [
      makeBlueprint(8, { mustCover: ['特旨擢升顾明章为正五品通政司右参议'] }),
      makeBlueprint(47, { mustCover: ['钱伯温彻查两淮盐引旧账'] }),
    ];
    expect(
      inspectOutlineQuality(outline).filter(issue => issue.kind === 'repeated-beat'),
    ).toHaveLength(0);
  });

  it('场景地标套话（出现在 ≥4 章的 6-gram）不构成重复节拍（reg70 实测误报形态）', () => {
    const outline = makeDirtyOutline();
    const key = { ...(outline.keyCharacters[0] as { name: string }), name: '沈淮' };
    outline.keyCharacters = [key];
    // 「在户部衙门与架阁」在 ch2/5/6/7/8/9 六章反复出现（场景常驻），不应刷黄签
    outline.chapterBlueprints = [2, 5, 6, 7, 8, 9].map(ch =>
      makeBlueprint(ch, { mustCover: [`沈淮在户部衙门与架阁司核对第${ch}章账目`] }),
    );
    expect(
      inspectOutlineQuality(outline).filter(issue => issue.kind === 'repeated-beat'),
    ).toHaveLength(0);
  });
});

describe('结构一致性：伏笔埋设×禁区冲突与爽点计划×蓝图对齐（2026-09-20 r8reg 大纲评审实证）', () => {
  it('伏笔 setupChapter 章禁区词面强重叠 → foreshadow-setup-forbidden-conflict；【让路】标记豁免', () => {
    const outline = makeDirtyOutline();
    outline.chapterBlueprints = [
      makeBlueprint(12, { forbiddenZones: ['严禁出现江南佛寺功德金免税飞签暗号'] }),
      makeBlueprint(13, { forbiddenZones: ['【让路】江南佛寺功德金免税飞签暗号可埋设'] }),
    ];
    outline.foreshadowPlan = [
      {
        id: 'f-conflict',
        hint: '江南佛寺功德金免税飞签暗号',
        type: 'item' as const,
        importance: 'subplot' as const,
        setupPhase: '',
        payoffPhase: '',
        setupChapter: 12,
        payoffChapter: 40,
        carrierCharacter: '',
        linkedConflict: '',
        payoffValue: '',
      },
      {
        id: 'f-yield',
        hint: '江南佛寺功德金免税飞签暗号（让路版）',
        type: 'item' as const,
        importance: 'subplot' as const,
        setupPhase: '',
        payoffPhase: '',
        setupChapter: 13,
        payoffChapter: 40,
        carrierCharacter: '',
        linkedConflict: '',
        payoffValue: '',
      },
    ] as never;
    const issues = inspectOutlineQuality(outline).filter(
      issue => issue.kind === 'foreshadow-setup-forbidden-conflict',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterOrder).toBe(12);
    expect(issues[0].detail).toContain('埋设');
  });

  it('爽点计划挂章与蓝图零词面关联 → coolpoint-plan-misaligned；词面相关则放行', () => {
    const outline = makeDirtyOutline();
    outline.chapterBlueprints = [
      makeBlueprint(28, { title: '公审大戏', mustCover: ['沈淮公审现场翻账打脸'] }),
      makeBlueprint(29, { title: '运河暗流' }),
    ];
    outline.coolPointPlan = [
      { type: '打脸', description: '公审现场沈淮翻账当众打脸', suggestedChapter: 28 },
      { type: '打脸', description: '边关大营犒赏三军立威', suggestedChapter: 29 },
    ] as never;
    const issues = inspectOutlineQuality(outline).filter(
      issue => issue.kind === 'coolpoint-plan-misaligned',
    );
    // ch28 词面相关放行；ch29「犒赏三军」与「运河暗流」零关联命中
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterOrder).toBe(29);
  });
});
