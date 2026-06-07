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
}

export interface DirectionGenerationResult {
  directions: OutlineDirection[];
  rawText?: string;
  strategy?: 'structured-text' | 'json' | 'fallback';
  warnings?: string[];
}
