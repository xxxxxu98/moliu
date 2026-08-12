/**
 * executable-outline-adapter 单元测试
 *
 * 重点验证首页大纲→章节蓝图派生过程的几个历史 bug 修复：
 * - Bug 1: CEN 不再全块重复（块内非末章不再用 block.hookRequirement）
 * - Bug 2: inferChapterType 用显式布尔判末章，ending/resolution 不再失效
 * - Bug 5: 块级 forbiddenZones 透传到章节级，供续写消费
 * - Q1: CBN 承接上一章 CEN，形成 CBN→CEN→CBN 连锁
 */

import { describe, it, expect } from 'vitest';
import { mapExecutableOutlineToGeneratedOutline } from '../executable-outline-adapter';
import type { ExecutableOutline } from '../../types/executable-outline';

function makeOutline(overrides: Partial<ExecutableOutline> = {}): ExecutableOutline {
  return {
    title: '测试方案',
    oneLiner: '一句话卖点',
    premise: '前提',
    positioning: {
      genreTags: ['东方玄幻'],
      targetReaders: ['读者A'],
      coreEmotions: ['爽'],
      sellingPoints: ['卖点1'],
      styleKeywords: ['玄幻'],
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
      protagonistName: '萧炎',
      protagonistStart: '废柴少年',
      protagonistGoalLongTerm: '复仇',
      protagonistGoalShortTerm: '炼药',
      coreConflict: '家族被灭',
      escalationPath: ['初遇', '冲突', '决战'],
      failureCost: '陨落',
    },
    volumePlan: [
      {
        volumeIndex: 1,
        title: '第1卷',
        objective: '炼药入门',
        coreConflict: '外院争斗',
        climax: '外院第一',
        reversal: '逆袭',
        endingHook: '内院召唤',
        protagonistGrowth: '筑基',
        keyCharacters: ['萧炎'],
        setupForeshadows: ['骨戒'],
        payoffForeshadows: [],
        relationshipShifts: [],
      },
    ],
    startupPack30: {
      openingHook: '萧炎从悬崖坠落',
      promiseToReader: '废柴逆袭',
      protagonistFirstImpression: '隐忍',
      firstMajorCoolPoint: '炼丹惊全场',
      firstConflictCycle: '击败萧宁',
      chapterBlocks: [
        {
          range: '1-5章',
          objective: '炼药入门',
          mustEvents: ['觉醒异火', '初次炼丹', '击败萧宁'],
          coolPoints: ['炼丹惊全场'],
          hookRequirement: '药老现身',
          pacing: 'fast',
          readerExpectation: '爽',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
        },
        {
          range: '6-10章',
          objective: '外院争斗',
          mustEvents: ['进入外院', '挑战排名', '击败强者'],
          coolPoints: ['决战巅峰'],
          hookRequirement: '内院名额揭晓',
          pacing: 'medium',
          readerExpectation: '热血',
          forbiddenZones: [],
        },
      ],
    },
    keyCharacters: [
      {
        name: '萧炎',
        role: 'protagonist',
        functionInStory: '主角',
        keyNeed: '复仇',
        tensionWithProtagonist: '',
        revealTiming: '',
        publicGoal: '炼药',
        hiddenNeed: '',
        fearOrWound: '',
        secret: '',
        turningPoint: '',
        arcStart: '',
        arcMid: '',
        arcEnd: '',
        resources: [],
        relationshipChanges: [],
      },
    ],
    foreshadowPlan: [],
    ...overrides,
  };
}

describe('splitStartupBlocksToChapters - Bug 1 CEN 不再全块重复', () => {
  it('块内非末章的 CEN 不等于 block.hookRequirement', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const chapters = result.chapters;
    expect(chapters.length).toBe(10);

    // 块 1（1-5章）：第 1-4 章是非末章，CEN 不得等于块钩子「药老现身」
    const block1NonLast = chapters.slice(0, 4);
    block1NonLast.forEach(ch => {
      expect(ch.CEN).not.toBe('药老现身');
      // 单事件章禁止塌成「推进至：=唯一 CPN」，也禁止元指令钩子
      expect(ch.CEN).not.toMatch(/^推进至[：:]/u);
      expect(ch.CEN).not.toContain('情节不得原地重复开场');
    });

    // 块 1 末章（第 5 章）：CEN 应为本块必留钩子
    const block1Last = chapters[4];
    expect(block1Last.CEN).toBe('药老现身');
  });

  it('不同块的末章 CEN 不同（避免块间重复）', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    // 块 1 末章（第5章）vs 块 2 末章（第10章）
    expect(result.chapters[4].CEN).toBe('药老现身');
    expect(result.chapters[9].CEN).toBe('内院名额揭晓');
  });
});

describe('mapExecutableOutlineToGeneratedOutline - 定位字段不污染题材', () => {
  it('题材、文风、读者和情绪分别映射', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());

    expect(result.genres).toEqual(['东方玄幻']);
    expect(result.styleKeywords).toEqual(['玄幻']);
    expect(result.targetReaders).toEqual(['读者A']);
    expect(result.coreEmotions).toEqual(['爽']);
  });

  it('旧版大纲缺少题材标签时，只回收纯题材词', () => {
    const outline = makeOutline();
    outline.positioning.genreTags = [];
    outline.positioning.styleKeywords = ['玄幻', '快节奏'];
    outline.positioning.targetReaders = ['18-35岁男性'];
    outline.positioning.coreEmotions = ['热血'];

    const result = mapExecutableOutlineToGeneratedOutline(outline);

    expect(result.genres).toEqual(['玄幻']);
  });
});

describe('splitStartupBlocksToChapters - CBN 用本章关键事件（不再承接上章 CEN）', () => {
  it('第 1 章 CBN 用开篇钩子', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    expect(result.chapters[0].CBN).toBe('萧炎从悬崖坠落');
  });

  it('第 2 章 CBN 用本章关键事件（不含“承接上章结尾”模板）', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const ch2CBN = result.chapters[1].CBN;
    expect(ch2CBN).not.toContain('承接上章结尾');
    // 块 1 mustEvents=['觉醒异火','初次炼丹','击败萧宁']，5 章均分后第 2 章取第一个
    expect(ch2CBN).toBe('觉醒异火');
  });

  it('跨块：第 6 章 CBN 用差异化推进句（块首章无独立事件时不重复块内事件）', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const ch6CBN = result.chapters[5].CBN;
    expect(ch6CBN).not.toContain('承接上章结尾');
    // 块 2 mustEvents=['进入外院','挑战排名','击败强者'] 3 事件 5 章，
    // 互斥分配后第 6 章（块内第 1 章）无事件，用带序号推进句兜底（Bug 6 修复）
    expect(ch6CBN).toContain('本区间第 1/5 段推进');
    // 块 2 首个事件落在第 7 章，不再与第 6 章重复
    expect(result.chapters?.[6].CBN).toBe('进入外院');
  });

  it('块内相邻章 CBN 互不相同（事件互斥分配，Bug 6 修复）', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const chapters = result.chapters ?? [];
    const cbns = chapters.map(ch => ch.CBN);
    // 修复前：3 事件 5 章强制每章至少 1 个 → ch2/ch3 同取 mustEvents[0]，CBN 重复
    expect(new Set(cbns).size).toBe(cbns.length);
  });

  it('mustCover 互斥：同一事件只进一章，空章不设 mustCover（Bug 6 修复）', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const block1 = (result.chapters ?? []).slice(0, 5);
    // 块 1 三个事件按序落到 ch2/ch4/ch5，ch1/ch3 为空章
    expect(block1[1].mustCover).toEqual(['觉醒异火']);
    expect(block1[3].mustCover).toEqual(['初次炼丹']);
    expect(block1[4].mustCover).toEqual(['击败萧宁']);
    expect(block1[0].mustCover).toBeUndefined();
    expect(block1[2].mustCover).toBeUndefined();
    // 全块 mustCover 摊开后无重复事件
    const flat = block1.flatMap(ch => ch.mustCover ?? []);
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('模板句事件（「X后对手反手施压，倒计时与证据链同时收紧」）被过滤，不再进 CBN/mustCover', () => {
    const outline = makeOutline({
      startupPack30: {
        ...makeOutline().startupPack30,
        chapterBlocks: [
          {
            range: '1-5章',
            objective: '验尸破案',
            mustEvents: [
              '苏瑾穿越醒来发现自己正在验尸',
              '苏瑾穿越醒来发现自己正在验尸后对手反手施压，倒计时与证据链同时收紧',
              '苏瑾在朝会上用数据报告怼翻御史',
            ],
            coolPoints: ['当众打脸'],
            hookRequirement: '银针藏不住',
            pacing: 'fast',
            readerExpectation: '爽',
            forbiddenZones: [],
          },
        ],
      },
    });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    const chapters = result.chapters ?? [];
    const allCbn = chapters.map(ch => ch.CBN).join('|');
    const allMustCover = chapters.flatMap(ch => ch.mustCover ?? []).join('|');
    expect(allCbn).not.toContain('倒计时与证据链同时收紧');
    expect(allMustCover).not.toContain('倒计时与证据链同时收紧');
    // 有效事件仍按序分配（2 事件 5 章，均分边界落在 ch3/ch5）：'验尸'→ch3、'怼翻御史'→ch5
    expect(chapters[2].CBN).toContain('验尸');
    expect(chapters[4].CBN).toContain('怼翻御史');
  });
});

describe('inferChapterType - Bug 2 ending/resolution 判定修复', () => {
  it('最后一块末章（含“结局”关键词）判定为 ending', () => {
    const outline = makeOutline({
      startupPack30: {
        ...makeOutline().startupPack30,
        chapterBlocks: [
          {
            range: '1-5章',
            objective: '开局',
            mustEvents: ['事件'],
            coolPoints: [],
            hookRequirement: '',
            pacing: 'fast',
            readerExpectation: '',
            forbiddenZones: [],
          },
          {
            range: '6-10章',
            objective: '终局',
            mustEvents: ['终战'],
            coolPoints: ['大结局落幕'],
            hookRequirement: '',
            pacing: 'medium',
            readerExpectation: '',
            forbiddenZones: [],
          },
        ],
      },
    });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    // 最后一块的末章（第10章）应判为 ending（原 bug：chapterNo=10 永远不等于 blockSize=5）
    expect(result.chapters[9].chapterType).toBe('ending');
    expect(result.chapters[9].isClimax).toBe(true);
  });

  it('非末块但区间末章含“解决”判定为 resolution', () => {
    const outline = makeOutline({
      startupPack30: {
        ...makeOutline().startupPack30,
        chapterBlocks: [
          {
            range: '1-5章',
            objective: '开局',
            mustEvents: ['事件1', '事件2', '事件3', '事件4', '解决争端'],
            coolPoints: ['冲突解决收尾'],
            hookRequirement: '',
            pacing: 'fast',
            readerExpectation: '',
            forbiddenZones: [],
          },
          {
            range: '6-10章',
            objective: '延续',
            mustEvents: ['延续'],
            coolPoints: [],
            hookRequirement: '',
            pacing: 'medium',
            readerExpectation: '',
            forbiddenZones: [],
          },
        ],
      },
    });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    // 第 5 章是第 1 块末章，coolPoints 含“解决”→ resolution（原 bug 会漏判）
    expect(result.chapters[4].chapterType).toBe('resolution');
  });

  it('前 3 章建置类型不变', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    expect(result.chapters[0].chapterType).toBe('world_intro');
    expect(result.chapters[1].chapterType).toBe('character_intro');
    expect(result.chapters[2].chapterType).toBe('plot_setup');
  });
});

describe('splitStartupBlocksToChapters - Bug 5 forbiddenZones 透传', () => {
  it('块级 forbiddenZones 透传到块内每一章', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    // 块 1（1-5章）每章都应继承 forbiddenZones
    result.chapters.slice(0, 5).forEach((ch) => {
      expect(ch.forbiddenZones).toEqual(['不能让药老提前暴露真实身份']);
    });
    // 块 2 forbiddenZones 为空数组 → 透传空数组
    result.chapters.slice(5, 10).forEach((ch) => {
      expect(ch.forbiddenZones).toEqual([]);
    });
  });
});

describe('splitStartupBlocksToChapters - 章号不跳号（globalChapterNo 修复）', () => {
  // 当 AI 输出的区间不连续（如 1-5 / 11-15）时，旧实现用 start+i 计算章号，
  // 第二块第一章 chapterNo 会从 11 起跳，标题变成"第11章"但其实是第 6 章；
  // 更严重的是 inferChapterType 用 chapterNo 判前 3 章建置类型，跳号会让
  // world_intro/character_intro/plot_setup 全部错位。修复后统一用 globalChapterNo。
  it('不连续区间下章号连续递增，不跳号', () => {
    const outline = makeOutline({
      startupPack30: {
        ...makeOutline().startupPack30,
        chapterBlocks: [
          {
            range: '1-5章',
            objective: '开局',
            mustEvents: ['e1', 'e2', 'e3'],
            coolPoints: [],
            hookRequirement: '',
            pacing: 'fast',
            readerExpectation: '',
            forbiddenZones: [],
          },
          {
            range: '11-15章', // 故意不连续：从 11 起
            objective: '第二段',
            mustEvents: ['e4', 'e5'],
            coolPoints: [],
            hookRequirement: '',
            pacing: 'medium',
            readerExpectation: '',
            forbiddenZones: [],
          },
        ],
      },
    });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    expect(result.chapters.length).toBe(10);
    // 章号必须 1..10 连续，不能出现 11-15
    const numbers = result.chapters.map((c) => c.number);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // 标题同样
    expect(result.chapters[5].title).toBe('第6章');
    expect(result.chapters[9].title).toBe('第10章');
    // 前 3 章建置类型不因跳号而错位
    expect(result.chapters[0].chapterType).toBe('world_intro');
    expect(result.chapters[1].chapterType).toBe('character_intro');
    expect(result.chapters[2].chapterType).toBe('plot_setup');
  });
});

describe('toChapters chapterBlueprints 分支 - AI 单章蓝图', () => {
  it('chapterBlueprints 非空时走 blueprint 分支，逐章产出 title/CBN/CEN/mustCover', () => {
    const outline = makeOutline({
      chapterBlueprints: [
        {
          orderIndex: 1,
          title: '擦身擦到一半，皇帝来了',
          summary: '穿越成小太监正在给总管擦身',
          CBN: '一睁眼正在给老太监擦身',
          CPNs: ['李德全找茬', '水温数据打脸'],
          CEN: '皇帝突然驾到冷宫',
          mustCover: ['李德全找茬', '水温数据打脸'],
          forbiddenZones: ['不能揭示穿越原因'],
          hookType: 'sudden_reveal',
          hookText: '暗处目光已至',
          coolPointType: '打脸',
        },
        {
          orderIndex: 2,
          title: '三天期限',
          summary: '被刘公公给三天期限破账目案',
          CBN: '被敲门惊醒接到命令',
          CPNs: ['查账目残页', '发现数目对不上'],
          CEN: '倒计时逼近眼前',
          mustCover: ['查账目残页', '发现数目对不上'],
          forbiddenZones: ['不能暴露冷宫密档'],
          hookType: 'deadline',
          coolPointType: '解谜',
        },
      ],
    });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    // 走 blueprint 分支：章数 = chapterBlueprints.length（不再走 5章块拆分）
    expect(result.chapters.length).toBe(2);
    const [ch1, ch2] = result.chapters;
    // title 来自 AI（非「第N章」占位）
    expect(ch1.title).toBe('擦身擦到一半，皇帝来了');
    expect(ch2.title).toBe('三天期限');
    // 结构化节点完整透传
    expect(ch1.CBN).toBe('一睁眼正在给老太监擦身');
    expect(ch1.CEN).toBe('皇帝突然驾到冷宫');
    expect(ch1.mustCover).toEqual(['李德全找茬', '水温数据打脸']);
    // status / pacingStrategy 补齐（对齐 algorithm 路径）
    expect(ch1.status).toBe('outline');
    expect(ch1.pacingStrategy).toBe('confront');
    // hook 优先 hookText（文案），而非把 hookType 枚举当文案
    expect(ch1.hook).toBe('暗处目光已至');
    // chapterType 仍由 inferChapterType 派生（首章 = world_intro）
    expect(ch1.chapterType).toBe('world_intro');
  });

  it('chapterBlueprints 为空时回退 splitStartupBlocksToChapters', () => {
    const outline = makeOutline({ chapterBlueprints: undefined });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    // 两个 5 章块 → 10 章
    expect(result.chapters.length).toBe(10);
    // 标题仍是「第N章」（algorithm 路径）
    expect(result.chapters[0].title).toBe('第1章');
  });
});

describe('splitStartupBlocksToChapters - 章号前缀清洗（P1-B）', () => {
  it('block.objective/mustEvents 里的「第N章」前缀被清洗，不串入单章 CBN', () => {
    const outline = makeOutline({
      startupPack30: {
        ...makeOutline().startupPack30,
        chapterBlocks: [
          {
            range: '1-5章',
            // objective 带「第2章」前缀（模拟 AI 误带）
            objective: '第2章用锚定效应让上司考核失误',
            mustEvents: ['第2章当众打脸王主簿', '正常事件e2'],
            coolPoints: [],
            hookRequirement: '',
            pacing: 'fast',
            readerExpectation: '',
            forbiddenZones: [],
          },
        ],
      },
    });
    const result = mapExecutableOutlineToGeneratedOutline(outline);
    // 各章 CBN/summary 不应再以「第2章」开头
    for (const ch of result.chapters) {
      expect(ch.CBN).not.toMatch(/^第2章/);
      expect(ch.summary ?? '').not.toMatch(/^第2章用锚定效应/);
    }
    // mustCover 透传的事件也清洗了
    const allMustCover = result.chapters.flatMap(c => c.mustCover ?? []);
    for (const ev of allMustCover) {
      expect(ev).not.toMatch(/^第2章/);
    }
  });
});
