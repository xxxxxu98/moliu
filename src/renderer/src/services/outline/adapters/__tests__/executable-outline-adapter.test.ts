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

    // 块 1（1-5章）：第 1-4 章是非末章，CEN 应为“推进至：...”而非“药老现身”
    const block1NonLast = chapters.slice(0, 4);
    block1NonLast.forEach((ch) => {
      expect(ch.CEN).not.toBe('药老现身');
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

describe('splitStartupBlocksToChapters - Q1 CBN 承接上一章 CEN', () => {
  it('第 1 章 CBN 用开篇钩子', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    expect(result.chapters[0].CBN).toBe('萧炎从悬崖坠落');
  });

  it('第 2 章 CBN 承接第 1 章 CEN（含“承接上章结尾”）', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const ch1CEN = result.chapters[0].CEN;
    const ch2CBN = result.chapters[1].CBN;
    expect(ch2CBN).toContain('承接上章结尾');
    expect(ch2CBN).toContain(ch1CEN);
  });

  it('跨块承接：第 6 章 CBN 承接第 5 章 CEN', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline());
    const ch5CEN = result.chapters[4].CEN; // “药老现身”
    const ch6CBN = result.chapters[5].CBN;
    expect(ch6CBN).toContain('承接上章结尾');
    expect(ch6CBN).toContain(ch5CEN);
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
