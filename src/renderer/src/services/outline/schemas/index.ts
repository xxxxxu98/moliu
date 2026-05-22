/**
 * Unified Schema Exports
 * 统一的 Schema 和类型导出
 * 
 * 所有大纲相关的 Schema 和类型都从这里导出
 */

// ============================================================
// 第一部分：主 Schema
// ============================================================

// Re-export all schemas from individual files
export {
  // 大纲 Schema
  OutlineSchema,
  StructureSchema,
  ChapterSchema,
  CharacterSchema,
  WorldSettingSchema,
  ForeshadowSchema,
  SubplotSchema,
  CoolPointDesignSchema,
  ConflictDesignSchema,
  StoryLinesSchema,
  EmotionGoalSchema,
  LocationSchema,
  FactionSchema,
  WorldRuleSchema,
  RelationshipSchema,
  GenreTagSchema,
  IdSchema,
  // 类型
  type Outline,
  type Chapter,
  type Character,
  type WorldSetting,
  type Foreshadow,
  type Subplot,
  type CoolPointDesign,
  type ConflictDesign,
  type StoryLines,
  type EmotionGoal,
  type Location,
  type Faction,
  type WorldRule,
  type Relationship,
  type GenreTag,
  type Structure,
} from './outline.schema';

export {
  // 卷 Schema
  VolumeSchema,
  BeatSchema,
  TimelineSchema,
  StrandStatusSchema,
  VolumePromisesSchema,
  VolumeValidationSchema,
  BeatTableSchema,
  TimeAnchorSchema,
  // 类型
  type Volume,
  type Beat,
  type Timeline,
  type StrandStatus,
  type VolumePromises,
  type VolumeValidation,
  type BeatTable,
  type TimeAnchor,
} from './volume.schema';

export {
  // 章节承诺 Schema
  ChapterCommitSchema,
  ChapterBriefSchema,
  ChapterNodeSchema,
  ChapterNodesSchema,
  ChapterCommitRequirementsSchema,
  ForbiddenZoneSchema,
  ChapterCommitExecutionSchema,
  ChapterNodeTypeEnum,
  NodeRoleEnum,
  // 类型
  type ChapterCommit,
  type ChapterBrief,
  type ChapterNode,
  type ChapterNodes,
  type ChapterCommitRequirements,
  type ForbiddenZone,
  type ChapterCommitExecution,
  type ChapterNodeTypeEnum,
  type NodeRoleEnum,
} from './chapter-brief.schema';

// ============================================================
// 第二部分：生成相关类型
// ============================================================

/**
 * 生成选项
 */
export interface GenerateOptions {
  temperature?: number;
  topP?: number;
  wordCountRange?: string;
  maxRetries?: number;
}

/**
 * 生成结果
 */
export interface GenerationResult {
  success: boolean;
  outlines: Outline[];
  warnings: string[];
  errors: string[];
  strategy: 'markdown-remark' | 'markdown-regex' | 'json-mode' | 'legacy';
  rawMarkdown?: string;
}

/**
 * 解析结果（通用）
 */
export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  warnings: string[];
  errors: string[];
  strategy: 'remark' | 'regex' | 'json';
}

// ============================================================
// 第三部分：增强的大纲接口（用于前端展示）
// ============================================================

/**
 * 增强的大纲展示数据
 */
export interface EnhancedOutline extends Outline {
  /** 章节数量 */
  chapterCount?: number;
  /** 已完成章节数 */
  completedChapterCount?: number;
  /** 预估完成度 */
  completionRate?: number;
  /** 主要角色列表 */
  mainCharacters?: Character[];
  /** 核心爽点 */
  coreCoolPoints?: string[];
  /** 下一步建议 */
  nextSuggestion?: string;
}

/**
 * 大纲可视化节点
 */
export interface OutlineVisualNode {
  id: string;
  type: 'act' | 'chapter' | 'volume' | 'foreshadow';
  title: string;
  description?: string;
  status?: 'pending' | 'active' | 'completed';
  children?: OutlineVisualNode[];
  metadata?: Record<string, any>;
}

/**
 * 大纲可视化树
 */
export interface OutlineVisualTree {
  title: string;
  acts: OutlineVisualNode[];
  foreshadows: OutlineVisualNode[];
  characters: OutlineVisualNode[];
}

// ============================================================
// 第四部分：验证结果类型
// ============================================================

/**
 * 验证问题
 */
export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  location?: string;
  suggestion?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  score?: number;
  summary?: string;
}

// ============================================================
// 第五部分：Prompt 上下文类型
// ============================================================

/**
 * 大纲生成 Prompt 上下文
 */
export interface OutlinePromptContext {
  /** 创意种子/灵感 */
  seed: string;
  /** 题材 */
  genres?: string[];
  /** 目标字数范围 */
  wordCountRange?: string;
  /** 是否高速推进 */
  highSpeed?: boolean;
  /** 用户自定义要求 */
  customRequirements?: string;
}

/**
 * 续写 Prompt 上下文
 */
export interface WritingPromptContext {
  /** 项目信息 */
  project: any;
  /** 当前章节内容 */
  currentContent: string;
  /** 章节索引 */
  chapterIndex?: number;
  /** 章节标题 */
  chapterTitle?: string;
  /** 本章大纲 */
  chapterOutline?: string;
  /** 完整大纲 */
  fullOutline?: string;
  /** 用户自定义要求 */
  customPrompt?: string;
}

// ============================================================
// 第六部分：常量定义
// ============================================================

/**
 * 章节状态
 */
export const CHAPTER_STATUS = {
  OUTLINE: 'outline' as const,
  DRAFT: 'draft' as const,
  COMPLETE: 'complete' as const,
};

/**
 * 故事线类型
 */
export const STRAND_TYPES = {
  QUEST: 'quest' as const,
  FIRE: 'fire' as const,
  CONSTELLATION: 'constellation' as const,
};

/**
 * 伏笔状态
 */
export const FORESHADOW_STATUS = {
  ACTIVE: 'active' as const,
  FULFILLED: 'fulfilled' as const,
  ABANDONED: 'abandoned' as const,
};

/**
 * 伏笔分期
 */
export const FORESHADOW_PHASE = {
  EARLY: 'early' as const,
  MID: 'mid' as const,
  LATE: 'late' as const,
};

/**
 * 爽点强度
 */
export const COOL_POINT_INTENSITY = {
  MICRO: 'micro' as const,
  SMALL: 'small' as const,
  BIG: 'big' as const,
};

/**
 * 四幕结构
 */
export const ACT_NAMES = {
  ACT1: '第一幕（建置）',
  ACT2A: '第二幕A（对抗）',
  ACT2B: '第二幕B（至暗）',
  ACT3: '第三幕（结局）',
} as const;

/**
 * 情绪弧线
 */
export const EMOTION_ARCS = {
  RISING: 'rising' as const,
  FALLING: 'falling' as const,
  WAVE: 'wave' as const,
  MIXED: 'mixed' as const,
} as const;
