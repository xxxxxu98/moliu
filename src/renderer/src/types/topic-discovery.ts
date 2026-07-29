/**
 * 开题中心（Topic Discovery）类型
 */

export type TopicAudience = 'general' | 'male' | 'female';

/** 目标平台（影响节奏、卖点与平台调性） */
export type TopicPlatform =
  | 'qidian'
  | 'fanqie'
  | 'jinjiang'
  | 'qimao'
  | 'zhihu'
  | 'general';

/** 篇幅：长篇连载 / 短篇完结 */
export type TopicLength = 'long' | 'short';

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

/** 题材上手难度（扫榜可行性判断） */
export type EntryDifficulty = 'low' | 'medium' | 'high';

/** 灵感种子卡：一句话故事核，非完整大纲 */
export interface StorySeedCard {
  id: string;
  title: string;
  oneLiner: string;
  genre: string;
  hook: string;
  coolPoint: string;
  audience: TopicAudience;
  platform?: TopicPlatform;
  length?: TopicLength;
  riskNote?: string;
  /** 读者核心期待 / 卖点 */
  sellPoint?: string;
  /** 金手指或核心机制一句话 */
  mechanism?: string;
  /** 反套路玩法：破的是什么套路 */
  brokenTrope?: string;
  /** 匹配到的题材 Profile id */
  genreProfileId?: string;
}

/**
 * 题材 Profile 注入开题的可读约束（由 genre-seed-context 生成）
 */
export interface GenreSeedHint {
  profileId: string;
  name: string;
  preferredHooks: string[];
  preferredCoolPoints: string[];
  typicalOpening?: string;
  commonRisks: string[];
}

/** 题材洞察卡：市场风向 / 开题机会（对齐扫榜报告结构） */
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
  /** 主推荐平台（与筛选一致时优先） */
  platform?: TopicPlatform;
  length?: TopicLength;
  /** 更适合的平台列表（扫榜平台适配） */
  platformBias?: TopicPlatform[];
  /** 上手难度：热度 × 可行性 */
  entryDifficulty?: EntryDifficulty;
  /** 书名 / 卖点命名模式 1～2 条 */
  namePatterns?: string[];
}

/**
 * 雷达洞察完整下传上下文：点洞察开题时喂给种子生成，
 * 避免只锁题材名而丢掉切入建议与热标签。
 */
export interface InsightSeedContext {
  name: string;
  audience: TopicAudience;
  opportunity: string;
  reason: string;
  hotTags: string[];
  riskLevel: RiskLevel;
  riskNote?: string;
  lifecycle: GenreLifecycleHint;
  platform?: TopicPlatform;
  length?: TopicLength;
  entryDifficulty?: EntryDifficulty;
  namePatterns?: string[];
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
  platform?: TopicPlatform;
  length?: TopicLength;
  lockedSlots?: {
    genre?: string;
    audience?: TopicAudience;
    platform?: TopicPlatform;
    length?: TopicLength;
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
  /** 来自题材雷达的完整洞察约束 */
  insightContext?: InsightSeedContext;
  /** 题材 Profile 注入（可由服务层自动解析） */
  genreSeedHint?: GenreSeedHint;
  /** 取消在飞 HTTP 请求 */
  signal?: AbortSignal;
}

export interface RefreshGenreInsightsOptions {
  count?: number;
  audience?: TopicAudience;
  platform?: TopicPlatform;
  length?: TopicLength;
  excludeNames?: string[];
  temperature?: number;
  /** 取消在飞 HTTP 请求 */
  signal?: AbortSignal;
}

export type TopicDiscoverySource = 'ai' | 'fallback';

export interface TopicDiscoveryBatch<T> {
  items: T[];
  source: TopicDiscoverySource;
  generatedAt: string;
  warning?: string;
}

/** 跨玩法收藏的灵感种子快照 */
export interface FavoriteSeed {
  seed: StorySeedCard;
  fromTab: TopicDiscoveryTab;
  savedAt: string;
  note?: string;
}

export type ToggleFavoriteResult =
  | { ok: true; action: 'added' | 'removed' }
  | { ok: false; action: 'limit'; reason: string };

/**
 * 开书时写入项目 metadata 的开题合同种子
 * 供后续大纲 / 追读力 / 审查读取题材与平台约束
 */
export interface TopicDiscoveryProjectSeed {
  seedId: string;
  title: string;
  genre: string;
  audience: TopicAudience;
  platform?: TopicPlatform;
  length?: TopicLength;
  sellPoint?: string;
  mechanism?: string;
  brokenTrope?: string;
  hook?: string;
  coolPoint?: string;
  genreProfileId?: string;
  sourceTab: TopicDiscoveryTab;
  capturedAt: string;
}

