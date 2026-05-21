/**
 * Knowledge Base - Barrel Export
 * 知识库统一导出
 */

// Extended genre templates
export * from './templates/extended-genres';

// Story cards
export * from './story-cards';

// CSV Knowledge Base
export * from './csv';

// Enhanced Knowledge Query System
export * from './enhanced-query';
export {
  enhancedKnowledgeQuery,
  queryWritingKnowledge,
  generateKnowledgeContext,
} from './enhanced-query';
export type {
  EnhancedKnowledgeContext,
  QueryOptions,
} from './enhanced-query';

// Re-export types
export type { 
  CoolPointRecord, 
  SceneWritingRecord, 
  GoldenFingerRecord, 
  CharacterRecord, 
  GenreRuleRecord, 
  BridgePatternRecord, 
  StoryCardRecord,
  ExtendedGenreTemplate,
} from './templates/extended-genres';

export type { StoryCard } from './story-cards';
