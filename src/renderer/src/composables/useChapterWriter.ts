/**
 * 单章写作 Composable - 增强版
 *
 * 核心改进：
 * 1. TaskBook 作为核心前置步骤（不再是可选）
 * 2. Blocking 闸门机制
 * 3. 结构化报告生成
 * 4. 失败恢复机制
 *
 * v2.1 改造（状态驱动架构）：
 * - writeChapter 委托给 useWritingOrchestratorV2()，
 *   内部已走 L1-L7 完整闭环（状态/门禁/提交/checkpoint）。
 * - 本 composable 只保留：UI 状态映射、辅助方法（applyGeneratedContent/copyToClipboard/supplementContinue/checkAndSupplement 等）、
 *   进度报告导出、useFailureRecovery 老失败恢复系统（保留为兼容层）。
 * - 不再直接调 AI client，所有 LLM 调用走 V2 编排器。
 */

import { ref, computed, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { useWritingOrchestratorV2 } from '@/services/writing/WritingOrchestratorV2';
import type { WritingStyle, ChapterWritingContext, ChapterType } from '@/types/writing';
import { ContextManager } from '@/services/writing/context-manager';
import {
  extractChapterContext,
  buildChapterOutlineText,
  buildWindowedOutlineText,
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
import { countWords } from '@/services/writing/utils';
import { sanitizeStructuredProseLeakage } from '@/services/story-runtime/stripDraftLeakage';
import {
  MAX_WORD_THRESHOLD,
  MAX_SUPPLEMENT_ROUNDS,
  checkWordCount as sharedCheckWordCount,
  buildSupplementPrompt as sharedBuildSupplementPrompt,
} from '@/services/writing/supplement';
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
  /** 管道已把正文写入章节（或用户已点应用）时为 true，用于禁用重复「应用」 */
  isAppliedToChapter: typeof isAppliedToChapter;

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
//
// 说明（Bug 5 修复）：此前 isGenerating / progress / currentStep / currentTaskBook /
// reportGenerator / recoveryManager 等全部定义在模块顶层，导致：
// 1) 不同组件 / 不同章节调用 useChapterWriter() 会共享同一份响应式状态（A 的 reset 清掉 B）；
// 2) currentChapterId / currentChapterNumber 跨章节残留，且在 generateTaskBook 里被引用，
//    若该函数在 writeChapter 之前被调用（或被并发调用）会触发 ReferenceError。
// 全部移入工厂函数内部，每次调用都得到独立状态，符合 Vue composable 的预期语义。
// 当前唯一消费者是 AIPanel.vue（单写手实例），改动行为兼容。
// ============================================

// 字数阈值常量：统一从 supplement.ts 导入（与管道 / 批量共用）
// MAX_WORD_THRESHOLD / MAX_SUPPLEMENT_ROUNDS

function extractChapterTypeFromOutline(outline: string, orderIndex: number): ChapterType {
  if (!outline) {
    if (orderIndex === 0) {
      return 'world_intro';
    }
    return 'normal';
  }

  // 注：原代码对中文 outline 调用 toLowerCase() 是 no-op，已去掉
  if (
    outline.includes('世界观') ||
    outline.includes('背景') ||
    outline.includes('设定') ||
    outline.includes('大陆') ||
    outline.includes('世界') ||
    outline.includes('历史')
  ) {
    return 'world_intro';
  }

  if (
    outline.includes('登场') ||
    outline.includes('出场') ||
    outline.includes('初遇') ||
    outline.includes('相遇') ||
    outline.includes('介绍') ||
    outline.includes('主角')
  ) {
    return 'character_intro';
  }

  if (
    outline.includes('开端') ||
    outline.includes('开始') ||
    outline.includes('序幕') ||
    outline.includes('引入')
  ) {
    return 'plot_setup';
  }

  if (
    outline.includes('高潮') ||
    outline.includes('决战') ||
    outline.includes('对决') ||
    outline.includes('爆发')
  ) {
    return 'climax';
  }

  if (
    outline.includes('解决') ||
    outline.includes('结束') ||
    outline.includes('落幕') ||
    outline.includes('结局') ||
    outline.includes('收尾')
  ) {
    return 'resolution';
  }

  if (
    outline.includes('过渡') ||
    outline.includes('间章') ||
    outline.includes('日常') ||
    outline.includes('休息')
  ) {
    return 'transitional';
  }

  if (
    outline.includes('终章') ||
    outline.includes('尾声') ||
    outline.includes('最终') ||
    outline.includes('完结')
  ) {
    return 'ending';
  }

  if (orderIndex === 0) {
    return 'world_intro';
  }

  return 'normal';
}

/**
 * 执行审查（带 Blocking 闸门）。纯依赖入参，无需工厂内状态，放模块级。
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

  // ====== 响应式状态（每次调用独立） ======
  const isGenerating = ref(false);
  const progress = ref(0);
  const error = ref<string | null>(null);
  const generatedContent = ref('');

  const currentStep = ref<
    'idle' | 'taskbook' | 'draft' | 'supplement' | 'review' | 'polish' | 'save'
  >('idle');
  const blockingIssues = ref<any[]>([]);
  const reviewResult = ref<BlockingReviewResult | null>(null);
  const reviewedContent = ref('');  // v2.1: 同步 V2 的审查产出
  const polishedContent = ref('');  // v2.1: 同步 V2 的润色产出
  const commitResult = ref<any>(null);  // v2.1: 同步 V2 的提交结果

  // 字数统计状态
  const actualWordCount = ref(0);
  const targetWordCount = ref(0);
  const isSupplementing = ref(false);
  const supplementRound = ref(0);
  /** 管道已落库或用户已应用，禁止重复点「应用」追加/覆盖 */
  const isAppliedToChapter = ref(false);

  // 报告状态
  const latestReport = ref<StructuredReviewReport | null>(null);

  // ====== 非响应式状态（闭包内） ======
  let currentTaskBook: WritingTaskBook | null = null;
  let currentGeneratedContent = '';
  let abortController: AbortController | null = null;

  // 当前章节信息
  let currentChapterId = '';
  let currentChapterNumber = 0;

  // 审查严格度
  let currentStrictness: 'relaxed' | 'normal' | 'strict' = 'normal';
  // 强制跳过审查标志（用户点击"强制继续"后设为 true，保留到下次应用完成）
  let skipReview = false;

  // ====== 子系统（每次调用独立初始化） ======
  const {
    generator: reportGenerator,
    generate: generateReport,
    exportToJSON,
    exportToMarkdown,
    getHistory,
    getLatestReport,
  } = useReportGenerator();

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
    // 传入 chapterOrderIndex 启用位置兜底：第 N 个 chapter 型 plot 节点 = 第 N 章
    const chapterCtx = extractChapterContext(
      projectStore.plotOutline,
      currentChapter.id,
      currentChapter.title,
      currentIndex,
    );
    const currentChapterOutline = chapterCtx
      ? buildChapterOutlineText(chapterCtx, false)
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
   * 集中构建写前 prompt 载荷（chapterCtx / enhancedPrompt / fullOutline）
   *
   * 此前主写、补充续写各分支都重复算一遍这些字段（每次约 30+ 行），既冗余又有遗漏风险。
   * 这里统一收口，配合 B1（fullOutline 窗口化）一起降低 token 消耗。
   */
  function buildWritingPromptParts(
    context: ChapterWritingContext,
    writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient',
  ) {
    const project = projectStore.currentProject!;
    const orderIndex = context.chapter.orderIndex;

    // chapterCtx：用位置兜底（首页大纲无 chapterId 绑定时靠第 N 个 chapter 节点对齐）
    const chapterCtx = extractChapterContext(
      projectStore.plotOutline,
      context.chapter.id,
      context.chapter.title,
      orderIndex,
    );

    const enhancedPrompt = buildEnhancedDesignPrompt({
      projectTitle: project.name,
      projectSynopsis: project.description || '',
      projectGenre: project.genre.map(g => g.name),
      currentChapter: chapterCtx || {
        title: context.chapter.title,
        description: context.chapter.outline || '',
        orderIndex,
      },
      currentChapterOutline: context.chapter.outline || '',
      emotionGoal: project.emotionGoal,
      conflictDesign: project.conflictDesign,
      coolPointDesign: project.coolPointDesign,
      storyLines: project.storyLines,
      goldenfingerDesign: project.goldenfingerDesign,
      coreSellingPoints: project.coreSellingPoints,
      startupPack: project.metadata?.startupPack,
      storyScale: project.metadata?.storyScale,
      writingStyle: writingStyle as any,
    });

    // 窗口化：当前章 ± 5 章给完整细纲，其它只给标题，大幅省 token 且聚焦当前章
    const fullOutline = buildWindowedOutlineText(projectStore.plotOutline, orderIndex, 5);

    return { chapterCtx, enhancedPrompt, fullOutline };
  }

  /**
   * 写入章节（v2.1 委托给 StateDriven 编排器）
   *
   * 老版本（行 540-772 已被替换）：
   *   1. 调 generateTaskBook 生成 TaskBook
   *   2. 调 client.continueWriting/Stream 写散文
   *   3. 内嵌补充续写逻辑
   *
   * 新版本：直接调 useWritingOrchestratorV2().run()，
   *   内部走 L1(状态) → L2(检索) → L3(拼prompt+CHANGES) → L4(写+重试) →
   *   L5(门禁) → L6(事务提交) → L7(checkpoint) 完整闭环。
   *   useChapterWriter 只做 UI 状态映射 + 异常转换 + 补充续写 fallback。
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
    isAppliedToChapter.value = false;

    if (isGenerating.value) {
      error.value = '正在生成中，请稍候';
      return null;
    }

    if (!projectStore.currentProject || !projectStore.currentChapter) {
      error.value = '项目或章节未加载';
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
      const project = projectStore.currentProject;
      const currentChapter = projectStore.currentChapter;

      // 记录章节信息
      currentChapterId = currentChapter.id;
      currentChapterNumber = currentChapter.orderIndex + 1;

      // 调 V2 编排器（其内部已调 StateDriven）
      const v2 = useWritingOrchestratorV2();
      currentStep.value = 'draft';

      const success = await v2.run({
        targetWordCount: requestedTarget,
        writingStyle: writingStyle as any,
      });

      // 同步 V2 状态到 useChapterWriter
      generatedContent.value = v2.generatedContent.value;
      currentGeneratedContent = v2.generatedContent.value;
      reviewedContent.value = v2.reviewedContent.value;
      polishedContent.value = v2.polishedContent.value;
      actualWordCount.value = v2.actualWordCount.value;
      reviewResult.value = v2.reviewResult.value as any;
      commitResult.value = v2.commitResult.value as any;
      currentTaskBook = (v2 as any).taskBook?.value ?? null;
      currentStep.value = v2.currentStep.value as any;
      progress.value = 100;

      if (!success) {
        // V2 失败（如门禁未通过）→ 透传错误
        if (v2.error.value && v2.error.value !== 'Generation stopped by user') {
          error.value = v2.error.value;
          // 写入失败记录（保留老失败恢复兼容）
          recoveryManager.registerFailure(
            currentChapterId,
            currentChapterNumber,
            'review',
            v2.error.value,
          );
        }
        return null;
      }

      // 补写已由 ChapterWritingPipeline（SMART_CONTINUE_PRESET.enableSupplement）统一处理，
      // 此处不再二次调用 supplementContinue，避免重复补写。

      // 当前管道（StateDriven / LongForm）成功后都会 replace 到章节；直接标记已写入，
      // 避免标题清洗导致字符串不完全相等时仍可重复「应用」。
      if (currentGeneratedContent.trim() && (projectStore.currentChapter?.content || '').trim()) {
        isAppliedToChapter.value = true;
      }

      return currentGeneratedContent;
    } catch (err) {
      // 失败兜底：记录到老失败恢复系统（向后兼容）
      if (currentChapterId) {
        recoveryManager.registerFailure(
          currentChapterId,
          currentChapterNumber,
          currentStep.value as PipelineStep,
          err instanceof Error ? err.message : '未知错误',
        );
      }

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
   *
   * 注意（B2 收敛）：CBN/CPNs/CEN/mustCover/forbiddenZones 已经通过
   * currentChapterOutlineContext（来自大纲节点的 chapterCtx）单独、结构化地传给 AI，
   * 这里不再重复拼进文本——否则同一个 CBN 出现两次（任务书版 + 大纲版）反而会让模型困惑。
   * 这里只保留大纲节点里**没有**的执行约束：风格指引 / 结尾感觉 / 开放问题。
   */
  function buildEnhancedOutline(taskBook: WritingTaskBook, baseOutline: string): string {
    const taskBookSection = `
=== 写作任务书（执行约束）===
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
  // 阈值与 checkWordCount / buildSupplementPrompt 已下沉到 services/writing/supplement.ts，
  // 与 ChapterWritingPipeline 共用。此处保留手动补写入口（AIPanel「补充续写」按钮）。

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
    return sharedCheckWordCount(content, target);
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
      // 衔接上下文（原文结尾片段）统一由 customPrompt（buildSupplementPrompt 内已拼入
      // existingContent.slice(-500)）承载。此前同时塞进 currentChapterContent 会造成结尾片段
      // 双重注入（一份 1000 字、一份 500 字），且触发 base.service 的「从结尾继续」逻辑与
      // customPrompt 的「请从这里继续」语义打架。这里留空，base.service 会回退到「根据本章大纲创作」。

      // 复用主流程的上下文构建（集中载荷，与主写分支保持一致）
      const {
        chapterCtx: supplementChapterCtx,
        enhancedPrompt: supplementEnhancedPrompt,
        fullOutline: supplementFullOutline,
      } = buildWritingPromptParts(context, supplementStyle);

      if (settingsStore.streamOutput && (client as any).continueWritingStream) {
        await new Promise<void>((resolve, reject) => {
          (client as any).continueWritingStream(
            {
              project,
              currentChapterId: context.chapter.id,
              currentChapterIndex: context.chapter.orderIndex,
              currentChapterTitle: context.chapter.title,
              currentChapterContent: '',
              // 注意：补充续写必须清空 currentChapterOutline。
              // 否则 base.service 会走"基于大纲完成任务 / 完成大纲后再结束"分支，
              // 与 customPrompt（supplementInstruction）的"从结尾续写补字"语义冲突，
              // 模型可能整章重写而非续写。清空后走"普通章节续写"分支，纯按结尾衔接。
              currentChapterOutline: undefined,
              fullOutline: supplementFullOutline,
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
            currentChapterContent: '',
            // 同 stream 分支：补充续写清空大纲，避免与续写指令语义冲突。
            currentChapterOutline: undefined,
            fullOutline: supplementFullOutline,
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
    return sharedBuildSupplementPrompt({
      existingContent,
      targetWordCount: targetWordCount.value,
      additionalWords: actualWords,
      round: supplementRound.value,
      maxRounds: MAX_SUPPLEMENT_ROUNDS,
      chapterTitle: context.chapter.title,
      chapterOutline: context.chapter.outline || '',
    });
  }

  /**
   * 停止写作（真正 abort 在飞 HTTP）
   */
  function stopWriting(): void {
    if (abortController) {
      abortController.abort();
    }
    // V2 使用模块级 AbortController，任意实例 stop() 均可中断当前 run
    useWritingOrchestratorV2().stop();
  }

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

    // 管道已写入章节：只做状态清理，禁止再次追加导致正文翻倍
    if (isAppliedToChapter.value) {
      currentGeneratedContent = '';
      generatedContent.value = '';
      progress.value = 0;
      currentStep.value = 'idle';
      return true;
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
          console.warn('[DEBUG applyGeneratedContent] ❌ 退出: 审查未通过且未跳过', {
            blockingCount: lastReviewResult.blockingCount,
            decision: lastReviewResult.decision,
          });
          const decisionHint = lastReviewResult.decision?.reason
            ? `：${lastReviewResult.decision.reason}`
            : `：${lastReviewResult.blockingCount}个阻断问题`;
          error.value = `审查未通过${decisionHint}（已达最低严格度，可选择跳过）`;
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
      // 正文不改写叙述（去AI味仅检测）；仅剥离结构化 JSON 骨架泄漏，保证编辑器回显干净
      currentStep.value = 'polish';
      let processedContent = sanitizeStructuredProseLeakage(currentGeneratedContent);
      let extractedTitle: string | null | undefined;

      const titleValidation = DeAIService.extractAndValidateTitle(processedContent);
      extractedTitle = titleValidation.title;
      processedContent = sanitizeStructuredProseLeakage(titleValidation.content);

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
      // 管道（ChapterWritingPipeline）在 L6 已落库；若正文已包含生成内容则跳过追加，避免重复写入。
      currentStep.value = 'save';
      const currentContent = projectStore.currentChapter?.content || '';
      const cleanedPersisted = sanitizeStructuredProseLeakage(currentContent);
      const alreadyPersistedByPipeline =
        currentContent.length > 0 &&
        (currentContent === processedContent ||
          cleanedPersisted === processedContent ||
          currentContent === currentGeneratedContent ||
          currentContent.endsWith(processedContent) ||
          currentContent.endsWith(currentGeneratedContent) ||
          (processedContent.length > 80 &&
            currentContent.includes(processedContent.slice(0, 80))));

      if (!alreadyPersistedByPipeline) {
        const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
        const newContent = sanitizeStructuredProseLeakage(
          currentContent + separator + processedContent
        );

        const updateData: Record<string, unknown> = {
          content: newContent,
          wordCount: countWords(newContent),
        };

        if (extractedTitle && projectStore.currentChapter) {
          updateData.title = extractedTitle;
        }

        await projectStore.updateChapter(projectStore.currentChapterId!, updateData);
      } else {
        // 管道已落库：若仍含 schema 泄漏则原地修正；标题按需同步
        const updateData: Record<string, unknown> = {};
        if (cleanedPersisted !== currentContent) {
          updateData.content = cleanedPersisted;
          updateData.wordCount = countWords(cleanedPersisted);
        }
        if (
          extractedTitle &&
          projectStore.currentChapter &&
          (!projectStore.currentChapter.title || projectStore.currentChapter.title.startsWith('第'))
        ) {
          updateData.title = extractedTitle;
        }
        if (Object.keys(updateData).length > 0) {
          await projectStore.updateChapter(projectStore.currentChapterId!, updateData);
        }
      }

      // 提取情节记忆
      extractMemoryAfterApply(projectStore.currentChapter!, currentIndex + 1);

      // ✅ 成功后：重置状态
      skipReview = false;
      isAppliedToChapter.value = true;
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
          characterRoster: (projectStore.currentProject?.characters ?? []).map(c => c.name),
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
    isAppliedToChapter.value = false;
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
    isAppliedToChapter,
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
