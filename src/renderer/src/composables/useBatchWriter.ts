/**
 * 批量写作 Composable
 * 简化的连续续写逻辑 - 从第一个空章节开始，自动连续写
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Volume } from '@/types/project';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import {
  extractChapterMemory,
  buildCharacterStateTable,
  buildPlotProgressTable,
  safeExtractChapterMemory
} from '@/services/writing/extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from '@/services/writing/memory-manager';
import { ContextManager } from '@/services/writing/context-manager';
import { DeAIService } from '@/services/writing/de-ai-service';
import {
  createTaskBookBuilder,
  type WritingTaskBuilder
} from '@/services/writing/writing-task-builder';
import { reviewChapter } from '@/services/review/review-service';
import { createChapterCommit, extractChapterFacts } from '@/services/writing/chapter-commit';
import { createForeshadowTracker, analyzeForeshadows } from '@/services/writing/foreshadow-tracker';
import type { WritingTaskBook } from '@/types/writing-task';
import { WritingError, ErrorCode, getErrorMessage } from '@/types/errors';

export type WritingTarget = 'specific' | 'finish';

export interface UseBatchWriterReturn {
  // 状态
  isWriting: Ref<boolean>;
  isPaused: Ref<boolean>;
  currentChapterIndex: Ref<number>;
  currentChapterTitle: Ref<string>;
  error: Ref<string | null>;

  // 统计
  totalChapters: ComputedRef<number>;
  writtenChapters: ComputedRef<number>;
  remainingChapters: ComputedRef<number>;
  writtenWordCount: ComputedRef<number>;
  progress: Ref<{ writtenChapters: number; writtenWords: number; targetChapters: number }>;

  // 配置
  target: Ref<WritingTarget>;
  config: Ref<{
    wordsPerChapter: number;
    writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
    temperature: number;
    deAIEnabled: boolean;
    useTaskBook: boolean;
    useReview: boolean;
    useCommit: boolean;
  }>;

  // 方法
  startBatchWriting: (targetChapters?: number, batchConfig?: BatchConfig) => Promise<void>;
  pauseWriting: () => void;
  resumeWriting: () => void;
  stopWriting: () => void;
  getNextChapterIndex: () => number;
  getTotalChapters: () => number;
}

// 批量写作配置
export interface BatchConfig {
  wordsPerChapter: number;
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
  temperature?: number;
  deAIEnabled?: boolean; // 是否启用去 AI 味处理
  useTaskBook?: boolean; // 是否启用任务书机制
  useReview?: boolean; // 是否启用六维审查
  useCommit?: boolean; // 是否启用 Commit 机制
}

// ============================================
// 内部状态类型
// ============================================

interface InternalWritingState {
  shouldStop: boolean;
  shouldPause: boolean;
  abortController: AbortController | null;
  targetChapterCount: number;
}

// ============================================
// 公共逻辑提取
// ============================================

/**
 * 构建角色信息列表
 */
function buildCharactersInfo(project: any, maxCount: number = 5): any[] {
  return (project?.characters || []).slice(0, maxCount).map((char: any) => ({
    id: char.id,
    name: char.name,
    role: char.role || '角色',
    description: char.description || '',
    personality: char.profile?.personality || [],
    appearance: char.profile?.appearance,
    relationships: (char.profile?.relationships || []).map((r: any) => ({
      targetName: r.targetName,
      type: r.type,
      description: r.description || '',
    })),
  }));
}

/**
 * 构建活跃伏笔列表
 */
function buildActiveForeshadows(project: any, maxCount: number = 5): any[] {
  return (project?.foreshadows || [])
    .filter((f: any) => f.status !== 'resolved')
    .slice(0, maxCount)
    .map((f: any) => ({
      id: f.id,
      hint: f.hint,
      status: f.status,
      suggestedChapter: f.suggestedResolutionChapter,
    }));
}

/**
 * 从大纲中提取章节概要
 */
function extractChapterOutlineFromPlot(plotOutline: any[], chapterId: string): string {
  const chapter = plotOutline?.find((p: any) => p.chapterId === chapterId);
  return chapter?.description || '';
}

/**
 * 从章节大纲中提取章节类型
 */
function extractChapterTypeFromOutline(outline: string, orderIndex: number): string {
  if (!outline) return orderIndex === 0 ? 'world_intro' : 'normal';

  const lowerOutline = outline.toLowerCase();

  if (
    lowerOutline.includes('高潮') ||
    lowerOutline.includes('决战') ||
    lowerOutline.includes('对决') ||
    lowerOutline.includes('爆发')
  ) {
    return 'climax';
  }
  if (
    lowerOutline.includes('解决') ||
    lowerOutline.includes('结束') ||
    lowerOutline.includes('落幕') ||
    lowerOutline.includes('结局')
  ) {
    return 'resolution';
  }
  if (
    lowerOutline.includes('终章') ||
    lowerOutline.includes('尾声') ||
    lowerOutline.includes('最终') ||
    lowerOutline.includes('完结')
  ) {
    return 'ending';
  }

  return 'normal';
}

/**
 * 构建完整大纲字符串
 */
function buildFullOutlineString(projectStore: any): string | undefined {
  const plotOutline = projectStore.plotOutline;
  if (!plotOutline || plotOutline.length === 0) return undefined;

  const chapterNodes = plotOutline
    .filter((p: any) => p.type === 'chapter')
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  if (chapterNodes.length === 0) return undefined;

  return chapterNodes
    .map((node: any, index: number) => {
      const chapterNum = index + 1;
      const title = node.title || `第${chapterNum}章`;
      const description = node.description || '（暂无大纲）';
      const keyEvents =
        node.keyEvents?.length > 0 ? `\n关键事件：${node.keyEvents.join('、')}` : '';
      return `【第${chapterNum}章】${title}\n${description}${keyEvents}`;
    })
    .join('\n\n');
}

/**
 * 构建近期章节完整原文
 */
function buildRecentChaptersFullText(
  projectStore: any,
  currentIndex: number,
  recentChapterCount: number
): string {
  const chapters = projectStore.sortedChapters;
  const recentChapters = chapters
    .filter((c: any, i: number) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount))
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  if (recentChapters.length === 0) return '';

  const fullTextParts = recentChapters.map((c: any) => {
    return `【第${c.orderIndex + 1}章 · ${c.title}】

${c.content || '（本章暂无内容）'}`;
  });

  return fullTextParts.join('\n\n==========\n\n');
}

/**
 * 生成写作任务书
 */
async function generateTaskBook(
  project: any,
  chapterIndex: number,
  chapterOutline: string | undefined,
  writingStyle: string,
  targetWordCount: number
): Promise<WritingTaskBook | null> {
  try {
    const builder = createTaskBookBuilder({
      project,
      chapterIndex,
      chapterOutline,
      writingStyle: writingStyle as any,
      targetWordCount,
    });

    const taskBook = await builder.buildTaskBook();
    return taskBook;
  } catch (err) {
    console.error('[批量写作] 生成任务书失败:', err);
    return null;
  }
}

/**
 * 执行六维审查
 */
async function performReview(
  project: any,
  chapter: any,
  chapterIndex: number,
  previousChapter: any
): Promise<boolean> {
  try {
    const result = await reviewChapter({
      project,
      chapter,
      chapterIndex,
      previousChapter,
    });

    const hasBlocking = result.overall.blockingCount > 0;

    if (hasBlocking) {
      console.warn('[批量写作] 审查发现阻断问题:', result.overall.summary);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[批量写作] 审查失败:', err);
    return true; // 审查失败不影响写作流程
  }
}

/**
 * 执行 Commit 提交
 */
async function performCommit(
  project: any,
  chapter: any,
  chapterIndex: number
): Promise<boolean> {
  try {
    // 1. 提取事实
    const extraction = await extractChapterFacts(chapter, chapterIndex);

    // 2. 创建 Commit
    const commit = await createChapterCommit(
      { project, chapter, chapterIndex },
      {
        fulfillment: { coveredNodes: [], missedNodes: [] },
        disambiguation: [],
        extraction,
      },
      { autoProject: true }
    );

    return commit.status === 'accepted';
  } catch (err) {
    console.error('[批量写作] Commit 失败:', err);
    return true; // Commit 失败不影响写作流程
  }
}

/**
 * 提取并追踪伏笔
 */
async function trackForeshadows(content: string, chapterIndex: number): Promise<void> {
  try {
    analyzeForeshadows(content, chapterIndex + 1);
  } catch (err) {
    console.error('[批量写作] 伏笔追踪失败:', err);
  }
}

/**
 * 提取章节记忆
 */
async function extractMemoryAfterApply(
  projectStore: any,
  chapter: any,
  chapterIndex: number
): Promise<void> {
  try {
    if (projectStore.currentProject) {
      initializeMemoryManager(
        projectStore.currentProject.id,
        projectStore.currentProject.name,
        true
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const memory = await safeExtractChapterMemory(
      { ...chapter, content: chapter.content || '' },
      chapterIndex,
      {
        enableAIEnhancement: true,
        enableFileBackup: true,
        fallbackToPrevious: true,
      }
    );

    if (memory) {
      projectStore.addChapterMemory(memory);
      const manager = getMemoryManager();
      await manager.saveMemory(memory);
    }
  } catch (err) {
    console.error('[批量写作] 提取记忆失败:', err);
  }
}

/**
 * 提取前情摘要
 */
async function extractPreviousChapterSummary(
  contextManager: ContextManager,
  content: string,
  maxLength: number = 300
): Promise<{ summary: string; ending: string }> {
  if (!content) return { summary: '', ending: '' };

  const summary = contextManager.extractPreviousChapterSummary(content, maxLength);
  const ending = contextManager.extractChapterEnding(content);

  return { summary, ending };
}

/**
 * 去 AI 味并提取标题
 */
async function processDeAIAndTitle(
  content: string,
  deAIEnabled: boolean
): Promise<{ fixedContent: string; title: string | null; fixedCount: number }> {
  if (!content) {
    return { fixedContent: '', title: null, fixedCount: 0 };
  }

  let fixedContent = content;
  let fixedCount = 0;
  let title: string | null = null;

  if (deAIEnabled) {
    const deAIResult = await DeAIService.fix(fixedContent);
    if (deAIResult.fixedCount > 0) {
      fixedContent = deAIResult.content;
      fixedCount = deAIResult.fixedCount;
    }
    
    // 【修复】直接使用 fix() 返回的 title，因为 fix() 内部已经提取了标题
    if (deAIResult.title) {
      title = deAIResult.title;
    }
  } else {
    // 不去AI味时，直接提取标题
    const titleValidation = DeAIService.extractAndValidateTitle(fixedContent);
    if (titleValidation.titleValid) {
      title = titleValidation.title;
    }
  }

  return { fixedContent, title, fixedCount };
}

/**
 * 保存章节内容
 */
async function saveChapterContent(
  projectStore: any,
  chapter: any,
  content: string,
  title: string | null
): Promise<void> {
  const updateData: Record<string, any> = {
    content,
    wordCount: content.length,
    isGenerated: true,
    generatedAt: new Date().toISOString(),
  };

  if (title) {
    updateData.title = title;
  }

  await projectStore.updateChapter(chapter.id, updateData);
}

/**
 * 构建增强版 Prompt（包含任务书内容）
 */
function buildEnhancedOutline(taskBook: WritingTaskBook, baseOutline: string): string {
  const taskBookSection = `
=== 写作任务书 ===
【CBN】${taskBook.CBN}
【CPNs】${taskBook.CPNs.join(' / ')}
【CEN】${taskBook.CEN}
【必须覆盖】${taskBook.mustCover.join(' / ')}
【禁区】${taskBook.forbiddenZones.join(' / ')}
【风格指引】${taskBook.styleGuidance.pacingStrategy}
【结尾感觉】${taskBook.endingSensation}
【开放问题】${taskBook.openQuestion}
=== 任务书结束 ===

`;

  return taskBookSection + baseOutline;
}

// ============================================
// 主 Composable
// ============================================

export function useBatchWriter(): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  // ========== 内部状态（每个实例独立） ==========
  const internalState: InternalWritingState = {
    shouldStop: false,
    shouldPause: false,
    abortController: null,
    targetChapterCount: 10,
  };

  // ========== 响应式状态 ==========
  const isWriting = ref(false);
  const isPaused = ref(false);
  const currentChapterIndex = ref(-1);
  const currentChapterTitle = ref('');
  const error = ref<string | null>(null);

  // 写作目标
  const target = ref<WritingTarget>('specific');

  // 进度统计
  const progress = ref({
    writtenChapters: 0,
    writtenWords: 0,
    targetChapters: 0,
  });

  // 写作配置
  const config = ref({
    wordsPerChapter: 3000,
    writingStyle: 'concise' as 'concise' | 'elegant' | 'humorous' | 'ancient',
    temperature: 0.5,
    deAIEnabled: true,
    useTaskBook: false,
    useReview: false,
    useCommit: false,
  });

  // 上下文管理器
  const contextManager = new ContextManager();

  // ========== 计算属性 ==========

  /**
   * 获取总章节数
   */
  const totalChapters = computed(() => projectStore.sortedChapters.length);

  /**
   * 获取已写字数
   */
  const writtenWordCount = computed(() => {
    return projectStore.sortedChapters.reduce((total: number, chapter: any) => {
      return total + (chapter.wordCount || 0);
    }, 0);
  });

  /**
   * 获取已写章节数（内容非空的章节）
   */
  const writtenChapters = computed(() => {
    return projectStore.sortedChapters.filter(
      (c: any) => c.content && c.content.trim().length > 0
    ).length;
  });

  /**
   * 获取剩余章节数
   */
  const remainingChapters = computed(() => {
    return totalChapters.value - writtenChapters.value;
  });

  // ========== 内部方法 ==========

  /**
   * 获取下一个待写章节的索引
   */
  function getNextChapterIndex(): number {
    const chapters = projectStore.sortedChapters;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].content || chapters[i].content.trim().length === 0) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 获取总章节数
   */
  function getTotalChapters(): number {
    return projectStore.sortedChapters.length;
  }

  /**
   * 创建新章节
   */
  async function createNewChapter(): Promise<number> {
    const project = projectStore.currentProject;
    if (!project) return -1;

    let volumeId = projectStore.sortedVolumes[0]?.id;
    if (!volumeId) {
      const newVolume: Volume = {
        id: `vol-${Date.now()}`,
        name: '第一卷',
        orderIndex: 0,
      };
      projectStore.addVolume(newVolume);
      volumeId = newVolume.id;
    }

    if (!volumeId) return -1;

    const newChapter = await projectStore.createChapter(volumeId);
    if (newChapter) {
      return projectStore.sortedChapters.findIndex((c: any) => c.id === newChapter.id);
    }
    return -1;
  }

  /**
   * 执行单章写作（核心逻辑提取）
   */
  async function executeChapterWriting(
    chapterIndex: number,
    options: {
      useTaskBook: boolean;
      useReview: boolean;
      useCommit: boolean;
      deAIEnabled: boolean;
      writingStyle: string;
      wordsPerChapter: number;
    }
  ): Promise<boolean> {
    const client = requireAIService();
    const chapters = projectStore.sortedChapters;

    if (chapterIndex >= chapters.length) {
      return false;
    }

    const chapter = chapters[chapterIndex];

    // 跳过已有内容的章节
    if (chapter.content && chapter.content.trim().length > 0) {
      return true;
    }

    currentChapterIndex.value = chapterIndex;
    currentChapterTitle.value = chapter.title;

    const project = projectStore.currentProject!;
    const chapterOutline =
      chapter.plotSummary || extractChapterOutlineFromPlot(projectStore.plotOutline, chapter.id);
    const recentChapterCount = projectStore.memoryConfig?.shortTermChapterCount || 5;

    // ========== 步骤 1: 生成写作任务书 ==========
    let taskBook: WritingTaskBook | null = null;
    if (options.useTaskBook) {
      taskBook = await generateTaskBook(
        project,
        chapterIndex,
        chapterOutline,
        options.writingStyle,
        options.wordsPerChapter
      );
    }

    // ========== 步骤 2: 构建上下文 ==========
    const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
    const { summary: previousSummary, ending: previousChapterEnding } = prevChapter?.content
      ? await extractPreviousChapterSummary(contextManager, prevChapter.content, 300)
      : { summary: '', ending: '' };

    const characters = buildCharactersInfo(project);
    const activeForeshadows = buildActiveForeshadows(project);
    const fullOutline = buildFullOutlineString(projectStore);
    const recentFullText = buildRecentChaptersFullText(projectStore, chapterIndex, recentChapterCount);

    // 构建增强版大纲
    let enhancedOutline = chapterOutline || '';
    if (taskBook) {
      enhancedOutline = buildEnhancedOutline(taskBook, enhancedOutline);
    }

    // ========== 步骤 3: 调用 AI 写作 ==========
    let generatedContent = '';

    try {
      const aiParams = {
        project,
        currentChapterId: chapter.id,
        currentChapterIndex: chapterIndex,
        currentChapterTitle: chapter.title,
        currentChapterContent: '',
        currentChapterOutline: enhancedOutline || undefined,
        fullOutline,
        adjacentChaptersSummary: prevChapter
          ? {
              previousChapterTitle: prevChapter.title,
              previousChapterSummary: previousSummary,
              previousChapterEnding: previousChapterEnding,
              nextChapterTitle: undefined,
              nextChapterSummary: undefined,
            }
          : undefined,
        recentChaptersFullText: recentFullText,
        charactersInScene: characters,
        relatedForeshadows: activeForeshadows,
        writingStyle: options.writingStyle,
      };

      // 根据设置选择流式或非流式
      if (settingsStore.streamOutput && (client as any).continueWritingStream) {
        generatedContent = await new Promise<string>((resolve, reject) => {
          let content = '';
          internalState.abortController = new AbortController();

          (client as any).continueWritingStream(
            aiParams,
            'smartContinue',
            options.wordsPerChapter,
            (chunk: string) => {
              content += chunk;
            },
            async () => {
              resolve(content);
            },
            (errMsg: string) => {
              reject(new WritingError(errMsg, ErrorCode.AI_STREAM_FAILED));
            },
            internalState.abortController?.signal
          );
        });
      } else {
        const result = await (client as any).continueWriting(
          aiParams,
          'smartContinue',
          options.wordsPerChapter
        );
        if (result?.content) {
          generatedContent = result.content;
        }
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err, 'AI 写作失败');
      console.error('[批量写作] AI 写作失败:', err);
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new WritingError(errorMessage, ErrorCode.AI_GENERATION_FAILED, { cause } as any);
    }

    // ========== 步骤 4: 去 AI 味处理 ==========
    if (generatedContent) {
      const { fixedContent, title, fixedCount } = await processDeAIAndTitle(
        generatedContent,
        options.deAIEnabled
      );
      generatedContent = fixedContent;

      // ========== 步骤 5: 保存章节内容 ==========
      await saveChapterContent(projectStore, chapter, generatedContent, title);

      // ========== 步骤 6: 六维审查（可选） ==========
      if (options.useReview) {
        await performReview(
          project,
          { ...chapter, content: generatedContent },
          chapterIndex,
          prevChapter
        );
      }

      // ========== 步骤 7: 提取记忆 ==========
      await extractMemoryAfterApply(projectStore, chapter, chapterIndex + 1);

      // ========== 步骤 8: Commit 提交（可选） ==========
      if (options.useCommit) {
        await performCommit(project, { ...chapter, content: generatedContent }, chapterIndex);
      }

      // ========== 步骤 9: 伏笔追踪 ==========
      await trackForeshadows(generatedContent, chapterIndex);

      progress.value.writtenChapters++;
      progress.value.writtenWords += generatedContent.length;
    }

    return true;
  }

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
      config.value.useTaskBook = batchConfig.useTaskBook ?? false;
      config.value.useReview = batchConfig.useReview ?? false;
      config.value.useCommit = batchConfig.useCommit ?? false;
    }

    // 设置目标
    const chaptersToWrite = targetChapters || internalState.targetChapterCount;
    progress.value = {
      writtenChapters: 0,
      writtenWords: 0,
      targetChapters: chaptersToWrite,
    };

    // 重置状态
    isWriting.value = true;
    isPaused.value = false;
    internalState.shouldStop = false;
    internalState.shouldPause = false;
    error.value = null;

    try {
      let currentIndex = getNextChapterIndex();
      let writtenCount = 0;

      while (currentIndex >= 0 || writtenCount < chaptersToWrite) {
        // 检查停止
        if (internalState.shouldStop) {
          break;
        }

        // 检查暂停
        while (internalState.shouldPause && !internalState.shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (internalState.shouldStop) break;

        // 检查是否达到目标
        if (target.value === 'specific' && writtenCount >= chaptersToWrite) {
          break;
        }

        // 如果没有空章节，创建新的
        if (currentIndex < 0) {
          currentIndex = await createNewChapter();
          if (currentIndex < 0) {
            break;
          }
        }

        try {
          // 统一调用核心写作逻辑
          await executeChapterWriting(currentIndex, {
            useTaskBook: config.value.useTaskBook,
            useReview: config.value.useReview,
            useCommit: config.value.useCommit,
            deAIEnabled: config.value.deAIEnabled,
            writingStyle: config.value.writingStyle,
            wordsPerChapter: config.value.wordsPerChapter,
          });
          writtenCount++;
        } catch (err) {
          console.error('[批量写作] 章节写作失败:', err);
          // 单章失败，继续下一章
        }

        // 找下一个空章节
        currentIndex = getNextChapterIndex();
      }
    } finally {
      isWriting.value = false;
      isPaused.value = false;
      currentChapterIndex.value = -1;
      currentChapterTitle.value = '';
      internalState.abortController = null;
    }
  }

  /**
   * 暂停写作
   */
  function pauseWriting(): void {
    internalState.shouldPause = true;
    isPaused.value = true;
  }

  /**
   * 继续写作
   */
  function resumeWriting(): void {
    internalState.shouldPause = false;
    isPaused.value = false;
  }

  /**
   * 停止写作
   */
  function stopWriting(): void {
    internalState.shouldStop = true;
    internalState.shouldPause = false;
    isPaused.value = false;
    isWriting.value = false;

    if (internalState.abortController) {
      internalState.abortController.abort();
      internalState.abortController = null;
    }
  }

  return {
    isWriting,
    isPaused,
    currentChapterIndex,
    currentChapterTitle,
    error,
    totalChapters,
    writtenChapters,
    remainingChapters,
    writtenWordCount,
    progress,
    target,
    config,
    startBatchWriting,
    pauseWriting,
    resumeWriting,
    stopWriting,
    getNextChapterIndex,
    getTotalChapters,
  };
}
