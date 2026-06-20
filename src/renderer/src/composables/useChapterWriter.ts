/**
 * 单章写作 Composable - 增强版
 *
 * 核心改进：
 * 1. TaskBook 作为核心前置步骤（不再是可选）
 * 2. Blocking 闸门机制
 * 3. 结构化报告生成
 * 4. 失败恢复机制
 */

import { ref, computed, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import type { WritingStyle, ChapterWritingContext, ChapterType } from '@/types/writing';
import { ContextManager } from '@/services/writing/context-manager';
import {
  extractChapterContext,
  buildChapterOutlineText,
  buildFullOutlineText,
  buildEnhancedDesignPrompt,
} from '@/services/writing/OutlineContextBuilder';
import {
  extractChapterMemory,
  buildCharacterStateTable,
  buildPlotProgressTable,
  safeExtractChapterMemory,
} from '@/services/writing/extract-plot-memory';
import { initializeMemoryManager, getMemoryManager } from '@/services/writing/memory-manager';
import { DeAIService } from '@/services/writing/de-ai-service';
import {
  createTaskBookBuilder,
  type WritingTaskBuilder,
} from '@/services/writing/writing-task-builder';
import {
  blockingReview,
  canProceedToPolish,
  getBlockingIssuesToFix,
  BlockingReviewService,
  type BlockingReviewResult,
} from '@/services/review/blocking-review.service';
import type { ChapterMemory, Chapter } from '@/types/project';
import type { WritingTaskBook } from '@/types/writing-task';
import {
  useReportGenerator,
  type StructuredReviewReport,
} from '@/services/writing/review/report-generator';
import {
  useFailureRecovery,
  type PipelineStep,
  type FailureState,
  type RecoveryStrategy,
} from '@/services/writing/failure-recovery';

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

  // 字数相关状态
  actualWordCount: typeof actualWordCount;
  targetWordCount: typeof targetWordCount;
  isSupplementing: typeof isSupplementing;
  supplementRound: typeof supplementRound;

  // 报告相关
  latestReport: typeof latestReport;

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

  // 补充续写
  supplementContinue: (options?: { additionalWords?: number }) => Promise<string | null>;
  checkAndSupplement: () => Promise<{
    needsSupplement: boolean;
    currentWords: number;
    targetWords: number;
  }>;

  // 报告导出
  exportReport: (format: 'json' | 'markdown') => string | null;
  getReport: () => StructuredReviewReport | null;

  // 失败恢复
  getFailures: () => FailureState[];
  attemptRecovery: (
    failureId: string
  ) => Promise<{ strategy: RecoveryStrategy | null; action: string }>;
  clearFailures: () => void;
}

// ============================================
// 内部状态
// ============================================

const isGenerating = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);
const generatedContent = ref('');

// 流水线状态
const currentStep = ref<
  'idle' | 'taskbook' | 'draft' | 'supplement' | 'review' | 'polish' | 'save'
>('idle');
const blockingIssues = ref<any[]>([]);
const reviewResult = ref<BlockingReviewResult | null>(null);

// 当前任务书
let currentTaskBook: WritingTaskBook | null = null;

// 字数统计状态
const actualWordCount = ref(0);
const targetWordCount = ref(0);
const isSupplementing = ref(false);
const supplementRound = ref(0);

// 报告状态
const latestReport = ref<StructuredReviewReport | null>(null);

// 初始化报告生成器
const {
  generator: reportGenerator,
  generate: generateReport,
  exportToJSON,
  exportToMarkdown,
  getHistory,
  getLatestReport,
} = useReportGenerator();

// 初始化失败恢复
const {
  manager: recoveryManager,
  registerFailure,
  attemptRecovery: attemptRecoveryAction,
  getChapterFailures,
  clearChapterFailures,
} = useFailureRecovery({
  onUserDecision: async (failure: FailureState) => {
    return null;
  },
  onRecovery: async (failure: FailureState, strategy: RecoveryStrategy) => {
    return true;
  },
});

// ============================================
// 工具函数
// ============================================

/**
 * 统计中文字符和英文单词数量
 */
function countWords(text: string): number {
  if (!text) return 0;
  // 去除 markdown 标题、章节标题和标记
  let cleaned = text.replace(/^#.*$/gm, '');
  // 去除「第X章 标题」格式的章节标题（避免被计入正文字数，影响补写阈值判断）
  cleaned = cleaned.replace(/^第[0-9零一二三四五六七八九十百千万]+章.*$/gm, '');
  cleaned = cleaned.replace(/【.*?】/g, '');
  cleaned = cleaned.replace(/\n/g, '');
  const chineseChars = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = (cleaned.match(/[a-zA-Z]+/g) || []).length;
  return chineseChars + englishWords;
}

function extractChapterTypeFromOutline(outline: string, orderIndex: number): ChapterType {
  if (!outline) {
    if (orderIndex === 0) {
      return 'world_intro';
    }
    return 'normal';
  }

  const lowerOutline = outline.toLowerCase();

  if (
    lowerOutline.includes('世界观') ||
    lowerOutline.includes('背景') ||
    lowerOutline.includes('设定') ||
    lowerOutline.includes('大陆') ||
    lowerOutline.includes('世界') ||
    lowerOutline.includes('历史')
  ) {
    return 'world_intro';
  }

  if (
    lowerOutline.includes('登场') ||
    lowerOutline.includes('出场') ||
    lowerOutline.includes('初遇') ||
    lowerOutline.includes('相遇') ||
    lowerOutline.includes('介绍') ||
    lowerOutline.includes('主角')
  ) {
    return 'character_intro';
  }

  if (
    lowerOutline.includes('开端') ||
    lowerOutline.includes('开始') ||
    lowerOutline.includes('序幕') ||
    lowerOutline.includes('引入')
  ) {
    return 'plot_setup';
  }

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
    lowerOutline.includes('结局') ||
    lowerOutline.includes('收尾')
  ) {
    return 'resolution';
  }

  if (
    lowerOutline.includes('过渡') ||
    lowerOutline.includes('间章') ||
    lowerOutline.includes('日常') ||
    lowerOutline.includes('休息')
  ) {
    return 'transitional';
  }

  if (
    lowerOutline.includes('终章') ||
    lowerOutline.includes('尾声') ||
    lowerOutline.includes('最终') ||
    lowerOutline.includes('完结')
  ) {
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
    return taskBook;
  } catch (err) {
    console.error('[智能续写] 生成任务书失败:', err);
    // 注册任务书生成失败
    recoveryManager.registerFailure(
      currentChapterId || 'unknown',
      chapterIndex + 1,
      'taskbook',
      err instanceof Error ? err.message : '任务书生成失败'
    );
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

  // 当前章节信息
  let currentChapterId = '';
  let currentChapterNumber = 0;

  // 初始化记忆管理器
  function initMemoryManager() {
    if (projectStore.currentProject) {
      initializeMemoryManager(
        projectStore.currentProject.id,
        projectStore.currentProject.name,
        true
      );
    }
  }

  function getAIClient() {
    return requireAIService();
  }

  /**
   * 构建章节写作上下文
   */
  function buildContext(
    additionalInstructions?: string,
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient'
  ): ChapterWritingContext | null {
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

    // 使用统一的 OutlineContextBuilder
    const chapterCtx = extractChapterContext(
      projectStore.plotOutline,
      currentChapter.id,
      currentChapter.title
    );
    const currentChapterOutline = chapterCtx
      ? buildChapterOutlineText(chapterCtx, true)
      : currentChapter.plotSummary || '';

    // 如果没有大纲上下文中的 chapterType，回退到原有推导逻辑
    const chapterType =
      chapterCtx?.chapterType || extractChapterTypeFromOutline(currentChapterOutline, currentIndex);

    const characters: ChapterWritingContext['characters'] = (project.characters || []).map(
      char => ({
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
      })
    );

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

    // 构建增强设计 prompt
    const enhancedPrompt = buildEnhancedDesignPrompt({
      projectTitle: project.name,
      projectSynopsis: project.description || '',
      projectGenre: project.genre.map(g => g.name),
      currentChapter: chapterCtx || {
        title: currentChapter.title,
        description: currentChapterOutline,
        orderIndex: currentIndex,
      },
      currentChapterOutline,
      emotionGoal: project.emotionGoal,
      conflictDesign: project.conflictDesign,
      coolPointDesign: project.coolPointDesign,
      storyLines: project.storyLines,
      coreSellingPoints: project.coreSellingPoints,
      writingStyle: writingStyle as any,
      memoryData: {
        shortTermFullText,
        characterStateTable: buildCharacterStateTable(projectStore.chapterMemories),
        plotProgressTable: buildPlotProgressTable(projectStore.chapterMemories),
      },
    });

    return {
      projectTitle: project.name,
      projectSynopsis: project.description || '',
      worldSetting: project.worldSchema
        ? {
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
          }
        : undefined,
      chapter: {
        id: currentChapter.id,
        title: currentChapter.title,
        orderIndex: currentIndex,
        outline: currentChapterOutline,
        existingContent: currentChapter.content || '',
        chapterType: chapterType,
      },
      previousChapter: prevChapter
        ? {
            title: prevChapter.title,
            summary: previousSummary,
            ending: contextManager.extractChapterEnding(prevChapter.content || ''),
          }
        : undefined,
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
      const content = c.content || '';
      if (!content) {
        return `【第${c.orderIndex + 1}章 · ${c.title}】\n\n（本章暂无内容）`;
      }
      // 压缩为「摘要 + 结尾」，避免整章原文灌入 prompt 浪费 token（首尾已足够承载文风）
      const summary = contextManager.extractPreviousChapterSummary(content, 300);
      const ending = content.length > 500 ? content.slice(-500) : content;
      return `【第${c.orderIndex + 1}章 · ${c.title}】\n[摘要] ${summary}\n……\n[结尾] ${ending}`;
    });

    return fullTextParts.join('\n\n==========\n\n');
  }

  /**
   * 写入章节（增强版）
   */
  async function writeChapter(options?: {
    targetWordCount?: number;
    additionalInstructions?: string;
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }): Promise<string | null> {
    const requestedTarget = options?.targetWordCount || 3000;
    const additionalInstructions = options?.additionalInstructions;
    const writingStyle = options?.writingStyle || 'concise';

    // 设置目标字数
    targetWordCount.value = requestedTarget;
    actualWordCount.value = 0;
    supplementRound.value = 0;

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

      // 记录章节信息
      currentChapterId = currentChapter.id;
      currentChapterNumber = currentIndex + 1;

      // 注册起草失败恢复
      const draftFailureId = registerFailure(
        currentChapterId,
        currentChapterNumber,
        'draft',
        '开始起草'
      ).id;

      // ========== 步骤 1: 生成写作任务书（核心前置） ==========
      currentStep.value = 'taskbook';
      currentTaskBook = await generateTaskBook(
        project,
        currentIndex,
        context.chapter.outline || undefined,
        writingStyle,
        requestedTarget
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
        // 使用 OutlineContextBuilder 提取当前章节上下文
        const chapterCtx = extractChapterContext(
          projectStore.plotOutline,
          context.chapter.id,
          context.chapter.title
        );
        const enhancedPrompt = buildEnhancedDesignPrompt({
          projectTitle: project.name,
          projectSynopsis: project.description || '',
          projectGenre: project.genre.map(g => g.name),
          currentChapter: chapterCtx || {
            title: context.chapter.title,
            description: enhancedOutline || '',
            orderIndex: context.chapter.orderIndex,
          },
          currentChapterOutline: enhancedOutline || '',
          emotionGoal: project.emotionGoal,
          conflictDesign: project.conflictDesign,
          coolPointDesign: project.coolPointDesign,
          storyLines: project.storyLines,
          coreSellingPoints: project.coreSellingPoints,
          writingStyle: writingStyle as any,
        });

        await new Promise<void>((resolve, reject) => {
          (client as any).continueWritingStream(
            {
              project,
              currentChapterId: context.chapter.id,
              currentChapterIndex: context.chapter.orderIndex,
              currentChapterTitle: context.chapter.title,
              currentChapterContent: context.chapter.existingContent || '',
              currentChapterOutline: enhancedOutline || undefined,
              fullOutline: buildFullOutlineText(projectStore.plotOutline),
              customPrompt: additionalInstructions || undefined,
              adjacentChaptersSummary: context.previousChapter
                ? {
                    previousChapterTitle: context.previousChapter.title,
                    previousChapterSummary: context.previousChapter.summary,
                    previousChapterEnding: context.previousChapter.ending,
                    nextChapterTitle: undefined,
                    nextChapterSummary: undefined,
                  }
                : undefined,
              recentChaptersFullText: context.memoryData.shortTermFullText,
              charactersInScene: context.characters,
              relatedForeshadows: context.foreshadows,
              writingStyle: writingStyle,
              // 新增：章节结构化策略
              currentChapterOutlineContext: chapterCtx
                ? {
                    chapterType: chapterCtx.chapterType,
                    hookType: chapterCtx.hookType,
                    pacingStrategy: chapterCtx.pacingStrategy,
                    timeSpan: chapterCtx.timeSpan,
                    keyEvents: chapterCtx.keyEvents,
                    isClimax: chapterCtx.isClimax,
                    expectedCoolPoints: chapterCtx.expectedCoolPoints,
                  }
                : undefined,
              // 新增：增强设计段落
              enhancedDesignPrompt: enhancedPrompt,
            },
            'smartContinue',
            requestedTarget,
            (chunk: string) => {
              currentGeneratedContent += chunk;
              generatedContent.value = currentGeneratedContent;
              progress.value = Math.min(
                Math.floor((currentGeneratedContent.length / (requestedTarget * 1.5)) * 100),
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
            abortController?.signal
          );
        });
      } else {
        // 使用 OutlineContextBuilder 提取当前章节上下文
        const chapterCtx = extractChapterContext(
          projectStore.plotOutline,
          context.chapter.id,
          context.chapter.title
        );
        const enhancedPrompt = buildEnhancedDesignPrompt({
          projectTitle: project.name,
          projectSynopsis: project.description || '',
          projectGenre: project.genre.map(g => g.name),
          currentChapter: chapterCtx || {
            title: context.chapter.title,
            description: enhancedOutline || '',
            orderIndex: context.chapter.orderIndex,
          },
          currentChapterOutline: enhancedOutline || '',
          emotionGoal: project.emotionGoal,
          conflictDesign: project.conflictDesign,
          coolPointDesign: project.coolPointDesign,
          storyLines: project.storyLines,
          coreSellingPoints: project.coreSellingPoints,
          writingStyle: writingStyle as any,
        });

        const result = await (client as any).continueWriting(
          {
            project,
            currentChapterId: context.chapter.id,
            currentChapterIndex: context.chapter.orderIndex,
            currentChapterTitle: context.chapter.title,
            currentChapterContent: context.chapter.existingContent || '',
            currentChapterOutline: enhancedOutline || undefined,
            fullOutline: buildFullOutlineText(projectStore.plotOutline),
            customPrompt: additionalInstructions || undefined,
            adjacentChaptersSummary: context.previousChapter
              ? {
                  previousChapterTitle: context.previousChapter.title,
                  previousChapterSummary: context.previousChapter.summary,
                  previousChapterEnding: context.previousChapter.ending,
                  nextChapterTitle: undefined,
                  nextChapterSummary: undefined,
                }
              : undefined,
            recentChaptersFullText: context.memoryData.shortTermFullText,
            charactersInScene: context.characters,
            relatedForeshadows: context.foreshadows,
            writingStyle: writingStyle,
            // 新增：章节结构化策略
            currentChapterOutlineContext: chapterCtx
              ? {
                  chapterType: chapterCtx.chapterType,
                  hookType: chapterCtx.hookType,
                  pacingStrategy: chapterCtx.pacingStrategy,
                  timeSpan: chapterCtx.timeSpan,
                  keyEvents: chapterCtx.keyEvents,
                  isClimax: chapterCtx.isClimax,
                  expectedCoolPoints: chapterCtx.expectedCoolPoints,
                }
              : undefined,
            // 新增：增强设计段落
            enhancedDesignPrompt: enhancedPrompt,
          },
          'smartContinue',
          requestedTarget
        );

        if (result?.content) {
          currentGeneratedContent = result.content;
          generatedContent.value = result.content;
          progress.value = 100;
        }
      }

      // 更新实际字数
      actualWordCount.value = countWords(currentGeneratedContent);

      // 检查字数是否达标
      const checkResult = checkWordCount(currentGeneratedContent, requestedTarget);

      // 如果字数不足且还有补充机会，尝试补充
      if (checkResult.needsSupplement && supplementRound.value < MAX_SUPPLEMENT_ROUNDS) {
        await supplementContinue({
          additionalWords: checkResult.shortfall,
          writingStyle: writingStyle as 'concise' | 'elegant' | 'humorous' | 'ancient',
        });
      }

      return currentGeneratedContent;
    } catch (err) {
      // 记录失败
      recoveryManager.registerFailure(
        currentChapterId,
        currentChapterNumber,
        currentStep.value as PipelineStep,
        err instanceof Error ? err.message : '未知错误'
      );

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

  // ============================================
  // 字数检查与补充续写
  // ============================================

  const MIN_WORD_THRESHOLD = 0.85; // 最低字数阈值（85%）
  const MAX_WORD_THRESHOLD = 1.15; // 最高字数阈值（115%）
  const MAX_SUPPLEMENT_ROUNDS = 3; // 最多补充轮次

  /**
   * 检查字数是否达标
   */
  function checkWordCount(
    content: string,
    target: number
  ): {
    needsSupplement: boolean;
    currentWords: number;
    targetWords: number;
    shortfall: number;
    percentage: number;
  } {
    const currentWords = countWords(content);
    const minRequired = Math.floor(target * MIN_WORD_THRESHOLD);
    const percentage = target > 0 ? (currentWords / target) * 100 : 0;

    return {
      needsSupplement: currentWords < minRequired,
      currentWords,
      targetWords: target,
      shortfall: Math.max(0, minRequired - currentWords),
      percentage,
    };
  }

  /**
   * 检查并返回是否需要补充
   */
  async function checkAndSupplement(): Promise<{
    needsSupplement: boolean;
    currentWords: number;
    targetWords: number;
  }> {
    const content = currentGeneratedContent || generatedContent.value;
    const target = targetWordCount.value || 3000;
    const checkResult = checkWordCount(content, target);
    actualWordCount.value = checkResult.currentWords;

    return {
      needsSupplement: checkResult.needsSupplement,
      currentWords: checkResult.currentWords,
      targetWords: checkResult.targetWords,
    };
  }

  /**
   * 补充续写（字数不足时调用）
   */
  async function supplementContinue(options?: {
    additionalWords?: number;
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }): Promise<string | null> {
    const supplementStyle = options?.writingStyle || 'concise';
    const additionalWords = options?.additionalWords || targetWordCount.value * 0.3;
    const maxSupplement =
      Math.ceil(targetWordCount.value * MAX_WORD_THRESHOLD) - countWords(currentGeneratedContent);

    if (maxSupplement <= 0) {
      return currentGeneratedContent;
    }

    if (supplementRound.value >= MAX_SUPPLEMENT_ROUNDS) {
      return currentGeneratedContent;
    }

    if (isGenerating.value || isSupplementing.value) {
      error.value = '当前正在生成中，请稍候';
      return null;
    }

    supplementRound.value++;
    isSupplementing.value = true;
    isGenerating.value = true;

    try {
      const client = getAIClient();
      const project = projectStore.currentProject!;
      const currentChapter = projectStore.currentChapter!;
      const currentIndex = projectStore.sortedChapters.findIndex(c => c.id === currentChapter.id);
      const prevChapter = currentIndex > 0 ? projectStore.sortedChapters[currentIndex - 1] : null;

      const context = buildContext();
      if (!context) {
        throw new Error('构建上下文失败');
      }

      // 构建补充续写指令
      const supplementInstruction = buildSupplementPrompt(
        currentGeneratedContent,
        additionalWords,
        Math.min(additionalWords, maxSupplement),
        context
      );

      // 设置当前步骤
      currentStep.value = 'supplement';

      // 调用 AI 补充续写
      let newContent = '';
      // 只传原文结尾（约 1000 字），避免超过上下文窗口
      const endingSnippet = currentGeneratedContent.slice(-1000) || '';

      // 复用主流程的上下文构建（保持补充内容与原章节计划方向一致）
      const supplementChapterCtx = extractChapterContext(
        projectStore.plotOutline,
        context.chapter.id,
        context.chapter.title
      );
      const supplementEnhancedPrompt = buildEnhancedDesignPrompt({
        projectTitle: project.name,
        projectSynopsis: project.description || '',
        projectGenre: project.genre.map(g => g.name),
        currentChapter: supplementChapterCtx || {
          title: context.chapter.title,
          description: context.chapter.outline || '',
          orderIndex: context.chapter.orderIndex,
        },
        currentChapterOutline: context.chapter.outline || '',
        emotionGoal: project.emotionGoal,
        conflictDesign: project.conflictDesign,
        coolPointDesign: project.coolPointDesign,
        storyLines: project.storyLines,
        coreSellingPoints: project.coreSellingPoints,
        writingStyle: supplementStyle as any,
      });

      if (settingsStore.streamOutput && (client as any).continueWritingStream) {
        await new Promise<void>((resolve, reject) => {
          (client as any).continueWritingStream(
            {
              project,
              currentChapterId: context.chapter.id,
              currentChapterIndex: context.chapter.orderIndex,
              currentChapterTitle: context.chapter.title,
              currentChapterContent: endingSnippet,
              currentChapterOutline: context.chapter.outline || undefined,
              fullOutline: buildFullOutlineText(projectStore.plotOutline),
              customPrompt: supplementInstruction,
              adjacentChaptersSummary: context.previousChapter
                ? {
                    previousChapterTitle: context.previousChapter.title,
                    previousChapterSummary: context.previousChapter.summary,
                    previousChapterEnding: context.previousChapter.ending,
                    nextChapterTitle: undefined,
                    nextChapterSummary: undefined,
                  }
                : undefined,
              recentChaptersFullText: context.memoryData.shortTermFullText,
              charactersInScene: context.characters,
              relatedForeshadows: context.foreshadows,
              writingStyle: supplementStyle,
              currentChapterOutlineContext: supplementChapterCtx
                ? {
                    chapterType: supplementChapterCtx.chapterType,
                    hookType: supplementChapterCtx.hookType,
                    pacingStrategy: supplementChapterCtx.pacingStrategy,
                    timeSpan: supplementChapterCtx.timeSpan,
                    keyEvents: supplementChapterCtx.keyEvents,
                    isClimax: supplementChapterCtx.isClimax,
                    expectedCoolPoints: supplementChapterCtx.expectedCoolPoints,
                  }
                : undefined,
              enhancedDesignPrompt: supplementEnhancedPrompt,
            },
            'smartContinue',
            Math.ceil(Math.min(additionalWords, maxSupplement)),
            (chunk: string) => {
              newContent += chunk;
            },
            () => {
              resolve();
            },
            (errMsg: string) => {
              reject(new Error(errMsg));
            },
            abortController?.signal
          );
        });
      } else {
        const result = await (client as any).continueWriting(
          {
            project,
            currentChapterId: context.chapter.id,
            currentChapterIndex: context.chapter.orderIndex,
            currentChapterTitle: context.chapter.title,
            currentChapterContent: endingSnippet,
            currentChapterOutline: context.chapter.outline || undefined,
            fullOutline: buildFullOutlineText(projectStore.plotOutline),
            customPrompt: supplementInstruction,
            adjacentChaptersSummary: context.previousChapter
              ? {
                  previousChapterTitle: context.previousChapter.title,
                  previousChapterSummary: context.previousChapter.summary,
                  previousChapterEnding: context.previousChapter.ending,
                  nextChapterTitle: undefined,
                  nextChapterSummary: undefined,
                }
              : undefined,
            recentChaptersFullText: context.memoryData.shortTermFullText,
            charactersInScene: context.characters,
            relatedForeshadows: context.foreshadows,
            writingStyle: supplementStyle,
            currentChapterOutlineContext: supplementChapterCtx
              ? {
                  chapterType: supplementChapterCtx.chapterType,
                  hookType: supplementChapterCtx.hookType,
                  pacingStrategy: supplementChapterCtx.pacingStrategy,
                  timeSpan: supplementChapterCtx.timeSpan,
                  keyEvents: supplementChapterCtx.keyEvents,
                  isClimax: supplementChapterCtx.isClimax,
                  expectedCoolPoints: supplementChapterCtx.expectedCoolPoints,
                }
              : undefined,
            enhancedDesignPrompt: supplementEnhancedPrompt,
          },
          'smartContinue',
          Math.ceil(Math.min(additionalWords, maxSupplement))
        );

        if (result?.content) {
          newContent = result.content;
        }
      }

      if (newContent) {
        // 将补充内容追加到现有内容
        const separator = !currentGeneratedContent.endsWith('\n') ? '\n\n' : '';
        currentGeneratedContent = currentGeneratedContent + separator + newContent;
        generatedContent.value = currentGeneratedContent;
        actualWordCount.value = countWords(currentGeneratedContent);
      }

      return currentGeneratedContent;
    } catch (err) {
      if (err instanceof Error && err.message === 'Generation stopped by user') {
        error.value = null;
      } else {
        error.value = err instanceof Error ? err.message : '补充续写失败';
      }
      return null;
    } finally {
      isGenerating.value = false;
      isSupplementing.value = false;
    }
  }

  /**
   * 构建补充续写的提示词
   */
  function buildSupplementPrompt(
    existingContent: string,
    requestedWords: number,
    actualWords: number,
    context: ChapterWritingContext
  ): string {
    const currentWords = countWords(existingContent);
    const endingSnippet = existingContent.slice(-500) || '（无）';

    return `【补充续写指令】

## 当前状态
- 已有字数：约 ${currentWords} 字
- 目标字数：约 ${targetWordCount.value} 字
- 本次补充：约 ${actualWords} 字
- 补充轮次：第 ${supplementRound.value}/${MAX_SUPPLEMENT_ROUNDS} 轮

## 补充要求
1. **自然衔接**：从原文结尾处继续，不要重复已有内容
2. **保持风格**：与原文保持一致的文风、语气和叙事节奏
3. **内容充实**：补充的内容要有实质性情节推进，不要凑字数
4. **衔接自然**：补充内容与原文之间过渡要自然，不突兀

## 原文结尾（请从这里继续）
${endingSnippet}

## 章节上下文
- 章节标题：${context.chapter.title}
- 章节大纲：${context.chapter.outline || '（无）'}

请直接输出补充内容，不要添加任何前缀说明。`;
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
  let skipReview = false; // 强制跳过审查标志（用户点击"强制继续"后设为 true，保留到下次应用完成）

  function getLowerStrictness(
    strictness: 'relaxed' | 'normal' | 'strict'
  ): 'relaxed' | 'normal' | 'strict' | null {
    const levels: Array<'relaxed' | 'normal' | 'strict'> = ['strict', 'normal', 'relaxed'];
    const currentIndex = levels.indexOf(strictness);
    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }
    return null;
  }

  function getStrictnessLabel(strictness: 'relaxed' | 'normal' | 'strict'): string {
    switch (strictness) {
      case 'strict':
        return '严格';
      case 'normal':
        return '正常';
      case 'relaxed':
        return '宽松';
      default:
        return strictness;
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

      // 审查结果（用于生成报告）
      let lastReviewResult: BlockingReviewResult | null = null;

      // ========== 步骤 3: 审查（跳过逻辑） ==========
      if (skipReview) {
        // 用户已点击"强制继续"，跳过审查直接进入保存
        currentStep.value = 'save';
      } else {
        // 正常审查流程
        currentStep.value = 'review';
        currentStrictness = 'normal';
        let reviewPassed = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!reviewPassed && attempts < maxAttempts) {
          attempts++;

          lastReviewResult = await performBlockingReview(
            project,
            { ...currentChapter, content: currentGeneratedContent },
            currentIndex,
            prevChapter,
            currentStrictness
          );
          reviewResult.value = lastReviewResult;
          blockingIssues.value = getBlockingIssuesToFix(lastReviewResult, 10);

          if (canProceedToPolish(lastReviewResult)) {
            reviewPassed = true;
            break;
          }

          const lowerStrictness = getLowerStrictness(currentStrictness);
          if (lowerStrictness) {
            currentStrictness = lowerStrictness;
          } else {
            console.warn(`[DEBUG applyGeneratedContent] ⚠️ 已达最低严格度，审查仍未通过`);
            break;
          }
        }

        // 未通过且未跳过审查，显示错误
        if (!reviewPassed && !skipReview && lastReviewResult) {
          console.warn('[DEBUG applyGeneratedContent] ❌ 退出: 审查未通过且未跳过');
          error.value = `审查未通过：${lastReviewResult.blockingCount}个阻断问题（已达最低严格度，可选择跳过）`;
          if (currentChapterId) {
            latestReport.value = generateReport(
              currentChapterId,
              currentChapterNumber,
              currentChapter.title,
              lastReviewResult as any,
              {} as any,
              { strictness: currentStrictness, passThreshold: 70 }
            );
          }
          return false;
        }
      }

      // 生成报告（无论通过审查还是跳过审查）
      if (currentChapterId && lastReviewResult) {
        latestReport.value = generateReport(
          currentChapterId,
          currentChapterNumber,
          currentChapter.title,
          lastReviewResult as any,
          {} as any,
          { strictness: currentStrictness, passThreshold: 70 }
        );
      }

      // ========== 步骤 4: 润色（去AI味） ==========
      // 正文不改写（保持稳定，由系统提示词的"去AI味门控路由"在生成阶段预防）
      // 仅做标题提取 + 可观测检测日志（不改内容），为后续决策提供数据
      currentStep.value = 'polish';
      let processedContent = currentGeneratedContent;
      let extractedTitle: string | null | undefined;

      const titleValidation = DeAIService.extractAndValidateTitle(processedContent);
      extractedTitle = titleValidation.title;
      processedContent = titleValidation.content;

      // 可观测检测：记录检测到的问题（纯检测，不改写正文）
      try {
        const detection = await DeAIService.detect(processedContent);
        if (detection.issues.length > 0) {
          console.log(
            `[智能续写] 去AI味检测：发现 ${detection.issues.length} 处问题，AI味等级=${detection.level}（已由提示词门控预防，正文未改写）`
          );
        }
      } catch (err) {
        console.warn('[智能续写] 去AI味检测失败（不影响写作流程）:', err);
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

      // ✅ 成功后：重置状态
      skipReview = false;
      currentGeneratedContent = '';
      generatedContent.value = '';
      progress.value = 0;
      currentStep.value = 'idle';
      blockingIssues.value = [];
      reviewResult.value = null;

      return true;
    } catch (err) {
      console.error('[DEBUG applyGeneratedContent] ❌ 抛出异常:', err);
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
    skipReview = false;
    // 重置字数相关状态
    actualWordCount.value = 0;
    targetWordCount.value = 0;
    isSupplementing.value = false;
    supplementRound.value = 0;
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
    skipReview = true;
  }

  function forceProceedToPolish(): void {
    console.warn('[智能续写] 用户强制继续进行润色');
    skipReview = true;
  }

  /**
   * 导出报告
   */
  function exportReport(format: 'json' | 'markdown'): string | null {
    if (!latestReport.value) {
      console.warn('[ChapterWriter] 没有可导出的报告');
      return null;
    }

    if (format === 'json') {
      return exportToJSON(latestReport.value);
    } else {
      return exportToMarkdown(latestReport.value);
    }
  }

  /**
   * 获取当前报告
   */
  function getReport(): StructuredReviewReport | null {
    return latestReport.value;
  }

  /**
   * 获取失败列表
   */
  function getFailures(): FailureState[] {
    return currentChapterId ? getChapterFailures(currentChapterId) : [];
  }

  /**
   * 尝试恢复失败
   */
  async function attemptRecovery(failureId: string): Promise<{
    strategy: RecoveryStrategy | null;
    action: string;
  }> {
    return attemptRecoveryAction(failureId);
  }

  /**
   * 清除失败记录
   */
  function clearFailures(): void {
    if (currentChapterId) {
      clearChapterFailures(currentChapterId);
    }
  }

  return {
    isGenerating,
    progress,
    error,
    generatedContent,
    currentStep,
    blockingIssues,
    reviewResult,
    actualWordCount,
    targetWordCount,
    isSupplementing,
    supplementRound,
    latestReport,
    writeChapter,
    stopWriting,
    buildContext,
    applyGeneratedContent,
    copyToClipboard,
    reset,
    retryCurrentStep,
    skipBlockingIssues,
    forceProceedToPolish,
    supplementContinue,
    checkAndSupplement,
    exportReport,
    getReport,
    getFailures,
    attemptRecovery,
    clearFailures,
  };
}
