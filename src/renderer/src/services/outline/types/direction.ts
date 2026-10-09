export interface OutlineDirection {
  id: string;
  title: string;
  oneLiner: string;
  premise: string;
  protagonistArc: string;
  coreConflict: string;
  coolPointStyle: string[];
  targetEmotions: string[];
  riskNotes: string[];
  recommendationScore: number;
  recommendedReason: string;
  longformCapacityNote?: string;
  /**
   * 生成侧自标注的承载力档位。
   * 只接受 strong / medium / cautious，不从正文关键词推断。
   */
  longformCapacityTier?: 'strong' | 'medium' | 'cautious' | null;
  /** 生成侧自写的长篇补强短语。空数组表示模型写了「无」。 */
  longformGaps?: string[];
}

export interface DirectionGenerationResult {
  directions: OutlineDirection[];
  rawText?: string;
  strategy?: 'structured-text' | 'json' | 'fallback';
  warnings?: string[];
}
