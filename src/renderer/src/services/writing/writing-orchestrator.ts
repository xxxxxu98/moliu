/**
 * 写作编排器
 * 核心服务，管理写作队列，协调各模块工作
 */

import { ref, reactive, readonly } from 'vue';
import type {
  WritingTask,
  WritingQueue,
  WritingConfig,
  ChapterWritingContext,
  ChapterWritingStatus,
  WritingProgressCallback,
  WritingCompleteCallback,
  BatchWritingCompleteCallback,
  WritingStyle,
} from '@/types/writing';
import { PromptBuilder } from './prompt-builder';
import { ContextManager, createContextManager } from './context-manager';
import type { Character, WorldSchema, PlotNode } from '@/types/project';

/**
 * AI 客户端接口
 */
interface AIWritingClient {
  generateContent(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    onChunk?: (chunk: string) => void;
  }): Promise<string>;
  
  generateContentStream(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
    onChunk: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: string) => void;
  }): void;
}

/**
 * 章节信息
 */
interface ChapterInfo {
  id: string;
  title: string;
  outline?: string;
  content?: string;
  orderIndex: number;
  volumeId?: string;
  status: ChapterWritingStatus;
}

/**
 * 写作编排器返回类型
 */
export interface WritingOrchestratorReturn {
  // 状态
  queue: typeof writingQueue;
  isWriting: typeof isWriting;
  isPaused: typeof isPaused;
  currentChapterId: typeof currentChapterId;
  progress: typeof progress;
  error: typeof error;

  // 方法
  initializeQueue: (chapters: ChapterInfo[], startIndex?: number) => void;
  startWriting: (options?: {
    client: AIWritingClient;
    config?: Partial<WritingConfig>;
    onProgress?: WritingProgressCallback;
    onChapterComplete?: WritingCompleteCallback;
    onBatchComplete?: BatchWritingCompleteCallback;
  }) => Promise<void>;
  pauseWriting: () => void;
  resumeWriting: () => void;
  stopWriting: () => void;
  skipChapter: () => void;
  retryChapter: () => void;
  generateSingleChapter: (params: {
    client: AIWritingClient;
    chapter: ChapterInfo;
    config: WritingConfig;
    context: ChapterWritingContext;
    onProgress?: (progress: number) => void;
  }) => Promise<{ content: string; wordCount: number }>;
}

/**
 * 写作编排器状态
 */
const writingQueue = reactive<WritingQueue>({
  projectId: '',
  tasks: [],
  currentTaskIndex: -1,
  isPaused: false,
  isActive: false,
  totalWordCount: 0,
  targetWordCount: 0,
});

const isWriting = ref(false);
const isPaused = ref(false);
const currentChapterId = ref<string | null>(null);
const progress = reactive({
  completed: 0,
  total: 0,
  percentage: 0,
  currentChapterTitle: '',
});

const error = ref<string | null>(null);

/**
 * 重试配置
 */
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms

/**
 * 写作编排器
 */
export function useWritingOrchestrator(): WritingOrchestratorReturn {
  // 当前写作配置
  let currentConfig: WritingConfig | null = null;
  // 上下文管理器
  let contextManager: ContextManager | null = null;
  // AI 客户端
  let aiClient: AIWritingClient | null = null;
  // 进度回调
  let onProgressCallback: WritingProgressCallback | null = null;
  let onChapterCompleteCallback: WritingCompleteCallback | null = null;
  let onBatchCompleteCallback: BatchWritingCompleteCallback | null = null;
  // 停止标志
  let shouldStop = false;
  // 暂停标志
  let shouldPause = false;

  /**
   * 初始化写作队列
   */
  function initializeQueue(chapters: ChapterInfo[], startIndex: number = 0): void {
    writingQueue.tasks = chapters.map((chapter, index) => ({
      id: `task-${chapter.id}-${Date.now()}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      status: index < startIndex ? 'completed' as ChapterWritingStatus : 'idle' as ChapterWritingStatus,
      progress: index < startIndex ? 100 : 0,
      targetWordCount: currentConfig?.wordsPerChapter || 4000,
      generatedContent: '',
      retryCount: 0,
    }));

    writingQueue.currentTaskIndex = startIndex;
    writingQueue.isActive = false;
    writingQueue.totalWordCount = 0;

    updateProgress();
  }

  /**
   * 开始写作
   */
  async function startWriting(options: {
    client: AIWritingClient;
    config?: Partial<WritingConfig>;
    contextManager?: ContextManager;
    onProgress?: WritingProgressCallback;
    onChapterComplete?: WritingCompleteCallback;
    onBatchComplete?: BatchWritingCompleteCallback;
  }): Promise<void> {
    aiClient = options.client;
    currentConfig = {
      targetWordCount: 800000,
      wordsPerChapter: 4000,
      chapterCount: 200,
      writingStyle: 'concise',
      temperature: 0.5,
      maxTokensPerChapter: 4000,
      includePreviousChapter: true,
      includeCharacterProfiles: true,
      includeWorldSetting: true,
      includeForeshadows: true,
      ...options.config,
    };
    contextManager = options.contextManager || createContextManager(currentConfig);
    onProgressCallback = options.onProgress || null;
    onChapterCompleteCallback = options.onChapterComplete || null;
    onBatchCompleteCallback = options.onBatchComplete || null;

    shouldStop = false;
    shouldPause = false;
    isWriting.value = true;
    writingQueue.isActive = true;
    error.value = null;

    // 更新目标字数
    writingQueue.targetWordCount = currentConfig.chapterCount * currentConfig.wordsPerChapter;

    try {
      // 从当前任务开始写作
      while (writingQueue.currentTaskIndex < writingQueue.tasks.length) {
        // 检查停止标志
        if (shouldStop) {
          break;
        }

        // 检查暂停标志
        while (shouldPause && !shouldStop) {
          await sleep(500);
        }

        if (shouldStop) break;

        const task = writingQueue.tasks[writingQueue.currentTaskIndex];
        if (task.status === 'completed') {
          writingQueue.currentTaskIndex++;
          continue;
        }

        currentChapterId.value = task.chapterId;

        try {
          await executeTask(task);
        } catch (err) {
          console.error(`[WritingOrchestrator] Task ${task.id} failed:`, err);
          task.error = err instanceof Error ? err.message : 'Unknown error';
          task.status = 'failed';
        }

        writingQueue.currentTaskIndex++;
        updateProgress();
      }

      // 完成回调
      if (onBatchCompleteCallback && !shouldStop) {
        const failedChapters = writingQueue.tasks
          .filter(t => t.status === 'failed')
          .map(t => t.chapterTitle);

        onBatchCompleteCallback({
          success: failedChapters.length === 0,
          completedCount: writingQueue.tasks.filter(t => t.status === 'completed').length,
          totalCount: writingQueue.tasks.length,
          totalWordCount: writingQueue.totalWordCount,
          failedChapters,
        });
      }
    } finally {
      isWriting.value = false;
      writingQueue.isActive = false;
      currentChapterId.value = null;
      shouldStop = false;
      shouldPause = false;
    }
  }

  /**
   * 执行单个写作任务
   */
  async function executeTask(task: WritingTask): Promise<void> {
    task.status = 'writing';
    task.startedAt = new Date().toISOString();
    task.progress = 0;
    task.error = undefined;

    let generatedContent = '';
    let attemptCount = 0;

    while (attemptCount < MAX_RETRIES) {
      try {
        // 这里需要从外部传入上下文信息
        // 实际实现中，应该从项目数据中获取
        const chapterContext = buildChapterContextForTask(task);

        // 使用 PromptBuilder 构建 prompt
        const prompt = PromptBuilder.buildChapterContinuePrompt(
          chapterContext,
          task.generatedContent || '',
          currentConfig!.wordsPerChapter
        );

        // 生成内容
        if (aiClient!.generateContentStream) {
          // 流式生成
          await new Promise<void>((resolve, reject) => {
            let lastProgress = 0;

            aiClient!.generateContentStream!(prompt, {
              temperature: currentConfig!.temperature,
              maxTokens: currentConfig!.maxTokensPerChapter,
              onChunk: (chunk) => {
                generatedContent += chunk;
                task.generatedContent = generatedContent;
                task.progress = Math.min(
                  Math.floor((generatedContent.length / (currentConfig!.wordsPerChapter * 2)) * 100),
                  95
                );

                // 触发进度更新
                if (task.progress > lastProgress + 5) {
                  lastProgress = task.progress;
                  emitProgress(task, generatedContent.length);
                }
              },
              onComplete: () => {
                task.progress = 100;
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
                writingQueue.totalWordCount += generatedContent.length;
                resolve();
              },
              onError: (errMsg) => {
                reject(new Error(errMsg));
              },
            });
          });
        } else {
          // 非流式生成
          generatedContent = await aiClient!.generateContent(prompt, {
            temperature: currentConfig!.temperature,
            maxTokens: currentConfig!.maxTokensPerChapter,
          });

          task.generatedContent = generatedContent;
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.progress = 100;
          writingQueue.totalWordCount += generatedContent.length;
        }

        // 章节完成回调
        if (onChapterCompleteCallback) {
          onChapterCompleteCallback({
            success: true,
            chapterId: task.chapterId,
            content: generatedContent,
            wordCount: generatedContent.length,
          });
        }

        return;

      } catch (err) {
        attemptCount++;
        task.retryCount = attemptCount;

        if (attemptCount < MAX_RETRIES) {
          console.warn(`[WritingOrchestrator] Retry ${attemptCount}/${MAX_RETRIES} for task ${task.id}`);
          await sleep(RETRY_DELAY * attemptCount);
        } else {
          task.status = 'failed';
          task.error = err instanceof Error ? err.message : 'Max retries exceeded';
          throw err;
        }
      }
    }
  }

  /**
   * 为任务构建上下文
   */
  function buildChapterContextForTask(task: WritingTask): ChapterWritingContext {
    // 这里需要根据实际项目数据构建上下文
    // 简化实现，返回基本结构
    return {
      projectTitle: '',
      projectSynopsis: '',
      chapter: {
        id: task.chapterId,
        title: task.chapterTitle,
        orderIndex: writingQueue.tasks.indexOf(task),
        existingContent: task.generatedContent,
      },
      characters: [],
      charactersInScene: [],
      foreshadows: [],
      requirements: {
        targetWordCount: currentConfig?.wordsPerChapter || 4000,
        style: (currentConfig?.writingStyle as WritingStyle) || 'concise',
      },
    };
  }

  /**
   * 暂停写作
   */
  function pauseWriting(): void {
    shouldPause = true;
    isPaused.value = true;
    writingQueue.isPaused = true;

    // 标记当前任务为暂停状态
    const currentTask = writingQueue.tasks[writingQueue.currentTaskIndex];
    if (currentTask && currentTask.status === 'writing') {
      currentTask.status = 'paused';
    }
  }

  /**
   * 继续写作
   */
  function resumeWriting(): void {
    shouldPause = false;
    isPaused.value = false;
    writingQueue.isPaused = false;

    // 恢复当前任务状态
    const currentTask = writingQueue.tasks[writingQueue.currentTaskIndex];
    if (currentTask && currentTask.status === 'paused') {
      currentTask.status = 'idle';
    }
  }

  /**
   * 停止写作
   */
  function stopWriting(): void {
    shouldStop = true;
    shouldPause = false;
    isPaused.value = false;
    isWriting.value = false;
    writingQueue.isActive = false;

    // 标记当前任务为失败
    const currentTask = writingQueue.tasks[writingQueue.currentTaskIndex];
    if (currentTask && currentTask.status === 'writing') {
      currentTask.status = 'paused';
    }
  }

  /**
   * 跳过当前章节
   */
  function skipChapter(): void {
    const currentTask = writingQueue.tasks[writingQueue.currentTaskIndex];
    if (currentTask) {
      currentTask.status = 'paused';
      currentTask.error = 'Skipped by user';
    }
    writingQueue.currentTaskIndex++;
    updateProgress();
  }

  /**
   * 重试当前章节
   */
  function retryChapter(): void {
    const currentTask = writingQueue.tasks[writingQueue.currentTaskIndex];
    if (currentTask && currentTask.status === 'failed') {
      currentTask.status = 'idle';
      currentTask.error = undefined;
      currentTask.retryCount = 0;
      currentTask.generatedContent = '';
    }
  }

  /**
   * 生成单个章节
   */
  async function generateSingleChapter(params: {
    client: AIWritingClient;
    chapter: ChapterInfo;
    config: WritingConfig;
    context: ChapterWritingContext;
    onProgress?: (progress: number) => void;
  }): Promise<{ content: string; wordCount: number }> {
    const { client, chapter, config, context, onProgress } = params;

    const prompt = PromptBuilder.buildChapterContinuePrompt(
      context,
      chapter.content || '',
      config.wordsPerChapter
    );

    let content = '';

    if (client.generateContentStream) {
      await new Promise<void>((resolve, reject) => {
        client.generateContentStream(prompt, {
          temperature: config.temperature,
          maxTokens: config.maxTokensPerChapter,
          onChunk: (chunk) => {
            content += chunk;
            onProgress?.(Math.min(
              Math.floor((content.length / (config.wordsPerChapter * 2)) * 100),
              95
            ));
          },
          onComplete: () => {
            onProgress?.(100);
            resolve();
          },
          onError: (errMsg) => reject(new Error(errMsg)),
        });
      });
    } else {
      content = await client.generateContent(prompt, {
        temperature: config.temperature,
        maxTokens: config.maxTokensPerChapter,
      });
      onProgress?.(100);
    }

    return {
      content,
      wordCount: content.length,
    };
  }

  /**
   * 更新进度
   */
  function updateProgress(): void {
    const completed = writingQueue.tasks.filter(t => t.status === 'completed').length;
    const total = writingQueue.tasks.length;

    progress.completed = completed;
    progress.total = total;
    progress.percentage = total > 0 ? Math.floor((completed / total) * 100) : 0;

    if (writingQueue.currentTaskIndex >= 0 && writingQueue.currentTaskIndex < writingQueue.tasks.length) {
      progress.currentChapterTitle = writingQueue.tasks[writingQueue.currentTaskIndex].chapterTitle;
    }
  }

  /**
   * 触发进度回调
   */
  function emitProgress(task: WritingTask, generatedWordCount: number): void {
    if (onProgressCallback) {
      onProgressCallback({
        chapterId: task.chapterId,
        chapterTitle: task.chapterTitle,
        progress: task.progress,
        generatedWordCount,
        totalWordCount: task.targetWordCount,
        status: task.status,
      });
    }
  }

  /**
   * 睡眠工具函数
   */
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return {
    // 状态
    queue: readonly(writingQueue) as typeof writingQueue,
    isWriting: readonly(isWriting),
    isPaused: readonly(isPaused),
    currentChapterId: readonly(currentChapterId),
    progress: readonly(progress) as typeof progress,
    error: readonly(error),

    // 方法
    initializeQueue,
    startWriting,
    pauseWriting,
    resumeWriting,
    stopWriting,
    skipChapter,
    retryChapter,
    generateSingleChapter,
  };
}

/**
 * 单章写作编排器（简化版，用于单章续写）
 */
export function useSingleChapterWriter() {
  const isGenerating = ref(false);
  const progress = ref(0);
  const error = ref<string | null>(null);

  async function writeChapter(params: {
    client: AIWritingClient;
    context: ChapterWritingContext;
    targetWordCount?: number;
    onChunk?: (chunk: string) => void;
    onProgress?: (progress: number) => void;
  }): Promise<{ content: string; wordCount: number }> {
    const { client, context, targetWordCount = 3000, onChunk, onProgress } = params;

    isGenerating.value = true;
    progress.value = 0;
    error.value = null;

    let content = '';

    try {
      const prompt = PromptBuilder.buildChapterContinuePrompt(
        context,
        context.chapter.existingContent || '',
        targetWordCount
      );

      if (client.generateContentStream) {
        await new Promise<void>((resolve, reject) => {
          client.generateContentStream(prompt, {
            temperature: 0.5,
            maxTokens: Math.ceil(targetWordCount * 1.5),
            onChunk: (chunk) => {
              content += chunk;
              content = chunk;
              const currentProgress = Math.min(
                Math.floor((content.length / (targetWordCount * 2)) * 100),
                98
              );
              progress.value = currentProgress;
              onChunk?.(chunk);
              onProgress?.(currentProgress);
            },
            onComplete: () => {
              progress.value = 100;
              onProgress?.(100);
              resolve();
            },
            onError: (errMsg) => reject(new Error(errMsg)),
          });
        });
      } else {
        content = await client.generateContent(prompt, {
          temperature: 0.5,
          maxTokens: Math.ceil(targetWordCount * 1.5),
        });
        progress.value = 100;
        onProgress?.(100);
      }

      return {
        content,
        wordCount: content.length,
      };

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Generation failed';
      throw err;
    } finally {
      isGenerating.value = false;
    }
  }

  return {
    isGenerating: readonly(isGenerating),
    progress: readonly(progress),
    error: readonly(error),
    writeChapter,
  };
}
