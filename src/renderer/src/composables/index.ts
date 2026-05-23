/**
 * Composable 导出模块
 * 统一导出所有 composables 和相关类型
 */

// ============================================================
// 核心 Composable 导出
// ============================================================

// 章节写作器
export { useChapterWriter } from './new/useChapterWriter';
export type {
  WritingTask,
  WritingResult,
  WritingOptions,
} from './new/useChapterWriter';

// 批量写作器
export { useBatchWriter } from './new/useBatchWriter';
export type {
  UseBatchWriterOptions,
  UseBatchWriterReturn,
  BatchConfig,
} from './new/useBatchWriter';

// 写作编排器
export { useWritingOrchestrator } from './new/useWritingOrchestrator';
export type {
  WritingSession,
  WritingError,
  OrchestratorConfig,
} from './new/useWritingOrchestrator';

// 上下文管理器
export { useContextManager } from './new/useContextManager';
export type {
  ContextPhase,
  ContextConfig,
  WritingContext,
  CharacterStateSummary,
  ForeshadowSummary,
  ContextSegment,
  UseContractManagerReturn,
} from './new/useContextManager';

// ============================================================
// 辅助 Composable 导出
// ============================================================

// 合同管理器
export { useContractManager } from './new/useContractManager';
export type { UseContractManagerOptions } from './new/useContractManager';

// 记忆系统
export { useMemorySystem } from './new/useMemorySystem';
export type { UseMemorySystemOptions } from './new/useMemorySystem';

// 市场趋势
export { useMarketTrends } from './new/useMarketTrends';
export type {
  TrendingTag,
  TrendAnalysis,
  DifferentiationSuggestion,
  MarketInsight,
} from './new/useMarketTrends';

// 追读力评估
export { useInspirationEvaluation } from './new/useInspirationEvaluation';
export type { UserSelection } from './new/useInspirationEvaluation';

// 质量检查器
export { useQualityChecker } from './new/useQualityChecker';
export type {
  QualityCheckResult,
  QualityIssue,
  QualityDetails,
  QualityConfig,
} from './new/useQualityChecker';

// Prompt 构建器
export { usePromptBuilder } from './new/usePromptBuilder';
export type {
  PromptTemplate,
  PromptType,
  PromptConfig,
  PromptContext,
} from './new/usePromptBuilder';

// 伏笔追踪器
export { useForeshadowTracker } from './new/useForeshadowTracker';
export type {
  Foreshadow,
  ForeshadowReminder,
  ForeshadowReport,
  ForeshadowConfig,
} from './new/useForeshadowTracker';

// 角色一致性检查器
export { useCharacterConsistency } from './new/useCharacterConsistency';
export type {
  CharacterProfile,
  ConsistencyCheckResult,
  ConsistencyIssue,
  CharacterConfig,
} from './new/useCharacterConsistency';

// 去AI味处理器
export { useAntiAI } from './new/useAntiAI';
export type {
  AntiAIConfig,
  AIAnalysisResult,
  AIPattern,
  OptimizationResult,
  OptimizationChange,
} from './new/useAntiAI';

// ============================================================
// 写作系统工厂函数
// ============================================================

import { useContractManager } from './new/useContractManager';
import { useMemorySystem } from './new/useMemorySystem';
import { useContextManager } from './new/useContextManager';
import { useWritingOrchestrator } from './new/useWritingOrchestrator';

/**
 * 创建完整的写作系统
 * 整合所有子系统到一个统一接口
 */
export function createWritingSystem(projectId: string) {
  const contractManager = useContractManager({ projectId });
  const memorySystem = useMemorySystem({ projectId });
  const contextManager = useContextManager({ projectId, contractManager });
  const orchestrator = useWritingOrchestrator(projectId);

  return {
    contractManager,
    memorySystem,
    contextManager,
    orchestrator,

    async startWriting(startChapter: number, endChapter: number) {
      await orchestrator.startSession(startChapter, endChapter);
    },

    pauseWriting() {
      orchestrator.pauseSession();
    },

    resumeWriting() {
      orchestrator.resumeSession();
    },

    stopWriting() {
      orchestrator.stopSession();
    },

    async writeSingleChapter(chapter: number) {
      return await orchestrator.writeSingleChapter(chapter);
    },
  };
}

export type WritingSystem = ReturnType<typeof createWritingSystem>;
