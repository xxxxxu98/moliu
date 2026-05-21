/**
 * Validation System - Barrel Export
 * 验证系统统一导出
 */

// Validators
export { EnhancedContractValidator, enhancedContractValidator } from '../contracts/validator';
export { ConsistencyValidator, consistencyValidator } from './consistency-validator';
export { StrandValidator, strandValidator } from './strand-validator';
export { PlaceholderScanner, placeholderScanner } from './placeholder-scanner';
export type { Placeholder } from './placeholder-scanner';

// Priority Manager
export { PriorityManager, priorityManager } from './priority-manager';
export type {
  PriorityContext,
  PrioritySummary,
  PriorityDecision,
  PriorityDecisionNode,
} from './priority-manager';

// Toxic Pattern Validator
export { ToxicPatternValidator, toxicPatternValidator } from './toxic-pattern-validator';
export type { 
  ToxicPatternType, 
  ToxicPatternRule, 
  ToxicPatternMatch, 
  ToxicPatternReport 
} from './toxic-pattern-validator';

// Anti-AI Detector
export { AntiAIDetector, antiAIDetector } from './anti-ai-detector';
export type { 
  AIFeaturePattern, 
  AIDetectionResult 
} from './anti-ai-detector';

// Re-export types
export type { ValidationResult, Violation, Warning } from '../contracts';
export type {
  PriorityLevel,
  PriorityConfig,
  PriorityRule,
  PriorityDecision,
} from '../types';
export { PRIORITY_LEVELS, comparePriority, isBlocking, getHighestPriority } from '../types';
