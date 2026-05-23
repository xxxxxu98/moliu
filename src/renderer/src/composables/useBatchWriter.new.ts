/**
 * 批量写作 Composable
 * 管理多章节批量写作流程
 */

import { ref, computed, shallowRef, readonly } from 'vue';
import type { Ref } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { WritingPipeline } from '@/services/writing/orchestrator/WritingPipeline';
import { WritingOrchestrator } from '@/services/writing/orchestrator/WritingOrchestrator';
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

export interface UseBatchWriterOptions {
  orchestratorConfig?: Partial<PipelineConfig>;
  pipelineConfig?: Partial<PipelineConfig>;
  targetWordCount?: number;
  writingStyle?: WritingStyle;
}

export type WritingStyle = 'concise' | 'elegant' | 'humorous' | 'ancient';

export interface UseBatchWriterReturn {
  // 状态
  isWriting: Readonly<Ref<boolean>>;
  isPaused: Readonly<Ref<boolean>>;
  error: Readonly<Ref<string | null>>;

  // 章节进度
  currentChapterIndex: Readonly<Ref<number>>;
  currentChapterTitle: Readonly<Ref<string>>;

  // 流水线状态
  pipelineStatus: Readonly<Ref<PipelineStatus>>;
  currentStep: Readonly<Ref<WritingStep | null>>;
  stepResults: Readonly<Ref<StepResult[]>>;

  // 审查状态
  blockingIssues: Readonly<Ref<ReviewIssue[]>>;
  reviewResult: Readonly<Ref<ReviewResultType | null>>;

  // 统计
  totalChapters: number;
  writtenChapters: number;
  remainingChapters: number;
  writtenWordCount: number;
  progress: Readonly<Ref<ProgressData>>;

  // 配置
  config: Readonly<Ref<ConfigData>>;

  // 方法
  startBatchWriting: (targetChapters?: number, batchConfig?: BatchConfig) => Promise<void>;
  pauseWriting: () => void;
  resumeWriting: () => void;
  stopWriting: () => void;

  // 流水线控制
  retryCurrentStep: () => Promise<void>;
  skipBlockingIssues: () => void;

  // 事件订阅
  onOrchestratorEvent: (callback: (event: OrchestratorEvent) => void) => () => void;
  onPipelineEvent: (callback: (event: PipelineEvent) => void) => () => void;
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

export interface ProgressData {
  writtenChapters: number;
  writtenWords: number;
  targetChapters: number;
}

export interface ConfigData {
  wordsPerChapter: number;
  writingStyle: WritingStyle;
  temperature: number;
  deAIEnabled: boolean;
  useTaskBook: boolean;
  useReview: boolean;
  useCommit: boolean;
  requireBlockingPass: boolean;
}

export interface BatchConfig {
  wordsPerChapter: number;
  writingStyle: WritingStyle;
  temperature?: number;
  deAIEnabled?: boolean;
  useTaskBook?: boolean;
  useReview?: boolean;
  useCommit?: boolean;
  requireBlockingPass?: boolean;
}

export interface OrchestratorEvent {
  type: string;
  data?: {
    chapterIndex?: number;
    chapterTitle?: string;
    targetChapters?: number;
  };
  error?: string;
}

// ============================================================
// Composable 实现
// ============================================================

export function useBatchWriter(options: UseBatchWriterOptions = {}): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const { requireAIService } = useActiveAIProvider();
  const writingContext = useWritingContext();

  // 响应式状态
  const isWriting = ref(false);
  const isPaused = ref(false);
  const error = ref<string | null>(null);
  const currentChapterIndex = ref(-1);
  const currentChapterTitle = ref('');
  const pipelineStatus = ref<PipelineStatus>('idle');
  const currentStep = ref<WritingStep | null>(null);
  const stepResults = ref<StepResult[]>([]);
  const blockingIssues = ref<ReviewIssue[]>([]);
  const reviewResult = ref<ReviewResultType | null>(null);
  const progress = ref<ProgressData>({
    writtenChapters: 0,
    writtenWords: 0,
    targetChapters: 0,
  });
  const config = ref<ConfigData>({
    wordsPerChapter: options.targetWordCount || 3000,
    writingStyle: options.writingStyle || 'concise',
    temperature: 0.5,
    deAIEnabled: true,
    useTaskBook: true,
    useReview: true,
    useCommit: true,
    requireBlockingPass: true,
  });

  // 实例状态
  const orchestratorRef = shallowRef<WritingOrchestrator | null>(null);
  const pipelineRef = shallowRef<WritingPipeline | null>(null);
  const currentContextRef = shallowRef<WritingContext | null>(null);

  // 初始化 Orchestrator
  function getOrchestrator(): WritingOrchestrator {
    if (!orchestratorRef.value) {
      orchestratorRef.value = new WritingOrchestrator(options.orchestratorConfig);
    }
    return orchestratorRef.value;
  }

  // 初始化 Pipeline
  function getPipeline(): WritingPipeline {
    if (!pipelineRef.value) {
      pipelineRef.value = new WritingPipeline(options.pipelineConfig);
    }
    return pipelineRef.value;
  }

  // ============================================================
  // 事件处理
  // ============================================================

  function handleOrchestratorEvent(event: OrchestratorEvent): void {
    switch (event.type) {
      case 'session_start':
        isWriting.value = true;
        isPaused.value = false;
        error.value = null;
        progress.value = {
          writtenChapters: 0,
          writtenWords: 0,
          targetChapters: event.data?.targetChapters || 0,
        };
        break;

      case 'session_pause':
        isPaused.value = true;
        break;

      case 'session_resume':
        isPaused.value = false;
        break;

      case 'session_complete':
        isWriting.value = false;
        break;

      case 'chapter_start':
        currentChapterIndex.value = event.data?.chapterIndex ?? -1;
        currentChapterTitle.value = event.data?.chapterTitle || '';
        break;

      case 'chapter_complete':
        progress.value.writtenChapters++;
        break;

      case 'session_error':
        isWriting.value = false;
        error.value = event.error || '批量写作失败';
        break;
    }
  }

  function handlePipelineEvent(event: PipelineEvent): void {
    switch (event.type) {
      case 'step_start':
        currentStep.value = event.step ?? null;
        break;

      case 'step_complete':
        stepResults.value.push({
          step: event.step!,
          data: event.data,
        });

        if (event.step === 'review' && event.data?.reviewResult) {
          reviewResult.value = event.data.reviewResult;
          blockingIssues.value = event.data.reviewResult.blockingIssues || [];
        }
        break;

      case 'step_error':
        error.value = event.error || '步骤执行失败';
        break;

      case 'pipeline_complete':
        pipelineStatus.value = 'completed';
        break;

      case 'pipeline_error':
        pipelineStatus.value = 'failed';
        error.value = event.error || '流水线执行失败';
        break;
    }
  }

  // ============================================================
  // 核心方法
  // ============================================================

  async function startBatchWriting(
    targetChapters?: number,
    batchConfig?: BatchConfig
  ): Promise<void> {
    if (isWriting.value) {
      error.value = '正在写作中';
      return;
    }

    const project = projectStore.currentProject;
    if (!project) {
      error.value = '请先选择一个项目';
      return;
    }

    // 应用配置
    if (batchConfig) {
      config.value = {
        wordsPerChapter: batchConfig.wordsPerChapter,
        writingStyle: batchConfig.writingStyle,
        temperature: batchConfig.temperature ?? 0.5,
        deAIEnabled: batchConfig.deAIEnabled ?? true,
        useTaskBook: batchConfig.useTaskBook ?? true,
        useReview: batchConfig.useReview ?? true,
        useCommit: batchConfig.useCommit ?? true,
        requireBlockingPass: batchConfig.requireBlockingPass ?? true,
      };
    }

    const chaptersToWrite = targetChapters || getNextChapterIndex() + 1;

    progress.value = {
      writtenChapters: 0,
      writtenWords: 0,
      targetChapters: chaptersToWrite,
    };

    // 重置状态
    isWriting.value = true;
    isPaused.value = false;
    error.value = null;
    stepResults.value = [];
    blockingIssues.value = [];
    reviewResult.value = null;

    try {
      const orchestrator = getOrchestrator();
      orchestrator.addEventListener(handleOrchestratorEvent);

      await orchestrator.startBatchWriting(
        getStartChapterIndex(),
        getStartChapterIndex() + chaptersToWrite - 1
      );
    } catch (err) {
      error.value = err instanceof Error ? err.message : '批量写作失败';
    } finally {
      isWriting.value = false;
    }
  }

  function pauseWriting(): void {
    if (orchestratorRef.value) {
      orchestratorRef.value.pause();
    }
    isPaused.value = true;
  }

  function resumeWriting(): void {
    if (orchestratorRef.value) {
      orchestratorRef.value.resume();
    }
    isPaused.value = false;
  }

  function stopWriting(): void {
    if (orchestratorRef.value) {
      orchestratorRef.value.stop();
    }
    if (pipelineRef.value) {
      pipelineRef.value.stop();
    }
    isWriting.value = false;
    isPaused.value = false;
  }

  async function retryCurrentStep(): Promise<void> {
    if (blockingIssues.value.length > 0 || reviewResult.value) {
      blockingIssues.value = [];
      reviewResult.value = null;
    }

    if (currentChapterIndex.value >= 0) {
      await writeSingleChapter(currentChapterIndex.value);
    }
  }

  function skipBlockingIssues(): void {
    console.warn('[useBatchWriter] 用户选择跳过阻断问题');
    blockingIssues.value = [];
    reviewResult.value = null;

    if (pipelineRef.value) {
      pipelineRef.value.updateConfig({ enableReview: false });
    }
  }

  function onOrchestratorEvent(callback: (event: OrchestratorEvent) => void): () => void {
    const orchestrator = getOrchestrator();
    orchestrator.addEventListener(callback);
    return () => orchestrator.removeEventListener(callback);
  }

  function onPipelineEvent(callback: (event: PipelineEvent) => void): () => void {
    const pipeline = getPipeline();
    pipeline.addEventListener(callback);
    return () => pipeline.removeEventListener(callback);
  }

  // ============================================================
  // 私有方法
  // ============================================================

  function getNextChapterIndex(): number {
    const chapters = projectStore.sortedChapters;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].content || chapters[i].content.trim().length === 0) {
        return i;
      }
    }
    return chapters.length;
  }

  function getStartChapterIndex(): number {
    return getNextChapterIndex();
  }

  function buildPipelineContext(chapterIndex: number): Record<string, unknown> {
    const chapter = projectStore.sortedChapters[chapterIndex];
    if (!chapter) return {};

    const context = writingContext.buildContext({
      chapterId: chapter.id,
      targetWordCount: config.value.wordsPerChapter,
      writingStyle: config.value.writingStyle,
      includePreviousChapter: true,
    });

    currentContextRef.value = context;

    if (!context) return {};

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
      aiProvider: requireAIService(),
    };
  }

  async function writeSingleChapter(chapterIndex: number): Promise<boolean> {
    const pipeline = getPipeline();
    pipeline.addEventListener(handlePipelineEvent);

    try {
      currentChapterIndex.value = chapterIndex;
      currentChapterTitle.value = projectStore.sortedChapters[chapterIndex]?.title || '';

      const context = buildPipelineContext(chapterIndex);
      const result = await pipeline.execute(chapterIndex + 1, context);

      return result.status === 'completed';
    } catch (err) {
      error.value = err instanceof Error ? err.message : '章节写作失败';
      return false;
    }
  }

  // ============================================================
  // 计算属性
  // ============================================================

  const totalChapters = computed(() => projectStore.sortedChapters.length);

  const writtenChapters = computed(() =>
    projectStore.sortedChapters.filter(
      (chapter) => chapter.content && chapter.content.trim().length > 0
    ).length
  );

  const remainingChapters = computed(() =>
    totalChapters.value - writtenChapters.value
  );

  const writtenWordCount = computed(() =>
    projectStore.sortedChapters.reduce((total, chapter) => {
      return total + (chapter.wordCount || 0);
    }, 0)
  );

  // ============================================================
  // 返回
  // ============================================================

  return {
    isWriting: readonly(isWriting),
    isPaused: readonly(isPaused),
    error: readonly(error),
    currentChapterIndex: readonly(currentChapterIndex),
    currentChapterTitle: readonly(currentChapterTitle),
    pipelineStatus: readonly(pipelineStatus),
    currentStep: readonly(currentStep),
    stepResults: readonly(stepResults),
    blockingIssues: readonly(blockingIssues),
    reviewResult: readonly(reviewResult),
    totalChapters: totalChapters.value,
    writtenChapters: writtenChapters.value,
    remainingChapters: remainingChapters.value,
    writtenWordCount: writtenWordCount.value,
    progress: readonly(progress),
    config: readonly(config),
    startBatchWriting,
    pauseWriting,
    resumeWriting,
    stopWriting,
    retryCurrentStep,
    skipBlockingIssues,
    onOrchestratorEvent,
    onPipelineEvent,
  };
}
