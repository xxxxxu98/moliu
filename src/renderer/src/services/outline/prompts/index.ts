/**
 * Prompt System - Barrel Export
 * 提示词系统统一导出
 */

// Core principles
export * from './system/core-principles';

// Unified Prompt Builder (新增)
export * as UnifiedPromptBuilder from './core/prompt-builder';

// Master prompts
export * from './master/master-outline-prompt';

// Volume prompts
export * from './volume/volume-beat-prompt';
export * from './volume/volume-timeline-prompt';
export * from './volume/volume-outline-prompt';

// Chapter prompts (使用命名导出避免重复)
export {
  buildChapterOutlinePrompt,
  buildSimpleChapterPrompt,
  buildBatchChapterPrompt,
  type ChapterOutlinePromptOptions,
} from './chapter/chapter-outline-prompt';

// Writing prompts
export {
  buildChapterWritingPrompt,
  buildSegmentWritingPrompt,
  buildPolishingPrompt,
  type ChapterWritingPromptOptions,
} from './writing/chapter-writing-prompt';

// Techniques library
export * from './techniques';

// Validators
export * from './validators/outline-validator';

// Re-export types (仅保留不在函数导出中的类型)
export type { MasterOutlineOptions, FiveStepPromptOptions } from './master/master-outline-prompt';
export type { VolumeBeatPromptOptions } from './volume/volume-beat-prompt';
export type { TimelinePromptOptions } from './volume/volume-timeline-prompt';
export type { VolumeOutlineOptions, VolumeBeatOptions, VolumeTimelineOptions } from './volume/volume-outline-prompt';
export type { QuickOutlinePromptOptions } from './system/quick-outline-prompt';
export type {
  OpeningTechnique,
  EndingTechnique,
  EmotionArcConfig,
  ChapterType,
  ChapterWritingConfig,
} from './techniques';
export type {
  EmotionType,
  EmotionArcType,
  EmotionAnchor,
  EmotionCurveConfig,
  EmotionHighPoint,
  EmotionDesignConfig,
} from './techniques';
export type { ValidationResult } from './validators/outline-validator';
