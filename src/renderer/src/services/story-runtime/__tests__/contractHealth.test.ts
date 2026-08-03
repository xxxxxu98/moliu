import { describe, expect, it } from 'vitest';

import {
  sanitizeInheritedCbn,
} from '../chapterBlueprintNormalize';
import {
  detectMustCoverForbiddenConflicts,
  enrichRevisionHint,
  healChapterContract,
  isForbiddenExemptForFulfillment,
  pruneFulfilledNodes,
  softenConflictingForbidden,
} from '../contractHealth';
import { GENERIC_PLOT } from './genericPlotFixtures';
import { makeContracts, makeState } from './testFixtures';

describe('contractHealth', () => {
  it('检测 mustCover×禁区揭示冲突并软化', () => {
    const mustCover = [GENERIC_PLOT.accuseBeat];
    const forbidden = [
      GENERIC_PLOT.forbiddenFactionFull,
      GENERIC_PLOT.forbiddenOutsideHelp,
      GENERIC_PLOT.forbiddenRevealFull,
    ];
    const conflicts = detectMustCoverForbiddenConflicts(mustCover, forbidden);
    expect(conflicts.some(item => item.kind === 'reveal')).toBe(true);
    expect(conflicts.some(item => item.forbidden.includes('全部真相'))).toBe(true);

    const { forbidden: softened, softened: changed } = softenConflictingForbidden(
      forbidden,
      conflicts
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(softened.some(zone => zone.includes('允许必要指认'))).toBe(true);
    expect(softened.some(zone => zone.includes('幕后势力'))).toBe(true);
  });

  it('清洗套娃 CBN：承接上章结尾：推进至：…', () => {
    const result = sanitizeInheritedCbn(`承接上章结尾：推进至：${GENERIC_PLOT.openingBeat}`, {
      cpns: [GENERIC_PLOT.accuseBeat],
    });
    expect(result.changed).toBe(true);
    expect(result.cbn).not.toMatch(/推进至[：:]/u);
    expect(result.cbn).toContain(GENERIC_PLOT.accuseBeat);
  });

  it('清洗后 CBN 不再保留「承接上章结尾/开场承接」前缀', () => {
    const result = sanitizeInheritedCbn(`承接上章结尾：${GENERIC_PLOT.openingBeat}`, {
      cpns: [GENERIC_PLOT.accuseBeat],
    });
    expect(result.changed).toBe(true);
    expect(result.cbn).not.toMatch(/^(承接上章结尾|开场承接|承接前段|承接前章结尾继续)[：:]/u);
    expect(result.cbn).toContain(GENERIC_PLOT.openingBeat);
  });

  it('按上章事件去重 mustCover', () => {
    const { kept, pruned } = pruneFulfilledNodes(
      [GENERIC_PLOT.accuseBeat, GENERIC_PLOT.framedBeat, GENERIC_PLOT.altNextBeat],
      {
        priorEventSummaries: [GENERIC_PLOT.priorEventSummary],
      }
    );
    expect(pruned).toContain(GENERIC_PLOT.accuseBeat);
    expect(pruned).toContain(GENERIC_PLOT.framedBeat);
    expect(kept).toContain(GENERIC_PLOT.altNextBeat);
  });

  it('软匹配去重：反诬+死牢 可裁掉「被反诬入狱」', () => {
    const { kept, pruned } = pruneFulfilledNodes(
      [GENERIC_PLOT.framedBeat, GENERIC_PLOT.nextBeat],
      {
        priorEventSummaries: [GENERIC_PLOT.priorEventSummaryJail],
      }
    );
    expect(pruned).toContain(GENERIC_PLOT.framedBeat);
    expect(kept).toContain(GENERIC_PLOT.nextBeat);
  });

  it('healChapterContract 综合清洗', () => {
    const contracts = makeContracts();
    contracts.chapter.CBN = `承接上章结尾：推进至：${GENERIC_PLOT.openingBeat}`;
    contracts.chapter.CPNs = [GENERIC_PLOT.accuseBeat];
    contracts.chapter.mustCover = [GENERIC_PLOT.accuseBeat];
    contracts.chapter.forbidden = [
      GENERIC_PLOT.forbiddenRevealFull,
      GENERIC_PLOT.forbiddenOutsideHelp,
    ];

    const state = makeState();
    state.events = [
      {
        id: 'chapter-1:event:2',
        chapter: 1,
        sceneId: 'chapter-1:scene',
        type: '指控冲突',
        summary: GENERIC_PLOT.priorEventSummary,
        participants: [],
        causes: [],
        effects: [],
        evidence: [],
      },
    ];

    const { chapter, report } = healChapterContract(contracts.chapter, { state });
    expect(report.cbnSanitized).toBe(true);
    expect(chapter.CBN).not.toMatch(/推进至[：:]/u);
    expect(report.conflicts.length).toBeGreaterThan(0);
    expect(chapter.forbidden.some(zone => zone.includes('允许必要指认'))).toBe(true);
    expect(report.notes.length).toBeGreaterThan(0);
  });

  it('enrichRevisionHint 给出负例与正向替代', () => {
    const hint = enrichRevisionHint(`触发本章禁区：${GENERIC_PLOT.forbiddenOutsideHelp}`, [
      '黑衣人递进干粮和金疮药',
    ]);
    expect(hint).toContain('【禁止】');
    expect(hint).toContain('【改为】');
  });

  it('履约豁免：指认类禁区触发可放过', () => {
    expect(
      isForbiddenExemptForFulfillment(
        `${GENERIC_PLOT.forbiddenRevealFull}（本章为履约「${GENERIC_PLOT.accuseBeat}」允许必要指认与证据展示；禁止提前完结翻案）`,
        [GENERIC_PLOT.accuseBeat],
        '通过现场证据当众指认反派是凶手'
      )
    ).toBe(true);
    // reveal 型软化：帮助类 reason 不放行（帮越狱≠指认举证）
    expect(
      isForbiddenExemptForFulfillment(
        `${GENERIC_PLOT.forbiddenRevealFull}（本章为履约「${GENERIC_PLOT.accuseBeat}」允许必要指认与证据展示；禁止提前完结翻案）`,
        [GENERIC_PLOT.accuseBeat],
        '师爷放火开锁帮助主角越狱'
      )
    ).toBe(false);
    // help 型软化：指认/证据类 reason 不放行，仅「获得帮助」类 reason 豁免
    const helpZone = `不能让主角提前获得外界帮助（本章 mustCover「${GENERIC_PLOT.accuseBeat}」所需帮助除外；禁止无剧情依据的神秘人开挂援助）`;
    expect(
      isForbiddenExemptForFulfillment(helpZone, [GENERIC_PLOT.accuseBeat], '通过现场证据当众指认反派是凶手')
    ).toBe(false);
    expect(
      isForbiddenExemptForFulfillment(helpZone, [GENERIC_PLOT.accuseBeat], 'mustCover 要求主角获得狱卒帮助')
    ).toBe(true);
  });
});
