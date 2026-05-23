/**
 * 批量写作 Composable - Pipeline 版本
 * 
 * 基于 webnovel-writer 架构重构
 * 使用 WritingOrchestrator 进行批量写作管理
 */

import { ref, computed, readonly, watch } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { WritingOrchestrator } from '@/services/writing/orchestrator/WritingOrchestrator';
import { WritingPipeline } from '@/services/writing/orchestrator/WritingPipeline';
import { useWritingContext } from './useWritingContext';
import type { PipelineConfig, PipelineResult, PipelineEvent, WritingStep, PipelineStatus } from '@/services/writing/orchestrator/types';
import type { OrchestratorConfig, OrchestratorEvent, WritingSession } from '@/services/writing/orchestrator/WritingOrchestrator';
import type { WritingContext } from './useWritingContext';

// ============================================
// 接口定义
// ============================================

export interface UseBatchWriterOptions {
  /** 编排器配置 */
  orchestratorConfig?: Partial<OrchestratorConfig>;
  /** 流水线配置 */
  pipelineConfig?: Partial<PipelineConfig>;
  /** 目标字数 */
  targetWordCount?: number;
  /** 写作风格 */
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
}

export interface UseBatchWriterReturn {
  // 状态
  isWriting: ReturnType<typeof readonly<typeof isWriting>>;
  isPaused: ReturnType<typeof readonly<typeof isPaused>>;
  error: ReturnType<typeof readonly<typeof error>>;

  // 章节进度
  currentChapterIndex: ReturnType<typeof readonly<typeof currentChapterIndex>>;
  currentChapterTitle: ReturnType<typeof readonly<typeof currentChapterTitle>>;
  
  // 流水线状态
  pipelineStatus: ReturnType<typeof readonly<typeof pipelineStatus>>;
  currentStep: ReturnType<typeof readonly<typeof currentStep>>;
  stepResults: ReturnType<typeof readonly<typeof stepResults>>;
  
  // 审查状态
  blockingIssues: ReturnType<typeof readonly<typeof blockingIssues>>;
  reviewResult: ReturnType<typeof readonly<typeof reviewResult>>;

  // 统计
  totalChapters: ReturnType<typeof totalChapters>>;
  writtenChapters: ReturnType<typeof writtenChapters>>;
  remainingChapters: ReturnType<typeof remainingChapters>>;
  writtenWordCount: ReturnType<typeof writtenWordCount>>;
  progress: ReturnType<typeof readonly<typeof progress>>;

  // 配置
  config: ReturnType<typeof readonly<typeof config>>;

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

// 批量写作配置
export interface BatchConfig {
  wordsPerChapter: number;
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
  temperature?: number;
  deAIEnabled?: boolean;
  useTaskBook?: boolean;
  useReview?: boolean;
  useCommit?: boolean;
  requireBlockingPass?: boolean;
}

// ============================================
// 内部状态
// ============================================

const isWriting = ref(false);
const isPaused = ref(false);
const error = ref<string | null>(null);

const currentChapterIndex = ref(-1);
const currentChapterTitle = ref('');

const pipelineStatus = ref<PipelineStatus>('idle');
const currentStep = ref<WritingStep | null>(null);
const stepResults = ref<any[]>([]);

const blockingIssues = ref<any[]>([]);
const reviewResult = ref<any | null>(null);

const progress = ref({
  writtenChapters: 0,
  writtenWords: 0,
  targetChapters: 0,
});

const config = ref({
  wordsPerChapter: 3000,
  writingStyle: 'concise' as 'concise' | 'elegant' | 'humorous' | 'ancient',
  temperature: 0.5,
  deAIEnabled: true,
  useTaskBook: true,
  useReview: true,
  useCommit: true,
  requireBlockingPass: true,
});

// Orchestrator 和 Pipeline 实例
let orchestrator: WritingOrchestrator | null = null;
let pipeline: WritingPipeline | null = null;

// 当前上下文
let currentContext: WritingContext | null = null;

// ============================================
// Composable 实现
// ============================================

export function useBatchWriter(options: UseBatchWriterOptions = {}): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();
  const writingContext = useWritingContext();

  // 初始化 Orchestrator
  if (!orchestrator) {
    orchestrator = new WritingOrchestrator(options.orchestratorConfig);
    orchestrator.addEventListener(handleOrchestratorEvent);
  }
  
  // 初始化 Pipeline
  if (!pipeline) {
    pipeline = new WritingPipeline(options.pipelineConfig);
    pipeline.addEventListener(handlePipelineEvent);
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
        currentStep.value = event.step || null;
        break;
        
      case 'step_complete':
        stepResults.value.push(event.data);
        
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
  
  /**
   * 开始批量写作
   */
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
      config.value.wordsPerChapter = batchConfig.wordsPerChapter;
      config.value.writingStyle = batchConfig.writingStyle;
      config.value.temperature = batchConfig.temperature ?? 0.5;
      config.value.deAIEnabled = batchConfig.deAIEnabled ?? true;
      config.value.useTaskBook = batchConfig.useTaskBook ?? true;
      config.value.useReview = batchConfig.useReview ?? true;
      config.value.useCommit = batchConfig.useCommit ?? true;
      config.value.requireBlockingPass = batchConfig.requireBlockingPass ?? true;
    }

    // 确定目标章节数
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
      // 使用 Orchestrator 开始批量写作
      const result = await orchestrator!.executeBatch(
        getStartChapterIndex(),
        getStartChapterIndex() + chaptersToWrite - 1,
        buildPipelineContext
      );

      if (!result.success) {
        error.value = result.error || '批量写作失败';
      }

    } catch (err) {
      error.value = err instanceof Error ? err.message : '批量写作失败';
    } finally {
      isWriting.value = false;
    }
  }

  /**
   * 暂停写作
   */
  function pauseWriting(): void {
    if (orchestrator) {
      orchestrator.pauseSession();
    }
    isPaused.value = true;
  }

  /**
   * 恢复写作
   */
  function resumeWriting(): void {
    if (orchestrator) {
      orchestrator.resumeSession();
    }
    isPaused.value = false;
  }

  /**
   * 停止写作
   */
  function stopWriting(): void {
    if (orchestrator) {
      orchestrator.stopSession();
    }
    if (pipeline) {
      pipeline.stop();
    }
    isWriting.value = false;
    isPaused.value = false;
  }

  /**
   * 重试当前步骤
   */
  async function retryCurrentStep(): Promise<void> {
    if (blockingIssues.value.length > 0 || reviewResult.value) {
      blockingIssues.value = [];
      reviewResult.value = null;
    }
    
    // 重试当前章节
    if (currentChapterIndex.value >= 0) {
      await writeSingleChapter(currentChapterIndex.value);
    }
  }

  /**
   * 跳过阻断问题
   */
  function skipBlockingIssues(): void {
    console.warn('[useBatchWriter] 用户选择跳过阻断问题');
    blockingIssues.value = [];
    reviewResult.value = null;
    
    if (pipeline) {
      pipeline.updateConfig({ enableReview: false });
    }
  }

  /**
   * 订阅 Orchestrator 事件
   */
  function onOrchestratorEvent(callback: (event: OrchestratorEvent) => void): () => void {
    if (orchestrator) {
      orchestrator.addEventListener(callback);
      return () => orchestrator?.removeEventListener(callback);
    }
    return () => {};
  }

  /**
   * 订阅 Pipeline 事件
   */
  function onPipelineEvent(callback: (event: PipelineEvent) => void): () => void {
    if (pipeline) {
      pipeline.addEventListener(callback);
      return () => pipeline?.removeEventListener(callback);
    }
    return () => {};
  }

  // ============================================================
  // 私有方法
  // ============================================================
  
  /**
   * 获取下一个待写章节索引
   */
  function getNextChapterIndex(): number {
    const chapters = projectStore.sortedChapters;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].content || chapters[i].content.trim().length === 0) {
        return i;
      }
    }
    return chapters.length;
  }
  
  /**
   * 获取起始章节索引
   */
  function getStartChapterIndex(): number {
    const chapters = projectStore.sortedChapters;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].content || chapters[i].content.trim().length === 0) {
        return i;
      }
    }
    return chapters.length;
  }
  
  /**
   * 构建流水线上下文
   */
  function buildPipelineContext(chapterIndex: number): any {
    const context = writingContext.buildContext({
      chapterId: projectStore.sortedChapters[chapterIndex]?.id,
      targetWordCount: config.value.wordsPerChapter,
      writingStyle: config.value.writingStyle,
      includePreviousChapter: true,
    });
    
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
  
  /**
   * 写单个章节
   */
  async function writeSingleChapter(chapterIndex: number): Promise<boolean> {
    try {
      currentChapterIndex.value = chapterIndex;
      currentChapterTitle.value = projectStore.sortedChapters[chapterIndex]?.title || '';
      
      const context = buildPipelineContext(chapterIndex);
      
      const result = await pipeline!.execute(chapterIndex + 1, context);
      
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
  
  const writtenChapters = computed(() => {
    return projectStore.sortedChapters.filter(
      (c: any) => c.content && c.content.trim().length > 0
    ).length;
  });
  
  const remainingChapters = computed(() => {
    return totalChapters.value - writtenChapters.value;
  });
  
  const writtenWordCount = computed(() => {
    return projectStore.sortedChapters.reduce((total: number, chapter: any) => {
      return total + (chapter.wordCount || 0);
    }, 0);
  });

  // ============================================================
  // 返回接口
  // ============================================================

  return {
    // 状态
    isWriting: readonly(isWriting),
    isPaused: readonly(isPaused),
    error: readonly(error),

    // 章节进度
    currentChapterIndex: readonly(currentChapterIndex),
    currentChapterTitle: readonly(currentChapterTitle),
    
    // 流水线状态
    pipelineStatus: readonly(pipelineStatus),
    currentStep: readonly(currentStep),
    stepResults: readonly(stepResults),
    
    // 审查状态
    blockingIssues: readonly(blockingIssues),
    reviewResult: readonly(reviewResult),

    // 统计
    totalChapters,
    writtenChapters,
    remainingChapters,
    writtenWordCount,
    progress: readonly(progress),

    // 配置
    config: readonly(config),

    // 方法
    startBatchWriting,
    pauseWriting,
    resumeWriting,
    stopWriting,
    retryCurrentStep,
    skipBlockingIssues,
    
    // 事件订阅
    onOrchestratorEvent,
    onPipelineEvent,
  };
}

// ============================================================
// 向后兼容：保留原 useBatchWriter 的核心逻辑
// ============================================================

export { useBatchWriter as createBatchWriter };
