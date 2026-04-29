/**
 * 批量写作 Composable
 * 封装批量写作的业务逻辑
 */

import { ref, reactive, computed, readonly } from 'vue';
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

export interface UseBatchWriterReturn {
  // 状态
  isWriting: typeof isWriting;
  isPaused: typeof isPaused;
  currentChapterId: typeof currentChapterId;
  currentChapterTitle: typeof currentChapterTitle;
  progress: typeof progress;
  queue: typeof queue;
  error: typeof error;

  // 计算属性
  completedCount: typeof completedCount;
  totalCount: typeof totalCount;
  progressPercentage: typeof progressPercentage;

  // 方法
  initializeQueue: () => void;
  startBatchWriting: (options?: Partial<WritingConfig>) => Promise<void>;
  pauseWriting: () => void;
  resumeWriting: () => void;
  stopWriting: () => void;
  skipChapter: () => void;
  retryFailedChapters: () => void;
}

const isWriting = ref(false);
const isPaused = ref(false);
const currentChapterId = ref<string | null>(null);
const currentChapterTitle = ref<string>('');

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

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export function useBatchWriter(): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  let config: WritingConfig | null = null;
  let shouldStop = false;
  let shouldPause = false;
  let abortController: AbortController | null = null;

  const completedCount = computed(() => 
    queue.tasks.filter(t => t.status === 'completed').length
  );

  const totalCount = computed(() => queue.tasks.length);

  const progressPercentage = computed(() => {
    if (totalCount.value === 0) return 0;
    return Math.floor((completedCount.value / totalCount.value) * 100);
  });

  /**
   * 初始化写作队列
   */
  function initializeQueue(): void {
    const chapters = projectStore.sortedChapters;
    const project = projectStore.currentProject;

    if (!project || chapters.length === 0) {
      error.value = '没有可写的章节';
      return;
    }

    queue.projectId = project.id;
    queue.tasks = chapters.map((chapter, index) => ({
      id: `task-${chapter.id}-${Date.now()}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      status: chapter.content && chapter.content.length > 0 ? 'completed' as const : 'idle' as const,
      progress: chapter.content && chapter.content.length > 0 ? 100 : 0,
      targetWordCount: config?.wordsPerChapter || 4000,
      generatedContent: '',
      retryCount: 0,
    }));

    queue.currentTaskIndex = queue.tasks.findIndex(t => t.status !== 'completed');
    queue.isActive = false;
    queue.isPaused = false;
    queue.totalWordCount = 0;
    queue.targetWordCount = config?.targetWordCount || (chapters.length * (config?.wordsPerChapter || 4000));

    // 更新进度
    progress.completed = completedCount.value;
    progress.total = totalCount.value;
    progress.percentage = progressPercentage.value;
  }

  /**
   * 获取 AI 客户端
   * 使用统一的 AI Provider 获取逻辑
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
        targetWordCount: config?.wordsPerChapter || 4000,
        style: (config?.writingStyle as WritingStyle) || 'concise',
        customStyle: config?.customStyleDescription,
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
      config?.wordsPerChapter || 4000
    );

    task.status = 'writing';
    task.startedAt = new Date().toISOString();

    let generatedContent = '';

    // 检查是否支持流式输出
    const targetWordCount = config?.wordsPerChapter || 4000;
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

    config = {
      targetWordCount: options?.targetWordCount || 800000,
      wordsPerChapter: options?.wordsPerChapter || 4000,
      chapterCount: options?.chapterCount || 200,
      writingStyle: options?.writingStyle || 'concise',
      temperature: options?.temperature || 0.7,
      maxTokensPerChapter: options?.maxTokensPerChapter || 4000,
      includePreviousChapter: options?.includePreviousChapter ?? true,
      includeCharacterProfiles: options?.includeCharacterProfiles ?? true,
      includeWorldSetting: options?.includeWorldSetting ?? true,
      includeForeshadows: options?.includeForeshadows ?? true,
      ...options,
    };

    // 初始化队列
    initializeQueue();

    if (queue.tasks.length === 0) {
      return;
    }

    shouldStop = false;
    shouldPause = false;
    isWriting.value = true;
    isPaused.value = false;
    queue.isActive = true;
    error.value = null;

    try {
      // 从当前任务开始
      while (queue.currentTaskIndex < queue.tasks.length) {
        // 检查停止
        if (shouldStop) {
          break;
        }

        // 检查暂停
        while (shouldPause && !shouldStop) {
          await sleep(500);
        }

        if (shouldStop) break;

        const task = queue.tasks[queue.currentTaskIndex];

        // 跳过已完成的或无效的任务
        if (!task || task.status === 'completed') {
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
    if (firstFailedIndex !== -1 && firstFailedIndex < queue.currentTaskIndex) {
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

    // 计算属性
    completedCount,
    totalCount,
    progressPercentage,

    // 方法
    initializeQueue,
    startBatchWriting,
    pauseWriting,
    resumeWriting,
    stopWriting,
    skipChapter,
    retryFailedChapters,
  };
}
