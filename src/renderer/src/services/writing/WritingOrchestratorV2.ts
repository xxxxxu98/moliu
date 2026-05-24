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
import { useActiveAIProvider } from '@/services/ai/useAIService';

import { usePreflightService, PreflightService } from '../preflight/PreflightService';
import { useEnhancedContextAgent, EnhancedContextAgent } from '@/services/ai/agents/enhanced-context-agent';
import { useEnhancedReviewerAgent, EnhancedReviewerAgent } from '@/services/ai/agents/enhanced-reviewer-agent';
import { useEnhancedDataAgent, EnhancedDataAgent } from '@/services/ai/agents/enhanced-data-agent';
import { useSixGatePolishPipeline, SixGatePolishPipeline } from '../polish/SixGatePolishPipeline';
import { useProjectionOrchestrator, ProjectionOrchestrator } from '../commit/ProjectionWriters';
import { useAntiPatternsRegistry, AntiPatternsRegistryService } from '../anti-patterns/AntiPatternsRegistry';
import { useChapterCommitManagerV2, ChapterCommitManagerV2 } from '../commit/ChapterCommitManagerV2';
import { DeAIService } from '../de-ai-service';

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
  const { requireAIService } = useActiveAIProvider();

  // 服务实例
  const preflightService = usePreflightService();
  const contextAgent = useEnhancedContextAgent();
  const reviewerAgent = useEnhancedReviewerAgent();
  const dataAgent = useEnhancedDataAgent();
  const antiPatternsRegistry = useAntiPatternsRegistry();

  let abortController: AbortController | null = null;

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

  async function step2_Draft(targetWordCount: number, writingStyle: string): Promise<void> {
    currentStep.value = 'draft';
    progress.value = 30;

    console.log('[OrchestratorV2] Step 2: AI 起草');

    const client = requireAIService();
    const project = projectStore.currentProject!;
    const currentChapter = projectStore.currentChapter!;

    // 构建增强大纲
    let enhancedOutline = '';
    if (taskBook.value) {
      enhancedOutline = buildEnhancedOutline(taskBook.value);
    }

    // 调用 AI 起草
    if (settingsStore.streamOutput && (client as any).continueWritingStream) {
      generatedContent.value = '';
      let content = '';

      await new Promise<void>((resolve, reject) => {
        (client as any).continueWritingStream(
          {
            project,
            currentChapterId: currentChapter.id,
            currentChapterIndex: currentChapter.orderIndex,
            currentChapterTitle: currentChapter.title,
            currentChapterContent: currentChapter.content || '',
            currentChapterOutline: enhancedOutline || undefined,
            recentChaptersFullText: taskBook.value?.dynamicContext ? 
              '' : '',  // 已在任务书中提供
            charactersInScene: project.characters,
            writingStyle,
          },
          'smartContinue',
          targetWordCount,
          (chunk: string) => {
            content += chunk;
            generatedContent.value = content;
            progress.value = 30 + Math.min(
              Math.floor((content.length / (targetWordCount * 2)) * 60),
              55
            );
          },
          () => resolve(),
          (errMsg: string) => reject(new Error(errMsg)),
          abortController?.signal,
        );
      });
    } else {
      const result = await (client as any).continueWriting(
        {
          project,
          currentChapterId: currentChapter.id,
          currentChapterIndex: currentChapter.orderIndex,
          currentChapterTitle: currentChapter.title,
          currentChapterContent: currentChapter.content || '',
          currentChapterOutline: enhancedOutline || undefined,
          charactersInScene: project.characters,
          writingStyle,
        },
        'smartContinue',
        targetWordCount
      );

      if (result?.content) {
        generatedContent.value = result.content;
      }
    }

    // 统计字数
    actualWordCount.value = countWords(generatedContent.value);
    reviewedContent.value = generatedContent.value;
    progress.value = 55;
  }

  // ============================================================
  // Step 3: 审查
  // ============================================================

  async function step3_Review(): Promise<boolean> {
    currentStep.value = 'review';
    progress.value = 60;

    console.log('[OrchestratorV2] Step 3: 审查');

    const project = projectStore.currentProject!;
    const currentChapter = projectStore.currentChapter!;
    const currentIndex = currentChapter.orderIndex;
    const prevChapter = currentIndex > 0 ? 
      projectStore.sortedChapters[currentIndex - 1] : null;

    // 获取反模式
    const antiPatterns = antiPatternsRegistry.getPatternStrings();

    // 调用增强审查 Agent
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
      } : undefined,
      antiPatterns,
    });

    reviewResult.value = result;

    // 回流反模式
    if (result.antiPatternIssues && result.antiPatternIssues.length > 0) {
      for (const issue of result.antiPatternIssues) {
        if (issue.severity === 'high') {
          antiPatternsRegistry.addFromReview(
            issue.pattern,
            currentIndex + 1,
            issue.severity
          );
        }
      }
    }

    progress.value = 70;

    // 返回是否通过
    return !result.blocking;
  }

  // ============================================================
  // Step 4: 润色
  // ============================================================

  async function step4_Polish(): Promise<void> {
    currentStep.value = 'polish';
    progress.value = 75;

    console.log('[OrchestratorV2] Step 4: 润色');

    // 1. 六门禁润色
    const pipeline = new SixGatePolishPipeline();
    const pipelineResult = pipeline.execute(reviewedContent.value);
    
    let polished = pipelineResult.content;

    // 2. 去AI味服务
    const deAIResult = await DeAIService.fix(polished);
    polished = deAIResult.content;

    polishedContent.value = polished;
    progress.value = 85;
  }

  // ============================================================
  // Step 5: 提交
  // ============================================================

  async function step5_Commit(): Promise<void> {
    currentStep.value = 'commit';
    progress.value = 90;

    console.log('[OrchestratorV2] Step 5: 提交');

    const project = projectStore.currentProject!;
    const currentChapter = projectStore.currentChapter!;
    const currentIndex = currentChapter.orderIndex + 1;

    // 使用新的 ChapterCommitManagerV2
    const commitManager = useChapterCommitManagerV2();

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

    // 保存章节
    if (commitResult.value.status === 'accepted') {
      const currentContent = projectStore.currentChapter?.content || '';
      const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
      const newContent = currentContent + separator + polishedContent.value;

      await projectStore.updateChapter(projectStore.currentChapterId!, {
        content: newContent,
        wordCount: countWords(newContent),
        status: 'published',
      });
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
