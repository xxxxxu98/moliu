/**
 * L5 门禁层 - 统一导出
 *
 * 门禁是防幻觉的确定性防线。所有 LLM 生成的内容必须穿过门禁才能落地。
 *
 * 使用方式：
 *   import { ConsistencyGatePipeline } from '@/services/gates';
 *   const pipeline = new ConsistencyGatePipeline();
 *   const result = await pipeline.run({ prose, changes, snapshot, chapter });
 *   if (result.decision.nextAction === 'rewrite') { ... }
 */

// 类型
export * from './types';

// 确定性门禁 G1-G6
export {
  Gate1Protocol,
  Gate2Reference,
  Gate3Consistency,
  Gate4Description,
  Gate5Blueprint,
  Gate6Entity,
} from './deterministic-gates';

// G7 LLM 门禁
export { Gate7Semantic, setGate7LLMClient } from './Gate7Semantic';
export type { Gate7LLMClient } from './Gate7Semantic';

// 流水线
export { ConsistencyGatePipeline, sortIssuesBySeverity } from './ConsistencyGatePipeline';
