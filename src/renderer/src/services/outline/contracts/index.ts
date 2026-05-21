/**
 * Contract System - Barrel Export
 * 契约系统统一导出
 */

// Types
export * from './story-contract';
export * from './volume-contract';
export * from './chapter-commit';

// Contract factories
export {
  createContractMeta,
  createDefaultStoryContract,
  createValidationResult,
  createViolation,
  createWarning,
  validateStrandRatio,
  getStrandSummary,
} from './story-contract';

export {
  createDefaultVolumeContract,
  generateTimelineFromBeats,
  calculateBeatChapterRange,
  generateDefaultBeatTable,
  BEAT_NODE_ORDER,
} from './volume-contract';

export {
  createDefaultChapterCommit,
  commitToBrief,
  determineNodeType,
  generateDefaultNodes,
} from './chapter-commit';
