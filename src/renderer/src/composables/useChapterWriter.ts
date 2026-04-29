/**
 * 单章写作 Composable
 * 封装单章续写的业务逻辑
 */

import { ref, computed, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import type { WritingStyle, ChapterWritingContext, ChapterType } from '@/types/writing';
import { PromptBuilder } from '@/services/writing/prompt-builder';
import { ContextManager } from '@/services/writing/context-manager';
import { extractChapterMemory, buildCharacterStateTable, buildPlotProgressTable } from '@/services/writing/extract-plot-memory';
import type { ChapterMemory } from '@/types/project';

/**
 * 从章节大纲中提取章节类型
 */
function extractChapterTypeFromOutline(outline: string, orderIndex: number): ChapterType {
  if (!outline) {
    // 如果没有大纲，根据章节序号判断
    if (orderIndex === 0) {
      return 'world_intro';
    }
    return 'normal';
  }

  const lowerOutline = outline.toLowerCase();

  // 关键词匹配
  if (lowerOutline.includes('世界观') || lowerOutline.includes('背景') || 
      lowerOutline.includes('设定') || lowerOutline.includes('大陆') ||
      lowerOutline.includes('世界') || lowerOutline.includes('历史')) {
    return 'world_intro';
  }

  if (lowerOutline.includes('登场') || lowerOutline.includes('出场') ||
      lowerOutline.includes('初遇') || lowerOutline.includes('相遇') ||
      lowerOutline.includes('介绍') || lowerOutline.includes('主角')) {
    return 'character_intro';
  }

  if (lowerOutline.includes('开端') || lowerOutline.includes('开始') ||
      lowerOutline.includes('序幕') || lowerOutline.includes('引入')) {
    return 'plot_setup';
  }

  if (lowerOutline.includes('高潮') || lowerOutline.includes('决战') ||
      lowerOutline.includes('对决') || lowerOutline.includes('爆发')) {
    return 'climax';
  }

  if (lowerOutline.includes('解决') || lowerOutline.includes('结束') ||
      lowerOutline.includes('落幕') || lowerOutline.includes('结局') ||
      lowerOutline.includes('收尾')) {
    return 'resolution';
  }

  if (lowerOutline.includes('过渡') || lowerOutline.includes('间章') ||
      lowerOutline.includes('日常') || lowerOutline.includes('休息')) {
    return 'transitional';
  }

  if (lowerOutline.includes('终章') || lowerOutline.includes('尾声') ||
      lowerOutline.includes('最终') || lowerOutline.includes('完结')) {
    return 'ending';
  }

  // 第一章默认世界观介绍
  if (orderIndex === 0) {
    return 'world_intro';
  }

  return 'normal';
}

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
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }) => Promise<string | null>;
  stopWriting: () => void;
  buildContext: (additionalInstructions?: string) => ChapterWritingContext | null;
  applyGeneratedContent: () => Promise<boolean>;
  copyToClipboard: () => void;
  reset: () => void;
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
  function buildContext(additionalInstructions?: string, writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient'): ChapterWritingContext | null {
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

    // 获取本章大纲（从 plotSummary 或大纲中获取）
    const chapterOutline = currentChapter.plotSummary || extractChapterOutlineFromPlot(projectStore.plotOutline, currentChapter.id);

    // 提取章节类型
    const chapterType = extractChapterTypeFromOutline(chapterOutline, currentIndex);

    // 准备角色信息
    const characters: ChapterWritingContext['characters'] = (project.characters || []).map(char => ({
      id: char.id,
      name: char.name,
      role: char.role || '角色',
      description: char.description || '',
      personality: char.profile?.personality || [],
      appearance: char.profile?.appearance,
      speakingStyle: undefined,
      currentStatus: undefined,
      relationships: (char.profile?.relationships || []).map(r => ({
        targetName: r.targetName,
        type: r.type,
        description: r.description || '',
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

      // ========== 记忆系统相关 ==========
    // 获取短期记忆（最近几章的完整记忆）
    const shortTermMemories = projectStore.getShortTermMemories();

    // 获取中期记忆（更早章节的摘要）
    const mediumTermMemories = projectStore.getMediumTermMemories();

    // 获取长期记忆摘要
    const longTermSummary = projectStore.getLongTermSummary();

    // 构建短期记忆的完整文本（最近几章的原文）
    const shortTermFullText = buildShortTermFullText(shortTermMemories);

    return {
      projectTitle: project.name,
      projectSynopsis: project.description || '',
      worldSetting: project.worldSchema ? {
        locations: (project.worldSchema.locations || []).map(l => ({
          name: l.name,
          description: l.description || '',
          level: l.level || 'other',
        })),
        rules: (project.worldSchema.rules || []).map(r => ({
          name: r.name,
          description: r.description || '',
        })),
        factions: (project.worldSchema.factions || []).map(f => ({
          name: f.name,
          description: f.description || '',
        })),
      } : undefined,
      chapter: {
        id: currentChapter.id,
        title: currentChapter.title,
        orderIndex: currentIndex,
        outline: chapterOutline,
        existingContent: currentChapter.content || '',
        chapterType: chapterType,
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
        style: writingStyle || 'concise',
        customStyle: additionalInstructions,
      },
      // 记忆系统数据
      memoryData: {
        shortTermMemories,
        mediumTermMemories,
        longTermSummary,
        shortTermFullText,
        characterStateTable: buildCharacterStateTable(shortTermMemories),
        plotProgressTable: buildPlotProgressTable(shortTermMemories),
      },
    };
  }

  /**
   * 构建短期记忆的完整文本（最近几章的原文）
   */
  function buildShortTermFullText(shortTermMemories: any[]): string {
    if (!shortTermMemories || shortTermMemories.length === 0) {
      return '';
    }

    // 获取章节列表
    const chapters = projectStore.sortedChapters;

    // 收集短期记忆对应的章节完整内容
    const chapterIds = shortTermMemories.map(m => m.chapterId);

    const fullTextParts = chapters
      .filter(c => chapterIds.includes(c.id))
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(c => {
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
   * 构建完整大纲字符串（用于传给 AI）
   */
  function buildFullOutlineString(): string | undefined {
    const plotOutline = projectStore.plotOutline;
    if (!plotOutline || plotOutline.length === 0) {
      return undefined;
    }

    // 获取所有章节节点，按顺序排列
    const chapterNodes = plotOutline
      .filter((p: any) => p.type === 'chapter')
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

    if (chapterNodes.length === 0) {
      return undefined;
    }

    // 构建大纲字符串
    const outlineParts = chapterNodes.map((node: any, index: number) => {
      const chapterNum = index + 1;
      const title = node.title || `第${chapterNum}章`;
      const description = node.description || '（暂无大纲）';
      const keyEvents = node.keyEvents?.length > 0 
        ? `\n关键事件：${node.keyEvents.join('、')}` 
        : '';
      
      return `【第${chapterNum}章】${title}\n${description}${keyEvents}`;
    });

    return outlineParts.join('\n\n');
  }

  /**
   * 写入章节
   * @param options.targetWordCount 目标字数（默认3000）
   */
  async function writeChapter(options?: {
    targetWordCount?: number;
    additionalInstructions?: string;
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }): Promise<string | null> {
    const targetWordCount = options?.targetWordCount || 3000;
    const additionalInstructions = options?.additionalInstructions;
    const writingStyle = options?.writingStyle || 'concise';

    // 验证状态
    if (isGenerating.value) {
      error.value = '正在生成中，请稍候';
      return null;
    }

    const context = buildContext(additionalInstructions, writingStyle);
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
              currentChapterIndex: context.chapter.orderIndex,
              currentChapterTitle: context.chapter.title,
              currentChapterContent: context.chapter.existingContent || '',
              currentChapterOutline: context.chapter.outline || undefined,
              fullOutline: buildFullOutlineString(),
              adjacentChaptersSummary: context.previousChapter ? {
                previousChapterTitle: context.previousChapter.title,
                previousChapterSummary: context.previousChapter.summary,
                nextChapterTitle: undefined,
                nextChapterSummary: undefined,
              } : undefined,
              charactersInScene: context.characters,
              relatedForeshadows: context.foreshadows,
              writingStyle: writingStyle,
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
            currentChapterIndex: context.chapter.orderIndex,
            currentChapterTitle: context.chapter.title,
            currentChapterContent: context.chapter.existingContent || '',
            currentChapterOutline: context.chapter.outline || undefined,
            fullOutline: buildFullOutlineString(),
            adjacentChaptersSummary: context.previousChapter ? {
              previousChapterTitle: context.previousChapter.title,
              previousChapterSummary: context.previousChapter.summary,
              nextChapterTitle: undefined,
              nextChapterSummary: undefined,
            } : undefined,
            charactersInScene: context.characters,
            relatedForeshadows: context.foreshadows,
            writingStyle: writingStyle,
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

      // 获取章节索引
      const currentIndex = projectStore.sortedChapters.findIndex(
        c => c.id === projectStore.currentChapterId
      );

      await projectStore.updateChapter(projectStore.currentChapterId!, {
        content: newContent,
        wordCount: newContent.length,
      });

      // 提取情节记忆（异步，不阻塞主流程）
      extractMemoryAfterApply(projectStore.currentChapter!, currentIndex + 1);

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
   * 应用内容后提取情节记忆
   */
  async function extractMemoryAfterApply(chapter: any, chapterIndex: number): Promise<void> {
    try {
      // 等待内容保存完成
      await new Promise(resolve => setTimeout(resolve, 500));

      const memory = await extractChapterMemory(chapter, chapterIndex);

      // 添加到记忆系统
      projectStore.addChapterMemory(memory);

      console.log('[记忆系统] 已提取章节记忆:', chapter.title, memory.corePlot.slice(0, 50) + '...');
    } catch (err) {
      console.error('[记忆系统] 提取记忆失败:', err);
    }
  }

  /**
   * 重置所有状态
   */
  function reset(): void {
    isGenerating.value = false;
    progress.value = 0;
    error.value = null;
    currentGeneratedContent = '';
    generatedContent.value = '';
    if (abortController) {
      abortController.abort();
      abortController = null;
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
    reset,
  };
}
