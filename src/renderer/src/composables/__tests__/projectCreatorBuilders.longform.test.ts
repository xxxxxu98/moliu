/**
 * 自测：题材中心「应用」后百万开书关键字段是否齐全落库
 */
import { describe, expect, it } from 'vitest';
import { mapExecutableOutlineToGeneratedOutline } from '@/services/outline/adapters/executable-outline-adapter';
import { buildExpandDirectionPrompt, buildVolumePlanSection } from '@/services/outline/prompts/system/expand-direction-prompt';
import { buildWordCountBreakdown } from '@/services/outline/utils';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import type { OutlineDirection } from '@/services/outline/types/direction';
import { buildEnhancedDesignPrompt } from '@/services/writing/OutlineContextBuilder';
import type { GeneratedOutline } from '@/types/inspiration';
import {
  buildLongformPersistPayload,
  buildStartupPackFromOutline,
  buildStoryScaleFromOutline,
  buildVolumesFromOutline,
} from '../projectCreatorBuilders';

function makeExecutableOutline(): ExecutableOutline {
  return {
    title: '万火朝宗',
    oneLiner: '废柴少年逆天夺异火',
    premise: '家族覆灭后主角携药老崛起',
    positioning: {
      targetReaders: ['男频玄幻读者'],
      coreEmotions: ['热血', '爽'],
      sellingPoints: ['异火收集', '炼药'],
      styleKeywords: ['玄幻', '升级'],
    },
    storyScale: {
      targetWordCount: '80万-150万字',
      estimatedChapterCount: 460,
      averageWordsPerChapter: 2500,
      suggestedVolumeCount: 7,
      estimatedChaptersPerVolume: 66,
      startupPhaseRatio: '7%',
      longformProgressionNote: '前30章只完成开局承诺，后续靠地图扩张与势力更替',
    },
    storyEngine: {
      protagonistName: '萧炎',
      protagonistStart: '废柴少年',
      protagonistGoalLongTerm: '复仇并执掌一方',
      protagonistGoalShortTerm: '炼药扬名',
      coreConflict: '家族与宗门压迫',
      escalationPath: ['外院', '内院', '中州', '终局'],
      failureCost: '药老消散、家族永灭',
    },
    volumePlan: Array.from({ length: 7 }, (_, i) => ({
      volumeIndex: i + 1,
      title: `第${i + 1}卷·阶段${i + 1}`,
      objective: `完成第${i + 1}阶段成长`,
      coreConflict: `第${i + 1}阶段核心冲突`,
      climax: `第${i + 1}卷高潮`,
      reversal: `第${i + 1}卷反转`,
      endingHook: `第${i + 1}卷尾钩`,
      protagonistGrowth: `成长节点${i + 1}`,
      keyCharacters: ['萧炎'],
      setupForeshadows: [`伏笔埋设${i + 1}`],
      payoffForeshadows: i > 0 ? [`伏笔回收${i}`] : [],
      relationshipShifts: [],
    })),
    startupPack30: {
      openingHook: '萧炎当众受辱',
      promiseToReader: '废柴逆袭炼药',
      protagonistFirstImpression: '隐忍但不认命',
      firstMajorCoolPoint: '炼丹惊全场',
      firstConflictCycle: '击败萧宁',
      chapterBlocks: [
        {
          range: '1-5',
          objective: '立人设并埋药老',
          mustEvents: ['受辱', '觉醒', '初次炼丹'],
          coolPoints: ['打脸'],
          hookRequirement: '药老现身迹象',
          pacing: 'fast',
          readerExpectation: '想看反击',
          forbiddenZones: ['不能让药老提前暴露真实身份', '不可提前兑现终局异火'],
        },
        {
          range: '6-10',
          objective: '外院立足',
          mustEvents: ['入学', '挑战'],
          coolPoints: ['装逼'],
          hookRequirement: '内院名额',
          pacing: 'medium',
          readerExpectation: '热血',
          forbiddenZones: ['不可提前进入中州'],
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
        revealTiming: '开篇',
        publicGoal: '炼药扬名',
        hiddenNeed: '找回父亲',
        fearOrWound: '被废丹田',
        secret: '药老寄宿',
        turningPoint: '契约异火',
        arcStart: '隐忍废柴',
        arcMid: '崭露锋芒',
        arcEnd: '执掌一方',
        resources: ['骨戒'],
        relationshipChanges: [
          {
            targetName: '药老',
            relationType: 'mentor',
            dynamic: '从寄宿到师徒共生',
          },
        ],
      },
    ],
    foreshadowPlan: [
      {
        id: 'fs-1',
        hint: '骨戒异动',
        type: 'item',
        importance: 'main',
        setupPhase: '开篇',
        payoffPhase: '中期',
        setupChapter: 3,
        payoffChapter: 120,
        carrierCharacter: '萧炎',
        linkedConflict: '异火争夺',
        payoffValue: '药老真身',
      },
    ],
  };
}

const sampleDirection: OutlineDirection = {
  id: 'dir-1',
  title: '废柴逆袭',
  oneLiner: '一句话卖点',
  premise: 'premise',
  protagonistArc: '从废柴到巅峰',
  coreConflict: '家族与宗门',
  coolPointStyle: ['打脸'],
  targetEmotions: ['爽'],
  riskNotes: ['节奏过快'],
  recommendationScore: 90,
  longformCapacityNote: '可支撑百万字',
  recommendedReason: '卖点清晰',
};

describe('百万开书自测：expand → map → persist', () => {
  it('字数规模换算对百万字给出合理卷数', () => {
    const scale = buildWordCountBreakdown('80万-150万字');
    expect(scale.targetWordCount).toBe(1_150_000);
    expect(scale.suggestedVolumeCount).toBeGreaterThanOrEqual(6);
    expect(scale.estimatedChapterCount).toBeGreaterThanOrEqual(400);
  });

  it('expand prompt 按规模动态输出卷纲槽位', () => {
    const volumeCount = buildWordCountBreakdown('80万-150万字').suggestedVolumeCount;
    expect(buildVolumePlanSection(volumeCount).match(/### 第\d+卷/g)?.length).toBe(volumeCount);

    const prompt = buildExpandDirectionPrompt({
      seed: '测试种子',
      direction: sampleDirection,
      wordCountRange: '80万-150万字',
    });
    expect(prompt.system).toContain(`### 第${volumeCount}卷`);
    expect(prompt.system).not.toContain('{{VOLUME_PLAN_SECTION}}');
    expect(prompt.user).toContain(`${volumeCount}卷规划要彼此递进`);
  });

  it('ExecutableOutline → GeneratedOutline → 落库载荷字段齐全', () => {
    const generated = mapExecutableOutlineToGeneratedOutline(makeExecutableOutline(), {
      targetWordCountRange: '80万-150万字',
    });

    expect(generated.volumePlans?.length).toBe(7);
    expect(generated.startupPack30?.chapterBlocks[0]?.forbiddenZones?.length).toBe(2);
    expect(generated.characters[0]?.secret).toBe('药老寄宿');
    expect(generated.storyScale?.targetWordCount).toBeTruthy();

    const payload = buildLongformPersistPayload(generated);

    // 1) 多卷实体
    expect(payload.volumes).toHaveLength(7);
    expect(payload.volumes[0].name).toBe('第1卷·阶段1');
    expect(payload.volumes[0].summary).toContain('完成第1阶段成长');

    // 2) startupPack 禁区
    expect(payload.metadata.startupPack?.chapterBlocks[0]?.forbiddenZones).toEqual([
      '不能让药老提前暴露真实身份',
      '不可提前兑现终局异火',
    ]);

    // 3) storyScale 字数字段
    expect(payload.metadata.storyScale?.targetWordCount).toBeTruthy();
    expect(payload.metadata.storyScale?.estimatedChapterCount).toBe(460);
    expect(payload.metadata.plannedChapterCount).toBe(460);
    expect(payload.metadata.plannedWordCount).toBe(generated.estimatedWordCount);
    expect(payload.targetWordCount).toBe(generated.estimatedWordCount);

    // 4) volumePlans metadata
    expect(payload.metadata.volumePlans).toHaveLength(7);
    expect(payload.metadata.volumePlans?.[6]?.title).toBe('第7卷·阶段7');

    // 5) 角色结构化人设
    expect(payload.characters[0].profile.secret).toBe('药老寄宿');
    expect(payload.characters[0].profile.arcStart).toBe('隐忍废柴');
    expect(payload.characters[0].profile.publicGoal).toBe('炼药扬名');
  });

  it('无 volumePlans 时按 suggestedVolumeCount 占位建卷', () => {
    const outline: GeneratedOutline = {
      id: 'g-1',
      title: '占位卷测试',
      synopsis: 'synopsis',
      structure: { act1: '', act2a: '', act2b: '', act3: '' },
      characters: [],
      foreshadows: [],
      estimatedWordCount: 1_000_000,
      storyScale: {
        targetWordCount: '100万字',
        estimatedChapterCount: 400,
        averageWordsPerChapter: 2500,
        suggestedVolumeCount: 6,
        estimatedChaptersPerVolume: 67,
        startupPhaseRatio: '8%',
        longformProgressionNote: '',
      },
    };

    const volumes = buildVolumesFromOutline(outline, 1);
    expect(volumes).toHaveLength(6);
    expect(volumes.map((v) => v.name)).toEqual([
      '第1卷',
      '第2卷',
      '第3卷',
      '第4卷',
      '第5卷',
      '第6卷',
    ]);
  });

  it('空 forbiddenZones 不会写入启动包块', () => {
    const outline: GeneratedOutline = {
      id: 'g-2',
      title: '禁区空数组',
      synopsis: '',
      structure: { act1: '', act2a: '', act2b: '', act3: '' },
      characters: [],
      foreshadows: [],
      estimatedWordCount: 500000,
      startupPack30: {
        openingHook: 'hook',
        promiseToReader: 'promise',
        protagonistFirstImpression: '印象',
        firstMajorCoolPoint: '爽点',
        firstConflictCycle: '冲突',
        chapterBlocks: [
          {
            range: '1-5',
            objective: '开局',
            mustEvents: [],
            coolPoints: [],
            hookRequirement: '',
            pacing: 'fast',
            readerExpectation: '',
            forbiddenZones: [],
          },
        ],
      },
    };

    const pack = buildStartupPackFromOutline(outline);
    expect(pack?.chapterBlocks[0].forbiddenZones).toBeUndefined();
  });

  it('storyScale 缺失时返回 undefined', () => {
    const outline: GeneratedOutline = {
      id: 'g-3',
      title: '无规模',
      synopsis: '',
      structure: { act1: '', act2a: '', act2b: '', act3: '' },
      characters: [],
      foreshadows: [],
      estimatedWordCount: 100000,
    };
    expect(buildStoryScaleFromOutline(outline)).toBeUndefined();
  });

  it('续写上下文能读到启动包禁区', () => {
    const generated = mapExecutableOutlineToGeneratedOutline(makeExecutableOutline(), {
      targetWordCountRange: '80万-150万字',
    });
    const payload = buildLongformPersistPayload(generated);

    const prompt = buildEnhancedDesignPrompt({
      projectTitle: generated.title,
      projectSynopsis: generated.synopsis,
      projectGenre: generated.genres || [],
      currentChapter: {
        title: '第1章',
        description: '开篇',
        orderIndex: 0,
      },
      currentChapterOutline: '开篇',
      startupPack: payload.metadata.startupPack,
    });

    expect(prompt).toContain('不能让药老提前暴露真实身份');
    expect(prompt).toContain('不可提前兑现终局异火');
  });
});
