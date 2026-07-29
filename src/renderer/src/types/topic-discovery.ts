/**
 * 开题中心（Topic Discovery）类型
 */

export type TopicAudience = 'general' | 'male' | 'female';

/** 开题玩法 Tab */
export type TopicDiscoveryTab =
  | 'seeds'
  | 'radar'
  | 'mix'
  | 'dice'
  | 'twist'
  | 'prompt';

/** 种子生成玩法风格（影响提示词） */
export type SeedPlayStyle = 'standard' | 'twist' | 'dice' | 'mix';

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

/** 命运骰子一次掷出的三面 */
export interface TopicDiceRoll {
  genre: string;
  hook: string;
  twist: string;
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
  /** 玩法风格：标准 / 反套路 / 骰子 / 混搭 */
  playStyle?: SeedPlayStyle;
  /** 元素混搭：题材标签名 */
  mixTags?: string[];
  /** 元素混搭：设定元素名 */
  mixElements?: string[];
  /** 命运骰子结果 */
  diceRoll?: TopicDiceRoll;
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
