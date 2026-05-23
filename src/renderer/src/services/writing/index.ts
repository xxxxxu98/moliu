/**
 * 写作服务导出
 * 整合所有写作相关的服务和模块
 */

// ============================================================
// 核心编排器
// ============================================================

export { WritingPipeline } from './orchestrator/WritingPipeline';
export { WritingOrchestrator, useWritingOrchestrator } from './orchestrator/WritingOrchestrator';
export { DraftAgent } from './orchestrator/DraftAgent';

// ============================================================
// 类型
// ============================================================

export * from './orchestrator/types';

// ============================================================
// 合同系统
// ============================================================

export { ContractManager, useContractManager } from './contract/ContractManager';
export * from './contract/types';

// ============================================================
// 记忆系统
// ============================================================

export { MemoryOrchestrator, useMemoryOrchestrator } from './memory/MemoryOrchestrator';
export { useReaderSignals, createReaderSignalsManager } from './memory/ReaderSignals';
export { ReaderSignalsTaskBookIntegrator } from './memory/ReaderSignalsTaskBookIntegrator';
export * from './memory/types';

// ============================================================
// 审查系统
// ============================================================

export { ReviewAgent, useReviewAgent } from './review/ReviewAgent';
export { EnhancedReviewAgent, useEnhancedReviewAgent } from './review/EnhancedReviewAgent';
export * from './review/types';

// ============================================================
// 润色系统
// ============================================================

export { PolishAgent, usePolishAgent } from './polish/PolishAgent';
export * from './polish/types';

// ============================================================
// 提交系统
// ============================================================

export { ChapterCommitManager, useChapterCommitManager } from './commit/ChapterCommitManager';
export * from './commit/types';

// ============================================================
// 备份系统
// ============================================================

export { GitBackupManager, useGitBackupManager } from './backup/GitBackupManager';

// ============================================================
// 任务书
// ============================================================

export { TaskBookBuilder } from './taskbook/TaskBookBuilder';

// ============================================================
// 数据提取
// ============================================================

export { DataExtractor, useDataExtractor } from './extraction/DataExtractor';

// ============================================================
// 去AI味
// ============================================================

export { AntiAIEnhancedService, useAntiAIEnhanced } from './anti-ai-enhanced';

// ============================================================
// Prompt 构建器
// ============================================================

export { SmartContinuePromptBuilder, PromptBuilder } from './prompts/SmartContinuePromptBuilder';

// ============================================================
// 监控
// ============================================================

export { WritingMonitor, getWritingMonitor, useWritingMonitor } from './monitor/WritingMonitor';
export * from './monitor/WritingMonitor';
