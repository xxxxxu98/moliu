/**
 * Outline Service - Main Export
 * 统一导出大纲生成系统的所有模块
 * 基于 oh-story-claudecode 和 webnovel-writer 重构
 */

// ====== Types ======
export * from './types';

// ====== Schemas ======
export * from './schemas/outline.schema';
export * from './schemas/volume.schema';
export * from './schemas/chapter-brief.schema';

// ====== Contract System (新契约系统) ======
export * from './contracts';
export type {
  StoryContract,
  VolumeContract,
  ChapterCommit,
  Beat,
  Timeline,
  StrandConfig,
  StrandStatus,
  ChapterNodes,
  Violation,
  Warning,
  ValidationResult,
} from './contracts';

// ====== Validation System (验证系统) ======
export * from './validation';
export {
  enhancedContractValidator,
  consistencyValidator,
  strandValidator,
  placeholderScanner,
  toxicPatternValidator,
  antiAIDetector,
} from './validation';

// ====== Knowledge Base (扩展知识库) ======
export * from './knowledge';
export {
  EXTENDED_GENRE_TEMPLATES,
  STORY_CARDS,
  getExtendedGenreTemplate,
  getAllStoryCards,
  getStoryCardById,
  getStoryCardsByCategory,
  getStoryCardsByGenre,
  searchStoryCards,
  getRecommendedStoryCards,
  STORY_CARD_COMBINATIONS,
} from './knowledge';

// ====== Prompts (提示词系统) ======
export * from './prompts';
export {
  buildMasterOutlinePrompt,
  buildVolumeBeatPrompt,
  buildTimelinePrompt,
  buildChapterOutlinePrompt,
  buildChapterWritingPrompt,
  buildSimpleBeatPrompt,
  buildSimpleTimelinePrompt,
  buildSimpleChapterPrompt,
  buildBatchChapterPrompt,
  buildSegmentWritingPrompt,
  buildPolishingPrompt,
} from './prompts';

// ====== Generators (生成器系统) ======
export {
  MasterOutlineGenerator,
  masterOutlineGenerator,
  VolumeOutlineGenerator,
  createVolumeGenerator,
  ChapterOutlineGenerator,
  createChapterGenerator,
} from './generator';
export type {
  GenerationResult,
  ProgressCallback,
  MasterGeneratorOptions,
  VolumeGeneratorOptions,
  VolumeGenerationResult,
  ChapterGeneratorOptions,
  ChapterGenerationResult,
  BatchChapterOptions,
} from './generator';

// ====== Processors ======
export { TimelineManager, timelineManager } from './processor/timeline-manager';
export { IncrementalWriteback, incrementalWriteback } from './processor/incremental-writeback';

// ====== Workflow ======
export * from './workflow';
export {
  confirmExecuteWorkflow,
  batchRecovery,
} from './workflow';

// ====== Analytics ======
export * from './analytics';
export {
  readingPowerAnalyzer,
} from './analytics';
