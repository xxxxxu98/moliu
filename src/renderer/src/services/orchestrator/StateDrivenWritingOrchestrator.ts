/**
 * 整合层 - 状态驱动写作编排器
 *
 * 把 L1-L7 串联成一个完整的单章写作闭环：
 *   [读L1] → [检L2] → [组L3] → [划+写L4] → [审L5] → [提L6] → [记L7]
 *
 * 这是整套状态驱动架构的"门面"。不破坏现有 WritingOrchestratorV2，
 * 作为增强版入口，由 useChapterWriter 按需切换。
 *
 * 设计原则：
 * - 所有外部依赖（AI/Git/Persistence）通过注入式适配器接入
 * - 失败不崩溃：每层都有降级路径
 * - 可观测：每步产出结构化日志，便于 debug
 */

import { createStateStore, type StateSnapshotStore } from '../state/StateSnapshotStore';
import { createChangesApplier } from '../state/ChangesApplier';
import { extractChanges } from '../state/ChangesProtocol';
import { initializeStateFromProject } from '../state/SnapshotBuilder';
import type { ChangesPayload, StateSnapshot } from '../state/types';

import { ContextAssembler } from '../context/ContextAssembler';
import type { RetrievedFragment } from '../context/ContextAssembler';

import { HybridRetriever } from '../retrieval/HybridRetriever';

import { DrafterRetryLoop, ModelRouter, ChangesPromptInjector } from '../generation/DrafterRetryLoop';
import type { DrafterClient } from '../generation/DrafterRetryLoop';

import { ConsistencyGatePipeline } from '../gates/ConsistencyGatePipeline';
import type { GatePipelineResult, GateContext } from '../gates/types';

import { CommitTransaction } from '../commit/CommitTransaction';
import type { GitBackupClient, ChapterPersistenceClient, MemoryClient, CommitTransactionResult } from '../commit/CommitTransaction';

import { CheckpointManager, SessionStateManager, recoverFromCrash } from '../recovery/RecoveryManager';
import type { RecoveryResult } from '../recovery/RecoveryManager';

import type { Project, Chapter } from '@/types/project';

// ============================================================
// 编排器配置
// ============================================================

export interface StateDrivenOrchestratorConfig {
  /** 默认模型名（ModelRouter 兜底） */
  defaultModel: string;
  /** 最大重试次数 */
  maxRetries: number;
  /** 是否启用 L2 检索 */
  enableRetrieval: boolean;
  /** 是否启用 G7 LLM 门禁 */
  enableSemanticGate: boolean;
  /** 是否启用 Git 备份 */
  enableGitBackup: boolean;
  /** 检索 Top-K */
  retrievalTopK: number;
}

export const DEFAULT_CONFIG: StateDrivenOrchestratorConfig = {
  defaultModel: 'gpt-4o',
  maxRetries: 3,
  enableRetrieval: true,
  enableSemanticGate: true,
  enableGitBackup: true,
  retrievalTopK: 8,
};

// ============================================================
// 单章执行结果
// ============================================================

export interface WriteChapterResult {
  /** 是否成功 */
  success: boolean;
  /** 章节号 */
  chapter: number;
  /** 最终正文 */
  prose: string;
  /** CHANGES 载荷 */
  changes: ChangesPayload | null;
  /** 门禁结果 */
  gateResult: GatePipelineResult | null;
  /** 提交结果 */
  commitResult: CommitTransactionResult | null;
  /** 提交后的快照 */
  snapshot: StateSnapshot | null;
  /** 重试次数 */
  attempts: number;
  /** 错误信息 */
  error?: string;
  /** 总耗时 */
  totalDurationMs: number;
}

// ============================================================
// 事件回调（用于 UI 进度展示）
// ============================================================

export type OrchestratorEventType =
  | 'state_loaded'
  | 'retrieval_done'
  | 'context_assembled'
  | 'draft_attempt'
  | 'gate_run'
  | 'commit_done'
  | 'checkpoint_saved'
  | 'error';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  chapter?: number;
  attempt?: number;
  message?: string;
  data?: unknown;
}

export type OrchestratorListener = (event: OrchestratorEvent) => void;

// ============================================================
// 编排器
// ============================================================

export class StateDrivenWritingOrchestrator {
  private readonly config: StateDrivenOrchestratorConfig;
  private readonly router: ModelRouter;
  private readonly assembler = new ContextAssembler();
  private readonly gatePipeline: ConsistencyGatePipeline;
  private readonly listeners = new Set<OrchestratorListener>();

  // 子系统（延迟初始化）
  private stateStore: StateSnapshotStore | null = null;
  private retriever: HybridRetriever | null = null;

  // 检查点/会话
  private checkpointManager: CheckpointManager | null = null;
  private sessionManager: SessionStateManager | null = null;

  constructor(
    /** 起草客户端（必须注入） */
    private readonly drafter: DrafterClient,
    /** Git 备份客户端（可选） */
    private readonly gitBackup: GitBackupClient | null = null,
    /** 章节持久化客户端（可选） */
    private readonly persistence: ChapterPersistenceClient | null = null,
    /** 章节记忆客户端（可选，best-effort） */
    private readonly memoryClient: MemoryClient | null = null,
    config: Partial<StateDrivenOrchestratorConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.router = new ModelRouter(this.config.defaultModel);
    this.gatePipeline = new ConsistencyGatePipeline({
      enableSemanticGate: this.config.enableSemanticGate,
    });
  }

  // ============================================================
  // 事件
  // ============================================================

  addListener(listener: OrchestratorListener): void {
    this.listeners.add(listener);
  }

  removeListener(listener: OrchestratorListener): void {
    this.listeners.delete(listener);
  }

  private emit(event: OrchestratorEvent): void {
    for (const l of this.listeners) {
      try { l(event); } catch (e) { console.error('[Orchestrator] listener error:', e); }
    }
  }

  // ============================================================
  // 初始化（每项目一次）
  // ============================================================

  /**
   * 从项目数据初始化状态存储 + 检索索引。
   * 首次使用或切换项目时调用。
   */
  async initialize(project: Project): Promise<{
    snapshot: StateSnapshot;
    warnings: string[];
  }> {
    const { store, stats, warnings } = initializeStateFromProject(project, {
      backfillChapters: false,  // 默认不回填，按需开启
    });
    this.stateStore = store;
    this.retriever = new HybridRetriever();
    this.retriever.registerSnapshot(store.getSnapshot());
    this.checkpointManager = new CheckpointManager(project.id);
    this.sessionManager = new SessionStateManager(project.id);

    this.emit({ type: 'state_loaded', message: `初始化完成：${stats.characters} 角色 / ${stats.foreshadows} 伏笔` });
    return { snapshot: store.getSnapshot(), warnings };
  }

  /**
   * 批量索引已写章节（用于初始化检索库）。
   */
  async indexExistingChapters(project: Project, onProgress?: (done: number, total: number) => void): Promise<void> {
    if (!this.retriever || !this.stateStore) return;
    const knownEntities = this.extractKnownEntities();
    const chapters = (project.chapters ?? [])
      .filter(c => c.content && c.content.trim().length > 100)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    for (let i = 0; i < chapters.length; i++) {
      try {
        await this.retriever.indexChapter(chapters[i].orderIndex + 1, chapters[i].content, knownEntities);
      } catch (e) {
        console.warn(`[Orchestrator] 第 ${chapters[i].orderIndex + 1} 章索引失败:`, e);
      }
      onProgress?.(i + 1, chapters.length);
    }
  }

  // ============================================================
  // 单章写作（核心入口）
  // ============================================================

  /**
   * 写一章。完整走 L1-L7 闭环。
   *
   * @param project 项目
   * @param chapter 目标章节
   * @param targetWordCount 目标字数
   * @param options 选项
   */
  async writeChapter(
    project: Project,
    chapter: Chapter,
    targetWordCount: number = 3000,
    options: {
      /** 用户自定义指令 */
      userInstructions?: string;
      /** 当前章细纲 */
      currentChapterOutline?: string;
      /** 窗口化大纲 */
      windowedOutline?: string;
      /** 写作规范文本 */
      writingRules?: string;
      /** 增强设计段落 */
      enhancedDesign?: string;
      /** 前章衔接 */
      previousChapter?: { title: string; summary: string; ending: string };
      /** 章节蓝图（G5 用） */
      blueprint?: {
        mustCover?: string[];
        forbiddenZones?: string[];
        requiredCharacters?: string[];
        cen?: string;
      };
    } = {},
  ): Promise<WriteChapterResult> {
    const startTime = Date.now();
    const chapterNo = chapter.orderIndex + 1;

    if (!this.stateStore) {
      return this.fail(chapterNo, '编排器未初始化，请先调用 initialize()', startTime);
    }

    try {
      // ============ L1: 读取状态快照 ============
      const snapshot = this.stateStore.getSnapshot();

      // ============ L2: 检索相关历史片段 ============
      let retrievedFragments: RetrievedFragment[] = [];
      if (this.config.enableRetrieval && this.retriever) {
        try {
          const query = this.buildRetrievalQuery(chapter, options);
          retrievedFragments = await this.retriever.retrieve(query, { topK: this.config.retrievalTopK });
          this.emit({ type: 'retrieval_done', chapter: chapterNo, data: { count: retrievedFragments.length } });
        } catch (e) {
          console.warn('[Orchestrator] L2 检索失败，降级为无检索:', e);
        }
      }

      // ============ L3: 组装 prompt ============
      const assemblyResult = this.assembler.assemble({
        modelName: this.config.defaultModel,
        chapter: chapterNo,
        snapshot,
        currentChapterOutline: options.currentChapterOutline || chapter.outline || chapter.plotSummary || '',
        windowedOutline: options.windowedOutline,
        retrievedFragments,
        writingRules: options.writingRules,
        enhancedDesign: options.enhancedDesign,
        previousChapter: options.previousChapter,
        userInstructions: options.userInstructions,
      });
      this.emit({ type: 'context_assembled', chapter: chapterNo, data: { tokens: assemblyResult.totalTokens } });

      // ============ L4: 起草 + 重试循环 ============
      const retryLoop = new DrafterRetryLoop(this.drafter, this.router);
      const gateRunner = async (prose: string, changes: ChangesPayload | null): Promise<GatePipelineResult> => {
        const ctx: GateContext = {
          chapter: chapterNo,
          prose,
          changes: changes ?? { version: '1.0', chapter: chapterNo, changes: [] },
          snapshot: this.stateStore!.getSnapshot(),
          blueprint: options.blueprint,
          title: chapter.title,
        };
        const result = await this.gatePipeline.run(ctx);
        this.emit({ type: 'gate_run', chapter: chapterNo, data: { passed: result.passed, blocking: result.blockingCount } });
        return result;
      };

      const loopResult = await retryLoop.run(assemblyResult.prompt, gateRunner, {
        maxAttempts: this.config.maxRetries,
      });

      if (!loopResult.bestAttempt) {
        return this.fail(chapterNo, '起草失败，无有效产出', startTime);
      }

      const prose = loopResult.bestAttempt.prose;
      const changes = loopResult.bestAttempt.changes ?? { version: '1.0', chapter: chapterNo, changes: [] };
      const gateResult = loopResult.bestAttempt.gateResult ?? null;

      // ============ L6: 提交事务 ============
      const applier = createChangesApplier(this.stateStore);
      const tx = new CommitTransaction(
        this.stateStore, applier, this.retriever, this.gitBackup, this.persistence, this.memoryClient,
      );
      const commitResult = await tx.commit({
        chapter: chapterNo,
        prose,
        changes,
        title: chapter.title,
        chapterId: chapter.id,
        skipGitBackup: !this.config.enableGitBackup,
      });
      this.emit({ type: 'commit_done', chapter: chapterNo, data: { success: commitResult.success } });

      // ============ L7: 写检查点 ============
      if (this.checkpointManager) {
        this.checkpointManager.save({
          projectId: project.id,
          chapter: chapterNo,
          type: 'post_commit',
          stateExport: this.stateStore.export(),
          commitResult: { success: commitResult.success, chapter: chapterNo },
        });
        this.emit({ type: 'checkpoint_saved', chapter: chapterNo });
      }

      return {
        success: commitResult.success,
        chapter: chapterNo,
        prose,
        changes,
        gateResult,
        commitResult,
        snapshot: this.stateStore.getSnapshot(),
        attempts: loopResult.attempts.length,
        totalDurationMs: Date.now() - startTime,
        error: commitResult.success ? undefined : commitResult.error,
      };
    } catch (err) {
      return this.fail(chapterNo, err instanceof Error ? err.message : String(err), startTime);
    }
  }

  // ============================================================
  // 批量写作
  // ============================================================

  /**
   * 批量写作多个章节。
   */
  async writeBatch(
    project: Project,
    chapters: Chapter[],
    options: {
      targetWordCount?: number;
      onProgress?: (done: number, total: number, result: WriteChapterResult) => void;
      onError?: (chapter: number, error: string) => 'stop' | 'skip' | 'retry';
    } & Parameters<StateDrivenWritingOrchestrator['writeChapter']>[3] = {},
  ): Promise<WriteChapterResult[]> {
    const results: WriteChapterResult[] = [];
    const { onProgress, onError, ...writeOptions } = options;

    // 启动会话
    const startChapter = (chapters[0]?.orderIndex ?? 0) + 1;
    const endChapter = (chapters[chapters.length - 1]?.orderIndex ?? startChapter - 1) + 1;
    this.sessionManager?.start(project.id, startChapter, endChapter);

    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const chapterNo = chapter.orderIndex + 1;
      this.sessionManager?.setCurrentChapter(chapterNo);

      let result: WriteChapterResult;
      try {
        result = await this.writeChapter(project, chapter, options.targetWordCount ?? 3000, writeOptions);
      } catch (err) {
        result = {
          success: false, chapter: chapterNo, prose: '', changes: null,
          gateResult: null, commitResult: null, snapshot: null, attempts: 0,
          error: err instanceof Error ? err.message : String(err),
          totalDurationMs: 0,
        };
      }

      results.push(result);

      if (result.success) {
        this.sessionManager?.markChapterCompleted(chapterNo);
      } else {
        this.sessionManager?.markChapterFailed(chapterNo, result.error ?? '未知错误');
        const action = onError?.(chapterNo, result.error ?? '');
        if (action === 'stop') break;
      }

      onProgress?.(i + 1, chapters.length, result);
    }

    this.sessionManager?.complete();
    return results;
  }

  // ============================================================
  // 崩溃恢复
  // ============================================================

  /**
   * 从崩溃中恢复，返回应继续的章节号。
   */
  recover(): RecoveryResult {
    if (!this.checkpointManager || !this.sessionManager || !this.stateStore) {
      return { canRecover: false, resumeChapter: 1, source: '未初始化' };
    }
    return recoverFromCrash(this.checkpointManager, this.sessionManager, this.stateStore);
  }

  // ============================================================
  // 状态查询
  // ============================================================

  /** 获取当前状态快照。 */
  getSnapshot(): StateSnapshot | null {
    return this.stateStore?.getSnapshot() ?? null;
  }

  /** 获取检索器（用于手动索引/查询）。 */
  getRetriever(): HybridRetriever | null {
    return this.retriever;
  }

  /** 获取状态存储（用于手动操作）。 */
  getStateStore(): StateSnapshotStore | null {
    return this.stateStore;
  }

  // ============================================================
  // 辅助
  // ============================================================

  private buildRetrievalQuery(
    chapter: Chapter,
    options: { currentChapterOutline?: string; blueprint?: { requiredCharacters?: string[] } },
  ) {
    const queryText = options.currentChapterOutline
      || chapter.outline
      || chapter.plotSummary
      || chapter.title;
    const entities = options.blueprint?.requiredCharacters ?? [];
    return {
      query: queryText,
      entities,
      currentChapter: chapter.orderIndex + 1,
    };
  }

  private extractKnownEntities(): string[] {
    if (!this.stateStore) return [];
    const snap = this.stateStore.peekSnapshot();
    const names: string[] = [];
    for (const c of Object.values(snap.characters)) names.push(c.name);
    for (const l of Object.values(snap.locations)) names.push(l.name);
    for (const f of Object.values(snap.factions)) names.push(f.name);
    return [...new Set(names)];
  }

  private fail(chapter: number, error: string, startTime: number): WriteChapterResult {
    this.emit({ type: 'error', chapter, message: error });
    return {
      success: false, chapter, prose: '', changes: null,
      gateResult: null, commitResult: null, snapshot: null,
      attempts: 0, error, totalDurationMs: Date.now() - startTime,
    };
  }
}
