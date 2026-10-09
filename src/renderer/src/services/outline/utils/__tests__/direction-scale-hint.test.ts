/**
 * 方向卡规模提示：档位只认模型自标注，正文关键词不能抬分。
 */
import { describe, expect, it } from 'vitest';

import type { OutlineDirection } from '@/services/outline/types/direction';
import { buildDirectionScaleHint } from '@/services/outline/utils/direction-scale-hint';

function direction(overrides: Partial<OutlineDirection> = {}): OutlineDirection {
  return {
    id: 'direction-1',
    title: '测试方向',
    oneLiner: '一句话',
    premise: '前提',
    protagonistArc: '成长',
    coreConflict: '冲突',
    coolPointStyle: [],
    targetEmotions: [],
    riskNotes: [],
    recommendationScore: 0,
    recommendedReason: '',
    ...overrides,
  };
}

describe('buildDirectionScaleHint', () => {
  it('正文里的地图、反派、升级不会抬高承载力分', () => {
    const keywordHeavy = buildDirectionScaleHint(
      '100万-300万',
      direction({
        premise: '地图持续扩张',
        coreConflict: '反派势力争夺',
        protagonistArc: '境界升级',
        oneLiner: '悬念与关系',
      }),
    );
    const plain = buildDirectionScaleHint('100万-300万', direction());

    expect(keywordHeavy.longformCapacityScore).toBe(plain.longformCapacityScore);
    expect(keywordHeavy.longformCapacityTone).toBe('cautious');
    expect(keywordHeavy.longformCapacityScore).toBe(62);
    expect(keywordHeavy.improvementSuggestions).toEqual([]);
  });

  it('显式档位优先于推荐分', () => {
    const hint = buildDirectionScaleHint(
      '100万-300万',
      direction({
        recommendationScore: 40,
        longformCapacityTier: 'strong',
        longformGaps: ['补势力梯度'],
      }),
    );

    expect(hint.longformCapacityTone).toBe('strong');
    expect(hint.longformCapacityScore).toBe(40);
    expect(hint.improvementSuggestions).toEqual(['补势力梯度']);
    expect(hint.enhancementBrief).toContain('补势力梯度');
  });

  it('缺档位时按推荐分分档，0 分回落到待加强', () => {
    const strong = buildDirectionScaleHint(
      '100万-300万',
      direction({ recommendationScore: 90 }),
    );
    const missing = buildDirectionScaleHint('100万-300万', direction({ recommendationScore: 0 }));

    expect(strong.longformCapacityTone).toBe('strong');
    expect(strong.longformCapacityScore).toBe(90);
    expect(missing.longformCapacityTone).toBe('cautious');
    expect(missing.longformCapacityScore).toBe(62);
    expect(missing.startupPhaseRatio.endsWith('%')).toBe(true);
  });
});
