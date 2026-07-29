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
 *      内部已含：起草 + 严格门禁重试 + 事务提交 + 记忆提取
 *   3. 字数不足时补充续写（可选，enableSupplement）
 *   4. 结果归一化 → ChapterWriteOutput
 *
 * 设计要点：
 * - 无状态服务：依赖通过构造函数注入（drafter/gitBackup/persistence/memoryClient 适配器 +
 *   preflightService + contextAgent）。
 * - 默认创建 persistence/memoryClient（与 V2 同口径），批量不再因 null 跳过落库。
 * - 内部持有 StateDrivenWritingOrchestrator 实例（跨章节复用状态快照/检索器/检查点）。
 * - 严格门禁未通过时绝不提交；forceAccepted 仅保留为兼容字段且恒为 false。
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
import type { GateContext, GateIssue, GatePipelineResult } from '@/services/gates/types';
import type { WritingTaskBook } from '@/types/writing-v2';
import type { Project, Chapter } from '@/types/project';
import type {
  ContinuityDomain,
  ContinuityReport,
  StructuredAI,
  StructuredAIRequest,
} from '@/types/story-runtime';
import {
  AIFactExtractor,
  ContractPackBuilder,
  GroundedRetriever,
  LegacyProjectMigrator,
  LongFormWritingEngine,
  StoryRuntimeClient,
} from '@/services/story-runtime';

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
  /** 兼容字段；严格门禁下恒为 false */
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
  private readonly memoryClient: MemoryClient | null;

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
    this.memoryClient = memoryClient;

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

    if (this.hasStoryRuntime()) {
      return this.executeLongFormRuntime(input, taskBook);
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

    if (!result.success || !result.gateResult?.passed) {
      return {
        success: false,
        prose: result.prose || '',
        title: this.readBackTitle(chapter.id),
        taskBook,
        gateResult: result.gateResult,
        attempts: result.attempts,
        forceAccepted: false,
        supplementRounds: 0,
        error: result.error || '严格门禁未通过，章节未提交',
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
        writingStyle,
        blueprint,
      );
      prose = supplementResult.prose;
      supplementRounds = supplementResult.rounds;
      if (supplementResult.error) {
        return {
          success: false,
          prose,
          title: this.readBackTitle(chapter.id),
          taskBook,
          gateResult: result.gateResult,
          attempts: result.attempts,
          forceAccepted: false,
          supplementRounds,
          error: supplementResult.error,
        };
      }
    }

    // ====== Step 6: 结果归一化 ======
    return {
      success: true,
      prose,
      title: this.readBackTitle(chapter.id),
      taskBook,
      gateResult: result.gateResult,
      attempts: result.attempts,
      forceAccepted: false,
      supplementRounds,
      error: result.error,
    };
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private hasStoryRuntime(): boolean {
    return (
      typeof window !== 'undefined' &&
      Boolean(window.electronAPI?.storyRuntime?.bootstrap)
    );
  }

  /**
   * 新长篇主链：迁移/幂等 bootstrap → 合同 → 场景 DAG → 独立事实提取
   * → 严格连续性校验 → SQLite accepted commit。
   */
  private async executeLongFormRuntime(
    input: ChapterWriteInput,
    taskBook: WritingTaskBook | null
  ): Promise<ChapterWriteOutput> {
    const { requireAIService } = useActiveAIProvider();
    const migrator = new LegacyProjectMigrator();
    const bootstrap = migrator.migrate(
      input.project as unknown as Parameters<LegacyProjectMigrator['migrate']>[0]
    );
    const runtime = new StoryRuntimeClient();

    try {
      await runtime.bootstrap(bootstrap);
      const state = await runtime.loadState(input.project.id);
      const chapterNumber = input.chapter.orderIndex + 1;
      if (state.chapter >= chapterNumber && input.chapter.content.trim()) {
        throw new Error(`第 ${chapterNumber} 章已有 accepted 状态，请使用章节重写流程`);
      }

      const volume = input.project.volumes.find(item => item.id === input.chapter.volumeId);
      const volumePlan = input.project.metadata?.volumePlans?.find(
        item => item.volumeIndex === (volume?.orderIndex ?? 0)
      );
      const outlineNode = {
        id: input.chapter.id,
        title: input.chapter.title,
        description: input.chapter.outline || input.chapter.plotSummary || '',
        chapterId: input.chapter.id,
        keyEvents: taskBook?.mustCover ?? [],
        CBN: taskBook?.CBN,
        CPNs: taskBook?.CPNs,
        CEN: taskBook?.CEN,
        mustCover: taskBook?.mustCover,
        forbiddenZones: taskBook?.forbiddenZones,
      };
      const contracts = new ContractPackBuilder().build({
        bootstrap,
        volume: {
          number: (volume?.orderIndex ?? 0) + 1,
          id: volume?.id,
          title: volume?.name ?? '正文卷',
          objective: volumePlan?.objective ?? volume?.summary ?? input.project.description,
          conflict: volumePlan?.coreConflict ?? input.project.conflictDesign?.source ?? '',
          requiredPayoffs: volumePlan?.payoffForeshadows ?? [],
          forbidden: taskBook?.forbiddenZones ?? [],
        },
        chapter: {
          number: chapterNumber,
          id: input.chapter.id,
          title: input.chapter.title,
          goal: input.chapter.outline || input.chapter.plotSummary || input.chapter.title,
          outlineNode,
        },
        style: [
          input.writingStyle,
          `目标约 ${input.targetWordCount} 字，按场景分配篇幅`,
          ...(taskBook?.styleGuidance?.reasoning ?? []),
          input.userInstructions ?? '',
        ],
        forbidden: taskBook?.forbiddenZones ?? [],
      });
      const query =
        taskBook?.CPNs.join(' ') ||
        input.chapter.outline ||
        input.chapter.plotSummary ||
        input.chapter.title;
      const entityIds = [...bootstrap.entities, ...bootstrap.rules, ...bootstrap.foreshadows]
        .filter(entity => query.includes(entity.name) || entity.aliases.some(alias => query.includes(alias)))
        .map(entity => entity.id);
      const retrievedScenes = await new GroundedRetriever(
        window.electronAPI.storyRuntime
      ).retrieve({
        projectId: input.project.id,
        query,
        entityIds,
        currentChapter: chapterNumber,
        topK: 8,
      });
      const recentScenes = bootstrap.sceneChunks
        .filter(scene => scene.chapterIndex < chapterNumber)
        .slice(-4);
      const ai: StructuredAI = {
        async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
          const service = requireAIService();
          const raw = await service.complete(request.prompt, {
            system: `${request.system}\n只输出符合 ${request.schemaName} 的 JSON，不要 Markdown。`,
            maxTokens: request.purpose === 'scene-draft' ? 4000 : 2500,
            temperature: request.purpose === 'scene-draft' ? 0.65 : 0.2,
          });
          const parsed = ChapterWritingPipeline.parseStructuredJson(raw);
          return request.parse(parsed);
        },
      };
      const engine = new LongFormWritingEngine({
        ai,
        factExtractor: new AIFactExtractor(ai),
        commitPort: runtime,
      });
      const result = await engine.write({
        projectId: input.project.id,
        contracts,
        state,
        recentScenes,
        retrievedScenes,
        styleGuidance: contracts.master.style,
        maxContextTokens: 24_000,
      });
      const prose = result.drafts
        .flatMap(scene => scene.paragraphs)
        .join('\n\n');
      const gateResult = this.toGateResult(result.report);

      if (result.commit.status !== 'accepted' || !result.receipt) {
        return {
          success: false,
          prose,
          title: null,
          taskBook,
          gateResult,
          attempts: 1,
          forceAccepted: false,
          supplementRounds: 0,
          error: result.commit.reasons.join('；') || '严格连续性门禁未通过',
        };
      }

      // electron-store 仅作为 UI 投影；canonical commit 已由 SQLite 原子写入。
      try {
        if (this.persistence?.replace) {
          await this.persistence.replace(input.chapter.id, prose);
        }
        await this.memoryClient?.extractAndSave(input.chapter.id, chapterNumber, prose);
      } catch (error) {
        console.warn('[Pipeline] accepted commit 的 UI 投影失败，可由 outbox 重放:', error);
      }
      return {
        success: true,
        prose,
        title: this.readBackTitle(input.chapter.id),
        taskBook,
        gateResult,
        attempts: 1,
        forceAccepted: false,
        supplementRounds: 0,
      };
    } catch (error) {
      return {
        ...this.fail(error instanceof Error ? error.message : '长篇运行时执行失败'),
        taskBook,
      };
    }
  }

  private static parseStructuredJson(raw: string): unknown {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      const start = Math.min(
        ...[trimmed.indexOf('{'), trimmed.indexOf('[')].filter(index => index >= 0)
      );
      const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
      if (!Number.isFinite(start) || start < 0 || end <= start) {
        throw new Error('AI 未返回可解析的结构化 JSON');
      }
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
  }

  private toGateResult(report: ContinuityReport): GatePipelineResult {
    const category = (domain: ContinuityDomain): GateIssue['category'] => {
      if (domain === 'entity') return 'entity';
      if (domain === 'fulfillment') return 'blueprint';
      if (domain === 'evidence') return 'protocol';
      if (domain === 'causality') return 'semantic';
      return 'consistency';
    };
    const allIssues: GateIssue[] = report.issues.map(issue => ({
      category: category(issue.domain),
      severity: issue.severity === 'blocking' ? 'critical' : 'medium',
      location: issue.sceneId ?? '章节',
      description: issue.message,
      evidence: issue.evidence.join('；'),
      autoFixable: false,
    }));
    const blockingCount = allIssues.filter(issue => issue.severity === 'critical').length;
    const passed = report.accepted && blockingCount === 0;
    return {
      passed,
      hasBlocking: blockingCount > 0,
      blockingCount,
      highCount: 0,
      totalIssues: allIssues.length,
      gates: [
        {
          gateId: 'G7',
          gateName: 'Story Runtime 连续性门禁',
          passed,
          issues: allIssues,
          durationMs: 0,
        },
      ],
      allIssues,
      decision: {
        shouldBlock: !passed,
        reason: passed ? '全部连续性约束通过' : '存在阻断级连续性问题',
        canAutoFix: false,
        nextAction: passed ? 'accept' : 'manual_review',
      },
      totalDurationMs: 0,
    };
  }

  /**
   * 字数不足时循环补写；增量通过 persistence 追加落库（与主写同口径）。
   */
  private async runSupplementIfNeeded(
    project: Project,
    chapter: Chapter,
    prose: string,
    targetWordCount: number,
    writingStyle: WritingStyle,
    blueprint?: GateContext['blueprint'],
  ): Promise<{ prose: string; rounds: number; error?: string }> {
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
      validateRound: async (_round, _delta, fullProse) => {
        const validation = await this.orchestrator.validateSupplement(
          fullProse,
          chapter,
          blueprint,
        );
        const crashedGate = validation.gates.find(gate => gate.error);
        if (crashedGate) {
          return `${crashedGate.gateId} ${crashedGate.gateName}执行异常：${crashedGate.error}`;
        }
        return validation.passed ? null : validation.decision.reason;
      },
      onRound: async (_round, delta) => {
        if (!this.persistence) {
          throw new Error('未配置章节持久化，无法安全保存补写内容');
        }
        if (delta) {
          await this.persistence.save(chapter.id, delta);
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
【风格指引】${book.styleGuidance?.reasoning?.join(' / ') || ''}
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
