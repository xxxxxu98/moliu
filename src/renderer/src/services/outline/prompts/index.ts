/**
 * Prompt System - Barrel Export
 * 提示词系统统一导出
 */

// Master prompts
export * from './master/master-outline-prompt';

// Volume prompts
export * from './volume/volume-beat-prompt';
export * from './volume/volume-timeline-prompt';

// Chapter prompts
export * from './chapter/chapter-outline-prompt';

// Writing prompts
export * from './writing/chapter-writing-prompt';

// Techniques library
export * from './techniques';

// Re-export types
export type { FiveStepPromptOptions } from './master/master-outline-prompt';
export type { VolumeBeatPromptOptions } from './volume/volume-beat-prompt';
export type { TimelinePromptOptions } from './volume/volume-timeline-prompt';
export type { ChapterOutlinePromptOptions } from './chapter/chapter-outline-prompt';
export type { ChapterWritingPromptOptions } from './writing/chapter-writing-prompt';
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
