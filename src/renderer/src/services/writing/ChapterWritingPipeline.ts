/**
 * 单章写作共享管道（ChapterWritingPipeline）
 *
 * 职责：封装"单章完整执行流程"，作为智能续写（V2）和批量续写（useBatchWriter）
 * 的公共执行核心，消除两套独立的单章流水线实现。
 *
 * 流程：
 *   0. Preflight 预检（可选，见 chapterWritePresets）
 *   1. contextAgent 生成任务书（TaskBook）
 *   2. StateDriven.writeChapter()（L1-L7 闭环）
 *      内部已含：起草 + 门禁重试 + 兜底放行 + 事务提交 + 记忆提取
 *   3. 字数不足时补充续写（可选，enableSupplement）
 *   4. 结果归一化 → ChapterWriteOutput
 *
 * 设计要点：
 * - 无状态服务：依赖通过构造函数注入（drafter/gitBackup/persistence/memoryClient 适配器 +
 *   preflightService + contextAgent）。
 * - 默认创建 persistence/memoryClient（与 V2 同口径），批量不再因 null 跳过落库。
 * - 内部持有 StateDrivenWritingOrchestrator 实例（跨章节复用状态快照/检索器/检查点）。
 * - 输出 forceAccepted 标记：区分"门禁通过提交"与"门禁未过但兜底放行提交"。
 */

import { useProjectStore } from '@/stores/project.store';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import {
  StateDrivenWritingOrchestrator,
  type DrafterClient,
  type GitBackupClient,
  type ChapterPersistenceClient,
  type MemoryClient,
  type WriteChapterResult,
} from '@/services/orchestrator';
import { usePreflightService } from './preflight/PreflightService';
import { useEnhancedContextAgent } from '@/services/ai/agents/enhanced-context-agent';
import { GitBackupManager } from '@/services/writing/backup/GitBackupManager';
import {
  createChapterPersistenceClient,
  createChapterMemoryClient,
} from './chapterPersistenceAdapters';
import { runSupplementRounds } from './supplement';
import type { GatePipelineResult } from '@/services/gates/types';
import type { WritingTaskBook } from '@/types/writing-v2';
import type { Project, Chapter } from '@/types/project';

// ============================================================
// 类型定义
// ============================================================

/** 写作风格（与 useChapterWriter / useBatchWriter 保持一致） */
export type WritingStyle = 'concise' | 'elegant' | 'humorous' | 'ancient';

/** 管道输入 */
export interface ChapterWriteInput {
  /** 项目（明确传入，不依赖 store.currentProject） */
  project: Project;
  /** 章节（明确传入，不依赖 store.currentChapter） */
  chapter: Chapter;
  /** 目标字数 */
  targetWordCount: number;
  /** 写作风格 */
  writingStyle: WritingStyle;
  /** 是否生成任务书（默认 true） */
  useTaskBook?: boolean;
  /**
   * 是否执行预检（默认 false）。
   * 调用方应优先使用 SMART_CONTINUE_PRESET / BATCH_CONTINUE_PRESET，
   * 避免魔法布尔值。
   */
  enablePreflight?: boolean;
  /**
   * 是否在字数不足时自动补写（默认 false）。
   * 预设中智能续写与批量续写均开启。
   */
  enableSupplement?: boolean;
  /** 用户自定义指令 */
  userInstructions?: string;
  /** 窗口化大纲（可选，未传则由 StateDriven 内部回退到 chapter.outline） */
  windowedOutline?: string;
  /** 前章衔接信息（可选） */
  previousChapter?: { title: string; summary: string; ending: string };
}

/** 管道输出 */
export interface ChapterWriteOutput {
  /** 是否成功（章节已提交落库） */
  success: boolean;
  /** 最终正文（含补写增量） */
  prose: string;
  /** 提取的标题（persistence 适配器已写入 store），无则 null */
  title: string | null;
  /** 任务书（生成失败或 useTaskBook=false 时为 null） */
  taskBook: WritingTaskBook | null;
  /** 门禁结果（G1-G7） */
  gateResult: GatePipelineResult | null;
  /** 起草尝试次数 */
  attempts: number;
  /** 是否兜底放行（门禁未过但已用最佳草稿提交） */
  forceAccepted: boolean;
  /** 实际执行的补写轮次（未开启或无需补写时为 0） */
  supplementRounds: number;
  /** 错误信息（失败时） */
  error?: string;
}

// ============================================================
// 单章写作管道
// ============================================================

export class ChapterWritingPipeline {
  private readonly orchestrator: StateDrivenWritingOrchestrator;
  private readonly preflightService: ReturnType<typeof usePreflightService>;
  private readonly contextAgent: ReturnType<typeof useEnhancedContextAgent>;
  private readonly persistence: ChapterPersistenceClient | null;

  constructor(deps?: {
    drafter?: DrafterClient;
    gitBackup?: GitBackupClient | null;
    persistence?: ChapterPersistenceClient | null;
    memoryClient?: MemoryClient | null;
    /** 注入外部已配置好的 orchestrator（跳过内部创建） */
    orchestrator?: StateDrivenWritingOrchestrator;
  }) {
    const projectStore = useProjectStore();
    const { requireAIService, currentModel } = useActiveAIProvider();

    // ====== 适配器（默认实现，可被 deps 覆盖） ======

    // drafter：把 StateDriven L3 拼好的 prompt 传给 AI service
    const drafter: DrafterClient = deps?.drafter ?? {
      async draft(prompt, params) {
        const client = requireAIService();
        const project = projectStore.currentProject;
        const currentChapter = projectStore.currentChapter;
        if (!project || !currentChapter) {
          throw new Error('项目或章节未加载');
        }
        const context: Record<string, unknown> = {
          projectId: project.id,
          currentChapterId: currentChapter.id,
          currentChapterIndex: currentChapter.orderIndex,
          currentChapterTitle: currentChapter.title,
          currentChapterContent: currentChapter.content || '',
          currentChapterOutline: currentChapter.outline || currentChapter.plotSummary || undefined,
          customPrompt: prompt,
          charactersInScene: project.characters || [],
          writingStyle: 'concise',
        };
        const result = await (client as any).continueWriting(
          context,
          'smartContinue',
          params.maxTokens || 3000
        );
        return result?.content ?? result?.text ?? (typeof result === 'string' ? result : '');
      },
    };

    // gitBackup：复用 GitBackupManager
    const gitBackup: GitBackupClient | null =
      deps?.gitBackup !== undefined
        ? deps.gitBackup
        : {
            async backup(chapter, content, title) {
              try {
                const mgr = new GitBackupManager();
                await mgr.backup(chapter, content, title);
              } catch (err) {
                console.warn('[Pipeline] Git 备份失败（不影响提交）:', err);
              }
            },
          };

    // 默认创建 persistence/memory（与 V2 同口径），调用方可显式传 null 关闭
    const persistence =
      deps?.persistence !== undefined ? deps.persistence : createChapterPersistenceClient();
    const memoryClient =
      deps?.memoryClient !== undefined ? deps.memoryClient : createChapterMemoryClient();
    this.persistence = persistence;

    // 优先使用注入的 orchestrator（V2 复用自己已配置好适配器的实例）；
    // 否则用上面的适配器创建新实例。
    this.orchestrator =
      deps?.orchestrator ??
      new StateDrivenWritingOrchestrator(drafter, gitBackup, persistence, memoryClient, {
        defaultModel: currentModel.value || 'gpt-4o',
        maxRetries: 3,
        enableSemanticGate: false, // G7 LLM 审查默认关闭
        enableGitBackup: true,
        enableRetrieval: true,
        retrievalTopK: 8,
      });

    this.preflightService = usePreflightService();
    this.contextAgent = useEnhancedContextAgent();
  }

  /** 暴露内部 orchestrator（供需要 initialize/indexExistingChapters 的场景使用） */
  getOrchestrator(): StateDrivenWritingOrchestrator {
    return this.orchestrator;
  }

  /**
   * 执行单章写作。
   */
  async execute(input: ChapterWriteInput): Promise<ChapterWriteOutput> {
    const {
      project,
      chapter,
      targetWordCount,
      writingStyle,
      useTaskBook = true,
      enablePreflight = false,
      enableSupplement = false,
      userInstructions,
      windowedOutline,
      previousChapter,
    } = input;

    // ====== Step 0: 预检（可选） ======
    if (enablePreflight) {
      const result = await this.preflightService.preflight();
      if (!result.valid) {
        return this.fail(`预检失败: ${result.errors.join(', ')}`);
      }
    }

    // ====== Step 1: 生成任务书 ======
    let taskBook: WritingTaskBook | null = null;
    if (useTaskBook) {
      const ctx = await this.preflightService.getCurrentChapterContext();
      const previousChapterEnding = previousChapter?.ending || ctx?.previousChapterEnding || '';
      const recentChaptersFullText = ctx?.recentChaptersFullText || '';

      const tbResult = await this.contextAgent.generateTaskBook({
        chapterNumber: chapter.orderIndex + 1,
        previousChapterEnding,
        recentChaptersFullText,
        targetWordCount,
        writingStyle: writingStyle as any,
      });

      if (tbResult.success && tbResult.taskBook) {
        taskBook = tbResult.taskBook;
      } else {
        // 任务书失败不中断，降级为无任务书写作
        console.warn('[Pipeline] 任务书生成失败，降级为无任务书:', tbResult.error);
      }
    }

    // ====== Step 2: 任务书 → StateDriven options 转换 ======
    const currentChapterOutline = chapter.outline || chapter.plotSummary || '';
    const writingRules = taskBook ? this.buildWritingRules(taskBook) : undefined;
    const blueprint = taskBook
      ? {
          mustCover: taskBook.mustCover,
          forbiddenZones: taskBook.forbiddenZones,
          requiredCharacters: taskBook.CPNs,
          cen: taskBook.CEN,
        }
      : undefined;

    // ====== Step 3: 初始化 orchestrator（幂等） ======
    await this.orchestrator.initialize(project);

    // ====== Step 4: 执行写作（L1-L7 闭环） ======
    const result: WriteChapterResult = await this.orchestrator.writeChapter(
      project,
      chapter,
      targetWordCount,
      {
        currentChapterOutline,
        windowedOutline,
        writingRules,
        blueprint,
        previousChapter,
        userInstructions,
      }
    );

    if (!result.success) {
      return {
        success: false,
        prose: result.prose || '',
        title: this.readBackTitle(chapter.id),
        taskBook,
        gateResult: result.gateResult,
        attempts: result.attempts,
        forceAccepted: false,
        supplementRounds: 0,
        error: result.error,
      };
    }

    // ====== Step 5: 字数不足时补写（可选） ======
    let prose = result.prose;
    let supplementRounds = 0;

    if (enableSupplement && prose) {
      const supplementResult = await this.runSupplementIfNeeded(
        project,
        chapter,
        prose,
        targetWordCount,
        writingStyle
      );
      prose = supplementResult.prose;
      supplementRounds = supplementResult.rounds;
    }

    // ====== Step 6: 结果归一化 ======
    const forceAccepted = !!result.gateResult && !result.gateResult.passed;

    return {
      success: true,
      prose,
      title: this.readBackTitle(chapter.id),
      taskBook,
      gateResult: result.gateResult,
      attempts: result.attempts,
      forceAccepted,
      supplementRounds,
      error: result.error,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  /**
   * 字数不足时循环补写；增量通过 persistence 追加落库（与主写同口径）。
   */
  private async runSupplementIfNeeded(
    project: Project,
    chapter: Chapter,
    prose: string,
    targetWordCount: number,
    writingStyle: WritingStyle
  ): Promise<{ prose: string; rounds: number }> {
    const { requireAIService } = useActiveAIProvider();

    return runSupplementRounds({
      prose,
      targetWordCount,
      chapterTitle: chapter.title,
      chapterOutline: chapter.outline || chapter.plotSummary || '',
      drafter: {
        async draft(prompt, maxTokens) {
          const client = requireAIService();
          // 补写必须清空 currentChapterOutline，避免走「按大纲整章重写」分支
          const context: Record<string, unknown> = {
            project,
            currentChapterId: chapter.id,
            currentChapterIndex: chapter.orderIndex,
            currentChapterTitle: chapter.title,
            currentChapterContent: '',
            currentChapterOutline: undefined,
            customPrompt: prompt,
            charactersInScene: project.characters || [],
            writingStyle,
          };
          const result = await (client as any).continueWriting(
            context,
            'smartContinue',
            maxTokens
          );
          return result?.content ?? result?.text ?? (typeof result === 'string' ? result : '');
        },
      },
      onRound: async (_round, delta) => {
        if (this.persistence && delta) {
          try {
            await this.persistence.save(chapter.id, delta);
          } catch (err) {
            console.warn('[Pipeline] 补写增量落库失败（正文已在内存中保留）:', err);
          }
        }
      },
    });
  }

  /**
   * 把任务书转换为写作规则文本（注入 prompt）。
   * 与 WritingOrchestratorV2.buildEnhancedOutline 口径一致。
   */
  private buildWritingRules(book: WritingTaskBook): string {
    return `
=== 写作任务书 ===
【CBN】${book.CBN}
【CPNs】${book.CPNs.join(' / ')}
【CEN】${book.CEN}
【必须覆盖】${book.mustCover.join(' / ')}
【禁区】${book.forbiddenZones.join(' / ')}
【风格指引】${book.styleGuidance?.reasoning?.join(' / ') || book.styleGuidance?.pacingStrategy || ''}
【结尾感觉】${book.hardConstraints?.chapterEndOpenQuestion || '留下悬念'}
【开放问题】${book.hardConstraints?.chapterEndOpenQuestion || '留下悬念'}
=== 任务书结束 ===
`;
  }

  /**
   * 从 store 读回 persistence 适配器写入的标题。
   * persistence 适配器用 DeAIService.extractAndValidateTitle 提取标题后写入 chapter.title。
   */
  private readBackTitle(chapterId: string): string | null {
    const projectStore = useProjectStore();
    const ch = projectStore.sortedChapters.find(c => c.id === chapterId);
    return ch?.title || null;
  }

  private fail(error: string): ChapterWriteOutput {
    return {
      success: false,
      prose: '',
      title: null,
      taskBook: null,
      gateResult: null,
      attempts: 0,
      forceAccepted: false,
      supplementRounds: 0,
      error,
    };
  }
}

// ============================================================
// 工厂（composable 友好）
// ============================================================

export function useChapterWritingPipeline(
  deps?: ConstructorParameters<typeof ChapterWritingPipeline>[0]
) {
  return new ChapterWritingPipeline(deps);
}
