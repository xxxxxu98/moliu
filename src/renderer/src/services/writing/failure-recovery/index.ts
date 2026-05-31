/**
 * 失败恢复系统导出
 */

export {
  FailureRecoveryManager,
  getRecoveryManager,
  createRecoveryManager,
  useFailureRecovery,
  type FailureState,
  type RecoveryEvent,
  type RecoveryConfig,
  type PipelineStep,
  type RecoveryStrategy,
  type Resolution,
  DEFAULT_RECOVERY_CONFIG,
  STEP_NAMES,
  STRATEGY_NAMES,
} from './failure-manager';
