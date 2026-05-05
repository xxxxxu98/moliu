/**
 * 批量写作 Composable
 * 简化的连续续写逻辑 - 从第一个空章节开始，自动连续写
 */

import { ref, computed } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { extractChapterMemory, buildCharacterStateTable, buildPlotProgressTable, safeExtractChapterMemory } from '@/services/writing/extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from '@/services/writing/memory-manager';
import { ContextManager } from '@/services/writing/context-manager';
import { DeAIService } from '@/services/writing/de-ai-service';

export type WritingTarget = 'specific' | 'finish';

export interface UseBatchWriterReturn {
  // 状态
  isWriting: typeof isWriting;
  isPaused: typeof isPaused;
  currentChapterIndex: typeof currentChapterIndex;
  currentChapterTitle: typeof currentChapterTitle;
  error: typeof error;

  // 统计
  totalChapters: typeof totalChapters;
  writtenChapters: typeof writtenChapters;
  remainingChapters: typeof remainingChapters;
  writtenWordCount: typeof writtenWordCount;
  progress: typeof progress;

  // 配置
  target: typeof target;
  config: typeof config;

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
  deAIEnabled?: boolean; // 是否启用去 AI 味处理
}

const isWriting = ref(false);
const isPaused = ref(false);
const currentChapterIndex = ref(-1);
const currentChapterTitle = ref('');
const error = ref<string | null>(null);

// 写作目标
const target = ref<WritingTarget>('specific');
const targetChapterCount = ref(10); // 目标写作数量

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
  temperature: 0.5, // 降低温度，减少 AI 机械感
  deAIEnabled: true, // 启用去 AI 味后处理
});

const contextManager = new ContextManager();
let shouldStop = false;
let shouldPause = false;
let abortController: AbortController | null = null;

export function useBatchWriter(): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  /**
   * 获取总章节数
   */
  const totalChapters = computed(() => projectStore.sortedChapters.length);

  /**
   * 获取已写字数
   */
  const writtenWordCount = computed(() => {
    return projectStore.sortedChapters.reduce((total, chapter) => {
      return total + (chapter.wordCount || 0);
    }, 0);
  });

  /**
   * 获取已写章节数（内容非空的章节）
   */
  const writtenChapters = computed(() => {
    return projectStore.sortedChapters.filter(
      c => c.content && c.content.trim().length > 0
    ).length;
  });

  /**
   * 获取剩余章节数
   */
  const remainingChapters = computed(() => {
    return totalChapters.value - writtenChapters.value;
  });

  /**
   * 获取下一个待写章节的索引
   * 如果不存在空章节，返回 -1 表示需要创建新章节
   */
  function getNextChapterIndex(): number {
    const chapters = projectStore.sortedChapters;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].content || chapters[i].content.trim().length === 0) {
        return i;
      }
    }
    return -1; // 所有章节都已写，需要创建新章节
  }

  /**
   * 获取总章节数（包含待创建的）
   */
  function getTotalChapters(): number {
    return projectStore.sortedChapters.length;
  }

  /**
   * 构建近期章节完整原文
   */
  function buildRecentChaptersFullText(currentIndex: number, recentChapterCount: number): string {
    const chapters = projectStore.sortedChapters;
    const recentChapters = chapters
      .filter((c, i) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (recentChapters.length === 0) return '';

    const fullTextParts = recentChapters.map(c => {
      return `【第${c.orderIndex + 1}章 · ${c.title}】

${c.content || '（本章暂无内容）'}`;
    });

    return fullTextParts.join('\n\n==========\n\n');
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

    if (lowerOutline.includes('高潮') || lowerOutline.includes('决战') ||
        lowerOutline.includes('对决') || lowerOutline.includes('爆发')) {
      return 'climax';
    }
    if (lowerOutline.includes('解决') || lowerOutline.includes('结束') ||
        lowerOutline.includes('落幕') || lowerOutline.includes('结局')) {
      return 'resolution';
    }
    if (lowerOutline.includes('终章') || lowerOutline.includes('尾声') ||
        lowerOutline.includes('最终') || lowerOutline.includes('完结')) {
      return 'ending';
    }

    return 'normal';
  }

  /**
   * 构建完整大纲字符串
   */
  function buildFullOutlineString(): string | undefined {
    const plotOutline = projectStore.plotOutline;
    if (!plotOutline || plotOutline.length === 0) return undefined;

    const chapterNodes = plotOutline
      .filter((p: any) => p.type === 'chapter')
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

    if (chapterNodes.length === 0) return undefined;

    return chapterNodes.map((node: any, index: number) => {
      const chapterNum = index + 1;
      const title = node.title || `第${chapterNum}章`;
      const description = node.description || '（暂无大纲）';
      const keyEvents = node.keyEvents?.length > 0
        ? `\n关键事件：${node.keyEvents.join('、')}`
        : '';
      return `【第${chapterNum}章】${title}\n${description}${keyEvents}`;
    }).join('\n\n');
  }

  /**
   * 提取章节记忆
   * 使用安全提取函数，带完整容错机制
   */
  async function extractMemoryAfterApply(chapter: any, chapterIndex: number): Promise<void> {
    try {
      // 确保记忆管理器已初始化
      if (projectStore.currentProject) {
        initializeMemoryManager(
          projectStore.currentProject.id,
          projectStore.currentProject.name,
          true // 启用文件系统备份
        );
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 使用安全提取函数
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
   * 执行单章写作
   */
  async function writeChapter(chapterIndex: number): Promise<boolean> {
    const client = requireAIService();
    const chapters = projectStore.sortedChapters;

    if (chapterIndex >= chapters.length) {
      return false; // 章节不存在
    }

    const chapter = chapters[chapterIndex];

    // 检查是否已有内容
    if (chapter.content && chapter.content.trim().length > 0) {
      return true; // 跳过已有内容的章节
    }

    currentChapterIndex.value = chapterIndex;
    currentChapterTitle.value = chapter.title;

    // 获取上下文
    const project = projectStore.currentProject;
    const chapterOutline = chapter.plotSummary || extractChapterOutlineFromPlot(projectStore.plotOutline, chapter.id);
    const chapterType = extractChapterTypeFromOutline(chapterOutline, chapterIndex);
    const recentChapterCount = projectStore.memoryConfig?.shortTermChapterCount || 5;
    const shortTermFullText = buildRecentChaptersFullText(chapterIndex, recentChapterCount);

    // 提取前情摘要
    const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
    let previousSummary = '';
    let previousChapterEnding = '';
    if (prevChapter?.content) {
      previousSummary = contextManager.extractPreviousChapterSummary(prevChapter.content, 300);
      previousChapterEnding = contextManager.extractChapterEnding(prevChapter.content);
    }

    // 角色信息
    const characters = (project?.characters || []).map((char: any) => ({
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

    // 活跃伏笔
    const activeForeshadows = (project?.foreshadows || [])
      .filter((f: any) => f.status !== 'resolved')
      .map((f: any) => ({
        id: f.id,
        hint: f.hint,
        status: f.status,
        suggestedChapter: f.suggestedResolutionChapter,
      }));

    const targetWordCount = config.value.wordsPerChapter || 3000;
    let generatedContent = '';

    return new Promise((resolve, reject) => {
      // 检查是否启用流式输出（根据用户设置）
      if (settingsStore.streamOutput && (client as any).continueWritingStream) {
        (client as any).continueWritingStream(
          {
            project: projectStore.currentProject,
            currentChapterId: chapter.id,
            currentChapterIndex: chapterIndex,
            currentChapterTitle: chapter.title,
            currentChapterContent: '',
            currentChapterOutline: chapterOutline || undefined,
            fullOutline: buildFullOutlineString(),
            adjacentChaptersSummary: prevChapter ? {
              previousChapterTitle: prevChapter.title,
              previousChapterSummary: previousSummary,
              previousChapterEnding: previousChapterEnding,
              nextChapterTitle: undefined,
              nextChapterSummary: undefined,
            } : undefined,
            recentChaptersFullText: shortTermFullText,
            charactersInScene: characters,
            relatedForeshadows: activeForeshadows,
            writingStyle: config.value.writingStyle,
          },
          'smartContinue',
          targetWordCount,
          (chunk: string) => {
            generatedContent += chunk;
          },
          async () => {
            let extractedTitle: string | null | undefined;
            if (config.value.deAIEnabled && generatedContent) {
              const deAIResult = await DeAIService.fix(generatedContent);
              if (deAIResult.fixedCount > 0) {
                generatedContent = deAIResult.content;
              }
              extractedTitle = deAIResult.title || null;
              if (extractedTitle) {
                const titleValidation = DeAIService.validateTitle(extractedTitle);
                if (titleValidation.valid) {
                  extractedTitle = titleValidation.title;
                } else {
                  extractedTitle = titleValidation.title;
                }
              } else {
                const titleValidation = DeAIService.extractAndValidateTitle(deAIResult.content || generatedContent);
                extractedTitle = titleValidation.titleValid ? titleValidation.title : null;
                if (titleValidation.title && !titleValidation.titleValid) {
                  extractedTitle = titleValidation.title;
                }
              }
            }

            if (generatedContent) {
              const updateData: Record<string, any> = {
                content: generatedContent,
                wordCount: generatedContent.length,
                isGenerated: true,
                generatedAt: new Date().toISOString(),
              };
              if (extractedTitle) {
                updateData.title = extractedTitle;
              }
              await projectStore.updateChapter(chapter.id, updateData);
              extractMemoryAfterApply(chapter, chapterIndex + 1);
              progress.value.writtenChapters++;
              progress.value.writtenWords += generatedContent.length;
            }
            resolve(true);
          },
          (errMsg: string) => {
            error.value = errMsg;
            reject(new Error(errMsg));
          },
          abortController?.signal
        );
      } else {
        // 非流式模式
        (client as any).continueWriting(
          {
            project: projectStore.currentProject,
            currentChapterId: chapter.id,
            currentChapterIndex: chapterIndex,
            currentChapterTitle: chapter.title,
            currentChapterContent: '',
            currentChapterOutline: chapterOutline || undefined,
            fullOutline: buildFullOutlineString(),
            adjacentChaptersSummary: prevChapter ? {
              previousChapterTitle: prevChapter.title,
              previousChapterSummary: previousSummary,
              previousChapterEnding: previousChapterEnding,
              nextChapterTitle: undefined,
              nextChapterSummary: undefined,
            } : undefined,
            recentChaptersFullText: shortTermFullText,
            charactersInScene: characters,
            relatedForeshadows: activeForeshadows,
            writingStyle: config.value.writingStyle,
          },
          'smartContinue',
          targetWordCount
        ).then(async (result: any) => {
          if (result?.content) {
            generatedContent = result.content;
            let extractedTitle: string | null | undefined;
            if (config.value.deAIEnabled && generatedContent) {
              const deAIResult = await DeAIService.fix(generatedContent);
              if (deAIResult.fixedCount > 0) {
                generatedContent = deAIResult.content;
              }
              extractedTitle = deAIResult.title || null;
              if (extractedTitle) {
                const titleValidation = DeAIService.validateTitle(extractedTitle);
                if (!titleValidation.valid) {
                  extractedTitle = titleValidation.title;
                }
              } else {
                const titleValidation = DeAIService.extractAndValidateTitle(deAIResult.content || generatedContent);
                extractedTitle = titleValidation.titleValid ? titleValidation.title : null;
                if (titleValidation.title && !titleValidation.titleValid) {
                  extractedTitle = titleValidation.title;
                }
              }
            }

            const updateData: Record<string, any> = {
              content: generatedContent,
              wordCount: generatedContent.length,
              isGenerated: true,
              generatedAt: new Date().toISOString(),
            };
            if (extractedTitle) {
              updateData.title = extractedTitle;
            }
            await projectStore.updateChapter(chapter.id, updateData);
            extractMemoryAfterApply(chapter, chapterIndex + 1);
            progress.value.writtenChapters++;
            progress.value.writtenWords += generatedContent.length;
          }
          resolve(true);
        }).catch((err: Error) => {
          error.value = err.message;
          reject(err);
        });
      }
    });
  }

  /**
   * 创建新章节
   */
  async function createNewChapter(): Promise<number> {
    const project = projectStore.currentProject;
    if (!project) return -1;

    // 获取或创建默认卷
    let volumeId = projectStore.sortedVolumes[0]?.id;
    if (!volumeId) {
      // 如果没有卷，创建一个
      const newVolume: Volume = {
        id: `vol-${Date.now()}`,
        name: '第一卷',
        orderIndex: 0,
      };
      projectStore.addVolume(newVolume);
      volumeId = newVolume.id;
    }

    if (!volumeId) return -1;

    // 创建新章节
    const newChapter = await projectStore.createChapter(volumeId);
    if (newChapter) {
      // 返回新章节的索引
      return projectStore.sortedChapters.findIndex(c => c.id === newChapter.id);
    }
    return -1;
  }

  /**
   * 开始批量写作
   */
  async function startBatchWriting(targetChapters?: number, batchConfig?: BatchConfig): Promise<void> {
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
    }

    // 设置目标
    const chaptersToWrite = targetChapters || targetChapterCount.value;
    progress.value = {
      writtenChapters: 0,
      writtenWords: 0,
      targetChapters: chaptersToWrite,
    };

    isWriting.value = true;
    isPaused.value = false;
    shouldStop = false;
    shouldPause = false;
    error.value = null;

    try {
      // 从第一个空章节开始
      let currentIndex = getNextChapterIndex();
      let writtenCount = 0;

      while (currentIndex >= 0 || writtenCount < chaptersToWrite) {
        // 检查停止
        if (shouldStop) {
          console.log('[批量写作] 已停止');
          break;
        }

        // 检查暂停
        while (shouldPause && !shouldStop) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (shouldStop) break;

        // 检查是否达到目标
        if (target.value === 'specific' && writtenCount >= chaptersToWrite) {
          console.log('[批量写作] 已完成目标数量');
          break;
        }

        // 如果没有空章节，创建新的
        if (currentIndex < 0) {
          currentIndex = await createNewChapter();
          if (currentIndex < 0) {
            console.log('[批量写作] 无法创建新章节');
            break;
          }
        }

        try {
          const result = await writeChapter(currentIndex);
          if (result) {
            writtenCount++;
          }
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
      abortController = null;
    }
  }

  /**
   * 暂停写作
   */
  function pauseWriting(): void {
    shouldPause = true;
    isPaused.value = true;
  }

  /**
   * 继续写作
   */
  function resumeWriting(): void {
    shouldPause = false;
    isPaused.value = false;
  }

  /**
   * 停止写作
   */
  function stopWriting(): void {
    shouldStop = true;
    shouldPause = false;
    isPaused.value = false;
    isWriting.value = false;

    if (abortController) {
      abortController.abort();
      abortController = null;
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
