export interface Project {
  id: string;
  name: string;
  description: string;
  genre: GenreTag[];
  wordCount: number;
  targetWordCount?: number; // 目标字数，来源于AI大纲
  status: 'planning' | 'writing' | 'paused' | 'completed';
  volumes: Volume[];
  chapters: Chapter[];
  characters: Character[];
  worldSchema: WorldSchema;
  foreshadows: Foreshadow[];
  plotOutline: PlotNode[];
  chapterMemories: ChapterMemory[];
  modelConfig?: ModelConfig;
  createdAt: string;
  updatedAt: string;
}

// 题材标签
export interface GenreTag {
  id: string;
  name: string;
  color?: string;
}

// 预设题材标签库
export const PRESET_GENRES: GenreTag[] = [
  { id: 'xianxia', name: '仙侠', color: '#8b5cf6' },
  { id: 'wuxia', name: '武侠', color: '#ef4444' },
  { id: 'yanqing', name: '言情', color: '#ec4899' },
  { id: 'xuanyi', name: '悬疑', color: '#6366f1' },
  { id: 'kehuan', name: '科幻', color: '#14b8a6' },
  { id: 'mohei', name: '魔幻', color: '#8b5cf6' },
  { id: 'lingshi', name: '灵异', color: '#78716c' },
  { id: 'shenghuo', name: '都市', color: '#f97316' },
  { id: 'qihuan', name: '奇幻', color: '#06b6d4' },
  { id: 'lishi', name: '历史', color: '#eab308' },
  { id: 'tongren', name: '同人', color: '#84cc16' },
  { id: 'qingnian', name: '轻小说', color: '#f472b6' },
];

export interface Volume {
  id: string;
  name: string;
  orderIndex: number;
  summary?: string;
}

export interface Chapter {
  id: string;
  volumeId?: string;
  title: string;
  content: string;
  wordCount: number;
  orderIndex: number;
  version: number;
  status: 'draft' | 'editing' | 'final';
  createdAt: string;
  updatedAt: string;
  plotSummary?: string; // 章节大纲摘要
  isGenerated?: boolean; // 是否为 AI 生成
  generatedAt?: string; // AI 生成时间
}

export interface Character {
  id: string;
  name: string;
  role?: string; // 角色定位，如"主角"、"反派"、"导师"等
  description?: string;
  profile: CharacterProfile;
  avatarPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterProfile {
  personality: string[];
  appearance?: string;
  background?: string;
  abilities?: string[];
  relationships?: Relationship[];
}

// 结构化角色关系
export interface Relationship {
  characterId?: string; // 关联的角色ID（创建后可填充）
  targetName: string;  // 关联的角色名称（AI生成时使用）
  type: RelationshipType;
  description?: string;
}

export type RelationshipType = 
  | 'friend'     // 朋友
  | 'enemy'      // 敌人/对手
  | 'family'     // 家人
  | 'lover'      // 恋人
  | 'rival'      // 竞争对手
  | 'mentor'     // 导师
  | 'student'    // 弟子
  | 'alliance'   // 盟友
  | 'neutral';   // 中立

// 关系类型映射
export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, { label: string; color: string }> = {
  friend: { label: '朋友', color: '#22c55e' },
  enemy: { label: '敌人', color: '#ef4444' },
  family: { label: '家人', color: '#f97316' },
  lover: { label: '恋人', color: '#ec4899' },
  rival: { label: '竞争对手', color: '#eab308' },
  mentor: { label: '导师', color: '#8b5cf6' },
  student: { label: '弟子', color: '#06b6d4' },
  alliance: { label: '盟友', color: '#3b82f6' },
  neutral: { label: '中立', color: '#6b7280' },
};

export interface WorldSchema {
  locations: Location[];
  rules: WorldRule[];
  factions: Faction[];
}

// 层级化地点
export interface Location {
  id: string;
  name: string;
  description?: string;
  parentId?: string; // 上级地点（如：城市属于某个国家）
  level: LocationLevel;
}

export type LocationLevel = 'world' | 'continent' | 'country' | 'city' | 'district' | 'special'; // 世界/大陆/国家/城市/城区/特殊地点

// 层级化规则
export interface WorldRule {
  id: string;
  name: string;
  description: string;
  locked: boolean;
  category: RuleCategory;
  relatedRuleIds?: string[]; // 关联的规则
}

export type RuleCategory = 'cultivation' | 'magic' | 'social' | 'physics' | 'custom';
export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  cultivation: '修炼体系',
  magic: '魔法规则',
  social: '社会法则',
  physics: '世界法则',
  custom: '自定义',
};

// 层级化势力
export interface Faction {
  id: string;
  name: string;
  description?: string;
  parentId?: string; // 上级势力（如：门派属于某个宗门）
  relation?: FactionRelation;
}

export interface FactionRelation {
  targetFactionId?: string; // 关联的势力ID
  targetFactionName: string; // 关联的势力名称
  type: 'ally' | 'enemy' | 'neutral';
  description?: string;
}

export interface Foreshadow {
  id: string;
  hint: string;
  type: 'item' | 'dialogue' | 'event' | 'mystery';
  status: 'buried' | 'hinted' | 'foreshadowed' | 'resolved';
  createdChapter: number;
  suggestedResolutionChapter?: number;
}

// 剧情节点 - 支持幕、子情节、章节级大纲
export interface PlotNode {
  id: string;
  title: string;
  description?: string;
  type: PlotNodeType;
  chapterRange?: [number, number]; // 涉及章节范围
  parentId?: string; // 父节点（如：子情节属于某个幕）
  orderIndex: number;
  // 章节级大纲/子情节专用
  keyEvents?: string[]; // 关键事件列表
  purpose?: string; // 本节点的目的/主题
  relatedCharacters?: string[]; // 涉及的角色名称列表
}

export type PlotNodeType = 'act' | 'subplot' | 'chapter' | 'foreshadow';

export const PLOT_NODE_TYPE_LABELS: Record<PlotNodeType, string> = {
  act: '幕',
  subplot: '支线',
  chapter: '章节',
  foreshadow: '伏笔',
};

export interface ModelConfig {
  defaultProvider: string;
  defaultModel?: string;
  providers: ProviderConfig[];
}

export interface ProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama';
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  priority: number;
  models: string[];
  quota?: {
    used: number;
    limit?: number;
    resetDate?: string;
  };
}

// ============================================
// 分层记忆系统类型定义
// ============================================

/**
 * 章节情节快照 - 每次续写后自动提取
 * 这是系统的"记忆单元"，用于保持情节连贯性
 */
export interface ChapterMemory {
  /** 章节ID */
  chapterId: string;
  /** 章节标题 */
  chapterTitle: string;
  /** 章节序号（从1开始） */
  chapterIndex: number;
  
  /** 核心情节摘要（100字内）- 用于中期记忆 */
  corePlot: string;
  
  /** 关键事件列表 */
  keyEvents: string[];
  
  /** 场景/地点列表 */
  locations: string[];
  
  /** 时间线标记（如"故事第3天"、"修炼开始后1年"） */
  timelineMark?: string;
  
  /** 角色状态变化 */
  characterStateChanges: CharacterStateChange[];
  
  /** 本章揭示/推进的伏笔 */
  revealedForeshadows: string[];
  
  /** 本章新埋的伏笔 */
  newForeshadows: string[];
  
  /** 情感基调（如"紧张"、"温馨"、"压抑"） */
  emotionalTone?: string;
  
  /** 章节字数 */
  wordCount: number;
  
  /** 创建时间 */
  createdAt: string;
}

/**
 * 角色状态变化
 */
export interface CharacterStateChange {
  /** 角色名称 */
  characterName: string;
  /** 状态类型 */
  stateType: 'appearance' | 'emotion' | 'ability' | 'relationship' | 'location' | 'status';
  /** 状态描述 */
  state: string;
  /** 详细变化 */
  detail: string;
}

/**
 * 情节线进度追踪
 */
export interface PlotThread {
  /** 情节线ID */
  id: string;
  /** 情节线标题 */
  title: string;
  /** 类型：主线/支线/感情线等 */
  type: 'main' | 'subplot' | 'romance' | 'mystery';
  /** 进度百分比（0-100） */
  progress: number;
  /** 当前阶段描述 */
  currentStage: string;
  /** 已完成阶段列表 */
  completedStages: string[];
  /** 待完成阶段列表 */
  pendingStages: string[];
  /** 关联章节ID列表 */
  relatedChapterIds: string[];
}

/**
 * 角色弧线状态
 */
export interface CharacterArc {
  /** 角色ID */
  characterId: string;
  /** 角色名称 */
  characterName: string;
  /** 初始状态描述 */
  initialState: string;
  /** 当前心理状态 */
  currentPsychology: string;
  /** 当前外貌/状态描述 */
  currentAppearance: string;
  /** 成长轨迹摘要 */
  growthTrack: string;
  /** 关联的情节线 */
  relatedPlotThreads: string[];
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 记忆系统配置
 */
export interface MemoryConfig {
  /** 短期记忆：保留最近N章的完整内容 */
  shortTermChapterCount: number;
  /** 中期记忆：保留最近N章的情节摘要 */
  mediumTermChapterCount: number;
  /** 是否启用情节线追踪 */
  enablePlotThreadTracking: boolean;
  /** 是否启用角色弧线追踪 */
  enableCharacterArcTracking: boolean;
}

// 默认配置
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  shortTermChapterCount: 5,
  mediumTermChapterCount: 20,
  enablePlotThreadTracking: true,
  enableCharacterArcTracking: true,
};
