/**
 * L3 上下文层 - 统一导出
 *
 * 把 L1 状态 + L2 检索 + 大纲，组装成最优 prompt。
 * 对抗 Lost-in-the-Middle：关键信息放首尾。
 */

export {
  estimateTokens,
  countWords,
  getInputTokenBudget,
  MODEL_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_OUTPUT_RESERVE_RATIO,
} from './TokenEstimator';

export {
  PriorityPolicy,
  DEFAULT_PRIORITY_POLICY,
} from './PriorityPolicy';
export type {
  BlockPriorityConfig,
  ContextBlockType,
  InjectionPosition,
} from './PriorityPolicy';

export { ContextAssembler, truncateToTokens } from './ContextAssembler';
export type {
  ContextAssemblyInput,
  ContextAssemblyResult,
  RetrievedFragment,
  BlockStat,
} from './ContextAssembler';
