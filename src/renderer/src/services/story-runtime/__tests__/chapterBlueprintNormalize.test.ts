import { describe, expect, it } from 'vitest';

import {
  buildMidChapterCen,
  distillEndingTip,
  enrichThinCpns,
  extractCbnConsequence,
  isHollowChapterHook,
  isMetaInstructionCen,
  isProseDebrisTip,
  isTemplateHookCen,
  normalizeChapterBlueprint,
  sanitizeInheritedCbn,
} from '../chapterBlueprintNormalize';

describe('chapterBlueprintNormalize', () => {
  it('将「推进至：=唯一 CPN」改写为具体后果，并补齐薄 CPN', () => {
    const cbn =
      '现代法医宋辞穿越成贱籍仵作，正在验尸时当众指出死者系县令公子刘文韬所害，被刘文韬反诬入狱，必须在三天内用尸检铁证翻案自证清白，否则将被处斩';
    const normalized = normalizeChapterBlueprint(
      {
        title: '第1章',
        goal: '第1章',
        CBN: cbn,
        CPNs: ['穿越醒来正在验尸'],
        CEN: '推进至：穿越醒来正在验尸',
        mustCover: ['穿越醒来正在验尸'],
      },
      1
    );

    expect(normalized.CEN).not.toMatch(/^推进至[：:]/u);
    expect(isMetaInstructionCen(normalized.CEN)).toBe(false);
    expect(isHollowChapterHook(normalized.CEN, normalized.CPNs)).toBe(false);
    expect(normalized.CEN).toMatch(/处斩|翻案|入狱|危机|后果|施压|压迫/);
    expect(normalized.goal).not.toBe('第1章');
    expect(normalized.mustCover).toContain(normalized.CBN);
    expect(normalized.mustCover).toContain(normalized.CEN);
    expect(normalized.CPNs.length).toBeGreaterThan(1);
    expect(normalized.CPNs[0]).toBe('穿越醒来正在验尸');
  });

  it('多节点也不再输出推进至：末节点', () => {
    const cen = buildMidChapterCen(['当众指凶', '被反诬入狱'], '当众指凶后被反诬入狱三日处斩');
    expect(cen).not.toMatch(/^推进至[：:]/u);
    expect(isHollowChapterHook(cen, ['当众指凶', '被反诬入狱'])).toBe(false);
  });

  it('改写元指令型 CEN', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: '当众指凶后被反诬入狱，三日后处斩',
        CPNs: ['穿越醒来正在验尸'],
        CEN: '章末钩子：在完成「穿越醒来正在验尸」后立即抛出下一拍冲突，情节不得原地重复开场',
      },
      2
    );
    expect(isMetaInstructionCen(normalized.CEN)).toBe(false);
    expect(normalized.CEN).not.toContain('情节不得原地重复开场');
  });

  it('enrichThinCpns 从 CBN 子句补节点', () => {
    const enriched = enrichThinCpns(
      ['穿越醒来正在验尸'],
      '现代法医宋辞穿越成贱籍仵作，正在验尸时当众指出死者系县令公子刘文韬所害，被刘文韬反诬入狱'
    );
    expect(enriched.length).toBeGreaterThan(1);
    expect(enriched[0]).toBe('穿越醒来正在验尸');
  });

  it('buildMidChapterCen 优先抽取 CBN 后果', () => {
    const cbn =
      '现代法医宋辞穿越成贱籍仵作，正在验尸时当众指出死者系县令公子刘文韬所害，被刘文韬反诬入狱，必须在三天内用尸检铁证翻案自证清白，否则将被处斩';
    const cen = buildMidChapterCen(['穿越醒来正在验尸'], cbn);
    expect(extractCbnConsequence(cbn, ['穿越醒来正在验尸'])).toBeTruthy();
    expect(cen).not.toMatch(/情节不得原地重复开场/);
    expect(cen.length).toBeGreaterThan(8);
  });

  it('sanitizeInheritedCbn 消除承接+推进至套娃，优先上章结尾', () => {
    const { cbn, changed } = sanitizeInheritedCbn('承接上章结尾：推进至：穿越醒来正在验尸', {
      cpns: ['当众指出凶手是县令公子'],
      previousEnding: '他潜入停尸房，银针刺入穴位准备明日指认。',
    });
    expect(changed).toBe(true);
    expect(cbn).not.toMatch(/推进至[：:]/u);
    expect(cbn).not.toMatch(/承接上章危机后继续推进/);
    expect(cbn).toContain('银针');
  });

  it('isHollowChapterHook 识别空壳', () => {
    expect(isHollowChapterHook('推进至：当众指凶', ['当众指凶'])).toBe(true);
    expect(isHollowChapterHook('承接上章危机后继续推进：当众指凶', ['当众指凶'])).toBe(true);
    expect(isHollowChapterHook('本章只推进到可落地的下一拍危机', ['当众指凶'])).toBe(true);
    expect(isTemplateHookCen('当众指凶之后立刻陷入不可逆危机，倒计时或反噬压到眼前')).toBe(
      true
    );
    expect(
      isHollowChapterHook('当众指凶之后立刻陷入不可逆危机，倒计时或反噬压到眼前', ['当众指凶'])
    ).toBe(true);
    expect(isHollowChapterHook('当众指凶之后立刻陷入三日处斩倒计时', ['当众指凶'])).toBe(false);
  });

  it('清洗泄漏的流程话术，不再进入 CPN/CEN', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: '开场承接：当众指出凶手是县令公子，本章只推进到可落地的下一拍危机',
        CPNs: ['当众指出凶手是县令公子', '本章只推进到可落地的下一拍危机'],
        CEN: '本章只推进到可落地的下一拍危机已经发生，章末落在其直接后果与新的压迫感上，并抛出下一拍未解问题',
        mustCover: ['当众指出凶手是县令公子', '本章只推进到可落地的下一拍危机'],
      },
      2
    );

    expect(normalized.CBN).toBe('开场承接：当众指出凶手是县令公子');
    expect(normalized.CBN).not.toContain('本章只推进到可落地');
    expect(normalized.CPNs.every(item => !item.includes('本章只推进到可落地'))).toBe(true);
    expect(normalized.CEN).not.toContain('本章只推进到可落地');
    expect(normalized.CEN).not.toContain('抛出下一拍未解问题');
    expect(normalized.mustCover.every(item => !item.includes('本章只推进到可落地'))).toBe(true);
    expect(normalized.CPNs[0]).toBe('当众指出凶手是县令公子');
  });

  it('优先上章 CEN 作承接，拒绝正文碎片 tip', () => {
    const debris =
      '下来，密信烧成了灰。你指望知府？他天亮前赶不到。”说罢，他起身，将刀尖伸进炭炉里，烧得滋滋作响。';
    expect(isProseDebrisTip(debris)).toBe(true);

    const { cbn } = sanitizeInheritedCbn('承接上章结尾：推进至：被反诬入狱', {
      cpns: ['被反诬入狱'],
      previousEnding: debris,
      previousCen: '必须在三天内用尸检铁证翻案自证清白，否则将被处斩',
    });
    expect(cbn).toContain('三天内用尸检铁证翻案');
    expect(cbn).not.toMatch(/密信烧成了灰|刀尖伸进炭炉/);
  });

  it('模板空壳 CEN 会被改写，不再输出不可逆危机套话', () => {
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: '开场承接：当众指出凶手是县令公子',
        CPNs: ['当众指出凶手是县令公子'],
        CEN: '当众指出凶手是县令公子之后立刻陷入不可逆危机，倒计时或反噬压到眼前',
        mustCover: ['当众指出凶手是县令公子'],
        goal: '狱中三日，凭尸检细节逼迫县衙公开复验',
      },
      2,
      {
        previousCen: '必须在三天内用尸检铁证翻案自证清白，否则将被处斩',
      }
    );

    expect(normalized.CEN).not.toMatch(/不可逆危机|倒计时或反噬/);
    expect(normalized.CEN).toMatch(/复验|尸检|狱中/);
    expect(normalized.CBN).toContain('三天内用尸检铁证翻案');
  });

  it('读者期待/企划口吻不得进入 CEN/CPN，也不连锁污染', () => {
    const readerGoal =
      '完成穿越设定，建立主角技术权威，制造生死危机，开启三日翻案倒计时，让读者对主角的技术能力和处境产生强烈代入感；读者期待：建立“技术流爽文”预期';
    const normalized = normalizeChapterBlueprint(
      {
        title: '第2章',
        CBN: '开场承接：当众指出凶手是县令公子',
        CPNs: ['当众指出凶手是县令公子'],
        CEN: '当众指出凶手是县令公子之后立刻陷入不可逆危机，倒计时或反噬压到眼前',
        mustCover: ['当众指出凶手是县令公子'],
        goal: readerGoal,
        description: readerGoal,
      },
      2,
      {
        previousCen: '必须在三天内用尸检铁证翻案自证清白，否则将被处斩',
      }
    );

    expect(normalized.CEN).not.toMatch(/读者期待|代入感|技术流爽文|完成穿越设定/);
    expect(normalized.CBN).toContain('三天内用尸检铁证翻案');
    expect(normalized.CBN).not.toMatch(/读者期待|完成穿越设定/);
    expect(normalized.CPNs.every(item => !/读者期待|完成穿越设定|建立主角技术权威/.test(item))).toBe(
      true
    );
  });
});
