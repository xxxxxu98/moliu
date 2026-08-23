import type { TopicDiscoveryProjectSeed } from './topic-discovery';
import type { ErrorKind } from '../utils/ai-error-classify';

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
  
  // ====== 大纲增强系统 ======
  emotionGoal?: EmotionGoal;         // 情绪目标
  conflictDesign?: ConflictDesign;   // 矛盾设计
  coolPointDesign?: CoolPointDesign; // 爽点设计
  storyLines?: StoryLines;          // 八条故事线
  goldenfingerDesign?: GoldenFingerDesign; // 金手指设定（爽点引擎）
  coreSellingPoints?: CoreSellingPoint[];  // 核心卖点
  metadata?: ProjectMetadata;         // 项目元数据
}

// 项目元数据
export interface ProjectMetadata {
  /** 大纲定位维度；题材、文风、读者和情绪分开保存，避免 genre 语义污染 */
  outlinePositioning?: {
    genres: string[];
    styleKeywords: string[];
    targetReaders: string[];
    coreEmotions: string[];
  };
  // 情绪目标
  emotionGoal?: {
    primary: string;
    secondary?: string;
    arc?: string;
    density?: number;
    highPoints?: number[];
    lowPoints?: number[];
  };
  // 爽点设计
  coolPointDesign?: {
    patterns: string[];
    arranged: Array<{
      type: string;
      description: string;
      suggestedChapter?: number;
    }>;
  };
  // 核心卖点
  coreSellingPoints?: CoreSellingPoint[];
  // 矛盾设计
  conflictDesign?: {
    source: string;
    escalation: string[];
    majorConflicts: string[];
  };
  // 八条故事线
  storyLines?: {
    map: string;
    faction: string;
    character: string;
    goldenfinger: string;
    worldRules: string;
    conflict: string;
    collection: string;
    romance: string;
  };
  
  // ========== 完结感知增强字段 ==========
  /** 计划总章节数 */
  plannedChapterCount?: number;
  /** 计划总字数 */
  plannedWordCount?: number;
  /** 高潮章节索引 */
  climaxChapterIndex?: number;
  /** 结局章节索引 */
  endingChapterIndex?: number;
  /** 大纲完成度百分比 0-100 */
  outlineProgress?: number;

  // ========== 首页大纲扩展字段 ==========
  /** 前 30 章启动包（来源于首页 expandDirection，供续写消费） */
  startupPack?: ProjectStartupPack;
  /** 故事规模规划（来源于首页 expandDirection） */
  storyScale?: ProjectStoryScale;
  /** 结构化卷纲（创建 volumes 实体后仍保留完整卷级冲突/伏笔规划） */
  volumePlans?: Array<{
    volumeIndex: number;
    /** 本卷章节区间（1-based 闭区间）；缺失时下游按 estimatedChaptersPerVolume 估算分卷 */
    chapterRange?: { start: number; end: number };
    title: string;
    objective: string;
    coreConflict: string;
    climax: string;
    reversal: string;
    endingHook: string;
    protagonistGrowth: string;
    keyCharacters: string[];
    setupForeshadows: string[];
    payoffForeshadows: string[];
    relationshipShifts: string[];
  }>;

  // ========== 开题中心 ==========
  /** 从开题中心创建时写入的题材合同种子 */
  topicDiscoverySeed?: TopicDiscoveryProjectSeed;
}

/** 项目级启动包（与 GeneratedStartupPack 对齐，独立定义以解耦） */
export interface ProjectStartupPack {
  openingHook: string;
  promiseToReader: string;
  protagonistFirstImpression: string;
  firstMajorCoolPoint: string;
  firstConflictCycle: string;
  chapterBlocks: Array<{
    range: string;
    objective: string;
    mustEvents: string[];
    coolPoints: string[];
    hookRequirement: string;
    pacing: 'fast' | 'medium';
    readerExpectation: string;
    /** 本块禁区，约束正文不提前摊牌/泄露关键信息 */
    forbiddenZones?: string[];
  }>;
}

/** 项目级故事规模（与 GeneratedStoryScale 对齐，独立定义以解耦） */
export interface ProjectStoryScale {
  /** 目标字数文案，如 "80万-150万字" / "100万字" */
  targetWordCount?: string;
  /** 预计总章节数 */
  estimatedChapterCount?: number;
  averageWordsPerChapter?: number;
  suggestedVolumeCount?: number;
  estimatedChaptersPerVolume?: number;
  startupPhaseRatio?: string;
  longformProgressionNote?: string;
}

// 核心卖点
export interface CoreSellingPoint {
  id: string;
  name: string;
  description: string;
  priority: number;
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
  outline?: string; // 章节详细大纲
  isGenerated?: boolean; // 是否为 AI 生成
  generatedAt?: string; // AI 生成时间
  // ====== 批量写作状态追踪（用于失败章节红标 + 断点续写跳过） ======
  /** 批量写作生命周期状态 */
  writeStatus?: 'pending' | 'writing' | 'success' | 'failed';
  /** 最近一次失败原因（用于 UI tooltip） */
  lastError?: string;
  /** 最近一次失败分类（参见 ai-error-classify.ts） */
  lastErrorKind?: ErrorKind;
  /** 最近一次失败时间戳（ISO） */
  lastErrorAt?: string;
}

export interface Character {
  id: string;
  name: string;
  role?: string; // 角色定位，如"主角"、"反派"、"导师"等
  description?: string;
  profile: CharacterProfile;
  /** 称呼变体（本名/称号互通），供实体消歧与检索 */
  aliases?: string[];
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
  /** 开书大纲透传的结构化人设（可选） */
  keyNeed?: string;
  publicGoal?: string;
  hiddenNeed?: string;
  fearOrWound?: string;
  secret?: string;
  turningPoint?: string;
  arcStart?: string;
  arcMid?: string;
  arcEnd?: string;
  /** 大纲指定的首次/最佳揭示或出场时机 */
  revealTiming?: string;
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
  /**
   * planned = 大纲预埋（尚未在正文落笔）；buried 及之后 = 已在正文实际埋设。
   * 旧数据 createdChapter 可能指向未写章节（全书规划章号），迁移见
   * services/story-runtime/foreshadowLifecycle.ts 的 normalizeForeshadow。
   */
  status: 'planned' | 'buried' | 'hinted' | 'foreshadowed' | 'resolved' | 'abandoned';
  createdChapter: number;
  suggestedResolutionChapter?: number;
  /** 正文实际埋设章号（区别于大纲规划的 setupChapter；planned 状态下未定义） */
  actualPlantedChapter?: number;
  // ========== 富伏笔字段（来自首页大纲 foreshadowPlan）==========
  /** 回收收益（伏笔回收时给读者带来的价值/震撼） */
  payoffValue?: string;
  /** 伏笔载体角色（承担该伏笔的角色） */
  carrierCharacter?: string;
  /** 关联冲突（与哪条主/支线冲突绑定） */
  linkedConflict?: string;
  /** 重要度：main 主线 / subplot 支线 / emotion 情感 */
  importance?: 'main' | 'subplot' | 'emotion';
  /** 计划埋设章节 */
  setupChapter?: number;
  /** 计划回收章节 */
  payoffChapter?: number;
}

// ============================================
// 章节结构化节点（参考 webnovel-writer 的 CBN/CPNs/CEN 模式）
// ============================================

/**
 * 章节结构化节点
 * 用于确保章节间逻辑承接，在续写时充分利用
 */
export interface ChapterStructureNodes {
  /** 章节起点 (CBN) - 章节开始时的情境 */
  CBN?: string;
  /** 推进节点 (CPNs) - 2-4个核心情节推进 */
  CPNs?: string[];
  /** 章节终点 (CEN) - 章节结束时的状态 */
  CEN?: string;
  /** 必须覆盖节点 */
  mustCover?: string[];
  /** 本章禁区 */
  forbiddenZones?: string[];
  /** 章节时长 */
  timeSpan?: string;
}

// 剧情节点 - 支持幕、子情节、章节级大纲
export interface PlotNode {
  id: string;
  title: string;
  description?: string;
  type: PlotNodeType;
  chapterRange?: [number, number]; // 涉及章节范围
  parentId?: string; // 父节点（如：子情节属于某个幕）
  /**
   * 节点排序索引。
   * 注意：对 type === 'chapter' 的节点，**这是全书章节序号**（从 0 起，与 act/subplot 节点独立计数），
   * 用于位置兜底匹配真实 Chapter。其他类型节点仍按全节点列表顺序排。
   */
  orderIndex: number;
  /**
   * 显式关联的章节 ID（type === 'chapter' 节点专用）。
   * 首页大纲生成阶段尚无真实 Chapter，此时留空，由 extractChapterContext 走位置兜底；
   * 用户后续在编辑器把章节与大纲节点显式绑定后写入此字段。
   */
  chapterId?: string;
  // 章节级大纲/子情节专用
  keyEvents?: string[]; // 关键事件列表
  purpose?: string; // 本节点的目的/主题
  relatedCharacters?: string[]; // 涉及的角色名称列表

  // ========== 结构化节点（章节续写核心数据）==========
  /** 章节起点 (CBN) - 章节开始时的情境 */
  CBN?: string;
  /** 推进节点 (CPNs) - 2-4个核心情节推进 */
  CPNs?: string[];
  /** 章节终点 (CEN) - 章节结束时的状态 */
  CEN?: string;
  /** 必须覆盖节点（≤4个）*/
  mustCover?: string[];
  /** 本章禁区（≤5条）*/
  forbiddenZones?: string[];
  /** 章节时长 */
  timeSpan?: string;
  /** 章节类型（参考 writing-task.ts）*/
  chapterType?: 'world_intro' | 'character_intro' | 'plot_setup' | 'conflict' | 'climax' | 'resolution' | 'transitional' | 'ending' | 'normal';
  /** 章节钩子类型 */
  hookType?: 'sudden_reveal' | 'urgent_crisis' | 'unfinished_action' | 'identity_reveal' | 'tough_choice' | 'mysterious_item' | 'countdown' | 'promise_threat' | 'strange_disappear' | 'hidden_meaning' | 'imagery' | 'echo' | 'blank';
  /** 节奏策略 */
  pacingStrategy?: 'build_up' | 'confront' | 'release' | 'normal';
  /** 是否为高潮章节 */
  isClimax?: boolean;
  /** 预期爽点数 */
  expectedCoolPoints?: number;
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
  defaultModel?: {
    providerId: string;
    modelName: string;
  } | null;
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

  // ========== 完结感知增强字段 ==========
  
  /** 情节阶段判定 */
  plotPhase?: {
    /** 阶段类型 */
    phase: 'setup' | 'rising' | 'climax' | 'falling' | 'resolution';
    /** 紧张度/冲突强度 0-10 */
    intensity: number;
    /** 悬念强度 0-10 */
    tension: number;
  };
  
  /** 伏笔完成状态 */
  foreshadowProgress?: {
    /** 总埋伏笔数 */
    totalBuried: number;
    /** 已揭示数 */
    totalRevealed: number;
    /** 完成率 0-100 */
    resolutionRate: number;
  };
  
  /** 章节贡献度 */
  contribution?: {
    /** 推进了多少剧情线 */
    plotProgress: number;
    /** 解决了哪些冲突 */
    resolvedConflicts: string[];
    /** 产生了哪些新冲突 */
    newConflicts: string[];
  };
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

// ============================================
// 大纲增强系统类型定义
// ============================================

/**
 * 情绪目标
 */
export interface EmotionGoal {
  id: string;
  primary: string;          // 核心情绪
  secondary?: string;       // 次要情绪
  arc: EmotionArcType;      // 情绪弧线
  density: number;          // 情绪波动间隔(字)
  highPoints: number[];     // 情绪高点章节
  lowPoints: number[];      // 情绪低点章节
}

export type EmotionArcType = 'rising' | 'falling' | 'wave' | 'mixed';

export const EMOTION_ARC_LABELS: Record<EmotionArcType, { label: string; description: string }> = {
  rising: { label: '上升型', description: '情绪从低到高，渐入佳境' },
  falling: { label: '下降型', description: '情绪从高到低，虐心路线' },
  wave: { label: '波浪型', description: '起伏交替，张弛有度' },
  mixed: { label: '混合型', description: '多种情绪交织' },
};

/**
 * 矛盾设计
 */
export interface ConflictDesign {
  id: string;
  source: ConflictSourceType;  // 冲突来源
  escalation: ConflictLevel[];   // 矛盾递进
  majorConflicts: MajorConflict[]; // 主要冲突
}

export type ConflictSourceType = 
  | 'resource'        // 资源/利益
  | 'faction'         // 阵营/种族
  | 'path'            // 超凡途径
  | 'faith'           // 信仰/宗教
  | 'factionFight'    // 派系之争
  | 'ideology';       // 理念/三观

export const CONFLICT_SOURCE_LABELS: Record<ConflictSourceType, { label: string; description: string }> = {
  resource: { label: '资源/利益', description: '争夺资源、利益分配' },
  faction: { label: '阵营/种族', description: '不同阵营或种族之间的对立' },
  path: { label: '超凡途径', description: '修炼道路、力量体系的竞争' },
  faith: { label: '信仰/宗教', description: '宗教信仰、意识形态冲突' },
  factionFight: { label: '派系之争', description: '同一阵营内部的派系斗争' },
  ideology: { label: '理念/三观', description: '价值观、人生观的对立' },
};

export interface ConflictLevel {
  level: number;        // 层级 1-4
  name: string;         // 名称
  description: string;   // 描述
  examples: string[];    // 示例
}

export interface MajorConflict {
  id: string;
  title: string;         // 标题
  type: ConflictIntensityType;  // 强度级别
  status: ConflictStatus;
  chapters: number[];    // 涉及章节
  stakes: string;       // 赌注/风险
  resolution?: string;   // 解决方式
}

export type ConflictIntensityType = 'S' | 'A' | 'B' | 'C';
export type ConflictStatus = 'pending' | 'active' | 'resolved';

export const CONFLICT_INTENSITY_LABELS: Record<ConflictIntensityType, { label: string; color: string }> = {
  S: { label: 'S级', color: '#ef4444' },  // 红色 - 史诗级
  A: { label: 'A级', color: '#f97316' },  // 橙色 - 重要
  B: { label: 'B级', color: '#eab308' },  // 黄色 - 中等
  C: { label: 'C级', color: '#22c55e' },  // 绿色 - 较小
};

/**
 * 爽点设计
 */
export interface CoolPointDesign {
  id: string;
  patterns: CoolPointPattern[];     // 爽点类型
  arranged: CoolPointArrangement[];  // 已安排爽点
  density: CoolPointDensity;        // 爽点密度
}

export interface CoolPointDensity {
  micro: number;   // 微爽点间隔(字)
  small: number;   // 小爽点间隔(字)
  big: number;     // 大爽点间隔(字)
}

/**
 * 金手指设定（爽点引擎，区别于 StoryLines 内的 GoldenFingerLine 简版）
 */
export interface GoldenFingerDesign {
  id: string;
  type: string;                  // 金手指是什么
  trigger: string;               // 触发场景（觉醒方式）
  upgradePath: string[];         // 升级路径（初阶→进阶→终极）
  limitation: string;            // 使用限制
  cost: string;                  // 使用代价
  firstRevealChapter?: number;   // 首次兑现章节（建议 1-3）
}

export type CoolPointPattern = 
  | 'face-slapping'     // 打脸
  | 'show-off'          // 装逼
  | 'identity-reveal'   // 身份揭秘
  | 'growth'            // 成长突破
  | 'rescue'            // 英雄救美
  | 'treasure'          // 寻宝获宝
  | 'breakthrough'       // 境界突破
  | 'romance'           // 甜蜜恋爱
  | 'revenge'           // 复仇快感
  | 'mystery-reveal'    // 谜题揭开
  | 'comedy'            // 搞笑逗比
  | 'justice';          // 伸张正义

export const COOL_POINT_PATTERN_LABELS: Record<CoolPointPattern, { label: string; emoji: string }> = {
  'face-slapping': { label: '打脸爽', emoji: '👋' },
  'show-off': { label: '装逼爽', emoji: '😎' },
  'identity-reveal': { label: '身份揭秘', emoji: '🎭' },
  'growth': { label: '成长突破', emoji: '📈' },
  'rescue': { label: '英雄救美', emoji: '🛡️' },
  'treasure': { label: '寻宝获宝', emoji: '💎' },
  'breakthrough': { label: '境界突破', emoji: '⚡' },
  'romance': { label: '甜蜜恋爱', emoji: '💕' },
  'revenge': { label: '复仇快感', emoji: '🔥' },
  'mystery-reveal': { label: '谜题揭开', emoji: '🔮' },
  'comedy': { label: '搞笑逗比', emoji: '😄' },
  'justice': { label: '伸张正义', emoji: '⚖️' },
};

export interface CoolPointArrangement {
  id: string;
  chapter: number;      // 章节
  type: CoolPointPattern;
  description: string;   // 描述
  /** 爽点闭环结构（P1-1 新增，向后兼容） */
  trigger?: string;      // 触发场景
  buildup?: string;      // 铺垫（轻视/压制）
  payoff?: string;       // 兑现（爆发画面）
  cost?: string;         // 代价
}

/**
 * 八条故事线
 */
export interface StoryLines {
  id: string;
  map: MapLine;         // 地图线
  faction: FactionLine;  // 阵营线
  character: CharacterLine;  // 人物线
  goldenfinger: GoldenFingerLine;  // 金手指线
  worldRules: WorldRulesLine;  // 世界观线
  conflict: StoryConflictLine;  // 矛盾线
  collection: CollectionLine;  // 收集线
  romance: RomanceLine;    // 感情线
}

export interface MapLine {
  planned: string[];           // 规划地点
  introduced: string[];        // 已引入
  current: string;             // 当前地点
  chaptersPerLocation: number; // 每地点章节数
}

export interface FactionLine {
  planned: string[];          // 规划势力
  introduced: string[];        // 已引入
  currentLevel: number;        // 当前等级
  escalationChapters: number[]; // 升级章节
}

export interface CharacterLine {
  planned: { id: string; role: string }[];  // 规划角色
  introduced: string[];        // 已引入
  keyRelationships: { from: string; to: string; type: string }[]; // 关键关系
}

export interface GoldenFingerLine {
  type: string;               // 金手指类型
  currentStage: number;       // 当前阶段
  upgrades: { chapter: number; description: string }[];  // 升级节点
  nextUpgrade?: { chapter: number; description: string }; // 下次升级
}

export interface WorldRulesLine {
  revealed: string[];          // 已揭示规则
  pending: string[];           // 待揭示规则
  nextReveal?: { chapter: number; rule: string }; // 下次揭示
}

export interface StoryConflictLine {
  chains: {
    level: number;
    name: string;
    description: string;
    chapters: number[];
    status: ConflictStatus;
  }[];
  activeConflict?: string;     // 当前冲突
}

export interface CollectionLine {
  target: string[];            // 收集目标
  progress: { item: string; acquired: boolean; chapter?: number }[]; // 收集进度
}

export interface RomanceLine {
  currentStage: RomanceStageType;  // 当前阶段
  progression: { chapter: number; stage: RomanceStageType; description: string }[]; // 感情进展
}

export type RomanceStageType = 'cold' | 'warm' | 'hot' | 'climax';

export const ROMANCE_STAGE_LABELS: Record<RomanceStageType, { label: string; description: string }> = {
  cold: { label: '冷淡期', description: '两人关系冷淡或尚未相识' },
  warm: { label: '暧昧期', description: '产生好感，暗生情愫' },
  hot: { label: '热恋期', description: '确认关系，甜蜜互动' },
  climax: { label: '高潮期', description: '感情升华，突破难关' },
};

// ============================================
// 情节线进度追踪
// ============================================

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
