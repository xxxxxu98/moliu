/**
 * L6 提交层 + L7 恢复层 - 统一导出
 */

// L6 提交层
export { CommitTransaction, IndexSyncWriter, createCommitTransaction } from '../commit/CommitTransaction';
export type {
  CommitStepResult,
  CommitTransactionResult,
  CommitTransactionOptions,
  GitBackupClient,
  ChapterPersistenceClient,
} from '../commit/CommitTransaction';

// L7 恢复层
export {
  CheckpointManager,
  SessionStateManager,
  recoverFromCrash,
} from './RecoveryManager';
export type {
  Checkpoint,
  SessionStatus,
  WritingSession,
  RecoveryResult,
} from './RecoveryManager';
