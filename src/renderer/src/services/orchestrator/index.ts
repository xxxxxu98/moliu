/**
 * 整合层 - 统一导出
 *
 * 这是状态驱动架构的入口。把 L1-L7 串联成可用的写作闭环。
 *
 * 使用示例：
 *   const orchestrator = new StateDrivenWritingOrchestrator(drafter, gitBackup, persistence);
 *   await orchestrator.initialize(project);
 *   const result = await orchestrator.writeChapter(project, chapter, 3000);
 */

export { StateDrivenWritingOrchestrator, DEFAULT_CONFIG } from './StateDrivenWritingOrchestrator';
export type {
  StateDrivenOrchestratorConfig,
  WriteChapterResult,
  OrchestratorEvent,
  OrchestratorEventType,
  OrchestratorListener,
} from './StateDrivenWritingOrchestrator';

// 重新导出各层（便于单点 import）
export * from '../state';
export * from '../gates';
export * from '../context';
export * from '../retrieval';
export * from '../generation';
export {
  CommitTransaction, IndexSyncWriter, createCommitTransaction,
} from '../commit/CommitTransaction';
export type {
  CommitStepResult, CommitTransactionResult, CommitTransactionOptions,
  GitBackupClient, ChapterPersistenceClient,
} from '../commit/CommitTransaction';
export {
  CheckpointManager, SessionStateManager, recoverFromCrash,
} from '../recovery/RecoveryManager';
export type {
  Checkpoint, SessionStatus, WritingSession, RecoveryResult,
} from '../recovery/RecoveryManager';
