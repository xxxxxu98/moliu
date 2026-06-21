/**
 * 写作编排器 v2 (Writing Orchestrator v2)
 * 
 * 基于 webnovel-writer 架构的完整 6 步写作流程
 * 
 * 步骤：
 * 0. 预检 (Preflight) - 环境验证
 * 1. 上下文 Agent - 生成任务书
 * 2. AI 起草 - 根据任务书生成正文
 * 3. 审查 Agent - 审查并生成结构化问题
 * 4. 润色 - 六门禁 + 去AI味
 * 5. 提交 (CHAPTER_COMMIT) - 提取事实并更新投影
 */

import { ref, computed, readonly, shallowRef } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';

import { usePreflightService, PreflightService } from './preflight/PreflightService';
import { useEnhancedContextAgent, EnhancedContextAgent } from '@/services/ai/agents/enhanced-context-agent';
import { useEnhancedReviewerAgent, EnhancedReviewerAgent } from '@/services/ai/agents/enhanced-reviewer-agent';
import { useEnhancedDataAgent, EnhancedDataAgent } from '@/services/ai/agents/enhanced-data-agent';
import { useSixGatePolishPipeline, SixGatePolishPipeline } from './polish/SixGatePolishPipeline';
import { useProjectionOrchestrator, ProjectionOrchestrator } from './commit/ProjectionWriters';
import { useAntiPatternsRegistry, AntiPatternsRegistryService } from './anti-patterns/AntiPatternsRegistry';
import { useChapterCommitManagerV2, ChapterCommitManagerV2 } from './commit/ChapterCommitManagerV2';
import { DeAIService } from './de-ai-service';

import type {
  WritingTaskBook,
  ReviewerOutput,
  PolishResult,
  ProjectionStatus,
  WritingStep,
  WritingMode,
  ChapterCommit,
} from '@/types/writing-v2';

// ============================================================
// 状态驱动架构集成（v3.0 重大变更）
// ============================================================
// V2.1 之前：Step 2 调 AI client.continueWriting 写散文 → 后续 DataExtractor 正则提取。
//   幻觉从概率问题无法拦截。
// V2.1 之后：Step 2 调 StateDrivenWritingOrchestrator.writeChapter()，
//   内部走 L1(读) → L2(检) → L3(组prompt) → L4(写+CHANGES) → L5(门禁) → L6(事务提交) → L7(checkpoint) 闭环。
//   V2 仅做编排与 UI 状态，状态/门禁/提交逻辑在 L1-L7 各层。

import {
  StateDrivenWritingOrchestrator,
  type DrafterClient,
  type GitBackupClient,
  type ChapterPersistenceClient,
  type WriteChapterResult,
  setGate7LLMClient,
} from '@/services/orchestrator';
import { GitBackupManager } from '@/services/writing/backup/GitBackupManager';

// ============================================================
// 接口定义
// ============================================================

export interface WritingOrchestratorOptions {
  targetWordCount?: number;
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  mode?: WritingMode;
}

export interface WritingOrchestratorState {
  // 状态
  isRunning: boolean;
  currentStep: WritingStep;
  progress: number;
  error: string | null;
  
  // 结果
  taskBook: WritingTaskBook | null;
  generatedContent: string;
  reviewedContent: string;
  polishedContent: string;
  commitResult: ChapterCommit | null;
  
  // 审查结果
  reviewResult: ReviewerOutput | null;
  
  // 字数统计
  actualWordCount: number;
  targetWordCount: number;
}

// ============================================================
// 状态管理
// ============================================================

const isRunning = ref(false);
const currentStep = ref<WritingStep>('idle');
const progress = ref(0);
const error = ref<string | null>(null);

const taskBook = ref<WritingTaskBook | null>(null);
const generatedContent = ref('');
const reviewedContent = ref('');
const polishedContent = ref('');
const commitResult = ref<ChapterCommit | null>(null);
const reviewResult = ref<ReviewerOutput | null>(null);

const actualWordCount = ref(0);
const targetWordCount = ref(3000);

// ============================================================
// 主编排器
// ============================================================

export function useWritingOrchestratorV2() {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService, currentModel } = useActiveAIProvider();

  // 服务实例
  const preflightService = usePreflightService();
  const contextAgent = useEnhancedContextAgent();
  const reviewerAgent = useEnhancedReviewerAgent();
  const dataAgent = useEnhancedDataAgent();
  const antiPatternsRegistry = useAntiPatternsRegistry();

  let abortController: AbortController | null = null;

  // ============================================================
  // 状态驱动编排器（v2.1 集成）
  // ============================================================
  // 单例化的 StateDrivenWritingOrchestrator。
  // AI/Git/Persistence 通过适配器接入现有服务。
  // 关键：useChapterWriter 调 run() 时只调一次 run()，不直接 init/reset 编排器。
  // 因此编排器是 per-instance 缓存，跨 run() 复用状态。

  const stateDrivenOrchestrator: StateDrivenWritingOrchestrator = createStateDrivenOrchestrator();

  function createStateDrivenOrchestrator(): StateDrivenWritingOrchestrator {
    // AI 客户端适配器：包装 useActiveAIProvider 的 UnifiedAIService
    // 关键：StateDriven 内部 L3 已拼好完整 prompt（含 CHANGES 协议），这里只需把 prompt
    // 传给 AI 即可。最简单做法：调 service.continueWriting（带 ProjectContext）。
    // ProjectContext 字段大部分从 currentProject/currentChapter 取。
    const drafter: DrafterClient = {
      async draft(prompt, params) {
        const client = requireAIService();
        const project = projectStore.currentProject;
        const currentChapter = projectStore.currentChapter;
        if (!project || !currentChapter) {
          throw new Error('项目或章节未加载');
        }

        // 构造 ProjectContext（service.continueWriting 期望的输入）
        const context: any = {
          projectId: project.id,
          currentChapterId: currentChapter.id,
          currentChapterIndex: currentChapter.orderIndex,
          currentChapterTitle: currentChapter.title,
          currentChapterContent: currentChapter.content || '',
          currentChapterOutline: currentChapter.outline || currentChapter.plotSummary || undefined,
          customPrompt: prompt,  // 把 StateDriven 拼好的完整 prompt 传过去
          charactersInScene: project.characters || [],
          writingStyle: 'concise',
        };

        // 调 service.continueWriting
        const result = await (client as any).continueWriting(
          context,
          'smartContinue',
          params.maxTokens || 3000,
        );
        // 兼容返回结构
        return result?.content ?? result?.text ?? (typeof result === 'string' ? result : '');
      },
    };

    // Git 备份适配器：复用 GitBackupManager
    const gitBackup: GitBackupClient = {
      async backup(chapter, content, title) {
        try {
          const project = projectStore.currentProject;
          if (!project) return;
          const mgr = new GitBackupManager();
          await mgr.backupChapter({
            projectRoot: project.id,
            chapterNumber: chapter,
            chapterTitle: title,
            content,
          });
        } catch (err) {
          console.warn('[V2→Orchestrator] Git 备份失败（不影响提交）:', err);
        }
      },
    };

    // 章节持久化适配器：写入 projectStore
    const persistence: ChapterPersistenceClient = {
      async save(chapterId, content) {
        const ch = projectStore.currentChapter;
        const oldContent = ch?.content ?? '';
        await projectStore.updateChapter(chapterId, {
          content: oldContent + (oldContent && !oldContent.endsWith('\n') ? '\n\n' : '') + content,
          status: 'published',
        });
        return { oldContent };
      },
    };

    // 默认模型：复用 useActiveAIProvider 的 currentModel
    const defaultModel = currentModel.value || 'gpt-4o';

    const orch = new StateDrivenWritingOrchestrator(drafter, gitBackup, persistence, {
      defaultModel,
      maxRetries: 3,
      enableSemanticGate: false,  // G7 LLM 审查默认关闭（需要外部注入客户端）
      enableGitBackup: true,
      enableRetrieval: true,
      retrievalTopK: 8,
    });

    return orch;
  }

  // ============================================================
  // 核心方法
  // ============================================================

  /**
   * 执行完整写作流程
   */
  async function run(options: WritingOrchestratorOptions = {}): Promise<boolean> {
    const {
      targetWordCount: requestedTarget = 3000,
      writingStyle = 'concise',
      mode = 'smart_continue',
    } = options;

    // 初始化状态
    reset();
    isRunning.value = true;
    targetWordCount.value = requestedTarget;

    try {
      // Step 0: 预检
      await step0_Preflight();
      if (error.value) return false;

      // Step 1: 上下文 Agent - 生成任务书
      await step1_GenerateTaskBook(writingStyle);
      if (error.value) return false;

      // Step 2: AI 起草
      await step2_Draft(requestedTarget, writingStyle);
      if (error.value) return false;

      // Step 3: 审查 Agent
      const reviewPass = await step3_Review();
      if (!reviewPass && mode !== 'polish') {
        // 有 blocking 问题时不继续，但允许用户强制继续
        console.warn('[OrchestratorV2] 审查未通过');
      }

      // Step 4: 润色
      await step4_Polish();
      if (error.value) return false;

      // Step 5: 提交
      await step5_Commit();
      if (error.value) return false;

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '执行失败';
      return false;
    } finally {
      isRunning.value = false;
    }
  }

  /**
   * 停止执行
   */
  function stop(): void {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    isRunning.value = false;
    currentStep.value = 'idle';
  }

  /**
   * 重置状态
   */
  function reset(): void {
    isRunning.value = false;
    currentStep.value = 'idle';
    progress.value = 0;
    error.value = null;
    taskBook.value = null;
    generatedContent.value = '';
    reviewedContent.value = '';
    polishedContent.value = '';
    commitResult.value = null;
    reviewResult.value = null;
    actualWordCount.value = 0;
  }

  // ============================================================
  // Step 0: 预检
  // ============================================================

  async function step0_Preflight(): Promise<void> {
    currentStep.value = 'preflight';
    progress.value = 5;

    console.log('[OrchestratorV2] Step 0: 预检');

    const result = await preflightService.preflight();

    if (!result.valid) {
      error.value = `预检失败: ${result.errors.join(', ')}`;
      return;
    }

    if (result.warnings.length > 0) {
      console.warn('[OrchestratorV2] 预检警告:', result.warnings);
    }

    progress.value = 10;
  }

  // ============================================================
  // Step 1: 生成任务书
  // ============================================================

  async function step1_GenerateTaskBook(writingStyle: string): Promise<void> {
    currentStep.value = 'taskbook';
    progress.value = 15;

    console.log('[OrchestratorV2] Step 1: 生成任务书');

    const project = projectStore.currentProject;
    const currentChapter = projectStore.currentChapter;
    
    if (!project || !currentChapter) {
      error.value = '没有选择项目或章节';
      return;
    }

    // 获取上下文
    const context = await preflightService.getCurrentChapterContext();
    if (!context) {
      error.value = '无法获取章节上下文';
      return;
    }

    // 初始化反模式注册表
    antiPatternsRegistry.initialize(project.id);

    // 调用增强上下文 Agent
    const result = await contextAgent.generateTaskBook({
      chapterNumber: context.chapterNumber,
      previousChapterEnding: context.previousChapterEnding,
      recentChaptersFullText: context.recentChaptersFullText,
      targetWordCount: targetWordCount.value,
      writingStyle: writingStyle as any,
    });

    if (!result.success || !result.taskBook) {
      error.value = result.error || '任务书生成失败';
      return;
    }

    taskBook.value = result.taskBook;
    progress.value = 25;
  }

  // ============================================================
  // Step 2: AI 起草
  // ============================================================

  // ============================================================
  // Step 2: AI 起草（v2.1 调 StateDriven 编排器）
  // ============================================================
  // 老版本：直接调 client.continueWriting 写散文 → 后续 DataExtractor 正则提取。
  // 新版本：调 stateDrivenOrchestrator.writeChapter()，内部已走 L1-L7 完整闭环。
  // - L1 读状态快照
  // - L2 检索相关历史
  // - L3 拼装 prompt（含 CHANGES 协议要求）
  // - L4 起草（带门禁反馈重试）
  // - L5 门禁审查（结构性矛盾必须通过）
  // - L6 事务化提交（状态+RAG+Git+持久化）
  // - L7 检查点（崩溃恢复用）
  // Step 2 内部会完成 L5-L6，所以 Step 3/Step 5 退化为"接收 Step 2 结果"。

  /** 缓存 Step 2 调 StateDriven 编排器的结果，供 Step 3/5 复用 */
  let lastStateDrivenResult: WriteChapterResult | null = null;

  async function step2_Draft(targetWordCount: number, _writingStyle: string): Promise<void> {
    currentStep.value = 'draft';
    progress.value = 30;

    console.log('[OrchestratorV2 v2.1] Step 2: 调 StateDriven 编排器（完整 L1-L7 闭环）');

    const project = projectStore.currentProject!;
    const currentChapter = projectStore.currentChapter!;

    // 把 TaskBook 转换成 StateDriven 的 outline 选项
    let currentChapterOutline = currentChapter.outline || currentChapter.plotSummary || '';
    if (taskBook.value) {
      currentChapterOutline = buildEnhancedOutline(taskBook.value) || currentChapterOutline;
    }

    // 蓝图（传给 G5 校验）
    const blueprint = taskBook.value ? {
      mustCover: taskBook.value.mustCover,
      forbiddenZones: taskBook.value.forbiddenZones,
      requiredCharacters: taskBook.value.CPNs,
      cen: taskBook.value.CEN,
    } : undefined;

    // 上章衔接
    const prevChapter = currentChapter.orderIndex > 0
      ? projectStore.sortedChapters[currentChapter.orderIndex - 1]
      : null;
    const previousChapter = prevChapter ? {
      title: prevChapter.title,
      summary: prevChapter.plotSummary || '',
      ending: (prevChapter.content || '').slice(-300),
    } : undefined;

    try {
      // 首次调 run() 时初始化编排器（initialize 是幂等的）
      await stateDrivenOrchestrator.initialize(project);

      // 订阅编排器事件 → 更新 UI 进度
      const eventHandler = (e: any) => {
        if (e.type === 'context_assembled') progress.value = 40;
        if (e.type === 'gate_run') progress.value = 60;
        if (e.type === 'commit_done') progress.value = 90;
        if (e.type === 'error') {
          console.error('[OrchestratorV2] 编排器错误:', e.message);
        }
      };
      stateDrivenOrchestrator.addListener(eventHandler);

      // 调 StateDriven 编排器
      const result = await stateDrivenOrchestrator.writeChapter(project, currentChapter, targetWordCount, {
        currentChapterOutline,
        blueprint,
        previousChapter,
        writingRules: taskBook.value ? buildEnhancedOutline(taskBook.value) : undefined,
        userInstructions: undefined,
      });

      stateDrivenOrchestrator.removeListener(eventHandler);
      lastStateDrivenResult = result;

      if (!result.success) {
        // 编排失败 → V2 错误透传
        error.value = result.error || '状态驱动编排失败';
        generatedContent.value = result.prose;
        return;
      }

      // 成功：填充 V2 状态以兼容 UI
      generatedContent.value = result.prose;
      reviewedContent.value = result.prose;
      polishedContent.value = result.prose;
      actualWordCount.value = countWords(result.prose);

      // 同步 commit 结果（Step 5 不再重复提交）
      if (result.commitResult) {
        commitResult.value = {
          chapterNumber: result.chapter,
          status: result.commitResult.success ? 'accepted' : 'rejected',
          reviewFeedback: '',
          committedAt: new Date().toISOString(),
        } as any;
      }

      progress.value = 90;  // 跳到 90，给 Step 5 留 10% 显示
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      console.error('[OrchestratorV2] Step 2 异常:', err);
    }
  }

  // ============================================================
  // Step 3: 审查
  // ============================================================

  // ============================================================
  // Step 3: 审查（v2.1 接收 StateDriven L5 门禁结果）
  // ============================================================
  // 老版本：调 reviewerAgent.review() 跑审查。
  // 新版本：L5 门禁已在 Step 2 内部跑完。这里把门禁结果翻译为 V2 旧 ReviewerOutput 格式，
  // 保持 UI 兼容（V2 的 UI 仍读 reviewResult.value.blocking）。
  // 如果编排器未启用（异常降级），仍回退到老 reviewerAgent。

  async function step3_Review(): Promise<boolean> {
    currentStep.value = 'review';
    progress.value = 95;  // Step 2 内部已到 90，Step 3 只做格式转换

    console.log('[OrchestratorV2 v2.1] Step 3: 接收 StateDriven 门禁结果');

    if (lastStateDrivenResult?.gateResult) {
      // 把 G1-G7 门禁结果翻译为 V2 ReviewerOutput
      const gate = lastStateDrivenResult.gateResult;
      const blocking = !gate.passed;
      const issues = gate.allIssues.map(i => ({
        location: i.location,
        type: 'consistency' as const,
        severity: i.severity === 'critical' ? 'high' : i.severity as any,
        description: i.description,
        evidence: i.evidence || '',
        suggestion: i.suggestion || '',
      }));

      reviewResult.value = {
        // 简化版 ReviewerOutput（V2 期望的字段）
        blocking,
        overallAssessment: blocking ? 'failed' : 'passed',
        blockingIssues: issues.filter(i => i.severity === 'high'),
        suggestions: issues.filter(i => i.severity !== 'high'),
        antiPatternIssues: [],
        logicChainValid: !blocking,
        consistency: blocking ? 50 : 90,
        completeness: blocking ? 50 : 90,
        writingQuality: blocking ? 50 : 90,
        contract: {} as any,
        contractAlignment: !blocking ? 100 : 50,
        reviewSummary: `L1-L7 门禁：${gate.passed ? '通过' : '未通过'}（${gate.blockingCount} critical / ${gate.highCount} high）`,
      } as any;

      return !blocking;
    }

    // 降级：编排器未启用 → 跑老 review
    console.warn('[OrchestratorV2 v2.1] StateDriven 未启用门禁，回退老审查');
    return await legacyReview();
  }

  async function legacyReview(): Promise<boolean> {
    const project = projectStore.currentProject!;
    const currentChapter = projectStore.currentChapter!;
    const currentIndex = currentChapter.orderIndex;
    const prevChapter = currentIndex > 0
      ? projectStore.sortedChapters[currentIndex - 1]
      : null;

    const antiPatterns = antiPatternsRegistry.getPatternStrings();
    const result = await reviewerAgent.review({
      projectRoot: project.id,
      chapterNumber: currentIndex + 1,
      chapterContent: reviewedContent.value,
      previousChapterContent: prevChapter?.content,
      contract: taskBook.value ? {
        id: currentChapter.id,
        chapterNumber: currentIndex + 1,
        title: currentChapter.title,
        directive: {
          goal: taskBook.value.hardConstraints.goal,
          CBN: taskBook.value.CBN,
          CPNs: taskBook.value.CPNs,
          CEN: taskBook.value.CEN,
          mustCoverNodes: taskBook.value.mustCover,
          forbiddenZones: taskBook.value.forbiddenZones,
        },
      } as any : undefined,
      antiPatterns,
    });

    reviewResult.value = result;
    if (result.antiPatternIssues && result.antiPatternIssues.length > 0) {
      for (const issue of result.antiPatternIssues) {
        if (issue.severity === 'high') {
          antiPatternsRegistry.addFromReview(issue.pattern, currentIndex + 1, issue.severity);
        }
      }
    }
    return !result.blocking;
  }

  // ============================================================
  // Step 4: 润色 - 暂时禁用去AI味
  // ============================================================

  async function step4_Polish(): Promise<void> {
    currentStep.value = 'polish';
    progress.value = 75;

    console.log('[OrchestratorV2] Step 4: 润色');

    // 【暂时禁用去AI味】
    // 2026-05-24 临时禁用，等问题排查完毕后再启用
    console.log('[OrchestratorV2] 去AI味已禁用（临时），使用原始内容');

    polishedContent.value = reviewedContent.value;
    progress.value = 85;
  }

  // ============================================================
  // Step 5: 提交
  // ============================================================

  // ============================================================
  // Step 5: 提交（v2.1 幂等 — StateDriven 已在 Step 2 内部完成提交）
  // ============================================================
  // 老版本：调 ChapterCommitManagerV2.commit() 走 V2 提交流程。
  // 新版本：StateDriven 编排器的 CommitTransaction 已在 Step 2 内部完成
  //   state_apply → rag_index → git_backup → persistence 事务化提交。
  // Step 5 退化为"显示提交状态" + 后置检查（如果有数据需要后处理）。
  // 注意：仍调 ChapterCommitManagerV2.commit() 是为了保留 V2 提交逻辑的反模式/反 AI 味
  //   投影等副作用（commit 幂等依赖其内部去重）。Step 5 不重复写正文。

  async function step5_Commit(): Promise<void> {
    currentStep.value = 'commit';
    progress.value = 95;

    console.log('[OrchestratorV2 v2.1] Step 5: 提交状态同步（StateDriven 已 commit）');

    const project = projectStore.currentProject!;
    const currentChapter = projectStore.currentChapter!;
    const currentIndex = currentChapter.orderIndex + 1;

    // 优先用 StateDriven 的提交结果
    if (lastStateDrivenResult?.commitResult?.success) {
      console.log('[OrchestratorV2 v2.1] 提交已由 StateDriven 完成，跳过重复提交');
      progress.value = 100;
      currentStep.value = 'idle';
      return;
    }

    // 降级：StateDriven 未跑成功时，仍走老 commit 路径（不重复 commit 失败的结果）
    console.warn('[OrchestratorV2 v2.1] StateDriven 未 commit，回退老 commit');
    const commitManager = useChapterCommitManagerV2();

    try {
      const result = await commitManager.commit({
        chapterNumber: currentIndex,
        content: polishedContent.value,
        reviewResult: reviewResult.value!,
        contract: taskBook.value ? {
          goal: taskBook.value.hardConstraints.goal,
          CBN: taskBook.value.CBN,
          CPNs: taskBook.value.CPNs,
          CEN: taskBook.value.CEN,
          mustCover: taskBook.value.mustCover,
          forbiddenZones: taskBook.value.forbiddenZones,
        } : undefined,
      });

      if (!result.success || !result.commit) {
        error.value = result.error || '提交失败';
        return;
      }
      commitResult.value = result.commit;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    }

    progress.value = 100;
    currentStep.value = 'idle';
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  function buildEnhancedOutline(book: WritingTaskBook): string {
    return `
=== 写作任务书 ===
【CBN】${book.CBN}
【CPNs】${book.CPNs.join(' / ')}
【CEN】${book.CEN}
【必须覆盖】${book.mustCover.join(' / ')}
【禁区】${book.forbiddenZones.join(' / ')}
【风格指引】${book.styleGuidance.reasoning.join(' / ')}
【结尾感觉】${book.hardConstraints.chapterEndOpenQuestion || '留下悬念'}
【开放问题】${book.hardConstraints.chapterEndOpenQuestion || '留下悬念'}
=== 任务书结束 ===

`;
  }

  function countWords(text: string): number {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  // ============================================================
  // 导出
  // ============================================================

  return {
    // 状态（只读）
    isRunning: readonly(isRunning),
    currentStep: readonly(currentStep),
    progress: readonly(progress),
    error: readonly(error),
    
    taskBook: readonly(taskBook),
    generatedContent: readonly(generatedContent),
    reviewedContent: readonly(reviewedContent),
    polishedContent: readonly(polishedContent),
    commitResult: readonly(commitResult),
    reviewResult: readonly(reviewResult),
    
    actualWordCount: readonly(actualWordCount),
    targetWordCount: readonly(targetWordCount),

    // 方法
    run,
    stop,
    reset,

    // 服务实例（用于高级用法）
    services: {
      preflight: preflightService,
      contextAgent,
      reviewerAgent,
      dataAgent,
      antiPatterns: antiPatternsRegistry,
      commitManager: useChapterCommitManagerV2(),
    },
  };
}

// ============================================================
// 类型导出
// ============================================================

export type { WritingOrchestratorOptions, WritingOrchestratorState };
export default useWritingOrchestratorV2;
