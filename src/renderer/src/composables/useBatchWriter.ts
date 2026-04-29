/**
 * 批量写作 Composable
 * 封装批量写作的业务逻辑
 */

import { ref, reactive, computed } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import type {
  WritingTask,
  WritingQueue,
  WritingConfig,
  WritingStyle,
  ChapterWritingContext,
} from '@/types/writing';
import { PromptBuilder } from '@/services/writing/prompt-builder';
import { ContextManager } from '@/services/writing/context-manager';

/**
 * 写作范围类型
 */
export type WritingScope = 'all' | 'remaining' | 'specific';

/**
 * 写作范围配置
 */
export interface WritingScopeConfig {
  scope: WritingScope;
  specificCount?: number; // 当 scope 为 'specific' 时指定的数量
}

export interface UseBatchWriterReturn {
  // 状态
  isWriting: typeof isWriting;
  isPaused: typeof isPaused;
  currentChapterId: typeof currentChapterId;
  currentChapterTitle: typeof currentChapterTitle;
  progress: typeof progress;
  queue: typeof queue;
  error: typeof error;
  writingScope: typeof writingScope;

  // 计算属性
  completedCount: typeof completedCount;
  totalCount: typeof totalCount;
  pendingCount: typeof pendingCount;
  progressPercentage: typeof progressPercentage;
  config: typeof config;

  // 方法
  initializeQueue: () => void;
  setWritingScope: (scope: WritingScope, specificCount?: number) => void;
  startBatchWriting: (options?: Partial<WritingConfig>) => Promise<void>;
  pauseWriting: () => void;
  resumeWriting: () => void;
  stopWriting: () => void;
  skipChapter: () => void;
  retryFailedChapters: () => void;
  resetQueue: () => void;
}

const isWriting = ref(false);
const isPaused = ref(false);
const currentChapterId = ref<string | null>(null);
const currentChapterTitle = ref<string>('');

// 写作范围配置
const writingScope = reactive<WritingScopeConfig>({
  scope: 'remaining',
  specificCount: undefined,
});

const progress = reactive({
  completed: 0,
  total: 0,
  percentage: 0,
  currentWordCount: 0,
  totalWordCount: 0,
});

const queue = reactive<WritingQueue>({
  projectId: '',
  tasks: [],
  currentTaskIndex: -1,
  isPaused: false,
  isActive: false,
  totalWordCount: 0,
  targetWordCount: 0,
});

const error = ref<string | null>(null);

// 写作配置
const config = reactive<Partial<WritingConfig>>({
  wordsPerChapter: 3000,
  writingStyle: 'concise',
  temperature: 0.7,
});

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export function useBatchWriter(): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  let activeConfig: WritingConfig | null = null;
  let shouldStop = false;
  let shouldPause = false;
  let abortController: AbortController | null = null;

  /**
   * 已完成的任务数
   */
  const completedCount = computed(() => 
    queue.tasks.filter(t => t.status === 'completed').length
  );

  /**
   * 总任务数
   */
  const totalCount = computed(() => queue.tasks.length);

  /**
   * 待写的任务数（idle + failed）
   */
  const pendingCount = computed(() => 
    queue.tasks.filter(t => t.status === 'idle' || t.status === 'failed').length
  );

  /**
   * 根据写作范围获取实际要写的任务数
   */
  const tasksToWrite = computed(() => {
    switch (writingScope.scope) {
      case 'all':
        return queue.tasks.length;
      case 'remaining':
        return pendingCount.value;
      case 'specific':
        return Math.min(writingScope.specificCount || pendingCount.value, queue.tasks.length);
      default:
        return pendingCount.value;
    }
  });

  /**
   * 进度百分比（基于写作范围的目标）
   */
  const progressPercentage = computed(() => {
    const target = tasksToWrite.value;
    if (target === 0) return 100;
    // 进度 = 已完成数 / 目标数
    return Math.min(Math.floor((completedCount.value / target) * 100), 100);
  });

  /**
   * 设置写作范围
   */
  function setWritingScope(scope: WritingScope, specificCount?: number): void {
    writingScope.scope = scope;
    writingScope.specificCount = specificCount;
    
    // 根据范围更新任务状态
    updateTaskStatusByScope();
  }

  /**
   * 根据写作范围更新任务状态
   */
  function updateTaskStatusByScope(): void {
    queue.tasks.forEach(task => {
      // 如果任务已完成，保持不变
      if (task.status === 'completed') return;
      
      // 如果任务失败或待写，根据范围决定是否纳入写作
      switch (writingScope.scope) {
        case 'remaining':
          // 保持 idle/failed 状态，这些是需要写的
          break;
        case 'all':
          // 所有任务都要写，如果是 completed 则设为 idle 重新写
          if (task.status !== 'writing' && task.status !== 'paused') {
            task.status = 'idle';
            task.progress = 0;
            task.error = undefined;
          }
          break;
        case 'specific':
          // 只写前 N 个待写任务
          if (task.status !== 'writing' && task.status !== 'paused') {
            task.status = 'idle';
            task.progress = 0;
            task.error = undefined;
          }
          break;
      }
    });

    // 更新当前任务索引
    queue.currentTaskIndex = queue.tasks.findIndex(t => t.status === 'idle');
  }

  /**
   * 初始化写作队列
   */
  function initializeQueue(): void {
    const chapters = projectStore.sortedChapters;
    const project = projectStore.currentProject;

    if (!project || chapters.length === 0) {
      error.value = '没有可写的章节';
      queue.tasks = [];
      return;
    }

    queue.projectId = project.id;
    queue.tasks = chapters.map((chapter, index) => ({
      id: `task-${chapter.id}-${Date.now()}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      // 初始状态：待写
      status: 'idle' as const,
      progress: 0,
      targetWordCount: config.wordsPerChapter || 4000,
      generatedContent: '',
      retryCount: 0,
    }));

    // 找到第一个待写的任务
    queue.currentTaskIndex = queue.tasks.findIndex(t => t.status === 'idle');
    queue.isActive = false;
    queue.isPaused = false;
    queue.totalWordCount = 0;
    queue.targetWordCount = chapters.length * (config.wordsPerChapter || 4000);

    // 更新进度
    progress.completed = completedCount.value;
    progress.total = totalCount.value;
    progress.percentage = progressPercentage.value;

    // 根据范围更新状态
    updateTaskStatusByScope();
  }

  /**
   * 重置队列
   */
  function resetQueue(): void {
    queue.tasks.forEach(task => {
      if (task.status !== 'writing') {
        task.status = 'idle';
        task.progress = 0;
        task.error = undefined;
        task.generatedContent = '';
        task.retryCount = 0;
      }
    });

    queue.currentTaskIndex = queue.tasks.findIndex(t => t.status === 'idle');
    queue.totalWordCount = 0;
    queue.isActive = false;
    queue.isPaused = false;

    progress.completed = 0;
    progress.totalWordCount = 0;
    progress.percentage = 0;

    updateTaskStatusByScope();
  }

  /**
   * 获取 AI 客户端
   */
  function getAIClient() {
    return requireAIService();
  }

  /**
   * 构建章节上下文
   */
  function buildChapterContext(task: WritingTask, previousChapter?: { title: string; content: string }): ChapterWritingContext | null {
    const project = projectStore.currentProject;
    if (!project) return null;

    const chapter = projectStore.chapters.find(c => c.id === task.chapterId);
    if (!chapter) return null;

    const contextManager = new ContextManager();

    // 提取前情摘要
    let previousSummary = '';
    if (previousChapter?.content) {
      previousSummary = contextManager.extractPreviousChapterSummary(previousChapter.content, 300);
    }

    // 准备角色信息
    const characters: ChapterWritingContext['characters'] = (project.characters || []).map(char => ({
      id: char.id,
      name: char.name,
      role: char.role,
      description: char.description,
      personality: char.profile?.personality || [],
      appearance: char.profile?.appearance,
      speakingStyle: undefined,
      currentStatus: undefined,
      relationships: char.profile?.relationships?.map(r => ({
        targetName: r.targetName,
        type: r.type,
        description: r.description,
      })),
    }));

    // 获取活跃伏笔
    const activeForeshadows: ChapterWritingContext['foreshadows'] = (project.foreshadows || [])
      .filter(f => f.status !== 'resolved')
      .map(f => ({
        id: f.id,
        hint: f.hint,
        status: f.status,
        suggestedChapter: f.suggestedResolutionChapter,
      }));

    return {
      projectTitle: project.name,
      projectSynopsis: project.description || '',
      worldSetting: project.worldSchema ? {
        locations: project.worldSchema.locations || [],
        rules: project.worldSchema.rules || [],
        factions: project.worldSchema.factions || [],
      } : undefined,
      chapter: {
        id: chapter.id,
        title: chapter.title,
        orderIndex: projectStore.sortedChapters.findIndex(c => c.id === chapter.id),
        outline: (chapter as any).outline || '',
        existingContent: chapter.content || '',
      },
      previousChapter: previousChapter ? {
        title: previousChapter.title,
        summary: previousSummary,
        ending: contextManager.extractChapterEnding(previousChapter.content),
      } : undefined,
      characters,
      charactersInScene: (project.characters || []).map(c => c.id),
      foreshadows: activeForeshadows,
      requirements: {
        targetWordCount: activeConfig?.wordsPerChapter || 4000,
        style: (activeConfig?.writingStyle as WritingStyle) || 'concise',
        customStyle: activeConfig?.customStyleDescription,
      },
    };
  }

  /**
   * 执行单个写作任务
   */
  async function executeTask(task: WritingTask): Promise<void> {
    const client = getAIClient();

    // 获取上一章信息
    const taskIndex = queue.tasks.findIndex(t => t.id === task.id);
    const prevTask = taskIndex > 0 ? queue.tasks[taskIndex - 1] : null;
    let previousChapter: { title: string; content: string } | undefined;

    if (prevTask) {
      const prevChapter = projectStore.chapters.find(c => c.id === prevTask.chapterId);
      if (prevChapter?.content) {
        previousChapter = {
          title: prevChapter.title,
          content: prevChapter.content,
        };
      }
    }

    const context = buildChapterContext(task, previousChapter);
    if (!context) {
      throw new Error('无法构建章节上下文');
    }

    const prompt = PromptBuilder.buildChapterContinuePrompt(
      context,
      context.chapter.existingContent || '',
      activeConfig?.wordsPerChapter || 4000
    );

    task.status = 'writing';
    task.startedAt = new Date().toISOString();

    let generatedContent = '';

    // 检查是否支持流式输出
    const targetWordCount = activeConfig?.wordsPerChapter || 4000;
    if ((client as any).continueWritingStream) {
      await new Promise<void>((resolve, reject) => {
        let lastProgress = 0;

        (client as any).continueWritingStream(
          {
            project: projectStore.currentProject,
            currentChapterId: context.chapter.id,
            currentChapterContent: context.chapter.existingContent || '',
            adjacentChaptersSummary: context.previousChapter ? {
              previousChapterTitle: context.previousChapter.title,
              previousChapterSummary: context.previousChapter.summary,
              nextChapterTitle: undefined,
              nextChapterSummary: undefined,
            } : undefined,
            charactersInScene: context.characters,
            relatedForeshadows: context.foreshadows,
          },
          'smartContinue',
          targetWordCount,
          (chunk: string) => {
            generatedContent += chunk;
            task.generatedContent = generatedContent;
            const currentProgress = Math.min(
              Math.floor((generatedContent.length / (targetWordCount * 1.5)) * 100),
              95
            );
            if (currentProgress > lastProgress) {
              lastProgress = currentProgress;
              task.progress = currentProgress;
              progress.currentWordCount += chunk.length;
            }
          },
          () => {
            task.progress = 100;
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
            queue.totalWordCount += generatedContent.length;
            progress.totalWordCount = queue.totalWordCount;
            resolve();
          },
          (errMsg: string) => {
            reject(new Error(errMsg));
          }
        );

        // 处理中止
        abortController = new AbortController();
      });
    } else {
      // 非流式模式
      const result = await (client as any).continueWriting(
        {
          project: projectStore.currentProject,
          currentChapterId: context.chapter.id,
          currentChapterContent: context.chapter.existingContent || '',
          adjacentChaptersSummary: context.previousChapter ? {
            previousChapterTitle: context.previousChapter.title,
            previousChapterSummary: context.previousChapter.summary,
            nextChapterTitle: undefined,
            nextChapterSummary: undefined,
          } : undefined,
          charactersInScene: context.characters,
          relatedForeshadows: context.foreshadows,
        },
        'smartContinue',
        targetWordCount
      );

      if (result?.content) {
        generatedContent = result.content;
        task.generatedContent = generatedContent;
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.progress = 100;
        queue.totalWordCount += generatedContent.length;
        progress.totalWordCount = queue.totalWordCount;
      }
    }

    // 保存到项目
    if (generatedContent) {
      const chapter = projectStore.chapters.find(c => c.id === task.chapterId);
      const currentContent = chapter?.content || '';
      const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
      const newContent = currentContent + separator + generatedContent;

      await projectStore.updateChapter(task.chapterId, {
        content: newContent,
        wordCount: newContent.length,
        isGenerated: true,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * 开始批量写作
   */
  async function startBatchWriting(options?: Partial<WritingConfig>): Promise<void> {
    if (isWriting.value) {
      error.value = '正在写作中';
      return;
    }

    // 如果是特定数量模式，先更新范围
    if (writingScope.scope === 'specific') {
      // 限制只写前 N 个任务
      let count = 0;
      queue.tasks.forEach(task => {
        if (task.status === 'idle' || task.status === 'failed') {
          if (count < (writingScope.specificCount || 0)) {
            count++;
          } else {
            // 超出数量的设为 paused，不纳入本次写作
            task.status = 'paused';
          }
        }
      });
    }

    activeConfig = {
      targetWordCount: options?.targetWordCount || 800000,
      wordsPerChapter: options?.wordsPerChapter || config.wordsPerChapter || 4000,
      chapterCount: options?.chapterCount || 200,
      writingStyle: options?.writingStyle || config.writingStyle || 'concise',
      temperature: options?.temperature || config.temperature || 0.7,
      maxTokensPerChapter: options?.maxTokensPerChapter || 4000,
      includePreviousChapter: options?.includePreviousChapter ?? true,
      includeCharacterProfiles: options?.includeCharacterProfiles ?? true,
      includeWorldSetting: options?.includeWorldSetting ?? true,
      includeForeshadows: options?.includeForeshadows ?? true,
      ...options,
    };

    // 更新配置
    Object.assign(config, {
      wordsPerChapter: activeConfig.wordsPerChapter,
      writingStyle: activeConfig.writingStyle,
      temperature: activeConfig.temperature,
    });

    // 找到下一个待写的任务
    queue.currentTaskIndex = queue.tasks.findIndex(t => t.status === 'idle');

    if (queue.currentTaskIndex === -1) {
      error.value = '没有待写的章节';
      return;
    }

    shouldStop = false;
    shouldPause = false;
    isWriting.value = true;
    isPaused.value = false;
    queue.isActive = true;
    error.value = null;

    try {
      // 从当前任务开始，逐个处理
      while (queue.currentTaskIndex < queue.tasks.length) {
        // 检查停止信号
        if (shouldStop) {
          break;
        }

        // 检查暂停信号
        while (shouldPause && !shouldStop) {
          await sleep(500);
        }

        if (shouldStop) break;

        const task = queue.tasks[queue.currentTaskIndex];

        // 跳过已完成的任务
        if (!task || task.status === 'completed') {
          queue.currentTaskIndex++;
          continue;
        }

        // 跳过非待写状态的任务（已暂停或已失败且不需要重试）
        if (task.status !== 'idle' && task.status !== 'failed') {
          queue.currentTaskIndex++;
          continue;
        }

        currentChapterId.value = task.chapterId;
        currentChapterTitle.value = task.chapterTitle;
        progress.percentage = progressPercentage.value;

        try {
          await executeTask(task);
        } catch (err) {
          console.error(`[BatchWriter] Task ${task.id} failed:`, err);
          task.error = err instanceof Error ? err.message : 'Unknown error';
          task.status = 'failed';

          // 自动重试
          if (task.retryCount < MAX_RETRIES) {
            task.retryCount++;
            await sleep(RETRY_DELAY * task.retryCount);
            continue;
          }
        }

        queue.currentTaskIndex++;
        progress.completed = completedCount.value;
        progress.percentage = progressPercentage.value;
      }
    } finally {
      isWriting.value = false;
      queue.isActive = false;
      currentChapterId.value = null;
      currentChapterTitle.value = '';
      shouldStop = false;
      shouldPause = false;
    }
  }

  /**
   * 暂停写作
   */
  function pauseWriting(): void {
    shouldPause = true;
    isPaused.value = true;
    queue.isPaused = true;

    const currentTask = queue.tasks[queue.currentTaskIndex];
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
    queue.isPaused = false;

    const currentTask = queue.tasks[queue.currentTaskIndex];
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
    queue.isActive = false;

    const currentTask = queue.tasks[queue.currentTaskIndex];
    if (currentTask && currentTask.status === 'writing') {
      currentTask.status = 'paused';
    }

    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  /**
   * 跳过当前章节
   */
  function skipChapter(): void {
    const currentTask = queue.tasks[queue.currentTaskIndex];
    if (currentTask) {
      currentTask.status = 'paused';
      currentTask.error = 'Skipped by user';
    }
    queue.currentTaskIndex++;
    progress.completed = completedCount.value;
    progress.percentage = progressPercentage.value;
  }

  /**
   * 重试失败的章节
   */
  function retryFailedChapters(): void {
    queue.tasks.forEach(task => {
      if (task.status === 'failed') {
        task.status = 'idle';
        task.error = undefined;
        task.retryCount = 0;
        task.progress = 0;
        task.generatedContent = '';
      }
    });

    // 从第一个失败的任务开始
    const firstFailedIndex = queue.tasks.findIndex(t => t.status === 'idle');
    if (firstFailedIndex !== -1) {
      queue.currentTaskIndex = firstFailedIndex;
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return {
    // 状态
    isWriting,
    isPaused,
    currentChapterId,
    currentChapterTitle,
    progress,
    queue,
    error,
    writingScope,

    // 计算属性
    completedCount,
    totalCount,
    pendingCount,
    progressPercentage,
    config,

    // 方法
    initializeQueue,
    setWritingScope,
    startBatchWriting,
    pauseWriting,
    resumeWriting,
    stopWriting,
    skipChapter,
    retryFailedChapters,
    resetQueue,
  };
}
