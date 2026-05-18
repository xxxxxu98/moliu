/**
 * Writing Types - 写作相关类型定义
 * Moliu v2.0 - 写作系统的核心类型
 */

// ============================================================
// Context Level (上下文层级)
// ============================================================

/**
 * 上下文层级
 */
export enum ContextLevel {
  Project = 'project',     // 项目级
  Volume = 'volume',       // 卷级
  Chapter = 'chapter',     // 章级
  Writing = 'writing',     // 创作级
}

/**
 * 上下文信息
 */
export interface ContextInfo {
  /** 层级 */
  level: ContextLevel;
  /** 内容 */
  content: string;
  /** Token 数量 */
  tokenCount: number;
  /** 来源 */
  source: string;
}

/**
 * 章节写作上下文
 */
export interface ChapterWritingContext {
  /** 项目标题 */
  projectTitle: string;
  /** 项目简介 */
  projectSynopsis: string;
  /** 世界设定 */
  worldSetting?: {
    locations: string[];
    rules: Array<{ name: string; description: string }>;
    factions: Array<{ name: string; description: string }>;
  };
  /** 卷标题 */
  volumeTitle?: string;
  /** 卷大纲 */
  volumeOutline?: string;
  /** 章节 */
  chapter: {
    id: string;
    title: string;
    orderIndex: number;
    outline: string;
    existingContent?: string;
  };
  /** 上一章 */
  previousChapter?: {
    title: string;
    summary: string;
    ending: string;
  };
  /** 角色列表 */
  characters: Array<{
    id: string;
    name: string;
    role: string;
    description: string;
    personality: string[];
    appearance?: string;
    speakingStyle?: string;
    currentStatus?: string;
    relationships?: Array<{
      targetName: string;
      type: string;
      description: string;
    }>;
  }>;
  /** 本章出场角色 ID */
  charactersInScene: string[];
  /** 伏笔列表 */
  foreshadows: Array<{ hint: string; status: string }>;
  /** 写作要求 */
  requirements: {
    targetWordCount: number;
    style: string;
    customStyle?: string;
  };
}

/**
 * 写作配置
 */
export interface WritingConfig {
  /** 目标字数 */
  targetWordCount: number;
  /** 每章字数 */
  wordsPerChapter: number;
  /** 章节数 */
  chapterCount: number;
  /** 写作风格 */
  writingStyle: 'concise' | 'detailed' | 'balanced';
  /** 温度参数 */
  temperature: number;
  /** 每章最大 Token 数 */
  maxTokensPerChapter: number;
  /** 包含上一章 */
  includePreviousChapter: boolean;
  /** 包含角色简介 */
  includeCharacterProfiles: boolean;
  /** 包含世界观设定 */
  includeWorldSetting: boolean;
  /** 包含伏笔追踪 */
  includeForeshadows: boolean;
}

// ============================================================
// AI Text Analysis (AI 文本分析)
// ============================================================

/**
 * AI 文本问题
 */
export interface AITextIssue {
  /** 问题类型 */
  type: 'transition' | 'explanation' | 'repetition' | 'formulaic' | 'emotionless';
  /** 严重程度 */
  severity: 'low' | 'medium' | 'high';
  /** 原始文本 */
  original: string;
  /** 位置 */
  position: {
    start: number;
    end: number;
  };
  /** 建议 */
  suggestion?: string;
}

/**
 * AI 文本分析结果
 */
export interface AITextAnalysisResult {
  /** AI 味评分 (0-100，越低越好) */
  aiScore: number;
  /** 检测到的问题 */
  issues: AITextIssue[];
  /** 改进建议 */
  suggestions: string[];
  /** 统计信息 */
  statistics: {
    avgSentenceLength: number;
    transitionRatio: number;
    dialogueRatio: number;
    descriptiveDensity: number;
  };
}

// ============================================================
// Writing Session
// ============================================================

export interface WritingSession {
  /** 会话ID */
  id: string;
  /** 项目ID */
  projectId: string;
  /** 章节号 */
  chapterNumber: number;
  /** 会话状态 */
  status: "active" | "completed" | "cancelled" | "failed";
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 重试次数 */
  retryCount: number;
  /** 已生成内容 */
  generatedContent: string;
}

export interface WritingTask {
  /** 项目ID */
  projectId: string;
  /** 章节号 */
  chapterNumber: number;
  /** 章节标题 */
  title?: string;
  /** 自定义提示词 */
  prompt?: string;
  /** 章节合同 */
  contract?: ChapterContractInput;
  /** 上文内容 */
  previousContent?: string;
}

export interface WritingResult {
  /** 是否成功 */
  success: boolean;
  /** 生成的内容 */
  content?: string;
  /** 提取的标题 */
  title?: string;
  /** 字数 */
  wordCount: number;
  /** 用时(ms) */
  duration: number;
  /** 错误信息 */
  error?: string;
  /** 重试次数 */
  retryCount: number;
}

export interface WritingOptions {
  /** 温度参数 */
  temperature: number;
  /** 最大token数 */
  maxTokens: number;
  /** Top P */
  topP: number;
  /** 频率惩罚 */
  frequencyPenalty: number;
  /** 存在惩罚 */
  presencePenalty: number;
  /** 启用质量检查 */
  enableQualityCheck: boolean;
  /** 启用去AI味 */
  enableDeAI: boolean;
  /** 失败时重试 */
  retryOnFailure: boolean;
  /** 最大重试次数 */
  maxRetries: number;
}

// ============================================================
// Chapter Contract Input (简化版)
// ============================================================

export interface ChapterContractInput {
  /** 章节开始节点 */
  cbn: ChapterBeginningInput;
  /** 章节进度节点 */
  cpns: ChapterProgressInput[];
  /** 章节结束节点 */
  cen: ChapterEndInput;
}

export interface ChapterBeginningInput {
  /** 摘要 */
  summary: string;
  /** 出现的角色 */
  charactersPresent: string[];
  /** 地点 */
  location: string;
  /** 时间上下文 */
  timeContext: string;
  /** 情感状态 */
  emotionalState: string;
  /** 悬念设置 */
  hooksToSet: string[];
  /** 伏笔提醒 */
  foreshadowReminders: string[];
}

export interface ChapterProgressInput {
  /** 顺序 */
  order: number;
  /** 描述 */
  description: string;
  /** 爽点操作 */
  coolPointOps: string[];
  /** 角色行动 */
  characterActions: CharacterAction[];
}

export interface CharacterAction {
  /** 角色名 */
  characterName: string;
  /** 行动描述 */
  action: string;
  /** 行动类型 */
  type: "dialogue" | "thought" | "action" | "observation";
}

export interface ChapterEndInput {
  /** 摘要 */
  summary: string;
  /** 角色状态 */
  charactersState: Record<string, string>;
  /** 剧情推进 */
  plotAdvancement: string;
  /** 揭示的悬念 */
  hooksRevealed: string[];
  /** 推进的伏笔 */
  foreshadowAdvances: string[];
  /** 悬念结尾 */
  cliffhanger: string;
  /** 下章预览 */
  nextChapterPreview: string;
}

// ============================================================
// Quality Check
// ============================================================

export interface QualityCheckResult {
  /** 是否通过 */
  passed: boolean;
  /** 评分 (0-100) */
  score: number;
  /** 问题列表 */
  issues: QualityIssue[];
  /** 建议列表 */
  suggestions: string[];
  /** 检查详情 */
  details: QualityDetails;
}

export interface QualityIssue {
  /** 问题类型 */
  type: "grammar" | "style" | "consistency" | "contract" | "ai-pattern";
  /** 严重程度 */
  severity: "low" | "medium" | "high";
  /** 描述 */
  description: string;
  /** 位置 */
  position?: string;
  /** 原始文本 */
  original?: string;
  /** 修复建议 */
  suggestion?: string;
}

export interface QualityDetails {
  /** 字数统计 */
  wordCount: WordCountStats;
  /** 节奏分析 */
  rhythm: RhythmAnalysis;
  /** 对话比例 */
  dialogueRatio: number;
  /** 段落长度 */
  paragraphLength: ParagraphStats;
  /** AI模式检测 */
  aiPatterns: AIPatternDetection;
}

export interface WordCountStats {
  /** 总字数 */
  total: number;
  /** 句子数 */
  sentenceCount: number;
  /** 平均句长 */
  avgSentenceLength: number;
  /** 段落数 */
  paragraphCount: number;
}

export interface RhythmAnalysis {
  /** 节奏评分 */
  score: number;
  /** 节奏类型 */
  type: "fast" | "medium" | "slow" | "varied";
  /** 长句比例 */
  longSentenceRatio: number;
  /** 短句比例 */
  shortSentenceRatio: number;
}

export interface ParagraphStats {
  /** 平均长度 */
  avgLength: number;
  /** 最长段落 */
  maxLength: number;
  /** 最短段落 */
  minLength: number;
}

export interface AIPatternDetection {
  /** 检测到的AI模式 */
  patterns: {
    /** 模式类型 */
    type: string;
    /** 出现次数 */
    count: number;
    /** 严重程度 */
    severity: "low" | "medium" | "high";
  }[];
  /** AI味评分 */
  aiScore: number;
}

// ============================================================
// Batch Writing
// ============================================================

export interface BatchWritingTask {
  /** 项目ID */
  projectId: string;
  /** 章节范围 */
  chapterRange: [number, number];
  /** 任务配置 */
  config: BatchWritingConfig;
  /** 优先级 */
  priority: number;
}

export interface BatchWritingConfig {
  /** 并发数 */
  concurrency: number;
  /** 延迟(ms) */
  delayBetween: number;
  /** 失败策略 */
  onFailure: "skip" | "retry" | "stop";
  /** 最大重试次数 */
  maxRetries: number;
}

export interface BatchWritingProgress {
  /** 总任务数 */
  total: number;
  /** 已完成 */
  completed: number;
  /** 进行中 */
  inProgress: number;
  /** 失败 */
  failed: number;
  /** 跳过 */
  skipped: number;
  /** 当前章节 */
  currentChapter?: number;
  /** 开始时间 */
  startTime: number;
  /** 预计剩余时间(ms) */
  estimatedRemaining: number;
}

export interface BatchWritingResult {
  /** 批次ID */
  batchId: string;
  /** 是否全部成功 */
  success: boolean;
  /** 总耗时 */
  totalDuration: number;
  /** 总字数 */
  totalWordCount: number;
  /** 平均每章用时 */
  avgChapterDuration: number;
  /** 各章节结果 */
  chapterResults: ChapterResult[];
}

export interface ChapterResult {
  /** 章节号 */
  chapterNumber: number;
  /** 是否成功 */
  success: boolean;
  /** 内容 */
  content?: string;
  /** 字数 */
  wordCount: number;
  /** 用时 */
  duration: number;
  /** 错误信息 */
  error?: string;
}

// ============================================================
// De-AI Optimization
// ============================================================

export interface DeAIResult {
  /** 优化后的内容 */
  content: string;
  /** 原始内容 */
  originalContent: string;
  /** 优化的问题数量 */
  fixedCount: number;
  /** 优化详情 */
  fixes: DeAIFix[];
  /** AI味等级变化 */
  levelChange: {
    before: string;
    after: string;
    improvement: number;
  };
}

export interface DeAIFix {
  /** 原始文本 */
  original: string;
  /** 替换文本 */
  replacement: string;
  /** 修复原因 */
  reason: string;
  /** 位置 */
  position?: string;
}

export interface DeAIConfig {
  /** 检测禁用词 */
  checkBannedWords: boolean;
  /** 检测AI模式 */
  checkAIPatterns: boolean;
  /** 优化过渡句 */
  optimizeTransitions: boolean;
  /** 修复过度解释 */
  fixOverExplanation: boolean;
  /** 统一节奏 */
  uniformRhythm: boolean;
  /** 强度级别 */
  intensity: "gentle" | "moderate" | "aggressive";
}

// ============================================================
// Writing Mode
// ============================================================

export type WritingMode = "outline" | "chapter" | "batch" | "analysis" | "settings";

export interface WritingModeConfig {
  /** 模式ID */
  id: WritingMode;
  /** 显示名称 */
  name: string;
  /** 图标 */
  icon: string;
  /** 描述 */
  description: string;
  /** 是否推荐 */
  recommended?: boolean;
  /** 快捷键 */
  shortcut?: string;
}

// ============================================================
// Writing Statistics
// ============================================================

export interface WritingStatistics {
  /** 今日写作 */
  today: DailyStats;
  /** 本周写作 */
  thisWeek: WeeklyStats;
  /** 本月写作 */
  thisMonth: MonthlyStats;
  /** 总计 */
  total: TotalStats;
}

export interface DailyStats {
  /** 写作字数 */
  wordCount: number;
  /** 写作时长(min) */
  duration: number;
  /** 完成章节数 */
  chaptersCompleted: number;
  /** 开始时间 */
  startTime?: number;
}

export interface WeeklyStats {
  /** 写作字数 */
  wordCount: number;
  /** 写作时长(min) */
  duration: number;
  /** 完成章节数 */
  chaptersCompleted: number;
  /** 日均字数 */
  avgDailyWordCount: number;
  /** 活跃天数 */
  activeDays: number;
}

export interface MonthlyStats {
  /** 写作字数 */
  wordCount: number;
  /** 写作时长(min) */
  duration: number;
  /** 完成章节数 */
  chaptersCompleted: number;
  /** 目标完成度 */
  goalCompletion: number;
  /** 与上月相比 */
  compareToLastMonth: number;
}

export interface TotalStats {
  /** 总字数 */
  wordCount: number;
  /** 总时长(min) */
  duration: number;
  /** 总章节数 */
  chaptersCompleted: number;
  /** 最高日更 */
  maxDailyWordCount: number;
  /** 平均日更 */
  avgDailyWordCount: number;
}

// ============================================================
// Export
// ============================================================

export type {
  WritingSession,
  WritingTask,
  WritingResult,
  WritingOptions,
  ChapterContractInput,
  ChapterBeginningInput,
  ChapterProgressInput,
  ChapterEndInput,
  CharacterAction,
  QualityCheckResult,
  QualityIssue,
  QualityDetails,
  WordCountStats,
  RhythmAnalysis,
  ParagraphStats,
  AIPatternDetection,
  BatchWritingTask,
  BatchWritingConfig,
  BatchWritingProgress,
  BatchWritingResult,
  ChapterResult,
  DeAIResult,
  DeAIFix,
  DeAIConfig,
  WritingMode,
  WritingModeConfig,
  WritingStatistics,
  DailyStats,
  WeeklyStats,
  MonthlyStats,
  TotalStats,
  // Context
  ContextLevel,
  ContextInfo,
  ChapterWritingContext,
  WritingConfig,
  // AI Text Analysis
  AITextAnalysisResult,
  AITextIssue,
};
