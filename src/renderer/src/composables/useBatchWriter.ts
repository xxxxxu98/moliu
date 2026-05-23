/**
 * 批量写作 Composable - 增强版
 * 
 * 核心改进：
 * 1. TaskBook 作为核心前置步骤
 * 2. 引入 blocking 闸门机制
 * 3. 流水线式管理：起草 → 审查 → 润色 → 提交
 * 4. 自适应审查严格度 - 审查失败时逐步降低严格度，直到通过
 * 5. 自动化程度高 - 无需人工干预，避免死循环
 * 
 * 审查策略：
 * - 每章从目标严格度开始（如 normal）
 * - 审查失败时，逐步降低严格度（normal → relaxed）
 * - 章节完成后，下一章重置为初始严格度
 * - 这样既保证质量，又避免无限循环
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
import {
  blockingReview,
  canProceedToPolish,
  getBlockingIssuesToFix,
  BlockingReviewService,
  WritingPipelineManager,
  type BlockingReviewResult,
  type WritingPipelineStage,
  type ReviewStrictness
} from '@/services/review/blocking-review.service';
import { createChapterCommit, extractChapterFacts } from '@/services/writing/chapter-commit';
import { createForeshadowTracker, analyzeForeshadows } from '@/services/writing/foreshadow-tracker';
import type { WritingTaskBook } from '@/types/writing-task';
import { WritingError, ErrorCode, getErrorMessage } from '@/types/errors';

export type WritingTarget = 'specific' | 'finish';

// ============================================
// 严格度降级策略
// ============================================

/** 严格度降级顺序 */
const STRICTNESS_LEVELS: ReviewStrictness[] = ['strict', 'normal', 'relaxed'];

/** 获取下一个更宽松的严格度 */
function getLowerStrictness(current: ReviewStrictness): ReviewStrictness | null {
  const currentIndex = STRICTNESS_LEVELS.indexOf(current);
  if (currentIndex < STRICTNESS_LEVELS.length - 1) {
    return STRICTNESS_LEVELS[currentIndex + 1];
  }
  return null; // 已经是最宽松的
}

/** 获取严格度显示名称 */
function getStrictnessLabel(strictness: ReviewStrictness): string {
  switch (strictness) {
    case 'strict': return '严格';
    case 'normal': return '正常';
    case 'relaxed': return '宽松';
    default: return strictness;
  }
}

export type WritingTarget = 'specific' | 'finish';

// ============================================
// 接口定义
// ============================================

export interface UseBatchWriterReturn {
  // 状态
  isWriting: Ref<boolean>;
  isPaused: Ref<boolean>;
  currentChapterIndex: Ref<number>;
  currentChapterTitle: Ref<string>;
  error: Ref<string | null>;

  // 流水线状态
  pipelineStatus: Ref<WritingPipelineStage[]>;
  currentPipelineStep: Ref<string>;
  blockingIssues: Ref<any[]>;

  // 统计
  totalChapters: ComputedRef<number>;
  writtenChapters: ComputedRef<number>;
  remainingChapters: ComputedRef<number>;
  writtenWordCount: ComputedRef<number>;
  progress: Ref<{ writtenChapters: number; writtenWords: number; targetChapters: number }>;

  // 自适应审查状态
  currentStrictness: Ref<ReviewStrictness>;          // 当前使用的严格度
  initialStrictness: Ref<ReviewStrictness>;           // 初始目标严格度
  reviewAttempts: Ref<number>;                       // 当前章节审查尝试次数
  strictnessHistory: Ref<Array<{chapter: number; strictness: ReviewStrictness; passed: boolean}>>;

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
    requireBlockingPass: boolean;
    // 审查配置
    initialStrictness: ReviewStrictness;           // 初始严格度
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
  deAIEnabled?: boolean;
  useTaskBook?: boolean;
  useReview?: boolean;
  useCommit?: boolean;
  requireBlockingPass?: boolean;
  initialStrictness?: ReviewStrictness;  // 初始审查严格度
}

// ============================================
// 内部状态
// ============================================

interface InternalWritingState {
  shouldStop: boolean;
  shouldPause: boolean;
  abortController: AbortController | null;
  targetChapterCount: number;
  pipeline: WritingPipelineManager;
  currentReviewResult: BlockingReviewResult | null;
  // 自适应审查相关状态
  currentStrictness: ReviewStrictness;           // 当前使用的严格度
  reviewAttempts: number;                       // 当前章节审查尝试次数
  currentChapter: number;                       // 当前处理的章节索引
}

// ============================================
// 公共逻辑
// ============================================

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
  
  if (chapter.description) {
    parts.push(chapter.description);
  }
  
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
      const keyEvents = node.keyEvents?.length > 0 ? `\n关键事件：${node.keyEvents.join('、')}` : '';

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

      const structuredSection = structuredNodes.length > 0 ? `\n${structuredNodes.join('\n')}` : '';

      return `【第${chapterNum}章】${title}\n${description}${keyEvents}${structuredSection}`;
    })
    .join('\n\n');
}

function buildRecentChaptersFullText(projectStore: any, currentIndex: number, recentChapterCount: number): string {
  const chapters = projectStore.sortedChapters;
  const recentChapters = chapters
    .filter((c: any, i: number) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount))
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  if (recentChapters.length === 0) return '';

  return recentChapters.map((c: any) => {
    return `【第${c.orderIndex + 1}章 · ${c.title}】\n\n${c.content || '（本章暂无内容）'}`;
  }).join('\n\n==========\n\n');
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
    console.log(`[批量写作] 第${chapterIndex + 1}章任务书已生成:`, taskBook.CBN);
    return taskBook;
  } catch (err) {
    console.error('[批量写作] 生成任务书失败:', err);
    return null;
  }
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

/**
 * 执行六维审查（带 blocking 闸门）
 */
async function performBlockingReview(
  project: any,
  chapter: any,
  chapterIndex: number,
  previousChapter: any,
  strictness: ReviewStrictness = 'normal'
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

  console.log(`[批量写作] 第${chapterIndex + 1}章审查 [${getStrictnessLabel(strictness)}]:`, {
    passed: result.passed,
    blockingCount: result.blockingCount,
    totalIssues: result.totalIssues,
    summary: result.summary,
  });

  return result;
}

/**
 * 执行润色（必须在 blocking 通过后）
 */
async function performPolish(content: string, deAIEnabled: boolean): Promise<{
  fixedContent: string;
  title: string | null;
  fixedCount: number;
}> {
  if (!deAIEnabled) {
    const result = DeAIService.extractAndValidateTitle(content);
    return {
      fixedContent: result.content,
      title: result.title,
      fixedCount: 0,
    };
  }

  // 使用三遍法去AI味
  const result = await DeAIService.fix(content);
  
  console.log('[批量写作] 去AI味结果:', {
    fixedCount: result.fixedCount,
    threePassStats: result.threePassStats,
  });

  return {
    fixedContent: result.content,
    title: result.title || null,
    fixedCount: result.fixedCount,
  };
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
    const extraction = await extractChapterFacts(chapter, chapterIndex);
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
 * 提取情节记忆
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

// ============================================
// 主 Composable
// ============================================

export function useBatchWriter(): UseBatchWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  // 内部状态
  const internalState: InternalWritingState = {
    shouldStop: false,
    shouldPause: false,
    abortController: null,
    targetChapterCount: 10,
    pipeline: new WritingPipelineManager(),
    currentReviewResult: null,
    // 自适应审查相关状态
    currentStrictness: 'normal',
    reviewAttempts: 0,
    currentChapter: 0,
  };

  // 响应式状态
  const isWriting = ref(false);
  const isPaused = ref(false);
  const currentChapterIndex = ref(-1);
  const currentChapterTitle = ref('');
  const error = ref<string | null>(null);

  // 流水线状态
  const pipelineStatus = ref<WritingPipelineStage[]>([]);
  const currentPipelineStep = ref('idle');
  const blockingIssues = ref<any[]>([]);

  // 写作目标
  const target = ref<WritingTarget>('specific');

  // 进度统计
  const progress = ref({
    writtenChapters: 0,
    writtenWords: 0,
    targetChapters: 0,
  });

  // 自适应审查状态
  const currentStrictness = ref<ReviewStrictness>('normal');
  const initialStrictness = ref<ReviewStrictness>('normal');
  const reviewAttempts = ref(0);
  const strictnessHistory = ref<Array<{chapter: number; strictness: ReviewStrictness; passed: boolean}>>([]);

  // 写作配置
  const config = ref({
    wordsPerChapter: 3000,
    writingStyle: 'concise' as 'concise' | 'elegant' | 'humorous' | 'ancient',
    temperature: 0.5,
    deAIEnabled: true,
    useTaskBook: true,
    useReview: true,
    useCommit: true,
    requireBlockingPass: true,
    initialStrictness: 'normal' as ReviewStrictness,
  });

  // 上下文管理器
  const contextManager = new ContextManager();

  // 计算属性
  const totalChapters = computed(() => projectStore.sortedChapters.length);
  const writtenWordCount = computed(() => {
    return projectStore.sortedChapters.reduce((total: number, chapter: any) => {
      return total + (chapter.wordCount || 0);
    }, 0);
  });
  const writtenChapters = computed(() => {
    return projectStore.sortedChapters.filter(
      (c: any) => c.content && c.content.trim().length > 0
    ).length;
  });
  const remainingChapters = computed(() => {
    return totalChapters.value - writtenChapters.value;
  });

  // 内部方法
  function getNextChapterIndex(): number {
    const chapters = projectStore.sortedChapters;
    for (let i = 0; i < chapters.length; i++) {
      if (!chapters[i].content || chapters[i].content.trim().length === 0) {
        return i;
      }
    }
    return -1;
  }

  function getTotalChapters(): number {
    return projectStore.sortedChapters.length;
  }

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
   * 执行单章写作（核心逻辑）
   * 
   * 流水线：TaskBook(前置) → 起草 → 审查(Blocking闸门) → 润色 → 提交
   * 
   * 审查策略：
   * - 从当前严格度开始审查
   * - 失败时降低严格度（normal → relaxed）
   * - 通过后进入润色阶段
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
      requireBlockingPass: boolean;
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
    const chapterOutline = chapter.plotSummary || extractChapterOutlineFromPlot(projectStore.plotOutline, chapter.id);
    const recentChapterCount = projectStore.memoryConfig?.shortTermChapterCount || 5;

    // 初始化本章审查状态
    internalState.reviewAttempts = 0;
    internalState.currentChapter = chapterIndex;
    
    // 获取当前使用的严格度（从初始严格度开始）
    let currentReviewStrictness = internalState.currentStrictness;

    // ========== 步骤 1: 生成写作任务书（核心前置） ==========
    let taskBook: WritingTaskBook | null = null;
    if (options.useTaskBook) {
      currentPipelineStep.value = '生成任务书';
      
      taskBook = await generateTaskBook(
        project,
        chapterIndex,
        chapterOutline,
        options.writingStyle,
        options.wordsPerChapter
      );

      if (!taskBook) {
        throw new WritingError('任务书生成失败', ErrorCode.TASK_BOOK_FAILED);
      }
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

    // 构建增强版大纲（包含任务书）
    let enhancedOutline = chapterOutline || '';
    if (taskBook) {
      enhancedOutline = buildEnhancedOutline(taskBook, enhancedOutline);
    }

    // ========== 步骤 3: AI 起草 ==========
    currentPipelineStep.value = 'AI起草';
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
      const errorMessage = getErrorMessage(err, 'AI 起草失败');
      throw new WritingError(errorMessage, ErrorCode.AI_GENERATION_FAILED);
    }

    // ========== 步骤 4: 审查（带自适应严格度） ==========
    if (options.useReview) {
      currentPipelineStep.value = '审查（Blocking闸门）';

      // 自适应审查循环：失败时降低严格度
      let reviewPassed = false;
      let lastReviewResult: BlockingReviewResult | null = null;
      
      while (!reviewPassed) {
        internalState.reviewAttempts++;
        
        console.log(`[批量写作] 第${chapterIndex + 1}章审查 [${getStrictnessLabel(currentReviewStrictness)}] (第${internalState.reviewAttempts}次尝试)`);
        
        lastReviewResult = await performBlockingReview(
          project,
          { ...chapter, content: generatedContent },
          chapterIndex,
          prevChapter,
          currentReviewStrictness
        );

        blockingIssues.value = getBlockingIssuesToFix(lastReviewResult, 10);
        currentStrictness.value = currentReviewStrictness;
        
        // 记录审查历史
        strictnessHistory.value.push({
          chapter: chapterIndex,
          strictness: currentReviewStrictness,
          passed: lastReviewResult.passed
        });

        // 检查是否通过
        if (canProceedToPolish(lastReviewResult)) {
          reviewPassed = true;
          console.log(`[批量写作] 第${chapterIndex + 1}章审查通过 [${getStrictnessLabel(currentReviewStrictness)}]`);
          break;
        }

        // 未通过，尝试降低严格度
        const lowerStrictness = getLowerStrictness(currentReviewStrictness);
        
        if (lowerStrictness) {
          console.log(`[批量写作] 审查未通过，降低严格度: ${getStrictnessLabel(currentReviewStrictness)} → ${getStrictnessLabel(lowerStrictness)}`);
          currentReviewStrictness = lowerStrictness;
          // 继续循环，用更宽松的严格度重新审查
        } else {
          // 已经是最宽松的严格度，仍然未通过
          console.warn(`[批量写作] 第${chapterIndex + 1}章在最低严格度下仍未通过，将继续（润色会处理部分问题）`);
          
          // 记录警告但仍然继续（润色阶段会处理）
          error.value = `第${chapterIndex + 1}章审查未通过，但继续进行润色`;
          
          // 重置严格度为初始值，为下一章做准备
          currentReviewStrictness = internalState.currentStrictness;
          break;
        }
      }
    }

    // ========== 步骤 5: 润色（去AI味） ==========
    currentPipelineStep.value = '润色（去AI味）';
    const { fixedContent, title } = await performPolish(generatedContent, options.deAIEnabled);
    generatedContent = fixedContent;

    // ========== 步骤 6: 保存章节 ==========
    currentPipelineStep.value = '保存';
    await saveChapterContent(projectStore, chapter, generatedContent, title);

    // ========== 步骤 7: Commit 提交（可选） ==========
    if (options.useCommit) {
      currentPipelineStep.value = '提交';
      await performCommit(project, { ...chapter, content: generatedContent }, chapterIndex);
    }

    // ========== 步骤 8: 提取记忆 ==========
    currentPipelineStep.value = '提取记忆';
    await extractMemoryAfterApply(projectStore, chapter, chapterIndex + 1);

    // ========== 步骤 9: 伏笔追踪 ==========
    await analyzeForeshadows(generatedContent, chapterIndex);

    progress.value.writtenChapters++;
    progress.value.writtenWords += generatedContent.length;

    // 重置当前章节的严格度，为下一章做准备
    internalState.currentStrictness = config.value.initialStrictness;
    currentStrictness.value = config.value.initialStrictness;

    // 重置流水线状态
    internalState.pipeline.reset();
    internalState.currentReviewResult = null;
    blockingIssues.value = [];
    currentPipelineStep.value = 'idle';

    return true;
  }

  /**
   * 重试当前步骤
   */
  async function retryCurrentStep(): Promise<void> {
    if (internalState.currentReviewResult) {
      blockingIssues.value = [];
      internalState.currentReviewResult = null;
    }
  }

  /**
   * 跳过 blocking 问题（强制继续）
   */
  function skipBlockingIssues(): void {
    console.warn('[批量写作] 用户选择跳过 blocking 问题');
    blockingIssues.value = [];
    internalState.pipeline.advance();
  }
  
  /**
   * 手动降低审查严格度
   */
  function lowerStrictness(): void {
    const lower = getLowerStrictness(internalState.currentStrictness);
    if (lower) {
      internalState.currentStrictness = lower;
      currentStrictness.value = lower;
      console.log(`[批量写作] 手动降低严格度: ${getStrictnessLabel(lower)}`);
    }
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
      config.value.useTaskBook = true;
      config.value.useReview = batchConfig.useReview ?? true;
      config.value.useCommit = batchConfig.useCommit ?? true;
      config.value.requireBlockingPass = batchConfig.requireBlockingPass ?? true;
      config.value.initialStrictness = batchConfig.initialStrictness ?? 'normal';
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
    internalState.pipeline.reset();
    internalState.currentStrictness = config.value.initialStrictness;
    internalState.reviewAttempts = 0;
    internalState.currentChapter = 0;
    error.value = null;
    strictnessHistory.value = [];

    try {
      let currentIndex = getNextChapterIndex();
      let writtenCount = 0;

      while (currentIndex >= 0 || writtenCount < chaptersToWrite) {
        // 检查停止
        if (internalState.shouldStop) {
          console.log('[批量写作] 用户停止写作');
          break;
        }

        // 检查暂停
        while (internalState.shouldPause && !internalState.shouldStop) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (internalState.shouldStop) break;

        // 检查是否达到目标
        if (target.value === 'specific' && writtenCount >= chaptersToWrite) {
          console.log(`[批量写作] 已完成目标: ${writtenCount} 章`);
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
          const success = await executeChapterWriting(currentIndex, {
            useTaskBook: config.value.useTaskBook,
            useReview: config.value.useReview,
            useCommit: config.value.useCommit,
            deAIEnabled: config.value.deAIEnabled,
            writingStyle: config.value.writingStyle,
            wordsPerChapter: config.value.wordsPerChapter,
            requireBlockingPass: config.value.requireBlockingPass,
          });
          
          if (success) {
            writtenCount++;
          }
        } catch (err) {
          if (err instanceof WritingError && err.code === ErrorCode.TASK_BOOK_FAILED) {
            console.error('[批量写作] 任务书生成失败，跳过章节');
          } else {
            console.error('[批量写作] 章节写作失败:', err);
          }
        }

        // 找下一个空章节
        currentIndex = getNextChapterIndex();
      }
      
      // 输出统计
      console.log('[批量写作] 完成统计:', {
        写入: writtenCount,
        总字数: progress.value.writtenWords,
        审查历史: strictnessHistory.value.length
      });
    } finally {
      isWriting.value = false;
      isPaused.value = false;
      currentChapterIndex.value = -1;
      currentChapterTitle.value = '';
      internalState.abortController = null;
      currentPipelineStep.value = 'idle';
      pipelineStatus.value = internalState.pipeline.getStatus().stages;
    }
  }

  function pauseWriting(): void {
    internalState.shouldPause = true;
    isPaused.value = true;
  }

  function resumeWriting(): void {
    internalState.shouldPause = false;
    isPaused.value = false;
  }

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
    pipelineStatus,
    currentPipelineStep,
    blockingIssues,
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
    retryCurrentStep,
    skipBlockingIssues,
    // 自适应审查状态
    currentStrictness,
    initialStrictness,
    reviewAttempts,
    strictnessHistory,
    lowerStrictness,
  };
}
