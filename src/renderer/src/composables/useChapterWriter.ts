/**
 * 单章写作 Composable
 * 封装单章续写的业务逻辑
 */

import { ref, computed, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import type { WritingStyle, ChapterWritingContext } from '@/types/writing';
import { PromptBuilder } from '@/services/writing/prompt-builder';
import { ContextManager } from '@/services/writing/context-manager';

export interface UseChapterWriterReturn {
  // 状态
  isGenerating: typeof isGenerating;
  progress: typeof progress;
  error: typeof error;
  generatedContent: typeof generatedContent;

  // 方法
  writeChapter: (options?: {
    targetWordCount?: number;
    additionalInstructions?: string;
  }) => Promise<string | null>;
  stopWriting: () => void;
  buildContext: (additionalInstructions?: string) => ChapterWritingContext | null;
  applyGeneratedContent: () => Promise<boolean>;
  copyToClipboard: () => void;
}

const isGenerating = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);
const generatedContent = ref('');

export function useChapterWriter(): UseChapterWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();
  const contextManager = new ContextManager();

  let currentGeneratedContent = '';
  let abortController: AbortController | null = null;

  /**
   * 获取 AI 客户端
   * 使用统一的 AI Provider 获取逻辑
   */
  function getAIClient() {
    return requireAIService();
  }

  /**
   * 构建章节写作上下文
   */
  function buildContext(additionalInstructions?: string): ChapterWritingContext | null {
    const project = projectStore.currentProject;
    const currentChapter = projectStore.currentChapter;

    if (!project || !currentChapter) {
      error.value = '请先选择一个项目和章节';
      return null;
    }

    // 获取前情摘要
    const currentIndex = projectStore.sortedChapters.findIndex(c => c.id === currentChapter.id);
    const prevChapter = currentIndex > 0 ? projectStore.sortedChapters[currentIndex - 1] : null;

    // 提取前情摘要（取上一章结尾）
    let previousSummary = '';
    if (prevChapter?.content) {
      previousSummary = contextManager.extractPreviousChapterSummary(prevChapter.content, 300);
    }

    // 获取本章大纲
    const chapterOutline = currentChapter.outline || extractChapterOutlineFromPlot(projectStore.plotOutline, currentChapter.id);

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
        id: currentChapter.id,
        title: currentChapter.title,
        orderIndex: currentIndex,
        outline: chapterOutline,
        existingContent: currentChapter.content || '',
      },
      previousChapter: prevChapter ? {
        title: prevChapter.title,
        summary: previousSummary,
        ending: contextManager.extractChapterEnding(prevChapter.content || ''),
      } : undefined,
      characters,
      charactersInScene: (project.characters || []).map(c => c.id),
      foreshadows: activeForeshadows,
      requirements: {
        targetWordCount: 3000,
        style: 'concise',
        customStyle: additionalInstructions,
      },
    };
  }

  /**
   * 从大纲中提取章节概要
   */
  function extractChapterOutlineFromPlot(plotOutline: any[], chapterId: string): string {
    const chapter = plotOutline?.find((p: any) => p.chapterId === chapterId);
    return chapter?.description || '';
  }

  /**
   * 写入章节
   * @param options.targetWordCount 目标字数（默认3000）
   */
  async function writeChapter(options?: {
    targetWordCount?: number;
    additionalInstructions?: string;
  }): Promise<string | null> {
    const targetWordCount = options?.targetWordCount || 3000;
    const additionalInstructions = options?.additionalInstructions;

    // 验证状态
    if (isGenerating.value) {
      error.value = '正在生成中，请稍候';
      return null;
    }

    const context = buildContext(additionalInstructions);
    if (!context) {
      return null;
    }

    // 初始化状态
    isGenerating.value = true;
    progress.value = 0;
    error.value = null;
    currentGeneratedContent = '';
    generatedContent.value = '';

    abortController = new AbortController();

    try {
      const client = getAIClient();
      const provider = settingsStore.aiProviders.find(p => p.enabled && p.apiKey);

      const prompt = PromptBuilder.buildChapterContinuePrompt(
        context,
        context.chapter.existingContent || '',
        targetWordCount,
        additionalInstructions
      );

      // 检查是否支持流式输出
      if ((client as any).continueWritingStream) {
        await new Promise<void>((resolve, reject) => {
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
              currentGeneratedContent += chunk;
              generatedContent.value = currentGeneratedContent;
              progress.value = Math.min(
                Math.floor((currentGeneratedContent.length / (targetWordCount * 1.5)) * 100),
                98
              );
            },
            () => {
              progress.value = 100;
              resolve();
            },
            (errMsg: string) => {
              reject(new Error(errMsg));
            }
          );
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
          currentGeneratedContent = result.content;
          generatedContent.value = result.content;
          progress.value = 100;
        }
      }

      return currentGeneratedContent;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败';
      return null;
    } finally {
      isGenerating.value = false;
      abortController = null;
    }
  }

  /**
   * 停止写作
   */
  function stopWriting(): void {
    if (abortController) {
      abortController.abort();
      isGenerating.value = false;
    }
  }

  /**
   * 应用生成的内容到章节
   */
  async function applyGeneratedContent(): Promise<boolean> {
    if (!currentGeneratedContent) {
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
      const newContent = currentContent + separator + currentGeneratedContent;

      await projectStore.updateChapter(projectStore.currentChapterId, {
        content: newContent,
        wordCount: newContent.length,
        isGenerated: true,
        generatedAt: new Date().toISOString(),
      });

      // 清空生成的内容
      currentGeneratedContent = '';
      generatedContent.value = '';
      progress.value = 0;

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败';
      return false;
    }
  }

  /**
   * 复制到剪贴板
   */
  function copyToClipboard(): void {
    if (currentGeneratedContent) {
      navigator.clipboard.writeText(currentGeneratedContent);
    }
  }

  return {
    // 状态
    isGenerating,
    progress,
    error,
    generatedContent,

    // 方法
    writeChapter,
    stopWriting,
    buildContext,
    applyGeneratedContent,
    copyToClipboard,
  };
}
