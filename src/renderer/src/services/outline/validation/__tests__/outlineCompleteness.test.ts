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
      keyCharacters: ['刑部主事郑伯昭，负责追查旧案'],
      setupForeshadows: [],
      payoffForeshadows: [],
      relationshipShifts: [],
    }];

    const result = inspectOutlineCompleteness(outline);

    expect(result.blockers.map(blocker => blocker.kind)).toContain('unknown-character-reference');
  });
});
