/**
 * L7 恢复层 - 检查点 + 会话状态
 *
 * 写 200 章中途崩溃是必然事件。这层保证可恢复：
 * - Checkpoint：每章提交后写检查点，崩溃后从最近检查点恢复
 * - SessionState：写作会话持久化，记录"写到哪了、当前状态"
 *
 * 存储：内存 + localStorage（renderer 可用）。生产可换 IndexedDB。
 */

import type { StateSnapshotStore } from '../state/StateSnapshotStore';
import type { CommitTransactionResult } from '../commit/CommitTransaction';
import type { GatePipelineResult } from '../gates/types';

// ============================================================
// 检查点
// ============================================================

export interface Checkpoint {
  /** 项目 ID */
  projectId: string;
  /** 检查点 ID */
  id: string;
  /** 对应章节号 */
  chapter: number;
  /** 检查点类型 */
  type: 'pre_draft' | 'post_draft' | 'post_gate' | 'post_commit';
  /** 时间戳 */
  timestamp: string;
  /** 状态快照导出（来自 StateSnapshotStore.export） */
  stateExport?: unknown;
  /** 门禁结果（post_gate 类型） */
  gateResult?: { passed: boolean; blockingCount: number };
  /** 提交结果（post_commit 类型） */
  commitResult?: { success: boolean; chapter: number };
  /** 草稿内容（pre/post_draft 类型，用于恢复重试） */
  draftContent?: string;
}

// ============================================================
// 检查点管理器
// ============================================================

export class CheckpointManager {
  private readonly storageKey: string;
  private checkpoints: Checkpoint[] = [];

  constructor(projectId: string) {
    this.storageKey = `moliu_checkpoints_${projectId}`;
    this.load();
  }

  /** 写入检查点。 */
  save(checkpoint: Omit<Checkpoint, 'id' | 'timestamp'>): Checkpoint {
    const full: Checkpoint = {
      ...checkpoint,
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.checkpoints.push(full);
    // 只保留最近 100 个（避免无限增长）
    if (this.checkpoints.length > 100) {
      this.checkpoints = this.checkpoints.slice(-100);
    }
    this.persist();
    return full;
  }

  /** 获取指定章节的所有检查点。 */
  getByChapter(chapter: number): Checkpoint[] {
    return this.checkpoints.filter(cp => cp.chapter === chapter)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** 获取最新的检查点。 */
  getLatest(): Checkpoint | null {
    if (this.checkpoints.length === 0) return null;
    return this.checkpoints[this.checkpoints.length - 1];
  }

  /** 获取指定类型最新的检查点。 */
  getLatestByType(type: Checkpoint['type']): Checkpoint | null {
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      if (this.checkpoints[i].type === type) return this.checkpoints[i];
    }
    return null;
  }

  /**
   * 找到恢复点：最近的 post_commit 检查点。
   * 崩溃后应从这里继续（已提交的章不用重做）。
   */
  getRecoveryPoint(): Checkpoint | null {
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const cp = this.checkpoints[i];
      if (cp.type === 'post_commit' && cp.commitResult?.success) {
        return cp;
      }
    }
    return null;
  }

  /** 删除指定章节之后的检查点（时光倒流重写时）。 */
  pruneAfter(chapter: number): void {
    this.checkpoints = this.checkpoints.filter(cp => cp.chapter <= chapter);
    this.persist();
  }

  /** 清空所有检查点。 */
  clear(): void {
    this.checkpoints = [];
    this.persist();
  }

  /** 所有检查点数量。 */
  size(): number {
    return this.checkpoints.length;
  }

  // ============================================================
  // 持久化
  // ============================================================

  private load(): void {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(this.storageKey)
        : null;
      if (raw) {
        this.checkpoints = JSON.parse(raw);
      }
    } catch {
      this.checkpoints = [];
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.checkpoints));
      }
    } catch (err) {
      console.warn('[CheckpointManager] 持久化失败:', err);
    }
  }
}

// ============================================================
// 会话状态
// ============================================================

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface WritingSession {
  /** 会话 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 开始时间 */
  startTime: string;
  /** 结束时间 */
  endTime?: string;
  /** 状态 */
  status: SessionStatus;
  /** 起始章节 */
  startChapter: number;
  /** 结束章节 */
  endChapter: number;
  /** 当前章节 */
  currentChapter: number;
  /** 已完成章节 */
  completedChapters: number[];
  /** 失败章节 */
  failedChapters: number[];
  /** 错误记录 */
  errors: Array<{ chapter: number; error: string; timestamp: string }>;
  /** 配置快照 */
  config?: Record<string, unknown>;
}

// ============================================================
// 会话管理器
// ============================================================

export class SessionStateManager {
  private readonly storageKey: string;
  private session: WritingSession | null = null;

  constructor(projectId: string) {
    this.storageKey = `moliu_session_${projectId}`;
    this.load();
  }

  /** 开始新会话。 */
  start(projectId: string, startChapter: number, endChapter: number, config?: Record<string, unknown>): WritingSession {
    this.session = {
      id: `session_${Date.now()}`,
      projectId,
      startTime: new Date().toISOString(),
      status: 'running',
      startChapter,
      endChapter,
      currentChapter: startChapter,
      completedChapters: [],
      failedChapters: [],
      errors: [],
      config,
    };
    this.persist();
    return this.session;
  }

  /** 获取当前会话。 */
  getCurrent(): WritingSession | null {
    return this.session;
  }

  /** 章节完成。 */
  markChapterCompleted(chapter: number): void {
    if (!this.session) return;
    if (!this.session.completedChapters.includes(chapter)) {
      this.session.completedChapters.push(chapter);
    }
    this.persist();
  }

  /** 章节失败。 */
  markChapterFailed(chapter: number, error: string): void {
    if (!this.session) return;
    if (!this.session.failedChapters.includes(chapter)) {
      this.session.failedChapters.push(chapter);
    }
    this.session.errors.push({ chapter, error, timestamp: new Date().toISOString() });
    this.persist();
  }

  /** 设置当前章节。 */
  setCurrentChapter(chapter: number): void {
    if (!this.session) return;
    this.session.currentChapter = chapter;
    this.persist();
  }

  /** 暂停。 */
  pause(): void {
    if (!this.session) return;
    this.session.status = 'paused';
    this.persist();
  }

  /** 恢复。 */
  resume(): void {
    if (!this.session) return;
    this.session.status = 'running';
    this.persist();
  }

  /** 完成会话。 */
  complete(): void {
    if (!this.session) return;
    this.session.status = 'completed';
    this.session.endTime = new Date().toISOString();
    this.persist();
  }

  /** 失败终止。 */
  fail(error: string): void {
    if (!this.session) return;
    this.session.status = 'failed';
    this.session.endTime = new Date().toISOString();
    this.session.errors.push({
      chapter: this.session.currentChapter,
      error,
      timestamp: new Date().toISOString(),
    });
    this.persist();
  }

  /** 销毁会话。 */
  destroy(): void {
    this.session = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // ignore
    }
  }

  /**
   * 从崩溃恢复：返回应继续的章节号。
   * 策略：currentChapter 如果未完成，重做；否则下一章。
   */
  getResumeChapter(): number | null {
    if (!this.session) return null;
    if (this.session.completedChapters.includes(this.session.currentChapter)) {
      return this.session.currentChapter + 1;
    }
    return this.session.currentChapter;
  }

  private load(): void {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem(this.storageKey)
        : null;
      if (raw) {
        this.session = JSON.parse(raw);
      }
    } catch {
      this.session = null;
    }
  }

  private persist(): void {
    try {
      if (this.session && typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(this.session));
      }
    } catch (err) {
      console.warn('[SessionStateManager] 持久化失败:', err);
    }
  }
}

// ============================================================
// 恢复协调器：把 Checkpoint + Session + State 串起来
// ============================================================

export interface RecoveryResult {
  /** 是否找到可恢复的状态 */
  canRecover: boolean;
  /** 恢复到的章节号 */
  resumeChapter: number;
  /** 恢复来源描述 */
  source: string;
  /** 恢复时丢弃的内容（未提交的草稿等） */
  discarded?: string[];
}

/**
 * 从崩溃中恢复。
 * 优先级：post_commit 检查点 > 会话状态 > 状态快照最新版本。
 */
export function recoverFromCrash(
  checkpointManager: CheckpointManager,
  sessionManager: SessionStateManager,
  stateStore: StateSnapshotStore,
): RecoveryResult {
  // 1. 优先从 post_commit 检查点恢复
  const commitCp = checkpointManager.getRecoveryPoint();
  if (commitCp) {
    // 恢复状态快照
    if (commitCp.stateExport) {
      stateStore.import(commitCp.stateExport as any);
    }
    const resumeChapter = commitCp.chapter + 1;
    sessionManager.setCurrentChapter(resumeChapter);
    return {
      canRecover: true,
      resumeChapter,
      source: `检查点：第 ${commitCp.chapter} 章提交后`,
    };
  }

  // 2. 从会话状态恢复
  const session = sessionManager.getCurrent();
  if (session && session.status === 'running') {
    const resumeChapter = sessionManager.getResumeChapter();
    if (resumeChapter !== null) {
      return {
        canRecover: true,
        resumeChapter,
        source: `会话状态：当前在第 ${session.currentChapter} 章`,
      };
    }
  }

  // 3. 从状态快照最新版本恢复
  const latestVersion = stateStore.getLatestVersion();
  if (latestVersion > 0) {
    return {
      canRecover: true,
      resumeChapter: latestVersion + 1,
      source: `状态快照：最新版本第 ${latestVersion} 章`,
    };
  }

  return {
    canRecover: false,
    resumeChapter: 1,
    source: '无可恢复状态，从头开始',
  };
}
