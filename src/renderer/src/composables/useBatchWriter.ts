/**
 * 批量写作 Composable
 * 简化的连续续写逻辑 - 从第一个空章节开始，自动连续写
 */

import type { Ref, ComputedRef } from 'vue';
import type { Volume } from '@/types/project';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { extractChapterMemory, buildCharacterStateTable, buildPlotProgressTable, safeExtractChapterMemory } from '@/services/writing/extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from '@/services/writing/memory-manager';
import { ContextManager } from '@/services/writing/context-manager';
import { DeAIService } from '@/services/writing/de-ai-service';
import { createTaskBookBuilder, WritingTaskBuilder } from '@/services/writing/writing-task-builder';
import { reviewChapter } from '@/services/review/review-service';
import { createChapterCommit, extractChapterFacts } from '@/services/writing/chapter-commit';
import { createForeshadowTracker, analyzeForeshadows } from '@/services/writing/foreshadow-tracker';
import type { WritingTaskBook } from '@/types/writing-task';

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
  useTaskBook: false, // 是否启用任务书机制
  useReview: false, // 是否启用六维审查
  useCommit: false, // 是否启用 Commit 机制
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
   * 提取前情摘要
   */
  async function extractPreviousChapterSummary(content: string, maxLength: number = 300): Promise<{
    summary: string;
    ending: string;
  }> {
    if (!content) return { summary: '', ending: '' };
    
    const summary = contextManager.extractPreviousChapterSummary(content, maxLength);
    const ending = contextManager.extractChapterEnding(content);
    
    return { summary, ending };
  }

  /**
   * 生成写作任务书
   */
  async function generateTaskBook(chapterIndex: number, chapterOutline?: string): Promise<WritingTaskBook | null> {
    const project = projectStore.currentProject;
    if (!project) return null;

    try {
      const builder = createTaskBookBuilder({
        project,
        chapterIndex,
        chapterOutline,
        writingStyle: config.value.writingStyle as any,
        targetWordCount: config.value.wordsPerChapter || 3000,
      });
      
      const taskBook = await builder.buildTaskBook();
      console.log('[批量写作] 任务书已生成:', taskBook.chapterTitle);
      
      return taskBook;
    } catch (err) {
      console.error('[批量写作] 生成任务书失败:', err);
      return null;
    }
  }

  /**
   * 执行六维审查
   */
  async function performReview(chapter: any, chapterIndex: number): Promise<boolean> {
    const project = projectStore.currentProject;
    if (!project) return true;

    try {
      const result = await reviewChapter({
        project,
        chapter,
        chapterIndex,
        previousChapter: chapterIndex > 0 ? projectStore.sortedChapters[chapterIndex - 1] : undefined,
      });

      const hasBlocking = result.overall.blockingCount > 0;
      
      if (hasBlocking) {
        console.warn('[批量写作] 审查发现阻断问题:', result.overall.summary);
        // 可以选择自动修复或停止
        return false;
      }

      console.log('[批量写作] 审查通过:', result.overall.summary);
      return true;
    } catch (err) {
      console.error('[批量写作] 审查失败:', err);
      return true; // 审查失败不影响写作流程
    }
  }

  /**
   * 执行 Commit 提交
   */
  async function performCommit(chapter: any, chapterIndex: number): Promise<boolean> {
    try {
      // 1. 提取事实
      const extraction = await extractChapterFacts(chapter, chapterIndex);
      
      // 2. 创建 Commit
      const commit = await createChapterCommit(
        { project: projectStore.currentProject!, chapter, chapterIndex },
        {
          fulfillment: { coveredNodes: [], missedNodes: [] },
          disambiguation: [],
          extraction,
        },
        { autoProject: true }
      );

      console.log('[批量写作] Commit 完成:', commit.status);
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
      const foreshadows = analyzeForeshadows(content, chapterIndex + 1);
      if (foreshadows.length > 0) {
        console.log(`[批量写作] 发现 ${foreshadows.length} 个伏笔`);
        // 可以更新项目伏笔列表
      }
    } catch (err) {
      console.error('[批量写作] 伏笔追踪失败:', err);
    }
  }

  /**
   * 执行单章写作（增强版：集成任务书机制）
   */
  async function writeChapterEnhanced(chapterIndex: number): Promise<boolean> {
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
    const chapterOutline = chapter.plotSummary || extractChapterOutlineFromPlot(projectStore.plotOutline, chapter.id);

    // ========== 步骤 1: 生成写作任务书 ==========
    let taskBook: WritingTaskBook | null = null;
    if (config.value.useTaskBook) {
      taskBook = await generateTaskBook(chapterIndex, chapterOutline);
    }

    // ========== 步骤 2: 起草正文 ==========
    const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
    const { summary: previousSummary, ending: previousChapterEnding } = prevChapter?.content
      ? await extractPreviousChapterSummary(prevChapter.content, 300)
      : { summary: '', ending: '' };

    const characters = (project.characters || []).slice(0, 5).map((char: any) => ({
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

    const activeForeshadows = (project.foreshadows || [])
      .filter((f: any) => f.status !== 'resolved')
      .slice(0, 5)
      .map((f: any) => ({
        id: f.id,
        hint: f.hint,
        status: f.status,
        suggestedChapter: f.suggestedResolutionChapter,
      }));

    const targetWordCount = config.value.wordsPerChapter || 3000;
    let generatedContent = '';

    // 构建增强版 Prompt（包含任务书内容）
    let enhancedOutline = chapterOutline || '';
    if (taskBook) {
      // 使用任务书增强大纲
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
      enhancedOutline = taskBookSection + enhancedOutline;
    }

    try {
      // 调用 AI 写作
      const result = await (client as any).continueWriting(
        {
          project,
          currentChapterId: chapter.id,
          currentChapterIndex: chapterIndex,
          currentChapterTitle: chapter.title,
          currentChapterContent: '',
          currentChapterOutline: enhancedOutline || undefined,
          fullOutline: buildFullOutlineString(),
          adjacentChaptersSummary: prevChapter ? {
            previousChapterTitle: prevChapter.title,
            previousChapterSummary: previousSummary,
            previousChapterEnding: previousChapterEnding,
            nextChapterTitle: undefined,
            nextChapterSummary: undefined,
          } : undefined,
          recentChaptersFullText: buildRecentChaptersFullText(chapterIndex, projectStore.memoryConfig?.shortTermChapterCount || 5),
          charactersInScene: characters,
          relatedForeshadows: activeForeshadows,
          writingStyle: config.value.writingStyle,
        },
        'smartContinue',
        targetWordCount
      );

      if (result?.content) {
        generatedContent = result.content;
      }
    } catch (err) {
      console.error('[批量写作] AI 写作失败:', err);
      return false;
    }

    // ========== 步骤 3: 去 AI 味处理 ==========
    if (config.value.deAIEnabled && generatedContent) {
      const deAIResult = await DeAIService.fix(generatedContent);
      if (deAIResult.fixedCount > 0) {
        generatedContent = deAIResult.content;
        console.log('[批量写作] 去 AI 味处理完成，修复', deAIResult.fixedCount, '处');
      }
    }

    // ========== 步骤 4: 提取标题 ==========
    let extractedTitle: string | null = null;
    if (generatedContent) {
      const titleValidation = DeAIService.extractAndValidateTitle(generatedContent);
      if (titleValidation.titleValid) {
        extractedTitle = titleValidation.title;
      }
    }

    // ========== 步骤 5: 保存章节内容 ==========
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

      // ========== 步骤 6: 六维审查（可选） ==========
      if (config.value.useReview) {
        await performReview({ ...chapter, content: generatedContent }, chapterIndex);
      }

      // ========== 步骤 7: 提取记忆 ==========
      await extractMemoryAfterApply(chapter, chapterIndex + 1);

      // ========== 步骤 8: Commit 提交（可选） ==========
      if (config.value.useCommit) {
        await performCommit({ ...chapter, content: generatedContent }, chapterIndex);
      }

      // ========== 步骤 9: 伏笔追踪 ==========
      await trackForeshadows(generatedContent, chapterIndex);

      progress.value.writtenChapters++;
      progress.value.writtenWords += generatedContent.length;
    }

    return true;
  }

  /**
   * 执行单章写作（原始版本）
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
              if (!extractedTitle) {
                const titleValidation = DeAIService.extractAndValidateTitle(deAIResult.content || generatedContent);
                if (titleValidation.titleValid) {
                  extractedTitle = titleValidation.title;
                } else if (titleValidation.title) {
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
              if (!extractedTitle) {
                const titleValidation = DeAIService.extractAndValidateTitle(deAIResult.content || generatedContent);
                if (titleValidation.titleValid) {
                  extractedTitle = titleValidation.title;
                } else if (titleValidation.title) {
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
      config.value.temperature = batchConfig.temperature ?? 0.5;
      config.value.deAIEnabled = batchConfig.deAIEnabled ?? true;
      config.value.useTaskBook = batchConfig.useTaskBook ?? false;
      config.value.useReview = batchConfig.useReview ?? false;
      config.value.useCommit = batchConfig.useCommit ?? false;
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
          // 根据配置选择写作方法
          const useEnhancedWrite = config.value.useTaskBook || config.value.useReview || config.value.useCommit;
          const result = useEnhancedWrite
            ? await writeChapterEnhanced(currentIndex)
            : await writeChapter(currentIndex);
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
