/**
 * 方向卡的规模提示。
 * 承载力档位只认模型自标注；缺档位时用推荐分分档，不扫描正文关键词。
 */
import type { OutlineDirection } from '@/services/outline/types/direction';
import { buildWordCountBreakdown } from '@/services/outline/utils';

export type DirectionCapacityTone = 'strong' | 'medium' | 'cautious';

export interface DirectionScaleHint {
  targetWordCountLabel: string;
  estimatedChapterCount: number;
  suggestedVolumeCount: number;
  estimatedChaptersPerVolume: number;
  startupPhaseRatio: string;
  longformCapacityScore: number;
  longformCapacityLabel: string;
  longformCapacityTone: DirectionCapacityTone;
  improvementSuggestions: string[];
  enhancementBrief: string;
}

const TONE_LABEL: Record<DirectionCapacityTone, string> = {
  strong: '长篇承载力强',
  medium: '长篇承载力稳',
  cautious: '长篇承载力待加强',
};

/** 模型没写档位时，用它已经给出的推荐分分档。0 分视为未标注。 */
function tierFromRecommendationScore(score: number): DirectionCapacityTone {
  if (score >= 88) return 'strong';
  if (score >= 76) return 'medium';
  return 'cautious';
}

/**
 * 把方向卡和字数区间收成卡片上的规模提示。
 * 补强句只来自模型写的「长篇补强」，没有就不编。
 */
/**
 * 用模型自标注的档位和补强短语生成方向卡规模提示。
 * 没有档位时按推荐分分档，不扫描方向正文。
 */
export function buildDirectionScaleHint(
  wordCountRange: string,
  direction: OutlineDirection,
): DirectionScaleHint {
  const breakdown = buildWordCountBreakdown(wordCountRange);
  const tone = direction.longformCapacityTier ?? tierFromRecommendationScore(direction.recommendationScore);
  const score = direction.recommendationScore > 0
    ? Math.min(100, Math.round(direction.recommendationScore))
    : tone === 'strong'
      ? 90
      : tone === 'medium'
        ? 78
        : 62;
  const improvementSuggestions = (direction.longformGaps ?? []).slice(0, 3);
  const enhancementBrief = improvementSuggestions.length
    ? `请在保持当前方向核心卖点不变的前提下，重点补强：${improvementSuggestions.join('；')}。`
    : '请在保持当前方向核心卖点不变的前提下，进一步放大长线升级空间与冲突层次。';

  return {
    targetWordCountLabel: wordCountRange,
    estimatedChapterCount: breakdown.estimatedChapterCount,
    suggestedVolumeCount: breakdown.suggestedVolumeCount,
    estimatedChaptersPerVolume: breakdown.estimatedChaptersPerVolume,
    startupPhaseRatio: breakdown.startupPhaseRatio,
    longformCapacityScore: score,
    longformCapacityLabel: TONE_LABEL[tone],
    longformCapacityTone: tone,
    improvementSuggestions,
    enhancementBrief,
  };
}
