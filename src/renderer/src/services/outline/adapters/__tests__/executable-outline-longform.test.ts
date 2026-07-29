/**
 * 百万开书字段透传：volumePlans / 角色结构化人设 / startupPack 禁区
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
        title: '第1卷·外院',
        objective: '站稳外院',
        coreConflict: '外院争斗',
        climax: '外院第一',
        reversal: '身世线索',
        endingHook: '内院召唤',
        protagonistGrowth: '筑基',
        keyCharacters: ['萧炎'],
        setupForeshadows: ['骨戒'],
        payoffForeshadows: [],
        relationshipShifts: ['与萧薰儿结盟'],
      },
      {
        volumeIndex: 2,
        title: '第2卷·内院',
        objective: '入主内院',
        coreConflict: '异火争夺',
        climax: '夺取异火',
        reversal: '药老危机',
        endingHook: '中州开启',
        protagonistGrowth: '斗灵',
        keyCharacters: ['萧炎', '药老'],
        setupForeshadows: ['中州'],
        payoffForeshadows: ['骨戒'],
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
          mustEvents: ['觉醒异火'],
          coolPoints: ['炼丹惊全场'],
          hookRequirement: '药老现身',
          pacing: 'fast',
          readerExpectation: '爽',
          forbiddenZones: ['不能让药老提前暴露真实身份'],
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
        publicGoal: '炼药扬名',
        hiddenNeed: '找回父亲',
        fearOrWound: '被废丹田',
        secret: '药老寄宿',
        turningPoint: '契约异火',
        arcStart: '隐忍废柴',
        arcMid: '崭露锋芒',
        arcEnd: '执掌一方',
        resources: ['骨戒'],
        relationshipChanges: [],
      },
    ],
    foreshadowPlan: [],
    ...overrides,
  };
}

describe('mapExecutableOutlineToGeneratedOutline - million-word fields', () => {
  it('maps volumePlans, character arc fields, and startupPack forbiddenZones', () => {
    const result = mapExecutableOutlineToGeneratedOutline(makeOutline(), {
      targetWordCountRange: '80万-150万字',
    });

    expect(result.volumePlans?.length).toBe(2);
    expect(result.volumePlans?.[0]?.title).toBe('第1卷·外院');
    expect(result.volumes).toBe(2);

    const protagonist = result.characters.find((c) => c.role === 'protagonist');
    expect(protagonist?.secret).toBe('药老寄宿');
    expect(protagonist?.arcStart).toBe('隐忍废柴');
    expect(protagonist?.publicGoal).toBe('炼药扬名');

    expect(result.startupPack30?.chapterBlocks[0]?.forbiddenZones).toEqual([
      '不能让药老提前暴露真实身份',
    ]);
    expect(result.storyScale?.targetWordCount).toBeTruthy();
  });
});
