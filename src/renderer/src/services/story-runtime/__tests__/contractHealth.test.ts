import { describe, expect, it } from 'vitest';

import {
  sanitizeInheritedCbn,
} from '../chapterBlueprintNormalize';
import {
  detectMustCoverForbiddenConflicts,
  detectOpeningRepetitionIssue,
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

  it('enrichRevisionHint 将角色不出场细化为声音和帘后台词也禁止', () => {
    const hint = enrichRevisionHint('触发本章禁区：不得让皇帝出场。', [
      '帘子后面传来皇帝的声音',
    ]);
    expect(hint).toContain('【严格缺席】');
    expect(hint).toContain('幕后声音');
    expect(hint).toContain('删除该角色的一切台词');
  });

  it('enrichRevisionHint 为 fact_conflict 补充跨章状态对齐指引', () => {
    const hint = enrichRevisionHint('语义问题[fact_conflict] 第3章第5段: 上章已死的王镖头本章再次活动', [
      '王镖头扶着门框走进来',
    ]);
    expect(hint).toContain('【跨章状态以状态摘要为准】');
    expect(hint).toContain('已死/已离开');
    expect(hint).toContain('状态摘要');
  });

  it('enrichRevisionHint 为未知实体问题补充身份称呼/笔误修正指引', () => {
    const hint = enrichRevisionHint('事件 chapter-2:event-5 引用了未知实体 火种营地斥候', [
      '我是……火种营地的斥候',
    ]);
    expect(hint).toContain('【该名未在角色表登记】');
    expect(hint).toContain('身份称呼');
    expect(hint).toContain('正确名字');
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

  it('陈旧度门禁：终态角色的 mustCover/CPN 节点被裁剪（500章人物状态幻觉防线）', () => {
    const contracts = makeContracts();
    contracts.chapter.mustCover = [
      '林夜押送证物回府',
      '周茂现身公堂反扑',
      '清点赃款入库',
    ];
    contracts.chapter.CPNs = ['周茂当堂翻供', '林夜取得新证据'];
    const state = makeState();
    state.entities['char-zhoumao'] = {
      id: 'char-zhoumao',
      kind: 'character',
      name: '周茂',
      aliases: [],
      attributes: { status: '下狱' },
      knownBy: ['char-zhoumao'],
      sourceTrace: [],
    };
    const { chapter, report } = healChapterContract(contracts.chapter, { state });
    expect(chapter.mustCover).not.toContain('周茂现身公堂反扑');
    expect(chapter.mustCover).toContain('林夜押送证物回府');
    expect(chapter.CPNs).not.toContain('周茂当堂翻供');
    expect(report.notes.some(note => note.includes('终态'))).toBe(true);
  });

  it('开场重叠检测：本章开头复读上章结尾判 blocking，正常承接放过', () => {
    const prevEnding =
      '他攥紧了手中的账册，转身推开了库房的大门，门外的火把连成一片，将他的影子拉得很长很长。';
    const repeatedProse = `他攥紧了手中的账册，转身推开了库房的大门，门外的火把连成一片，将他的影子拉得很长很长。人群哗然而退。`;
    const issue = detectOpeningRepetitionIssue(repeatedProse, prevEnding);
    expect(issue).not.toBeNull();
    expect(issue!.severity).toBe('blocking');

    // 正常承接：只呼应一个短句就进入新动作
    const normalProse =
      '库房门外的火把还未熄灭，林夜已经翻身上马。三枚铜钱在掌心排成一列，每一枚都刻着漕帮的暗记——这是三年来第一次凑齐。';
    expect(detectOpeningRepetitionIssue(normalProse, prevEnding)).toBeNull();
    // 无上章结尾时不误报
    expect(detectOpeningRepetitionIssue(repeatedProse, '')).toBeNull();
  });
});
