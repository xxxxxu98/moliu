/**
 * 单章写作 Composable - 增强版
 * 
 * 核心改进：
 * 1. TaskBook 作为核心前置步骤（不再是可选）
 * 2. Blocking 闸门机制
 * 3. 三遍法去AI味
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
import {
  createTaskBookBuilder,
  type WritingTaskBuilder
} from '@/services/writing/writing-task-builder';
import {
  blockingReview,
  canProceedToPolish,
  getBlockingIssuesToFix,
  BlockingReviewService,
  type BlockingReviewResult
} from '@/services/review/blocking-review.service';
import type { ChapterMemory, Chapter } from '@/types/project';
import type { WritingTaskBook } from '@/types/writing-task';

// ============================================
// 接口定义
// ============================================

export interface UseChapterWriterReturn {
  // 状态
  isGenerating: typeof isGenerating;
  progress: typeof progress;
  error: typeof error;
  generatedContent: typeof generatedContent;

  // 流水线状态
  currentStep: typeof currentStep;
  blockingIssues: typeof blockingIssues;
  reviewResult: typeof reviewResult;

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
  
  // 流水线控制
  retryCurrentStep: () => void;
  skipBlockingIssues: () => void;
  forceProceedToPolish: () => void;
}

// ============================================
// 内部状态
// ============================================

const isGenerating = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);
const generatedContent = ref('');

// 流水线状态
const currentStep = ref<'idle' | 'taskbook' | 'draft' | 'review' | 'polish' | 'save'>('idle');
const blockingIssues = ref<any[]>([]);
const reviewResult = ref<BlockingReviewResult | null>(null);

// 当前任务书
let currentTaskBook: WritingTaskBook | null = null;

// ============================================
// 工具函数
// ============================================

function extractChapterTypeFromOutline(outline: string, orderIndex: number): ChapterType {
  if (!outline) {
    if (orderIndex === 0) {
      return 'world_intro';
    }
    return 'normal';
  }

  const lowerOutline = outline.toLowerCase();

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

  if (orderIndex === 0) {
    return 'world_intro';
  }

  return 'normal';
}

/**
 * 生成写作任务书（核心前置步骤）
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
    console.log('[智能续写] 任务书已生成:', taskBook.CBN);
    return taskBook;
  } catch (err) {
    console.error('[智能续写] 生成任务书失败:', err);
    return null;
  }
}

/**
 * 执行审查（带 Blocking 闸门）
 */
async function performBlockingReview(
  project: any,
  chapter: any,
  chapterIndex: number,
  previousChapter: any,
  strictness: 'relaxed' | 'normal' | 'strict' = 'normal'
): Promise<BlockingReviewResult> {
  const context = {
    project,
    chapter,
    chapterIndex,
    previousChapter,
    previousSummary: previousChapter?.content 
      ? new ContextManager().extractPreviousChapterSummary(previousChapter.content, 300)
      : undefined,
  };

  const result = await blockingReview(context, undefined, strictness);
  
  console.log('[智能续写] 审查结果:', {
    passed: result.passed,
    blockingCount: result.blockingCount,
    totalIssues: result.totalIssues,
    strictness,
  });

  return result;
}

// ============================================
// 主 Composable
// ============================================

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
        true
      );
      console.log('[ChapterWriter] 记忆管理器已初始化');
    }
  }

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

    const currentIndex = projectStore.sortedChapters.findIndex(c => c.id === currentChapter.id);
    const prevChapter = currentIndex > 0 ? projectStore.sortedChapters[currentIndex - 1] : null;

    let previousSummary = '';
    if (prevChapter?.content) {
      previousSummary = contextManager.extractPreviousChapterSummary(prevChapter.content, 300);
    }

    const chapterOutline = currentChapter.plotSummary || extractChapterOutlineFromPlot(projectStore.plotOutline, currentChapter.id);
    const chapterType = extractChapterTypeFromOutline(chapterOutline, currentIndex);

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

    const activeForeshadows: ChapterWritingContext['foreshadows'] = (project.foreshadows || [])
      .filter(f => f.status !== 'resolved')
      .map(f => ({
        id: f.id,
        hint: f.hint,
        status: f.status,
        suggestedChapter: f.suggestedResolutionChapter,
      }));

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
      memoryData: {
        shortTermFullText,
        characterStateTable: buildCharacterStateTable(projectStore.chapterMemories),
        plotProgressTable: buildPlotProgressTable(projectStore.chapterMemories),
      },
    };
  }

  function buildRecentChaptersFullText(currentIndex: number, recentChapterCount: number): string {
    const chapters = projectStore.sortedChapters;

    const recentChapters = chapters
      .filter((c, i) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount))
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (recentChapters.length === 0) {
      return '';
    }

    const fullTextParts = recentChapters.map(c => {
      return `【第${c.orderIndex + 1}章 · ${c.title}】\n\n${c.content || '（本章暂无内容）'}`;
    });

    return fullTextParts.join('\n\n==========\n\n');
  }

  /**
   * 从 PlotOutline 中提取章节大纲
   * 支持按 chapterId 或按 orderIndex 查找
   */
  function extractChapterOutlineFromPlot(plotOutline: any[], chapterId: string): string {
    // 首先尝试按 chapterId 查找
    let chapter = plotOutline?.find((p: any) => p.chapterId === chapterId);
    
    // 如果没找到，尝试按 id 查找
    if (!chapter) {
      chapter = plotOutline?.find((p: any) => p.id === chapterId);
    }
    
    if (!chapter) {
      return '';
    }
    
    // 构建包含结构化节点的完整大纲
    const parts: string[] = [];
    
    // 基础大纲描述
    if (chapter.description) {
      parts.push(chapter.description);
    }
    
    // 结构化节点
    if (chapter.CBN) {
      parts.push(`【章节起点 CBN】${chapter.CBN}`);
    }
    if (chapter.CPNs?.length > 0) {
      parts.push(`【推进节点 CPNs】\n  ${chapter.CPNs.map((cpn: string, i: number) => `${i + 1}. ${cpn}`).join('\n  ')}`);
    }
    if (chapter.CEN) {
      parts.push(`【章节终点 CEN】${chapter.CEN}`);
    }
    if (chapter.mustCover?.length > 0) {
      parts.push(`【必须覆盖】${chapter.mustCover.join('、')}`);
    }
    if (chapter.forbiddenZones?.length > 0) {
      parts.push(`【禁区】${chapter.forbiddenZones.join('、')}`);
    }
    
    return parts.join('\n');
  }
  
  /**
   * 提取章节结构化节点（新增）
   */
  function extractChapterStructureNodes(plotOutline: any[], chapterId: string): {
    CBN?: string;
    CPNs?: string[];
    CEN?: string;
    mustCover?: string[];
    forbiddenZones?: string[];
  } | null {
    let chapter = plotOutline?.find((p: any) => p.chapterId === chapterId);
    
    if (!chapter) {
      chapter = plotOutline?.find((p: any) => p.id === chapterId);
    }
    
    if (!chapter) {
      return null;
    }
    
    return {
      CBN: chapter.CBN,
      CPNs: chapter.CPNs,
      CEN: chapter.CEN,
      mustCover: chapter.mustCover,
      forbiddenZones: chapter.forbiddenZones,
    };
  }

  function buildFullOutlineString(): string | undefined {
    const plotOutline = projectStore.plotOutline;
    if (!plotOutline || plotOutline.length === 0) {
      return undefined;
    }

    const chapterNodes = plotOutline
      .filter((p: any) => p.type === 'chapter')
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

    if (chapterNodes.length === 0) {
      return undefined;
    }

    const outlineParts = chapterNodes.map((node: any, index: number) => {
      const chapterNum = index + 1;
      const title = node.title || `第${chapterNum}章`;
      const description = node.description || '（暂无大纲）';
      const keyEvents = node.keyEvents?.length > 0
        ? `\n关键事件：${node.keyEvents.join('、')}`
        : '';

      // ========== 构建结构化节点（增强大纲）==========
      const structuredNodes: string[] = [];

      if (node.CBN) {
        structuredNodes.push(`【章节起点 CBN】${node.CBN}`);
      }
      if (node.CPNs?.length > 0) {
        structuredNodes.push(`【推进节点 CPNs】\n  ${node.CPNs.map((cpn: string, i: number) => `${i + 1}. ${cpn}`).join('\n  ')}`);
      }
      if (node.CEN) {
        structuredNodes.push(`【章节终点 CEN】${node.CEN}`);
      }
      if (node.mustCover?.length > 0) {
        structuredNodes.push(`【必须覆盖】${node.mustCover.join('、')}`);
      }
      if (node.forbiddenZones?.length > 0) {
        structuredNodes.push(`【禁区】${node.forbiddenZones.join('、')}`);
      }

      const structuredSection = structuredNodes.length > 0
        ? `\n${structuredNodes.join('\n')}`
        : '';

      return `【第${chapterNum}章】${title}\n${description}${keyEvents}${structuredSection}`;
    });

    return outlineParts.join('\n\n');
  }

  /**
   * 写入章节（增强版）
   */
  async function writeChapter(options?: {
    targetWordCount?: number;
    additionalInstructions?: string;
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }): Promise<string | null> {
    const targetWordCount = options?.targetWordCount || 3000;
    const additionalInstructions = options?.additionalInstructions;
    const writingStyle = options?.writingStyle || 'concise';

    if (isGenerating.value) {
      error.value = '正在生成中，请稍候';
      return null;
    }

    const context = buildContext(additionalInstructions, writingStyle);
    if (!context) {
      return null;
    }

    // 重置状态
    isGenerating.value = true;
    progress.value = 0;
    error.value = null;
    currentGeneratedContent = '';
    generatedContent.value = '';
    currentStep.value = 'idle';
    blockingIssues.value = [];
    reviewResult.value = null;
    currentTaskBook = null;

    abortController = new AbortController();

    try {
      const client = getAIClient();
      const project = projectStore.currentProject!;
      const currentChapter = projectStore.currentChapter!;
      const currentIndex = context.chapter.orderIndex;

      // ========== 步骤 1: 生成写作任务书（核心前置） ==========
      currentStep.value = 'taskbook';
      currentTaskBook = await generateTaskBook(
        project,
        currentIndex,
        context.chapter.outline || undefined,
        writingStyle,
        targetWordCount
      );

      if (!currentTaskBook) {
        throw new Error('任务书生成失败');
      }

      // 构建增强版大纲
      let enhancedOutline = context.chapter.outline || '';
      if (currentTaskBook) {
        enhancedOutline = buildEnhancedOutline(currentTaskBook, enhancedOutline);
      }

      // ========== 步骤 2: AI 起草 ==========
      currentStep.value = 'draft';

      if (settingsStore.streamOutput && (client as any).continueWritingStream) {
        await new Promise<void>((resolve, reject) => {
          (client as any).continueWritingStream(
            {
              project,
              currentChapterId: context.chapter.id,
              currentChapterIndex: context.chapter.orderIndex,
              currentChapterTitle: context.chapter.title,
              currentChapterContent: context.chapter.existingContent || '',
              currentChapterOutline: enhancedOutline || undefined,
              fullOutline: buildFullOutlineString(),
              adjacentChaptersSummary: context.previousChapter ? {
                previousChapterTitle: context.previousChapter.title,
                previousChapterSummary: context.previousChapter.summary,
                nextChapterTitle: undefined,
                nextChapterSummary: undefined,
              } : undefined,
              recentChaptersFullText: context.memoryData.shortTermFullText,
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
            abortController?.signal,
          );
        });
      } else {
        const result = await (client as any).continueWriting(
          {
            project,
            currentChapterId: context.chapter.id,
            currentChapterIndex: context.chapter.orderIndex,
            currentChapterTitle: context.chapter.title,
            currentChapterContent: context.chapter.existingContent || '',
            currentChapterOutline: enhancedOutline || undefined,
            fullOutline: buildFullOutlineString(),
            adjacentChaptersSummary: context.previousChapter ? {
              previousChapterTitle: context.previousChapter.title,
              previousChapterSummary: context.previousChapter.summary,
              nextChapterTitle: undefined,
              nextChapterSummary: undefined,
            } : undefined,
            recentChaptersFullText: context.memoryData.shortTermFullText,
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
      if (err instanceof Error && err.message === 'Generation stopped by user') {
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
   * 构建增强版大纲（包含任务书）
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

  /**
   * 停止写作
   */
  function stopWriting(): void {
    if (abortController) {
      abortController.abort();
    }
  }

  // 审查严格度
  let currentStrictness: 'relaxed' | 'normal' | 'strict' = 'normal';
  let forceProceed = false;  // 强制继续标志

  function getLowerStrictness(strictness: 'relaxed' | 'normal' | 'strict'): 'relaxed' | 'normal' | 'strict' | null {
    const levels: Array<'relaxed' | 'normal' | 'strict'> = ['strict', 'normal', 'relaxed'];
    const currentIndex = levels.indexOf(strictness);
    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }
    return null;
  }

  function getStrictnessLabel(strictness: 'relaxed' | 'normal' | 'strict'): string {
    switch (strictness) {
      case 'strict': return '严格';
      case 'normal': return '正常';
      case 'relaxed': return '宽松';
      default: return strictness;
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
      const project = projectStore.currentProject!;
      const currentChapter = projectStore.currentChapter!;
      const currentIndex = projectStore.sortedChapters.findIndex(
        c => c.id === projectStore.currentChapterId
      );
      const prevChapter = currentIndex > 0 ? projectStore.sortedChapters[currentIndex - 1] : null;

      // ========== 步骤 3: 审查（自适应 Blocking 闸门） ==========
      currentStep.value = 'review';
      
      // 初始化审查严格度
      currentStrictness = 'normal';
      forceProceed = false;
      let reviewPassed = false;
      let lastReviewResult: BlockingReviewResult | null = null;
      let attempts = 0;
      const maxAttempts = 3;

      // 自适应审查循环：失败时降低严格度
      while (!reviewPassed && attempts < maxAttempts) {
        attempts++;
        console.log(`[智能续写] 审查尝试 ${attempts}/${maxAttempts}，严格度: ${getStrictnessLabel(currentStrictness)}`);

        lastReviewResult = await performBlockingReview(
          project,
          { ...currentChapter, content: currentGeneratedContent },
          currentIndex,
          prevChapter,
          currentStrictness
        );
        reviewResult.value = lastReviewResult;
        blockingIssues.value = getBlockingIssuesToFix(lastReviewResult, 10);

        // 检查是否通过
        if (canProceedToPolish(lastReviewResult)) {
          reviewPassed = true;
          console.log(`[智能续写] 审查通过（${getStrictnessLabel(currentStrictness)}模式）`);
          break;
        }

        // 未通过，尝试降低严格度
        const lowerStrictness = getLowerStrictness(currentStrictness);
        if (lowerStrictness) {
          console.log(`[智能续写] 审查未通过，降低严格度: ${getStrictnessLabel(currentStrictness)} → ${getStrictnessLabel(lowerStrictness)}`);
          currentStrictness = lowerStrictness;
        } else {
          // 已到最低严格度
          console.warn(`[智能续写] 已达最低严格度，审查仍未通过`);
          break;
        }
      }

      // 如果仍未通过且未强制继续，显示错误
      if (!reviewPassed && !forceProceed && lastReviewResult) {
        console.warn('[智能续写] 审查未通过，blocking 问题:', lastReviewResult.blockingCount);
        error.value = `审查未通过：${lastReviewResult.blockingCount}个阻断问题（已达最低严格度，可选择跳过）`;
        return false;
      }

      // ========== 步骤 4: 润色（三遍法去AI味） ==========
      currentStep.value = 'polish';
      let processedContent = currentGeneratedContent;
      let extractedTitle: string | null | undefined;

      const deAIResult = await DeAIService.fix(processedContent);
      console.log('[智能续写] 去AI味结果:', {
        fixedCount: deAIResult.fixedCount,
        threePassStats: deAIResult.threePassStats,
      });

      if (deAIResult.fixedCount > 0) {
        processedContent = deAIResult.content;
      }

      extractedTitle = deAIResult.title || null;
      if (!extractedTitle) {
        const titleValidation = DeAIService.extractAndValidateTitle(deAIResult.content);
        extractedTitle = titleValidation.title;
      }

      // ========== 步骤 5: 保存 ==========
      currentStep.value = 'save';
      const currentContent = projectStore.currentChapter?.content || '';
      const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
      const newContent = currentContent + separator + processedContent;

      const updateData: Record<string, any> = {
        content: newContent,
        wordCount: newContent.length,
      };

      if (extractedTitle && projectStore.currentChapter) {
        updateData.title = extractedTitle;
      }

      await projectStore.updateChapter(projectStore.currentChapterId!, updateData);

      // 提取情节记忆
      extractMemoryAfterApply(projectStore.currentChapter!, currentIndex + 1);

      // 重置状态
      currentGeneratedContent = '';
      generatedContent.value = '';
      progress.value = 0;
      currentStep.value = 'idle';
      blockingIssues.value = [];
      reviewResult.value = null;

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败';
      return false;
    }
  }

  async function extractMemoryAfterApply(chapter: Chapter, chapterIndex: number): Promise<void> {
    try {
      initMemoryManager();
      await new Promise(resolve => setTimeout(resolve, 500));

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
        console.log('[记忆系统] 已提取章节记忆:', chapter.title, memory.corePlot.slice(0, 50) + '...');
      }
    } catch (err) {
      console.error('[记忆系统] 提取记忆失败:', err);
    }
  }

  function reset(): void {
    isGenerating.value = false;
    progress.value = 0;
    error.value = null;
    currentGeneratedContent = '';
    generatedContent.value = '';
    currentStep.value = 'idle';
    blockingIssues.value = [];
    reviewResult.value = null;
    currentTaskBook = null;
    currentStrictness = 'normal';
    forceProceed = false;
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  function copyToClipboard(): void {
    if (currentGeneratedContent) {
      navigator.clipboard.writeText(currentGeneratedContent);
    }
  }

  function retryCurrentStep(): void {
    if (reviewResult.value) {
      blockingIssues.value = [];
      reviewResult.value = null;
    }
  }

  function skipBlockingIssues(): void {
    console.warn('[智能续写] 用户选择跳过 blocking 问题，强制继续');
    blockingIssues.value = [];
    reviewResult.value = null;
    forceProceed = true;
  }

  function forceProceedToPolish(): void {
    console.warn('[智能续写] 用户强制继续进行润色');
    forceProceed = true;
  }

  return {
    isGenerating,
    progress,
    error,
    generatedContent,
    currentStep,
    blockingIssues,
    reviewResult,
    writeChapter,
    stopWriting,
    buildContext,
    applyGeneratedContent,
    copyToClipboard,
    reset,
    retryCurrentStep,
    skipBlockingIssues,
    forceProceedToPolish,
  };
}
