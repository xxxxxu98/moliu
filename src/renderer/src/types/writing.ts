/**
 * AI 写作系统类型定义
 */

/**
 * 写作模式
 */
export type WritingMode = 'single' | 'batch';

/**
 * 章节写作状态
 */
export type ChapterWritingStatus = 
  | 'idle' 
  | 'preparing'    // 准备中
  | 'writing'      // 写作中
  | 'completed'    // 完成
  | 'failed'       // 失败
  | 'paused';      // 暂停

/**
 * 批量写作任务
 */
export interface WritingTask {
  id: string;
  chapterId: string;
  chapterTitle: string;
  status: ChapterWritingStatus;
  progress: number;         // 0-100
  targetWordCount: number; // 目标字数
  generatedContent: string; // 已生成内容
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;      // 重试次数
}

/**
 * 批量写作队列
 */
export interface WritingQueue {
  projectId: string;
  tasks: WritingTask[];
  currentTaskIndex: number;
  isPaused: boolean;
  isActive: boolean;
  startedAt?: string;
  completedAt?: string;
  totalWordCount: number;   // 已生成总字数
  targetWordCount: number;  // 目标总字数
}

/**
 * 写作配置
 */
export interface WritingConfig {
  // 字数设置
  targetWordCount: number;     // 目标总字数
  wordsPerChapter: number;    // 每章目标字数
  chapterCount: number;       // 章节数量

  // 风格设置
  writingStyle: WritingStyle;
  customStyleDescription?: string;

  // AI 设置
  temperature: number;           // 创造性 0-1
  maxTokensPerChapter: number;  // 每章最大 token

  // 上下文设置
  includePreviousChapter: boolean;
  includeCharacterProfiles: boolean;
  includeWorldSetting: boolean;
  includeForeshadows: boolean;
}

/**
 * 写作风格
 */
export type WritingStyle = 
  | 'concise'      // 简洁有力
  | 'elegant'     // 文笔华丽
  | 'humorous'    // 幽默风趣
  | 'ancient'     // 古风典雅
  | 'custom';     // 自定义

/**
 * 章节写作上下文
 */
export interface ChapterWritingContext {
  // 项目级设定
  projectTitle: string;
  projectSynopsis: string;
  worldSetting?: {
    locations: Array<{ name: string; description: string; level: string }>;
    rules: Array<{ name: string; description: string }>;
    factions: Array<{ name: string; description: string }>;
  };

  // 卷级设定
  volumeTitle?: string;
  volumeOutline?: string;

  // 章级设定
  chapter: {
    id: string;
    title: string;
    orderIndex: number;
    outline?: string;        // 章节大纲
    existingContent?: string; // 已写内容
    chapterType?: ChapterType; // 章节类型
  };

  // 前情摘要
  previousChapter?: {
    title: string;
    summary: string;         // 300字摘要
    ending: string;          // 结尾关键句
  };

  // 角色设定
  characters: Array<{
    id: string;
    name: string;
    role: string;
    description: string;
    personality: string[];
    appearance?: string;
    speakingStyle?: string;
    currentStatus?: string;
    relationships?: Array<{ targetName: string; type: string; description: string }>;
  }>;

  // 本章出场角色
  charactersInScene: string[]; // 角色 ID 列表

  // 伏笔设定
  foreshadows: Array<{
    id: string;
    hint: string;
    status: string;
    suggestedChapter?: number;
  }>;

  // 写作要求
  requirements: {
    targetWordCount: number;
    style: WritingStyle;
    customStyle?: string;
    keyEvents?: string[];   // 本章关键事件
    foreshadowToBury?: string[];   // 本章埋设伏笔
    foreshadowToReveal?: string[]; // 本章揭示伏笔
  };
}

/**
 * 分层上下文级别
 */
export enum ContextLevel {
  Project = 1,   // 项目级
  Volume = 2,    // 卷级
  Chapter = 3,   // 章级
  Writing = 4,   // 创作级
}

/**
 * 上下文信息
 */
export interface ContextInfo {
  level: ContextLevel;
  content: string;
  tokenCount: number;
  source: string;  // 来源标识
}

/**
 * 章节生成请求
 */
export interface GenerateChapterRequest {
  projectId: string;
  outline: string;
  chapterCount?: number;
  wordsPerChapter?: number;
  style?: WritingStyle;
}

/**
 * 章节类型
 */
export type ChapterType = 
  | 'world_intro'      // 世界观/背景介绍
  | 'character_intro'  // 人物登场/介绍
  | 'plot_setup'       // 情节铺陈
  | 'conflict'         // 冲突展开
  | 'climax'          // 高潮
  | 'resolution'       // 冲突解决
  | 'transitional'     // 过渡章节
  | 'ending'          // 结尾/收束
  | 'normal';         // 普通章节

/**
 * 章节类型描述映射
 */
export const CHAPTER_TYPE_DESCRIPTIONS: Record<ChapterType, string> = {
  world_intro: '世界观/背景介绍 - 需要详细介绍故事发生的世界、历史、社会结构等背景信息',
  character_intro: '人物登场/介绍 - 需要重点描写新角色的外貌、性格、能力、背景等',
  plot_setup: '情节铺陈 - 故事的开端，需要建立冲突的种子，为后续发展做铺垫',
  conflict: '冲突展开 - 矛盾冲突逐渐激化，情节逐步推进',
  climax: '高潮 - 故事最激烈的部分，核心冲突达到顶点',
  resolution: '冲突解决 - 矛盾得到化解，问题得到解决',
  transitional: '过渡章节 - 连接前后情节的过渡段落，可以放缓节奏',
  ending: '结尾/收束 - 故事接近尾声，需要收束所有线索，给出结局',
  normal: '普通章节 - 正常推进情节的章节',
};

/**
 * 章节生成响应
 */
export interface GenerateChapterResponse {
  chapters: Array<{
    title: string;
    outline: string;
    orderIndex: number;
    keyEvents: string[];
    foreshadows: string[];
    chapterType?: ChapterType;  // 章节类型（新增）
  }>;
}

/**
 * 写作进度回调
 */
export type WritingProgressCallback = (progress: {
  chapterId: string;
  chapterTitle: string;
  progress: number;
  generatedWordCount: number;
  totalWordCount: number;
  status: ChapterWritingStatus;
}) => void;

/**
 * 写作完成回调
 */
export type WritingCompleteCallback = (result: {
  success: boolean;
  chapterId: string;
  content: string;
  wordCount: number;
  error?: string;
}) => void;

/**
 * 批量写作完成回调
 */
export type BatchWritingCompleteCallback = (result: {
  success: boolean;
  completedCount: number;
  totalCount: number;
  totalWordCount: number;
  failedChapters: string[];
}) => void;
