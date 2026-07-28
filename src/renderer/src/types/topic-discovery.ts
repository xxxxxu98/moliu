/**
 * 开题中心（Topic Discovery）类型
 */

export type TopicAudience = 'general' | 'male' | 'female';

export type GenreLifecycleHint =
  | 'emerging'
  | 'rising'
  | 'peak'
  | 'declining'
  | 'saturated';

export type RiskLevel = 'low' | 'medium' | 'high';

/** 灵感种子卡：一句话故事核，非完整大纲 */
export interface StorySeedCard {
  id: string;
  title: string;
  oneLiner: string;
  genre: string;
  hook: string;
  coolPoint: string;
  audience: TopicAudience;
  riskNote?: string;
}

/** 题材洞察卡：市场风向 / 开题机会 */
export interface GenreInsightCard {
  id: string;
  name: string;
  lifecycle: GenreLifecycleHint;
  audience: TopicAudience;
  reason: string;
  opportunity: string;
  hotTags: string[];
  riskLevel: RiskLevel;
  riskNote?: string;
}

export interface RefreshStorySeedsOptions {
  count?: number;
  genre?: string;
  audience?: TopicAudience;
  lockedSlots?: {
    genre?: string;
    audience?: TopicAudience;
  };
  excludeTitles?: string[];
  temperature?: number;
}

export interface RefreshGenreInsightsOptions {
  count?: number;
  audience?: TopicAudience;
  excludeNames?: string[];
  temperature?: number;
}

export type TopicDiscoverySource = 'ai' | 'fallback';

export interface TopicDiscoveryBatch<T> {
  items: T[];
  source: TopicDiscoverySource;
  generatedAt: string;
  warning?: string;
}
