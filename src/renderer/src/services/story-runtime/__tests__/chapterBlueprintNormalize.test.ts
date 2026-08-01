import { describe, expect, it } from 'vitest';

import {
  buildMidChapterCen,
  enrichThinCpns,
  extractCbnConsequence,
  isMetaInstructionCen,
  normalizeChapterBlueprint,
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
    expect(normalized.CEN).toMatch(/处斩|翻案|入狱/);
    expect(normalized.goal).not.toBe('第1章');
    expect(normalized.mustCover).toContain(normalized.CBN);
    expect(normalized.CPNs.length).toBeGreaterThan(1);
    expect(normalized.CPNs[0]).toBe('穿越醒来正在验尸');
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
});
