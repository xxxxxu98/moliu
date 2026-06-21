/**
 * 失败恢复系统
 * 
 * 功能：
 * 1. 管理写作流水线各阶段的失败状态
 * 2. 实现自动恢复策略
 * 3. 支持用户决策点
 * 4. 失败历史追踪
 *
 * v2.1 改造：集成 L7 CheckpointManager
 *   - 失败超过最大重试时，提供"从最近 checkpoint 恢复"的能力
 *   - 章节级（post_commit）checkpoint + 阶段级（per-step）失败恢复双轨并行
 */

import { ref, computed, type Ref } from 'vue';
import { CheckpointManager, type RecoveryResult } from '@/services/recovery';

// ============================================================
// 类型定义
// ============================================================

/**
 * 流水线步骤
 */
export type PipelineStep = 
  | 'idle'
  | 'taskbook'        // 生成任务书
  | 'draft'           // 起草
  | 'supplement'       // 补充续写
  | 'review'          // 审查
  | 'polish'          // 润色
  | 'save'            // 保存
  | 'commit'          // 提交
  | 'memory';         // 记忆提取

/**
 * 失败解决方案
 */
export type Resolution = 'resolved' | 'skipped' | 'forced_proceed' | 'user_override' | 'max_retries_exceeded';

/**
 * 恢复策略
 */
export type RecoveryStrategy = 
  | 'retry'                           // 重试
  | 'retry_with_simpler_prompt'      // 简化提示重试
  | 'skip'                           // 跳过
  | 'force_proceed'                   // 强制继续
  | 'use_placeholder'                // 使用占位符
  | 'fallback_to_previous'           // 回退到之前状态
  | 'use_original_content'           // 使用原始内容
  | 'user_decision'                  // 等待用户决策
  | 'lower_strictness';             // 降低严格度

/**
 * 失败状态
 */
export interface FailureState {
  id: string;
  chapterId: string;
  chapterNumber: number;
  step: PipelineStep;
  error: string;
  errorCode?: string;
  attempts: number;
  maxAttempts: number;
  strategies: RecoveryStrategy[];
  currentStrategy: RecoveryStrategy | null;
  status: 'pending' | 'recovering' | 'resolved' | 'failed';
  resolution?: Resolution;
  resolvedAt?: string;
  metadata?: Record<string, any>;
}

/**
 * 恢复策略配置
 */
export interface RecoveryConfig {
  maxRetries: number;
  strategies: RecoveryStrategy[];
  fallbackAction: RecoveryStrategy;
}

/**
 * 恢复事件
 */
export interface RecoveryEvent {
  id: string;
  timestamp: string;
  chapterId: string;
  step: PipelineStep;
  type: 'failure' | 'retry' | 'recovery' | 'skip' | 'user_decision';
  strategy?: RecoveryStrategy;
  result?: 'success' | 'failed';
  message?: string;
}

// ============================================================
// 默认配置
// ============================================================

/**
 * 各步骤的默认恢复配置
 */
export const DEFAULT_RECOVERY_CONFIG: Record<PipelineStep, RecoveryConfig> = {
  idle: { maxRetries: 0, strategies: [], fallbackAction: 'skip' },
  
  taskbook: {
    maxRetries: 2,
    strategies: ['retry', 'retry_with_simpler_prompt', 'skip'],
    fallbackAction: 'skip',
  },
  
  draft: {
    maxRetries: 2,
    strategies: ['retry', 'retry_with_simpler_prompt', 'skip'],
    fallbackAction: 'skip',
  },
  
  supplement: {
    maxRetries: 1,
    strategies: ['retry', 'use_original_content'],
    fallbackAction: 'use_original_content',
  },
  
  review: {
    maxRetries: 3,
    strategies: ['lower_strictness', 'force_proceed'],
    fallbackAction: 'force_proceed',
  },
  
  polish: {
    maxRetries: 1,
    strategies: ['retry', 'use_original_content'],
    fallbackAction: 'use_original_content',
  },
  
  save: {
    maxRetries: 2,
    strategies: ['retry', 'skip'],
    fallbackAction: 'skip',
  },
  
  commit: {
    maxRetries: 1,
    strategies: ['retry', 'skip'],
    fallbackAction: 'skip',
  },
  
  memory: {
    maxRetries: 2,
    strategies: ['retry', 'use_placeholder', 'fallback_to_previous'],
    fallbackAction: 'fallback_to_previous',
  },
};

/**
 * 步骤中文名称
 */
export const STEP_NAMES: Record<PipelineStep, string> = {
  idle: '空闲',
  taskbook: '生成任务书',
  draft: 'AI起草',
  supplement: '补充续写',
  review: '审查',
  polish: '润色',
  save: '保存',
  commit: '提交',
  memory: '记忆提取',
};

/**
 * 策略中文名称
 */
export const STRATEGY_NAMES: Record<RecoveryStrategy, string> = {
  retry: '重试',
  retry_with_simpler_prompt: '简化提示重试',
  skip: '跳过',
  force_proceed: '强制继续',
  use_placeholder: '使用占位符',
  fallback_to_previous: '回退到之前状态',
  use_original_content: '使用原始内容',
  user_decision: '等待用户决策',
  lower_strictness: '降低严格度',
};

// ============================================================
// 失败恢复管理器
// ============================================================

export class FailureRecoveryManager {
  // 状态
  private failures: Ref<Map<string, FailureState>> = ref(new Map());
  private events: Ref<RecoveryEvent[]> = ref([]);
  
  // 配置
  private config: Record<PipelineStep, RecoveryConfig> = { ...DEFAULT_RECOVERY_CONFIG };
  
  // 回调
  private onUserDecision?: (failure: FailureState) => Promise<RecoveryStrategy | null>;
  private onRecovery?: (failure: FailureState, strategy: RecoveryStrategy) => Promise<boolean>;

  constructor(options?: {
    onUserDecision?: (failure: FailureState) => Promise<RecoveryStrategy | null>;
    onRecovery?: (failure: FailureState, strategy: RecoveryStrategy) => Promise<boolean>;
  }) {
    this.onUserDecision = options?.onUserDecision;
    this.onRecovery = options?.onRecovery;
  }

  /**
   * 注册失败
   */
  registerFailure(
    chapterId: string,
    chapterNumber: number,
    step: PipelineStep,
    error: string,
    errorCode?: string,
    metadata?: Record<string, any>
  ): FailureState {
    const id = `failure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const failure: FailureState = {
      id,
      chapterId,
      chapterNumber,
      step,
      error,
      errorCode,
      attempts: 0,
      maxAttempts: this.config[step].maxRetries,
      strategies: [...this.config[step].strategies],
      currentStrategy: null,
      status: 'pending',
      metadata,
    };

    this.failures.value.set(id, failure);
    
    // 记录事件
    this.addEvent({
      id: `event-${Date.now()}`,
      timestamp: new Date().toISOString(),
      chapterId,
      step,
      type: 'failure',
      message: error,
    });

    return failure;
  }

  /**
   * 获取失败的下一个恢复策略
   */
  getNextStrategy(failureId: string): RecoveryStrategy | null {
    const failure = this.failures.value.get(failureId);
    if (!failure) return null;

    // 如果已经尝试了所有策略
    if (failure.attempts >= failure.strategies.length) {
      return this.config[failure.step].fallbackAction;
    }

    // 返回下一个策略
    return failure.strategies[failure.attempts];
  }

  /**
   * 尝试恢复
   */
  async attemptRecovery(failureId: string): Promise<{
    strategy: RecoveryStrategy | null;
    action: 'retry' | 'skip' | 'user_decision' | 'fallback';
  }> {
    const failure = this.failures.value.get(failureId);
    if (!failure) {
      return { strategy: null, action: 'fallback' };
    }

    const strategy = this.getNextStrategy(failureId);
    if (!strategy) {
      return { strategy: null, action: 'fallback' };
    }

    // 更新失败状态
    failure.currentStrategy = strategy;
    failure.status = 'recovering';
    failure.attempts++;

    // 如果需要用户决策
    if (strategy === 'user_decision') {
      if (this.onUserDecision) {
        const userChoice = await this.onUserDecision(failure);
        if (userChoice) {
          failure.currentStrategy = userChoice;
          return { strategy: userChoice, action: 'user_decision' };
        }
      }
      return { strategy: null, action: 'user_decision' };
    }

    // 记录事件
    this.addEvent({
      id: `event-${Date.now()}`,
      timestamp: new Date().toISOString(),
      chapterId: failure.chapterId,
      step: failure.step,
      type: 'retry',
      strategy,
    });

    // 执行恢复
    if (this.onRecovery) {
      const success = await this.onRecovery(failure, strategy);
      if (success) {
        this.resolveFailure(failureId, 'resolved');
        return { strategy, action: 'retry' };
      }
    }

    // 恢复失败，尝试下一个策略
    return this.attemptRecovery(failureId);
  }

  /**
   * 解决失败
   */
  resolveFailure(
    failureId: string,
    resolution: Resolution,
    options?: { forceProceed?: boolean; useOriginalContent?: boolean }
  ): void {
    const failure = this.failures.value.get(failureId);
    if (!failure) return;

    failure.status = 'resolved';
    failure.resolution = resolution;
    failure.resolvedAt = new Date().toISOString();

    // 如果强制继续，更新元数据
    if (options?.forceProceed) {
      failure.metadata = { ...failure.metadata, forceProceed: true };
    }
    if (options?.useOriginalContent) {
      failure.metadata = { ...failure.metadata, useOriginalContent: true };
    }

    // 记录事件
    this.addEvent({
      id: `event-${Date.now()}`,
      timestamp: new Date().toISOString(),
      chapterId: failure.chapterId,
      step: failure.step,
      type: 'recovery',
      strategy: failure.currentStrategy || undefined,
      result: 'success',
      message: `已通过 ${STRATEGY_NAMES[failure.currentStrategy || 'unknown']} 解决`,
    });
  }

  /**
   * 跳过失败
   */
  skipFailure(failureId: string): void {
    this.resolveFailure(failureId, 'skipped');
  }

  /**
   * 强制继续
   */
  forceProceed(failureId: string): void {
    const failure = this.failures.value.get(failureId);
    if (failure) {
      failure.status = 'resolved';
      failure.resolution = 'forced_proceed';
      failure.resolvedAt = new Date().toISOString();
    }
  }

  /**
   * 用户覆盖
   */
  userOverride(failureId: string, decision: RecoveryStrategy): void {
    const failure = this.failures.value.get(failureId);
    if (failure) {
      failure.status = 'resolved';
      failure.resolution = 'user_override';
      failure.currentStrategy = decision;
      failure.resolvedAt = new Date().toISOString();
    }
  }

  /**
   * 获取章节的失败状态
   */
  getChapterFailures(chapterId: string): FailureState[] {
    return Array.from(this.failures.value.values()).filter(
      f => f.chapterId === chapterId
    );
  }

  /**
   * 获取章节的未解决失败
   */
  getPendingFailures(chapterId?: string): FailureState[] {
    const all = Array.from(this.failures.value.values());
    if (chapterId) {
      return all.filter(f => f.chapterId === chapterId && f.status === 'pending');
    }
    return all.filter(f => f.status === 'pending');
  }

  /**
   * 检查是否可以继续
   */
  canProceed(chapterId: string): { canProceed: boolean; blockingFailures: FailureState[] } {
    const pending = this.getPendingFailures(chapterId);
    const blocking = pending.filter(f => 
      f.step === 'review' && 
      f.status !== 'resolved'
    );
    
    return {
      canProceed: blocking.length === 0,
      blockingFailures: blocking,
    };
  }

  /**
  // ============================================================
  // v2.1: L7 Checkpoint 集成
  // ============================================================

  /**
   * 记录一章提交后的 checkpoint（桥接到 L7 CheckpointManager）。
   * 由 ChapterCommitManagerV2 或 V2 编排器在 commit 成功后调用。
   */
  recordCheckpoint(
    projectId: string,
    chapter: number,
    stateExport: unknown,
    success: boolean,
  ): void {
    const cp = new CheckpointManager(projectId);
    cp.save({
      projectId,
      chapter,
      type: 'post_commit',
      stateExport,
      commitResult: { success, chapter },
    });
  }

  /**
   * 在所有自动恢复策略都失败时，让用户选择"从最近 checkpoint 恢复"。
   * 这是兜底：跨章节的恢复（per-chapter 失败重试救不了的场景）。
   *
   * 返回：最近成功 commit 的检查点；无则 null。调用方负责：
   *   1. stateStore.import(checkpoint.stateExport)
   *   2. 提示用户从第 (checkpoint.chapter + 1) 章继续
   */
  recoverFromCheckpoint(projectId: string): {
    checkpoint: any;
    resumeChapter: number;
  } | null {
    const cp = new CheckpointManager(projectId);
    const latest = cp.getRecoveryPoint();
    if (!latest) return null;
    return {
      checkpoint: latest,
      resumeChapter: latest.chapter + 1,
    };
  }

  /**
   * 添加事件
   */
  private addEvent(event: RecoveryEvent): void {
    this.events.value.push(event);
    
    // 限制事件数量
    if (this.events.value.length > 500) {
      this.events.value = this.events.value.slice(-500);
    }
  }

  /**
   * 获取事件历史
   */
  getEventHistory(chapterId?: string, limit?: number): RecoveryEvent[] {
    let events = [...this.events.value];
    
    if (chapterId) {
      events = events.filter(e => e.chapterId === chapterId);
    }
    
    if (limit) {
      events = events.slice(-limit);
    }
    
    return events;
  }

  /**
   * 获取失败历史
   */
  getFailureHistory(chapterId?: string): FailureState[] {
    const all = Array.from(this.failures.value.values());
    if (chapterId) {
      return all.filter(f => f.chapterId === chapterId);
    }
    return all;
  }

  /**
   * 清除章节失败
   */
  clearChapterFailures(chapterId: string): void {
    for (const [id, failure] of this.failures.value.entries()) {
      if (failure.chapterId === chapterId) {
        this.failures.value.delete(id);
      }
    }
  }

  /**
   * 清除所有失败
   */
  clearAll(): void {
    this.failures.value.clear();
    this.events.value = [];
  }

  /**
   * 更新配置
   */
  updateConfig(step: PipelineStep, config: Partial<RecoveryConfig>): void {
    this.config[step] = { ...this.config[step], ...config };
  }

  /**
   * 获取配置
   */
  getConfig(step: PipelineStep): RecoveryConfig {
    return { ...this.config[step] };
  }

  /**
   * 导出失败状态
   */
  export(): { failures: FailureState[]; events: RecoveryEvent[] } {
    return {
      failures: Array.from(this.failures.value.values()),
      events: [...this.events.value],
    };
  }

  /**
   * 导入失败状态
   */
  import(data: { failures: FailureState[]; events: RecoveryEvent[] }): void {
    this.failures.value = new Map(data.failures.map(f => [f.id, f]));
    this.events.value = data.events;
  }
}

// ============================================================
// 单例
// ============================================================

let recoveryManagerInstance: FailureRecoveryManager | null = null;

export function getRecoveryManager(): FailureRecoveryManager {
  if (!recoveryManagerInstance) {
    recoveryManagerInstance = new FailureRecoveryManager();
  }
  return recoveryManagerInstance;
}

export function createRecoveryManager(
  options?: {
    onUserDecision?: (failure: FailureState) => Promise<RecoveryStrategy | null>;
    onRecovery?: (failure: FailureState, strategy: RecoveryStrategy) => Promise<boolean>;
  }
): FailureRecoveryManager {
  recoveryManagerInstance = new FailureRecoveryManager(options);
  return recoveryManagerInstance;
}

// ============================================================
// Composable
// ============================================================

export function useFailureRecovery(
  options?: {
    onUserDecision?: (failure: FailureState) => Promise<RecoveryStrategy | null>;
    onRecovery?: (failure: FailureState, strategy: RecoveryStrategy) => Promise<boolean>;
  }
) {
  const manager = options 
    ? createRecoveryManager(options) 
    : getRecoveryManager();

  return {
    manager,
    
    // 注册失败
    registerFailure: (
      chapterId: string,
      chapterNumber: number,
      step: PipelineStep,
      error: string,
      errorCode?: string,
      metadata?: Record<string, any>
    ) => manager.registerFailure(chapterId, chapterNumber, step, error, errorCode, metadata),
    
    // 尝试恢复
    attemptRecovery: (failureId: string) => manager.attemptRecovery(failureId),
    
    // 解决失败
    resolveFailure: (failureId: string, resolution: Resolution, options?: any) => 
      manager.resolveFailure(failureId, resolution, options),
    
    // 跳过
    skipFailure: (failureId: string) => manager.skipFailure(failureId),
    
    // 强制继续
    forceProceed: (failureId: string) => manager.forceProceed(failureId),
    
    // 用户覆盖
    userOverride: (failureId: string, decision: RecoveryStrategy) => 
      manager.userOverride(failureId, decision),
    
    // 检查是否可以继续
    canProceed: (chapterId: string) => manager.canProceed(chapterId),
    
    // 获取失败
    getChapterFailures: (chapterId: string) => manager.getChapterFailures(chapterId),
    getPendingFailures: (chapterId?: string) => manager.getPendingFailures(chapterId),
    
    // 事件历史
    getEventHistory: (chapterId?: string, limit?: number) => 
      manager.getEventHistory(chapterId, limit),
    
    // 清除
    clearChapterFailures: (chapterId: string) => manager.clearChapterFailures(chapterId),
    clearAll: () => manager.clearAll(),
    
    // 配置
    updateConfig: (step: PipelineStep, config: Partial<RecoveryConfig>) => 
      manager.updateConfig(step, config),
    getConfig: (step: PipelineStep) => manager.getConfig(step),
    
    // 导出/导入
    export: () => manager.export(),
    import: (data: { failures: FailureState[]; events: RecoveryEvent[] }) => 
      manager.import(data),
    
    // 辅助
    STEP_NAMES,
    STRATEGY_NAMES,
    DEFAULT_RECOVERY_CONFIG,
  };
}
