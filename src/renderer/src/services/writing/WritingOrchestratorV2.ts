/**
 * 智能续写 UI 编排器（WritingOrchestratorV2）
 *
 * 职责：把单章智能续写的执行委托给 SSOT `executeSmartContinue`（与冒烟同入口），
 * 自身只负责模块级响应式状态（进度/错误/产物）与用户中断（AbortController）。
 *
 * 关键约束：
 * - 不持有任何写作引擎实例；引擎装配全部在 ChapterWritingPipeline 内完成。
 * - persistence / memoryClient 在实例内共享，跨 run() 复用（与批量续写同口径）。
 * - reviewResult 只是把 gateResult 翻译成 UI 兼容的 ReviewerOutput 形状，无独立判定逻辑。
 */

import { ref, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { countWords } from './utils';
import {
  createChapterPersistenceClient,
  createChapterMemoryClient,
} from './chapterPersistenceAdapters';
import { executeSmartContinue } from './smartContinue';

import type {
  WritingTaskBook,
  ReviewerOutput,
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
  isRunning: boolean;
  currentStep: WritingStep;
  progress: number;
  error: string | null;
  taskBook: WritingTaskBook | null;
  generatedContent: string;
  reviewedContent: string;
  polishedContent: string;
  commitResult: ChapterCommit | null;
  reviewResult: ReviewerOutput | null;
  actualWordCount: number;
  targetWordCount: number;
}

// ============================================================
// 模块级状态（多个组件实例共享同一次运行的进度）
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

/** 模块级 AbortController：任意 useWritingOrchestratorV2().stop() 都能中断当前 run */
let sharedAbortController: AbortController | null = null;

// ============================================================
// 主编排器
// ============================================================

/** 智能续写 UI 编排器；执行链见 smartContinue.ts → ChapterWritingPipeline */
export function useWritingOrchestratorV2() {
  const projectStore = useProjectStore();

  // 与批量续写同口径的落库/记忆客户端；跨 run() 复用
  const smartContinueDeps = {
    persistence: createChapterPersistenceClient(),
    memoryClient: createChapterMemoryClient(),
  };

  /**
   * 执行智能续写：委托 SSOT 入口，随后把 ChapterWriteOutput 映射到响应式状态。
   * 返回是否成功（用户中断视为失败，error 固定为 'Generation stopped by user'）。
   */
  async function run(options: WritingOrchestratorOptions = {}): Promise<boolean> {
    const { targetWordCount: requestedTarget = 3000, writingStyle = 'concise' } = options;

    reset();
    isRunning.value = true;
    targetWordCount.value = requestedTarget;

    sharedAbortController?.abort();
    sharedAbortController = new AbortController();
    const signal = sharedAbortController.signal;

    try {
      const project = projectStore.currentProject;
      const currentChapter = projectStore.currentChapter;
      if (!project || !currentChapter) {
        error.value = '没有选择项目或章节';
        return false;
      }

      currentStep.value = 'preflight';
      progress.value = 5;

      const result = await executeSmartContinue(
        {
          project,
          chapter: currentChapter,
          targetWordCount: requestedTarget,
          writingStyle,
          signal,
        },
        smartContinueDeps
      );

      if (signal.aborted || result.error === 'Generation stopped by user') {
        error.value = 'Generation stopped by user';
        return false;
      }

      progress.value = 100;

      taskBook.value = result.taskBook;
      generatedContent.value = result.prose;
      reviewedContent.value = result.prose;
      polishedContent.value = result.prose;
      actualWordCount.value = countWords(result.prose);

      // 门禁结果翻译为 UI 兼容的 ReviewerOutput 形状（UI 只读 blocking / 摘要）
      if (result.gateResult) {
        const gate = result.gateResult;
        const blocking = !gate.passed;
        const toIssue = (i: (typeof gate.allIssues)[number]) => ({
          location: i.location,
          type: 'consistency' as const,
          severity: i.severity === 'critical' ? 'high' : (i.severity as 'high' | 'medium' | 'low'),
          description: i.description,
          evidence: i.evidence || '',
          suggestion: i.suggestion || '',
        });
        reviewResult.value = {
          blocking,
          overallAssessment: blocking ? 'failed' : 'passed',
          blockingIssues: gate.allIssues
            .filter(i => i.severity === 'critical' || i.severity === 'high')
            .map(toIssue),
          suggestions: gate.allIssues
            .filter(i => i.severity !== 'critical' && i.severity !== 'high')
            .map(toIssue),
          antiPatternIssues: [],
          logicChainValid: !blocking,
          consistency: blocking ? 50 : 90,
          completeness: blocking ? 50 : 90,
          writingQuality: blocking ? 50 : 90,
          contract: {},
          contractAlignment: !blocking ? 100 : 50,
          reviewSummary: `审查门：${gate.passed ? '通过' : '未通过'}（${gate.blockingCount} critical / ${gate.highCount} high）${result.forceAccepted ? ' · 兜底放行' : ''}`,
        } as unknown as ReviewerOutput;
      }

      commitResult.value = result.success
        ? ({
            chapterNumber: currentChapter.orderIndex + 1,
            status: 'accepted',
            reviewFeedback: '',
            committedAt: new Date().toISOString(),
          } as unknown as ChapterCommit)
        : null;

      if (!result.success) {
        error.value = result.error || '写作失败';
        return false;
      }

      currentStep.value = 'idle';
      return true;
    } catch (err) {
      if (
        sharedAbortController?.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError') ||
        (err instanceof Error && err.message === 'Generation stopped by user')
      ) {
        error.value = 'Generation stopped by user';
        return false;
      }
      error.value = err instanceof Error ? err.message : '执行失败';
      return false;
    } finally {
      isRunning.value = false;
      if (sharedAbortController?.signal === signal) {
        sharedAbortController = null;
      }
    }
  }

  /** 停止执行（真正 abort 在飞 HTTP） */
  function stop(): void {
    if (sharedAbortController) {
      sharedAbortController.abort();
      sharedAbortController = null;
    }
    isRunning.value = false;
    currentStep.value = 'idle';
  }

  /** 重置全部响应式状态 */
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

  return {
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

    run,
    stop,
    reset,
  };
}

export default useWritingOrchestratorV2;
