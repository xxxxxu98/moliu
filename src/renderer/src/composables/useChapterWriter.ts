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
import { extractChapterMemory, buildCharacterStateTable, buildPlotProgressTable, safeExtractChapterMemory } from '@/services/writing/extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from '@/services/writing/memory-manager';
import { DeAIService } from '@/services/writing/de-ai-service';
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

  // 初始化记忆管理器
  function initMemoryManager() {
    if (projectStore.currentProject) {
      initializeMemoryManager(
        projectStore.currentProject.id,
        projectStore.currentProject.name,
        true // 启用文件系统备份
      );
      console.log('[ChapterWriter] 记忆管理器已初始化');
    }
  }

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

      // ========== 近期章节原文（直接从章节数据读取，不依赖记忆系统） ==========
    const recentChapterCount = projectStore.memoryConfig?.shortTermChapterCount || 5;
    const shortTermFullText = buildRecentChaptersFullText(currentIndex, recentChapterCount);

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
      // 近期章节原文和记忆数据
      memoryData: {
        shortTermFullText,
        characterStateTable: buildCharacterStateTable(projectStore.chapterMemories),
        plotProgressTable: buildPlotProgressTable(projectStore.chapterMemories),
      },
    };
  }

  /**
   * 构建近期章节完整原文（直接从 sortedChapters 读取，不依赖记忆系统）
   * @param currentIndex 当前章节索引
   * @param recentChapterCount 包含最近几章（不含当前章节）
   */
  function buildRecentChaptersFullText(currentIndex: number, recentChapterCount: number): string {
    const chapters = projectStore.sortedChapters;

    // 收集最近 N 章的完整原文（从当前章节往前数）
    const recentChapters = chapters
      .filter((c, i) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (recentChapters.length === 0) {
      return '';
    }

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

      // 检查是否启用流式输出（根据用户设置）
      if (settingsStore.streamOutput && (client as any).continueWritingStream) {
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
              recentChaptersFullText: context.memoryData.shortTermFullText, // 【重要】传递完整原文
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
            },
            abortController?.signal, // 传递 AbortSignal 以支持停止
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
            recentChaptersFullText: context.memoryData.shortTermFullText, // 【重要】传递完整原文
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
      // 如果是用户主动停止，不显示错误
      if (err instanceof Error && err.message === 'Generation stopped by user') {
        // 用户停止，保持已生成的内容
        error.value = null;
      } else {
        error.value = err instanceof Error ? err.message : '生成失败';
      }
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
      // 不立即设置 isGenerating = false，让 streamChat 回调处理
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
      // 应用去 AI 味处理
      let processedContent = currentGeneratedContent;
      let extractedTitle: string | null | undefined;
      let titleValid = false;
      let titleValidationReason = '';
      
      console.log('[智能续写] 开始处理，generatedContent前200字:', currentGeneratedContent.substring(0, 200));
      
      const deAIResult = await DeAIService.fix(processedContent);
      console.log('[智能续写] DeAIService.fix 返回结果:', {
        hasTitle: !!deAIResult.title,
        title: deAIResult.title,
        contentLength: deAIResult.content.length,
        fixedCount: deAIResult.fixedCount
      });
      
      if (deAIResult.fixedCount > 0) {
        console.log(`[智能续写] 去AI味处理：修复了 ${deAIResult.fixedCount} 处`);
        processedContent = deAIResult.content;
      }
      // 使用 deAIResult.title 而不是重新提取（因为 fix 已经提取过了）
      console.log('[智能续写] 使用 deAIResult.title 作为章节标题:', deAIResult.title);
      extractedTitle = deAIResult.title || null;
      if (extractedTitle) {
        const titleValidation = DeAIService.validateTitle(extractedTitle);
        console.log('[智能续写] 标题验证结果:', {
          title: titleValidation.title,
          valid: titleValidation.valid,
          reason: titleValidation.reason
        });
        titleValid = titleValidation.valid;
        titleValidationReason = titleValidation.reason || '';
        if (titleValid) {
          console.log(`[智能续写] 标题验证通过：${extractedTitle}`);
        } else {
          console.log(`[智能续写] 标题验证失败（${titleValidationReason}），但仍使用原标题：${extractedTitle}`);
          titleValid = true; // 即使验证不通过也使用原标题
        }
      } else {
        console.log('[智能续写] deAIResult.title 为空，尝试从内容中提取');
        // 备用：从内容中提取
        const titleValidation = DeAIService.extractAndValidateTitle(deAIResult.content || generatedContent);
        console.log('[智能续写] 备用提取结果:', {
          title: titleValidation.title,
          titleValid: titleValidation.titleValid
        });
        extractedTitle = titleValidation.title;
        titleValid = titleValidation.titleValid;
        titleValidationReason = titleValidation.title ? DeAIService.validateTitle(titleValidation.title).reason || '' : '';
        if (extractedTitle) {
          if (titleValid) {
            console.log(`[智能续写] 备用提取并验证通过：${extractedTitle}`);
          } else {
            console.log(`[智能续写] 备用提取标题但验证失败（${titleValidationReason}）：${extractedTitle}`);
          }
        }
      }

      const currentContent = projectStore.currentChapter?.content || '';
      const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
      const newContent = currentContent + separator + processedContent;

      // 获取章节索引
      const currentIndex = projectStore.sortedChapters.findIndex(
        c => c.id === projectStore.currentChapterId
      );

      // 构建更新对象
      const updateData: Record<string, any> = {
        content: newContent,
        wordCount: newContent.length,
      };
      // 如果提取到标题，则更新章节标题（不检查是否为默认标题）
      if (extractedTitle && projectStore.currentChapter) {
        updateData.title = extractedTitle;
        console.log(`[智能续写] 更新章节标题: ${extractedTitle}`);
      }

      await projectStore.updateChapter(projectStore.currentChapterId!, updateData);

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
   * 使用安全提取函数，带完整容错机制
   */
  async function extractMemoryAfterApply(chapter: any, chapterIndex: number): Promise<void> {
    try {
      // 确保记忆管理器已初始化
      initMemoryManager();

      // 等待内容保存完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 使用安全提取函数
      const memory = await safeExtractChapterMemory(
        { ...chapter, content: chapter.content || '' },
        chapterIndex,
        {
          enableAIEnhancement: true,
          enableFileBackup: true,
          fallbackToPrevious: true, // 允许从缓存恢复
        }
      );

      if (memory) {
        // 添加到记忆系统
        projectStore.addChapterMemory(memory);

        // 同时保存到 MemoryManager
        const manager = getMemoryManager();
        await manager.saveMemory(memory);

        console.log('[记忆系统] 已提取章节记忆:', chapter.title, memory.corePlot.slice(0, 50) + '...');
      }
    } catch (err) {
      console.error('[记忆系统] 提取记忆失败:', err);
      // 容错：提取失败不影响主流程
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
