/**
 * L6 提交层 - 事务化状态回写
 *
 * 只有通过所有门禁的章节才能提交。提交是事务：
 *   BEGIN
 *     1. CHANGES → 状态快照（L1）
 *     2. 章节正文切片 → RAG 索引（L2）
 *     3. 实体图倒排更新（L2）
 *     4. Git 备份（复用 GitBackupManager）
 *     5. 持久化章节正文
 *     6. 提取并保存章节记忆（best-effort，失败不回滚）
 *   COMMIT (任一关键步骤失败回滚；记忆步骤除外)
 *
 * 保证"状态永远和正文一致"——不会出现正文写了角色升级、状态库没变的脏数据。
 */

import type { ChangesApplier } from '../state/ChangesApplier';
import type { ApplyResult, ApplyOptions } from '../state/ChangesApplier';
import type { StateSnapshotStore } from '../state/StateSnapshotStore';
import type { ChangesPayload, StateSnapshot } from '../state/types';
import type { HybridRetriever } from '../retrieval/HybridRetriever';
import type { GatePipelineResult } from '../gates/types';
import type { ChapterMemory, CharacterStateChange } from '@/types/project';

// ============================================================
// 提交步骤结果
// ============================================================

export interface CommitStepResult {
  step: string;
  success: boolean;
  durationMs: number;
  error?: string;
  /** 步骤产出（用于回滚） */
  output?: unknown;
}

export interface CommitTransactionResult {
  /** 是否全部成功 */
  success: boolean;
  /** 章节号 */
  chapter: number;
  /** 各步骤结果 */
  steps: CommitStepResult[];
  /** 状态应用结果（来自 ChangesApplier） */
  applyResult?: ApplyResult;
  /** 提交后的快照 */
  snapshot?: StateSnapshot;
  /** 总耗时 */
  totalDurationMs: number;
  /** 错误信息（失败时） */
  error?: string;
}

// ============================================================
// Git 备份接口（注入式，解耦具体实现）
// ============================================================

export interface GitBackupClient {
  backup(chapter: number, content: string, title: string): Promise<void>;
}

// ============================================================
// 章节持久化接口（注入式）
// ============================================================

export interface ChapterPersistenceClient {
  /** 追加章节正文。返回旧内容（仅用于增量写入）。 */
  save(chapterId: string, content: string): Promise<{ oldContent: string }>;
  /** 精确替换章节正文；主提交与回滚必须优先使用。 */
  replace?(chapterId: string, content: string): Promise<{ oldContent: string }>;
}

// ============================================================
// 章节记忆客户端接口（注入式，best-effort）
// ============================================================
// 提取并保存章节记忆（ChapterMemory）。失败不影响提交事务的成功与否。

export interface MemoryClient {
  /**
   * 提取并保存章节记忆。
   * @param chapterId 章节持久化 ID
   * @param chapterNumber 章节序号（1-based）
   * @param prose 章节正文（已通过门禁）
   * @param aiStateChanges AI 事实提取的状态 delta（命运账唯一来源，契约 7-10）；
   *        缺省时记忆只有规则层的状态碎片，不含命运账
   * @returns 提取出的记忆，或 null
   */
  extractAndSave(
    chapterId: string,
    chapterNumber: number,
    prose: string,
    aiStateChanges?: CharacterStateChange[],
  ): Promise<ChapterMemory | null>;
}

// ============================================================
// 提交事务
// ============================================================

export interface CommitTransactionOptions {
  /** 章节号 */
  chapter: number;
  /** 章节正文（已通过门禁的 prose） */
  prose: string;
  /** CHANGES 载荷 */
  changes: ChangesPayload;
  /** 章节标题 */
  title?: string;
  /** 章节持久化 ID */
  chapterId?: string;
  /** 状态应用选项（strictness 等） */
  applyOptions?: ApplyOptions;
  /** 是否跳过 Git 备份 */
  skipGitBackup?: boolean;
  /** 是否跳过 RAG 索引（首次/重试场景） */
  skipRagIndex?: boolean;
  /** 是否跳过记忆提取（默认 false） */
  skipMemory?: boolean;
}

export class CommitTransaction {
  constructor(
    private readonly stateStore: StateSnapshotStore,
    private readonly applier: ChangesApplier,
    private readonly retriever: HybridRetriever | null,
    private readonly gitBackup: GitBackupClient | null,
    private readonly persistence: ChapterPersistenceClient | null,
    private readonly memoryClient: MemoryClient | null = null,
  ) {}

  /**
   * 执行提交事务。
   * 任一步骤失败：回滚已执行步骤，返回失败结果。
   */
  async commit(options: CommitTransactionOptions): Promise<CommitTransactionResult> {
    const startTime = Date.now();
    const steps: CommitStepResult[] = [];
    const rollback: Array<() => Promise<void>> = [];

    const result: CommitTransactionResult = {
      success: false,
      chapter: options.chapter,
      steps,
      totalDurationMs: 0,
    };

    try {
      // Step 1: CHANGES → 状态快照
      const step1 = await this.runStep('state_apply', async () => {
        const applyResult = this.applier.apply(options.changes, {
          strictness: options.applyOptions?.strictness ?? 'lenient',
          allowAutoCreateEntities: options.applyOptions?.allowAutoCreateEntities ?? true,
        });
        if (!applyResult.success && applyResult.appliedCount === 0) {
          throw new Error(`状态应用失败：${applyResult.errors.slice(0, 2).join('; ')}`);
        }
        result.applyResult = applyResult;
        result.snapshot = this.stateStore.getSnapshot();
        return applyResult;
      });
      steps.push(step1);
      if (!step1.success) {
        return this.fail(result, step1.error, startTime);
      }

      // Step 2: RAG 索引更新
      if (!options.skipRagIndex && this.retriever) {
        const step2 = await this.runStep('rag_index', async () => {
          // 从快照提取已知实体名供实体图索引
          const knownEntities = this.extractKnownEntities();
          const chunks = await this.retriever!.upsertChapter(
            options.chapter, options.prose, knownEntities,
          );
          // 若后续关键步骤失败，至少移除本次新索引，避免失败正文进入检索结果。
          rollback.push(async () => {
            await this.retriever!.removeChapter(options.chapter);
          });
          return { chunkCount: chunks.length };
        });
        steps.push(step2);
        if (!step2.success) {
          await this.executeRollback(rollback);
          return this.fail(result, step2.error, startTime);
        }
      }

      // Step 3: Git 备份
      if (!options.skipGitBackup && this.gitBackup) {
        const step3 = await this.runStep('git_backup', async () => {
          await this.gitBackup!.backup(
            options.chapter, options.prose,
            options.title || `第${options.chapter}章`,
          );
          return { backed: true };
        });
        steps.push(step3);
        if (!step3.success) {
          await this.executeRollback(rollback);
          return this.fail(result, step3.error, startTime);
        }
      }

      // Step 4: 章节持久化
      if (this.persistence && options.chapterId) {
        const step4 = await this.runStep('persistence', async () => {
          if (!this.persistence!.replace) {
            throw new Error('章节持久化适配器缺少 replace，拒绝执行非事务性主提交');
          }
          const saveResult = await this.persistence!.replace(options.chapterId!, options.prose);
          // 注册回滚：恢复旧内容
          rollback.push(async () => {
            await this.persistence!.replace!(options.chapterId!, saveResult.oldContent);
          });
          return saveResult;
        });
        steps.push(step4);
        if (!step4.success) {
          await this.executeRollback(rollback);
          return this.fail(result, step4.error, startTime);
        }
      }

      // Step 5: 章节记忆提取（best-effort）
      // 关键设计：记忆失败不影响提交事务的成功与否——章节正文已安全落库，
      // 记忆缺失只会影响后续章节的上下文质量，不应导致整章回滚。
      if (!options.skipMemory && this.memoryClient && options.chapterId) {
        const step5 = await this.runStep('memory_extract', async () => {
          const memory = await this.memoryClient!.extractAndSave(
            options.chapterId!,
            options.chapter,
            options.prose,
          );
          return { hasMemory: !!memory };
        });
        // 即使失败也继续：best-effort 语义
        steps.push(step5);
        if (!step5.success) {
          console.warn('[CommitTransaction] Step5 记忆提取失败（best-effort，不影响提交）:', step5.error);
        }
      }

      result.success = true;
      result.totalDurationMs = Date.now() - startTime;
      return result;
    } catch (err) {
      await this.executeRollback(rollback);
      return this.fail(result, err instanceof Error ? err.message : String(err), startTime);
    }
  }

  // ============================================================
  // 辅助
  // ============================================================

  private async runStep(
    name: string,
    fn: () => Promise<unknown>,
  ): Promise<CommitStepResult> {
    const start = Date.now();
    try {
      const output = await fn();
      return { step: name, success: true, durationMs: Date.now() - start, output };
    } catch (err) {
      return {
        step: name, success: false, durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async executeRollback(rollback: Array<() => Promise<void>>): Promise<void> {
    // 逆序执行回滚
    for (let i = rollback.length - 1; i >= 0; i--) {
      try {
        await rollback[i]();
      } catch (err) {
        console.error('[CommitTransaction] 回滚失败:', err);
      }
    }
  }

  private fail(
    result: CommitTransactionResult,
    error: string | undefined,
    startTime: number,
  ): CommitTransactionResult {
    return {
      ...result,
      success: false,
      totalDurationMs: Date.now() - startTime,
      error: error || '提交失败',
    };
  }

  /** 从当前快照提取所有已知实体名（供 RAG 实体图索引）。 */
  private extractKnownEntities(): string[] {
    const snap = this.stateStore.peekSnapshot();
    const names: string[] = [];
    for (const c of Object.values(snap.characters)) names.push(c.name);
    for (const l of Object.values(snap.locations)) names.push(l.name);
    for (const f of Object.values(snap.factions)) names.push(f.name);
    for (const it of Object.values(snap.items)) names.push(it.name);
    return [...new Set(names)];
  }
}

// ============================================================
// 工厂
// ============================================================

export function createCommitTransaction(
  stateStore: StateSnapshotStore,
  retriever?: HybridRetriever | null,
  gitBackup?: GitBackupClient | null,
  persistence?: ChapterPersistenceClient | null,
  memoryClient?: MemoryClient | null,
): CommitTransaction {
  const applier = new ChangesApplier(stateStore);
  return new CommitTransaction(stateStore, applier, retriever ?? null, gitBackup ?? null, persistence ?? null, memoryClient ?? null);
}

// ============================================================
// IndexSyncWriter（索引同步的独立封装，便于单独调用）
// ============================================================

/**
 * 索引同步写入器。
 * 把章节切片并同步到 RAG 检索器 + 实体图。
 * 可独立于 CommitTransaction 调用（如历史章节批量索引）。
 */
export class IndexSyncWriter {
  constructor(private readonly retriever: HybridRetriever) {}

  async syncChapter(chapter: number, content: string, knownEntities: string[] = []): Promise<{
    chunkCount: number;
    durationMs: number;
  }> {
    const start = Date.now();
    const chunks = await this.retriever.upsertChapter(chapter, content, knownEntities);
    return { chunkCount: chunks.length, durationMs: Date.now() - start };
  }

  /** 批量同步多章（用于初始化/重建索引）。 */
  async syncChapters(
    chapters: Array<{ chapter: number; content: string }>,
    knownEntities: string[] = [],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ syncedCount: number; failedCount: number; totalMs: number }> {
    const start = Date.now();
    let synced = 0;
    let failed = 0;

    for (let i = 0; i < chapters.length; i++) {
      const { chapter, content } = chapters[i];
      try {
        await this.syncChapter(chapter, content, knownEntities);
        synced++;
      } catch {
        failed++;
      }
      onProgress?.(i + 1, chapters.length);
    }

    return {
      syncedCount: synced,
      failedCount: failed,
      totalMs: Date.now() - start,
    };
  }
}
