import { describe, expect, it } from 'vitest';

import {
  VOCABULARY_TIER_LABELS,
  normalizeVocabularyTier,
  renderBlueprintVocabularyRule,
  renderVocabularyRules,
  renderGoldenChapterRules,
  GOLDEN_CHAPTER_CONSTRAINTS,
} from '../proseRules';

describe('normalizeVocabularyTier', () => {
  it('显式英文档位值直通', () => {
    expect(normalizeVocabularyTier({ tier: 'hardcore' })).toBe('hardcore');
    expect(normalizeVocabularyTier({ tier: 'balanced' })).toBe('balanced');
    expect(normalizeVocabularyTier({ tier: 'plain' })).toBe('plain');
  });

  it('中文标签与混合写法可识别（解析器产出可能带中文）', () => {
    expect(normalizeVocabularyTier({ tier: 'hardcore 硬核技术流' })).toBe('hardcore');
    expect(normalizeVocabularyTier({ tier: '小白大白话' })).toBe('plain');
    expect(normalizeVocabularyTier({ tier: '均衡' })).toBe('balanced');
  });

  it('显式档位支持 vocabularyTier 键名（整份 outlinePositioning 直接传入的形态）', () => {
    expect(
      normalizeVocabularyTier({
        vocabularyTier: 'plain',
        styleKeywords: ['冷峻', '硬核', '严密推演'],
        targetReaders: [],
        coreEmotions: [],
        genres: ['悬疑'],
      })
    ).toBe('plain');
  });

  it('无显式档位时从 styleKeywords 推导（深海回声实测形态）', () => {
    expect(
      normalizeVocabularyTier({
        styleKeywords: ['冷峻', '硬核', '密闭压迫', '严密推演', '智力绞杀'],
      })
    ).toBe('hardcore');
    expect(normalizeVocabularyTier({ styleKeywords: ['轻松', '爽文', '快节奏'] })).toBe('plain');
  });

  it('targetReaders 信号同样参与推导', () => {
    expect(normalizeVocabularyTier({ targetReaders: ['硬核悬疑推理解谜爱好者'] })).toBe(
      'hardcore'
    );
    expect(normalizeVocabularyTier({ targetReaders: ['小白读者'] })).toBe('plain');
  });

  it('硬核与小白信号冲突时回落 balanced（不得偏向任一侧）', () => {
    expect(
      normalizeVocabularyTier({ styleKeywords: ['硬核', '轻松搞笑'] })
    ).toBe('balanced');
  });

  it('空输入/非法值/空串回落 balanced（旧书兼容）', () => {
    expect(normalizeVocabularyTier({})).toBe('balanced');
    expect(normalizeVocabularyTier({ tier: '宇宙级' })).toBe('balanced');
    expect(normalizeVocabularyTier({ tier: '  ' })).toBe('balanced');
    expect(normalizeVocabularyTier({ styleKeywords: 'not-an-array' })).toBe('balanced');
  });
});

describe('renderVocabularyRules', () => {
  it('三档规则互不相同且都带档位标签', () => {
    const hardcore = renderVocabularyRules('hardcore');
    const balanced = renderVocabularyRules('balanced');
    const plain = renderVocabularyRules('plain');
    expect(hardcore.join('\n')).toContain(VOCABULARY_TIER_LABELS.hardcore);
    expect(balanced.join('\n')).toContain(VOCABULARY_TIER_LABELS.balanced);
    expect(plain.join('\n')).toContain(VOCABULARY_TIER_LABELS.plain);
    expect(new Set([hardcore.join(), balanced.join(), plain.join()]).size).toBe(3);
  });

  it('hardcore 允许专业词但保留术语落地底线（任何档位不放开可读性）', () => {
    const rules = renderVocabularyRules('hardcore').join('\n');
    expect(rules).toContain('允许使用');
    // 落地底线条款 + 正反例（《深海回声》实测语料）
    expect(rules).toContain('术语落地底线');
    expect(rules).toContain('雷击纹');
    expect(rules).toContain('氢脆');
    expect(rules).toContain('每千字不超过 10');
  });

  it('plain 明确禁止非日常术语并要求大白话转译', () => {
    const rules = renderVocabularyRules('plain').join('\n');
    expect(rules).toContain('禁止非日常专业术语');
    expect(rules).toContain('转译成大白话');
  });

  it('balanced 限定术语个位数且须当场解释', () => {
    const rules = renderVocabularyRules('balanced').join('\n');
    expect(rules).toContain('个位数');
    expect(rules).toContain('当场解释');
  });

  it('缺省档位渲染 balanced（规则永远在场，只有宽严之分）', () => {
    expect(renderVocabularyRules()).toEqual(renderVocabularyRules('balanced'));
  });
});

describe('renderBlueprintVocabularyRule', () => {
  it('三档节点语言规则互不相同', () => {
    const rules = [
      renderBlueprintVocabularyRule('hardcore'),
      renderBlueprintVocabularyRule('balanced'),
      renderBlueprintVocabularyRule('plain'),
    ];
    expect(new Set(rules).size).toBe(3);
    for (const rule of rules) {
      expect(rule).toContain('蓝图节点');
    }
  });

  it('hardcore 节点规则给出「术语索引→白话因果」的改写示范', () => {
    expect(renderBlueprintVocabularyRule('hardcore')).toContain('断裂力学');
  });

  it('缺省档位为 balanced', () => {
    expect(renderBlueprintVocabularyRule()).toBe(renderBlueprintVocabularyRule('balanced'));
  });
});

describe('renderGoldenChapterRules', () => {
  it('第一章(chapterNumber=0)返回完整规则集', () => {
    const rules = renderGoldenChapterRules(0);
    expect(rules.length).toBeGreaterThan(0);
    const text = rules.join('\n');
    expect(text).toContain('【黄金开篇】');
    expect(text).toContain('【第一章·世界观窗口】');
    expect(text).toContain('【第一章·主角人设】');
    expect(text).toContain('【第一章·开场钩子】');
    expect(text).toContain('【第一章·金手指露出】');
    expect(text).toContain('前 30% 篇幅');
    expect(text).toContain('前 3 段内');
  });

  it('第二章(chapterNumber=1)返回主线目标规则', () => {
    const rules = renderGoldenChapterRules(1);
    expect(rules.length).toBeGreaterThan(0);
    const text = rules.join('\n');
    expect(text).toContain('【黄金开篇】');
    expect(text).toContain('【第二章·主线目标】');
    expect(text).toContain('【第二章·首个爽点】');
    expect(text).toContain('【第二章·对立建立】');
    expect(text).toContain('【第二章·期待感】');
    expect(text).toContain('压制→反击→小胜');
  });

  it('第三章(chapterNumber=2)返回金手指展示规则', () => {
    const rules = renderGoldenChapterRules(2);
    expect(rules.length).toBeGreaterThan(0);
    const text = rules.join('\n');
    expect(text).toContain('【黄金开篇】');
    expect(text).toContain('【第三章·金手指展示】');
    expect(text).toContain('【第三章·拉仇恨】');
    expect(text).toContain('【第三章·信息差】');
    expect(text).toContain('【第三章·长线悬念】');
    expect(text).toContain('【第三章·钩子强度】');
    expect(text).toContain('strong 级');
  });

  it('第四章及以后(chapterNumber>=3)返回空数组', () => {
    expect(renderGoldenChapterRules(3)).toEqual([]);
    expect(renderGoldenChapterRules(10)).toEqual([]);
    expect(renderGoldenChapterRules(100)).toEqual([]);
  });

  it('所有黄金三章规则都包含通用开篇约束', () => {
    for (let ch = 0; ch <= 2; ch++) {
      const rules = renderGoldenChapterRules(ch);
      const text = rules.join('\n');
      expect(text).toContain('【黄金开篇】');
      expect(text).toContain('【节奏密度】');
      expect(text).toContain('【爽点前置】');
      expect(text).toContain('【开篇段落强制短促】');
      expect(text).toContain('中位数目标35-40字');
      expect(text).toContain('对话占比≥35%');
    }
  });

  it('章节特定规则互不重叠', () => {
    const ch0Rules = renderGoldenChapterRules(0).join('\n');
    const ch1Rules = renderGoldenChapterRules(1).join('\n');
    const ch2Rules = renderGoldenChapterRules(2).join('\n');

    // 第一章规则不包含第二章或第三章标签
    expect(ch0Rules).not.toContain('【第二章·');
    expect(ch0Rules).not.toContain('【第三章·');

    // 第二章规则不包含第一章或第三章标签
    expect(ch1Rules).not.toContain('【第一章·');
    expect(ch1Rules).not.toContain('【第三章·');

    // 第三章规则不包含第一章或第二章标签
    expect(ch2Rules).not.toContain('【第一章·');
    expect(ch2Rules).not.toContain('【第二章·');
  });
});

describe('GOLDEN_CHAPTER_CONSTRAINTS', () => {
  it('定义了连续叙述段上限', () => {
    expect(GOLDEN_CHAPTER_CONSTRAINTS.maxContinuousNarration).toBe(2);
  });

  it('定义了对话占比下限', () => {
    expect(GOLDEN_CHAPTER_CONSTRAINTS.minDialogueRatio).toBe(0.35);
  });

  it('定义了段落长度目标', () => {
    expect(GOLDEN_CHAPTER_CONSTRAINTS.targetParagraphLength.median).toBe(40);
    expect(GOLDEN_CHAPTER_CONSTRAINTS.targetParagraphLength.p75).toBe(60);
  });

  it('定义了钩子强度要求', () => {
    expect(GOLDEN_CHAPTER_CONSTRAINTS.hookStrength.ch0).toBe('strong');
    expect(GOLDEN_CHAPTER_CONSTRAINTS.hookStrength.ch1).toBe('medium');
    expect(GOLDEN_CHAPTER_CONSTRAINTS.hookStrength.ch2).toBe('strong');
  });
});
