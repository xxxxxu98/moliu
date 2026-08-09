import { describe, expect, it } from 'vitest';

import {
  buildMidChapterCen,
  distillEndingTip,
  enrichThinCpns,
  extractCbnConsequence,
  isCrossChapterGoal,
  isHollowChapterHook,
  isMetaInstructionCen,
  isProseDebrisTip,
  isTemplateHookCen,
  normalizeChapterBlueprint,
  sanitizeInheritedCbn,
} from '../chapterBlueprintNormalize';
import { GENERIC_PLOT } from './genericPlotFixtures';

describe('chapterBlueprintNormalize', () => {
  it('将「推进至：=唯一 CPN」改写为具体后果，并补齐薄 CPN', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第1章',
        goal: '第1章',
        CBN: GENERIC_PLOT.richCbn,
        CPNs: [GENERIC_PLOT.openingBeat],
        CEN: `推进至：${GENERIC_PLOT.openingBeat}`,
        mustCover: [GENERIC_PLOT.openingBeat],
      },
      1
    );

    expect(normalized.CEN).not.toMatch(/^推进至[：:]/u);
    expect(isMetaInstructionCen(normalized.CEN)).toBe(false);
    expect(isHollowChapterHook(normalized.CEN, normalized.CPNs)).toBe(false);
    expect(normalized.CEN).toMatch(/处斩|翻案|入狱|危机|后果|施压|压迫/);
    expect(normalized.goal).not.toBe('第1章');
    // CEN 是短威胁钩子（否则将被处斩），非跨章目标，应纳入 mustCover 验收；
    // 跨章目标（三天内翻案）的拦截由 isCrossChapterGoal 独立用例覆盖
    expect(isCrossChapterGoal(normalized.CEN)).toBe(false);
    expect(normalized.mustCover).toContain(normalized.CEN);
    expect(normalized.CPNs.length).toBeGreaterThan(1);
    expect(normalized.CPNs[0]).toBe(GENERIC_PLOT.openingBeat);
  });

  it('isCrossChapterGoal 识别限期/威胁组合目标，放过单句钩子与多子句单章节点', () => {
    expect(isCrossChapterGoal('必须在三天内用铁证翻案自证清白，否则将被处斩')).toBe(true);
    expect(isCrossChapterGoal('承接上章结尾：必须在三天内用铁证翻案自证清白')).toBe(true);
    expect(isCrossChapterGoal('限期翻案，否则将被处斩')).toBe(true);
    expect(isCrossChapterGoal('否则将被处斩')).toBe(false);
    expect(isCrossChapterGoal('当众指认真凶后反被诬陷入狱，三日后处斩')).toBe(true);
    expect(isCrossChapterGoal('主角在现场发现关键线索')).toBe(false);
    expect(isCrossChapterGoal('狱中梳理证据漏洞')).toBe(false);
    expect(isCrossChapterGoal('当众指认真凶后对手反手施压，倒计时与证据链同时收紧')).toBe(false);
    // 多子句但单章可兑现的节点不得误伤（与生成 prompt「场景链合并为一条」约束一致）
    expect(isCrossChapterGoal('收集证词，锁定真凶，公堂对峙')).toBe(false);
    expect(isCrossChapterGoal('翻出证物，当众指认，反被下狱')).toBe(false);
    expect(isCrossChapterGoal('醒来验尸，当众指认，却被诬入狱')).toBe(false);
  });

  it('isCrossChapterGoal 识别弧线终态式跨章目标（卷级 objective 常见）', () => {
    // 卷级 objective 写法：完成/实现/达成 + 大跨度 + 终态动作词
    // 这类是整卷主线，单章无法完整兑现，注入 mustCover 会触发死循环
    expect(isCrossChapterGoal('完成临水县从空壳穷县到模范县的逆转')).toBe(true);
    expect(isCrossChapterGoal('实现家族复兴')).toBe(true);
    expect(isCrossChapterGoal('达成天下统一')).toBe(true);
    expect(isCrossChapterGoal('做到全行业称霸')).toBe(true);
    expect(isCrossChapterGoal('完成逆袭')).toBe(true);
    expect(isCrossChapterGoal('实现从草根到权臣的崛起')).toBe(true);
    expect(isCrossChapterGoal('完成蜕变')).toBe(true);

    // 单章可兑现的节奏点：终态词单独出现（无「完成/实现」前缀）不算跨章目标，
    // 避免误伤「本章破局」「当堂翻案」「翻身打脸」这类合法单章爽点
    expect(isCrossChapterGoal('逆转劣势')).toBe(false);
    expect(isCrossChapterGoal('翻身打脸')).toBe(false);
    expect(isCrossChapterGoal('当堂翻案')).toBe(false);
    expect(isCrossChapterGoal('本章破局靠的是数据')).toBe(false);
    expect(isCrossChapterGoal('这次翻身靠的是数据')).toBe(false);
    // 来自 smoke 实测的正常单章 mustCover 节点也不应误伤
    expect(isCrossChapterGoal('醒来并承认自己成了临水县新任知县')).toBe(false);
    expect(isCrossChapterGoal('身前是残破县衙和堆积旧账。')).toBe(false);
    expect(isCrossChapterGoal('门外差役高喊钱老爷的拜帖到了。')).toBe(false);
  });

  it('多节点也不再输出推进至：末节点', () => {
    const cen = buildMidChapterCen(
      [GENERIC_PLOT.accuseBeat, GENERIC_PLOT.framedBeat],
      `${GENERIC_PLOT.accuseBeat}后${GENERIC_PLOT.framedBeat}三日处斩`
    );
    expect(cen).not.toMatch(/^推进至[：:]/u);
    expect(isHollowChapterHook(cen, [GENERIC_PLOT.accuseBeat, GENERIC_PLOT.framedBeat])).toBe(
      false
    );
  });

  it('改写元指令型 CEN', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: GENERIC_PLOT.midCbn,
        CPNs: [GENERIC_PLOT.openingBeat],
        CEN: `章末钩子：在完成「${GENERIC_PLOT.openingBeat}」后立即抛出下一拍冲突，情节不得原地重复开场`,
      },
      2
    );
    expect(isMetaInstructionCen(normalized.CEN)).toBe(false);
    expect(normalized.CEN).not.toContain('情节不得原地重复开场');
  });

  it('enrichThinCpns 从 CBN 子句补节点', () => {
    const enriched = enrichThinCpns([GENERIC_PLOT.openingBeat], GENERIC_PLOT.richCbn);
    expect(enriched.length).toBeGreaterThan(1);
    expect(enriched[0]).toBe(GENERIC_PLOT.openingBeat);
  });

  it('buildMidChapterCen 优先抽取 CBN 后果', () => {
    const cen = buildMidChapterCen([GENERIC_PLOT.openingBeat], GENERIC_PLOT.richCbn);
    expect(extractCbnConsequence(GENERIC_PLOT.richCbn, [GENERIC_PLOT.openingBeat])).toBeTruthy();
    expect(cen).not.toMatch(/情节不得原地重复开场/);
    expect(cen.length).toBeGreaterThan(8);
  });

  it('sanitizeInheritedCbn 消除承接+推进至套娃，优先上章结尾', () => {
    const { cbn, changed } = sanitizeInheritedCbn(
      `承接上章结尾：推进至：${GENERIC_PLOT.openingBeat}`,
      {
        cpns: [GENERIC_PLOT.accuseBeat],
        previousEnding: GENERIC_PLOT.previousEndingAction,
      }
    );
    expect(changed).toBe(true);
    expect(cbn).not.toMatch(/推进至[：:]/u);
    expect(cbn).not.toMatch(/承接上章危机后继续推进/);
    expect(cbn).toContain('银针');
  });

  it('isHollowChapterHook 识别空壳', () => {
    expect(isHollowChapterHook(`推进至：${GENERIC_PLOT.accuseBeat}`, [GENERIC_PLOT.accuseBeat])).toBe(
      true
    );
    expect(
      isHollowChapterHook(`承接上章危机后继续推进：${GENERIC_PLOT.accuseBeat}`, [
        GENERIC_PLOT.accuseBeat,
      ])
    ).toBe(true);
    expect(isHollowChapterHook('本章只推进到可落地的下一拍危机', [GENERIC_PLOT.accuseBeat])).toBe(
      true
    );
    expect(
      isTemplateHookCen(`${GENERIC_PLOT.accuseBeat}之后立刻陷入不可逆危机，倒计时或反噬压到眼前`)
    ).toBe(true);
    expect(
      isHollowChapterHook(`${GENERIC_PLOT.accuseBeat}之后立刻陷入不可逆危机，倒计时或反噬压到眼前`, [
        GENERIC_PLOT.accuseBeat,
      ])
    ).toBe(true);
    expect(
      isHollowChapterHook(`${GENERIC_PLOT.accuseBeat}之后立刻陷入三日处斩倒计时`, [
        GENERIC_PLOT.accuseBeat,
      ])
    ).toBe(false);
  });

  it('清洗泄漏的流程话术，不再进入 CPN/CEN', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: `开场承接：${GENERIC_PLOT.accuseBeat}，本章只推进到可落地的下一拍危机`,
        CPNs: [GENERIC_PLOT.accuseBeat, '本章只推进到可落地的下一拍危机'],
        CEN: '本章只推进到可落地的下一拍危机已经发生，章末落在其直接后果与新的压迫感上，并抛出下一拍未解问题',
        mustCover: [GENERIC_PLOT.accuseBeat, '本章只推进到可落地的下一拍危机'],
      },
      2
    );

    // CBN 清洗后不再保留「开场承接：」模板前缀（去前缀独立事件句）
    expect(normalized.CBN).toBe(GENERIC_PLOT.accuseBeat);
    expect(normalized.CBN).not.toContain('本章只推进到可落地');
    expect(normalized.CPNs.every(item => !item.includes('本章只推进到可落地'))).toBe(true);
    expect(normalized.CEN).not.toContain('本章只推进到可落地');
    expect(normalized.CEN).not.toContain('抛出下一拍未解问题');
    expect(normalized.mustCover.every(item => !item.includes('本章只推进到可落地'))).toBe(true);
    expect(normalized.CPNs[0]).toBe(GENERIC_PLOT.accuseBeat);
  });

  it('优先上章 CEN 作承接，拒绝正文碎片 tip', () => {
    expect(isProseDebrisTip(GENERIC_PLOT.proseDebris)).toBe(true);

    const { cbn } = sanitizeInheritedCbn(`承接上章结尾：推进至：${GENERIC_PLOT.framedBeat}`, {
      cpns: [GENERIC_PLOT.framedBeat],
      previousEnding: GENERIC_PLOT.proseDebris,
      previousCen: GENERIC_PLOT.chapterEndStakes,
    });
    expect(cbn).toContain('三天内用铁证翻案');
    expect(cbn).not.toMatch(/密信烧成了灰|刀尖伸进炭炉/);
  });

  it('模板空壳 CEN 会被改写，不再输出不可逆危机套话', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: `开场承接：${GENERIC_PLOT.accuseBeat}`,
        CPNs: [GENERIC_PLOT.accuseBeat],
        CEN: `${GENERIC_PLOT.accuseBeat}之后立刻陷入不可逆危机，倒计时或反噬压到眼前`,
        mustCover: [GENERIC_PLOT.accuseBeat],
        goal: GENERIC_PLOT.chapterGoal,
      },
      2,
      {
        previousCen: GENERIC_PLOT.chapterEndStakes,
      }
    );

    expect(normalized.CEN).not.toMatch(/不可逆危机|倒计时或反噬/);
    expect(normalized.CEN).toMatch(/复验|证据|狱中/);
    expect(normalized.CBN).toContain('三天内用铁证翻案');
  });

  it('读者期待/企划口吻不得进入 CEN/CPN，也不连锁污染', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: `开场承接：${GENERIC_PLOT.accuseBeat}`,
        CPNs: [GENERIC_PLOT.accuseBeat],
        CEN: `${GENERIC_PLOT.accuseBeat}之后立刻陷入不可逆危机，倒计时或反噬压到眼前`,
        mustCover: [GENERIC_PLOT.accuseBeat],
        goal: GENERIC_PLOT.readerMetaGoal,
        description: GENERIC_PLOT.readerMetaGoal,
      },
      2,
      {
        previousCen: GENERIC_PLOT.chapterEndStakes,
      }
    );

    expect(normalized.CEN).not.toMatch(/读者期待|代入感|爽文预期|完成开篇设定/);
    expect(normalized.CBN).toContain('三天内用铁证翻案');
    expect(normalized.CBN).not.toMatch(/读者期待|完成开篇设定/);
    expect(normalized.CPNs.every(item => !/读者期待|完成开篇设定|建立主角权威/.test(item))).toBe(
      true
    );
  });

  it('distillEndingTip 能从动作场面提炼 tip', () => {
    const tip = distillEndingTip(
      '守卫锁上门离开。主角将刀尖伸进炭炉里，烧得滋滋作响，准备烙开密信封口。'
    );
    expect(tip).toBeTruthy();
    expect(tip).toMatch(/炭炉|密信|烙开/);
  });
});
