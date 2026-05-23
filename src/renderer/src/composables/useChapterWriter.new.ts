/**
 * 单章写作 Composable
 * 管理单章节写作流程和流水线
 */

import { ref, shallowRef, readonly } from 'vue';
import type { Ref } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { WritingPipeline } from '@/services/writing/orchestrator/WritingPipeline';
import { useWritingContext } from './useWritingContext';
import type {
  PipelineConfig,
  PipelineEvent,
  WritingStep,
  PipelineStatus,
} from '@/services/writing/orchestrator/types';
import type { WritingContext } from './useWritingContext';

// ============================================================
// 类型定义
// ============================================================

export interface UseChapterWriterOptions {
  pipelineConfig?: Partial<PipelineConfig>;
  enableStreaming?: boolean;
  targetWordCount?: number;
  writingStyle?: WritingStyle;
}

export type WritingStyle = 'concise' | 'elegant' | 'humorous' | 'ancient';

export interface UseChapterWriterReturn {
  // 状态
  isGenerating: Readonly<Ref<boolean>>;
  progress: Readonly<Ref<number>>;
  error: Readonly<Ref<string | null>>;
  generatedContent: Readonly<Ref<string>>;

  // 流水线状态
  currentStep: Readonly<Ref<WritingStep | null>>;
  pipelineStatus: Readonly<Ref<PipelineStatus>>;
  stepResults: Readonly<Ref<StepResult[]>>;

  // 审查状态
  blockingIssues: Readonly<Ref<ReviewIssue[]>>;
  reviewResult: Readonly<Ref<ReviewResultType | null>>;

  // 方法
  writeChapter: (options?: ChapterWriteOptions) => Promise<string | null>;
  stopWriting: () => void;
  applyGeneratedContent: () => Promise<boolean>;
  copyToClipboard: () => void;
  reset: () => void;

  // 流水线控制
  retryCurrentStep: () => Promise<void>;
  skipBlockingIssues: () => void;

  // 事件订阅
  onPipelineEvent: (callback: (event: PipelineEvent) => void) => () => void;
}

export interface ChapterWriteOptions {
  targetWordCount?: number;
  additionalInstructions?: string;
  writingStyle?: WritingStyle;
}

export interface StepResult {
  step: WritingStep;
  data?: unknown;
}

export interface ReviewIssue {
  type: string;
  severity: string;
  description: string;
}

export interface ReviewResultType {
  blockingIssues: ReviewIssue[];
}

// ============================================================
// Composable 实现
// ============================================================

export function useChapterWriter(options: UseChapterWriterOptions = {}): UseChapterWriterReturn {
  const projectStore = useProjectStore();
  const { requireAIService } = useActiveAIProvider();
  const writingContext = useWritingContext();

  // 响应式状态
  const isGenerating = ref(false);
  const progress = ref(0);
  const error = ref<string | null>(null);
  const generatedContent = ref('');
  const pipelineStatus = ref<PipelineStatus>('idle');
  const currentStep = ref<WritingStep | null>(null);
  const stepResults = ref<StepResult[]>([]);
  const blockingIssues = ref<ReviewIssue[]>([]);
  const reviewResult = ref<ReviewResultType | null>(null);

  // 实例状态
  const pipelineRef = shallowRef<WritingPipeline | null>(null);
  const currentContextRef = shallowRef<WritingContext | null>(null);

  // 初始化 Pipeline
  function getPipeline(): WritingPipeline {
    if (!pipelineRef.value) {
      pipelineRef.value = new WritingPipeline(options.pipelineConfig);
      pipelineRef.value.addEventListener(handlePipelineEvent);
    }
    return pipelineRef.value;
  }

  // ============================================================
  // 事件处理
  // ============================================================

  function handlePipelineEvent(event: PipelineEvent): void {
    switch (event.type) {
      case 'step_start':
        currentStep.value = event.step ?? null;
        progress.value = calculateStepProgress(event.step);
        break;

      case 'step_complete':
        stepResults.value.push({
          step: event.step!,
          data: event.data,
        });
        progress.value = calculateStepProgress(event.step);

        if (event.step === 'review' && event.data?.reviewResult) {
          reviewResult.value = event.data.reviewResult;
          blockingIssues.value = event.data.reviewResult.blockingIssues || [];
        }

        if (event.step === 'draft' && event.data?.content) {
          generatedContent.value = event.data.content;
        }
        break;

      case 'step_error':
        error.value = event.error || '步骤执行失败';
        break;

      case 'pipeline_complete':
        isGenerating.value = false;
        pipelineStatus.value = 'completed';
        progress.value = 100;

        const draftStep = stepResults.value.find((s) => s.step === 'draft');
        if (draftStep?.data?.content) {
          generatedContent.value = draftStep.data.content;
        }
        break;

      case 'pipeline_error':
        isGenerating.value = false;
        pipelineStatus.value = 'failed';
        error.value = event.error || '流水线执行失败';
        break;
    }
  }

  function calculateStepProgress(step: WritingStep | null | undefined): number {
    if (!step) return 0;

    const stepMap: Record<WritingStep, number> = {
      'task_book': 15,
      'draft': 40,
      'review': 60,
      'polish': 80,
      'commit': 95,
      'backup': 100,
    };

    return stepMap[step] ?? 0;
  }

  // ============================================================
  // 核心方法
  // ============================================================

  async function writeChapter(chapterOptions?: ChapterWriteOptions): Promise<string | null> {
    const targetWordCount = chapterOptions?.targetWordCount || options.targetWordCount || 3000;
    const writingStyle = chapterOptions?.writingStyle || options.writingStyle || 'concise';

    if (isGenerating.value) {
      error.value = '正在生成中，请稍候';
      return null;
    }

    const context = writingContext.buildContext({
      targetWordCount,
      writingStyle,
      includePreviousChapter: true,
    });

    if (!context) {
      error.value = '无法构建写作上下文';
      return null;
    }

    reset();

    const pipeline = getPipeline();
    pipeline.updateConfig({
      enableTaskBook: true,
      enableReview: true,
      enablePolish: true,
      enableCommit: true,
      enableBackup: true,
      maxRetries: 3,
    });

    try {
      isGenerating.value = true;
      pipelineStatus.value = 'running';
      error.value = null;

      const pipelineContext = buildPipelineContext(context, chapterOptions);
      const result = await pipeline.execute(
        context.chapterIndex + 1,
        pipelineContext
      );

      if (result.status === 'completed' && result.finalContent) {
        generatedContent.value = result.finalContent;
        return result.finalContent;
      }

      if (result.error) {
        error.value = result.error;
      }

      return result.finalContent || null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败';
      return null;
    } finally {
      if (pipelineStatus.value !== 'running') {
        isGenerating.value = false;
      }
    }
  }

  function stopWriting(): void {
    if (pipelineRef.value) {
      pipelineRef.value.stop();
    }
    isGenerating.value = false;
    pipelineStatus.value = 'idle';
  }

  async function applyGeneratedContent(): Promise<boolean> {
    if (!generatedContent.value) {
      error.value = '没有可应用的内容';
      return false;
    }

    if (!projectStore.currentChapterId) {
      error.value = '请先选择一个章节';
      return false;
    }

    try {
      const currentContent = projectStore.currentChapter?.content || '';
      const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
      const newContent = currentContent + separator + generatedContent.value;

      const titleMatch = generatedContent.value.match(/^第[一二三四五六七八九十百千万\d]+章\s*(.+)/);
      const extractedTitle = titleMatch ? titleMatch[1] : null;

      const updateData: Record<string, unknown> = {
        content: newContent,
        wordCount: newContent.length,
      };

      if (extractedTitle && projectStore.currentChapter) {
        updateData.title = extractedTitle;
      }

      await projectStore.updateChapter(projectStore.currentChapterId, updateData);
      await updateMemoryAfterApply();

      generatedContent.value = '';
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败';
      return false;
    }
  }

  async function updateMemoryAfterApply(): Promise<void> {
    const context = currentContextRef.value;
    if (!context) return;

    try {
      const memoryOrchestrator = writingContext.memoryOrchestrator;
      await memoryOrchestrator.updateFromChapter(
        context.chapterIndex,
        generatedContent.value || ''
      );
    } catch (err) {
      console.error('[useChapterWriter] 更新记忆失败:', err);
    }
  }

  function copyToClipboard(): void {
    if (generatedContent.value) {
      navigator.clipboard.writeText(generatedContent.value);
    }
  }

  function reset(): void {
    isGenerating.value = false;
    progress.value = 0;
    error.value = null;
    generatedContent.value = '';
    currentStep.value = null;
    pipelineStatus.value = 'idle';
    stepResults.value = [];
    blockingIssues.value = [];
    reviewResult.value = null;
  }

  async function retryCurrentStep(): Promise<void> {
    if (blockingIssues.value.length > 0 || reviewResult.value) {
      blockingIssues.value = [];
      reviewResult.value = null;
    }

    await writeChapter();
  }

  function skipBlockingIssues(): void {
    console.warn('[useChapterWriter] 用户选择跳过阻断问题');
    blockingIssues.value = [];
    reviewResult.value = null;
  }

  function onPipelineEvent(callback: (event: PipelineEvent) => void): () => void {
    const pipeline = getPipeline();
    pipeline.addEventListener(callback);
    return () => pipeline.removeEventListener(callback);
  }

  // ============================================================
  // 私有方法
  // ============================================================

  function buildPipelineContext(
    context: WritingContext,
    chapterOptions?: ChapterWriteOptions
  ): Record<string, unknown> {
    currentContextRef.value = context;

    return {
      project: context.project,
      chapter: {
        id: context.chapterId,
        index: context.chapterIndex,
        title: context.chapterTitle,
        outline: context.chapterOutline,
        type: context.chapterType,
        existingContent: context.existingContent,
      },
      previousChapter: context.previousChapter,
      memoryPack: context.memoryPack,
      readerSignals: context.readerSignals,
      contract: context.contract,
      characters: context.characters,
      activeForeshadows: context.activeForeshadows,
      fullOutline: context.fullOutline,
      writingStyle: context.writingStyle,
      targetWordCount: context.targetWordCount,
      additionalInstructions: chapterOptions?.additionalInstructions,
      aiProvider: requireAIService(),
    };
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    isGenerating: readonly(isGenerating),
    progress: readonly(progress),
    error: readonly(error),
    generatedContent: readonly(generatedContent),
    currentStep: readonly(currentStep),
    pipelineStatus: readonly(pipelineStatus),
    stepResults: readonly(stepResults),
    blockingIssues: readonly(blockingIssues),
    reviewResult: readonly(reviewResult),
    writeChapter,
    stopWriting,
    applyGeneratedContent,
    copyToClipboard,
    reset,
    retryCurrentStep,
    skipBlockingIssues,
    onPipelineEvent,
  };
}
