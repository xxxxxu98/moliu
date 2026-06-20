/**
 * 批量写作 Composable - 增强版
 *
 * 核心改进：
 * 1. TaskBook 作为核心前置步骤
 * 2. 引入 blocking 闸门机制
 * 3. 流水线式管理：起草 → 审查 → 润色 → 提交
 * 4. 自适应审查严格度 - 审查失败时逐步降低严格度，直到通过
 * 5. 自动化程度高 - 无需人工干预，避免死循环
 * 6. 结构化报告生成
 * 7. 失败恢复机制
 *
 * 审查策略：
 * - 每章从目标严格度开始（如 normal）
 * - 审查失败时，逐步降低严格度（normal → relaxed）
 * - 章节完成后，下一章重置为初始严格度
 * - 这样既保证质量，又避免无限循环
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Volume, ChapterMemory } from '@/types/project';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import {
  extractChapterMemory,
  buildCharacterStateTable,
  buildPlotProgressTable,
  safeExtractChapterMemory,
} from '@/services/writing/extract-plot-memory';
import {
  extractChapterContext,
  buildChapterOutlineText,
  buildWindowedOutlineText,
  buildEnhancedDesignPrompt,
} from '@/services/writing/OutlineContextBuilder';
import { initializeMemoryManager, getMemoryManager } from '@/services/writing/memory-manager';
import { ContextManager } from '@/services/writing/context-manager';
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
  WritingPipelineManager,
  type BlockingReviewResult,
  type WritingPipelineStage,
  type ReviewStrictness,
} from '@/services/review/blocking-review.service';
import { createChapterCommit, extractChapterFacts } from '@/services/writing/chapter-commit';
import { createForeshadowTracker, analyzeForeshadows } from '@/services/writing/foreshadow-tracker';
import type { WritingTaskBook } from '@/types/writing-task';
import { WritingError, ErrorCode, getErrorMessage } from '@/types/errors';
import { createEndingPerceptionEngine } from '@/services/writing/ending-perception-engine';
import {
  useReportGenerator,
  type StructuredReviewReport,
} from '@/services/writing/review/report-generator';
import {
  useFailureRecovery,
  type PipelineStep,
  type FailureState,
  type RecoveryStrategy,
  type RecoveryEvent,
} from '@/services/writing/failure-recovery';

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
  currentStrictness: Ref<ReviewStrictness>; // 当前使用的严格度
  initialStrictness: Ref<ReviewStrictness>; // 初始目标严格度
  reviewAttempts: Ref<number>; // 当前章节审查尝试次数
  strictnessHistory: Ref<Array<{ chapter: number; strictness: ReviewStrictness; passed: boolean }>>;

  // 失败重试状态
  maxRetries: Ref<number>; // 单章最大重试次数
  currentRetryCount: Ref<number>; // 当前章节重试次数（重试中显示 1/maxRetries，0 表示无重试）

  // 写到完结状态
  endingStatus: Ref<EndingCheckResult | null>; // 完结判断结果
  isReadyToEnd: Ref<boolean>; // 是否准备好完结

  // 报告相关
  latestReports: Ref<Map<number, StructuredReviewReport>>; // 每章的报告

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
    initialStrictness: ReviewStrictness; // 初始严格度
    // 失败重试配置
    maxRetries: number; // 单章失败重试次数
  }>;

  // 方法
  startBatchWriting: (targetChapters?: number, batchConfig?: BatchConfig) => Promise<void>;
  pauseWriting: () => void;
  resumeWriting: () => void;
  stopWriting: () => void;
  getNextChapterIndex: () => number;
  getTotalChapters: () => number;
  checkEndingReadiness: (
    project: any,
    chapterIndex: number,
    memories: ChapterMemory[]
  ) => EndingCheckResult;
  retryCurrentStep: () => Promise<void>;
  skipBlockingIssues: () => void;
  lowerStrictness: () => void;

  // 报告导出
  exportReport: (chapterNumber: number, format: 'json' | 'markdown') => string | null;
  getReport: (chapterNumber: number) => StructuredReviewReport | null;
  getAllReports: () => StructuredReviewReport[];

  // 失败恢复
  getFailures: (chapterId?: string) => FailureState[];
  getRecoveryHistory: (limit?: number) => RecoveryEvent[];
  clearFailures: () => void;
}

// 完结检查结果
export interface EndingCheckResult {
  isReady: boolean; // 是否准备好完结
  chapterProgress: number; // 章节进度百分比
  outlineProgress: number; // 大纲进度百分比
  foreshadowCompletion: number; // 伏笔完成率
  remainingChapters: number; // 预估剩余章节
  unresolvedForeshadows: number; // 未解决伏笔数

  // 增强字段
  foreshadowUrgencyScore: number; // 伏笔紧急度评分 (0-100)
  criticalForeshadows: ForeshadowUrgencyItem[]; // 紧急伏笔列表
  outlineNodesComplete: number; // 已完成大纲节点数
  outlineNodesTotal: number; // 总大纲节点数
  volumeProgress?: VolumeProgress; // 卷级进度（如果有）

  isInEndingPhase: boolean; // 是否已进入完结阶段
  phaseName: string; // 当前阶段名称
  canCreateNewChapter: boolean; // 是否可以创建新章节
  stopReason?: string; // 停止原因（如果是 'ending' 模式）
}

// 伏笔紧急度项
export interface ForeshadowUrgencyItem {
  hint: string; // 伏笔提示
  urgency: 'critical' | 'high' | 'medium' | 'low'; // 紧急度
  urgencyScore: number; // 紧急度评分 (0-100)
  plantedChapter: number; // 埋设章节
  suggestedResolutionChapter?: number; // 建议揭示章节
  overdueChapters: number; // 超期章节数
}

// 卷级进度
export interface VolumeProgress {
  currentVolume: number;
  totalVolumes: number;
  volumeProgress: number; // 当前卷进度百分比
  chaptersInVolume: number; // 当前卷章节数
  chaptersWritten: number; // 当前卷已写章节数
  volumeStatus: 'setup' | 'development' | 'climax' | 'resolution' | 'complete';
  nextVolumeReady: boolean; // 下一卷是否准备好开启
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
  initialStrictness?: ReviewStrictness; // 初始审查严格度
  maxRetries?: number; // 单章失败重试次数（指数退避）
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
  currentStrictness: ReviewStrictness; // 当前使用的严格度
  reviewAttempts: number; // 当前章节审查尝试次数
  currentChapter: number; // 当前处理的章节索引
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

function buildRecentChaptersFullText(
  projectStore: any,
  currentIndex: number,
  recentChapterCount: number
): string {
  const chapters = projectStore.sortedChapters;
  const recentChapters = chapters
    .filter(
      (c: any, i: number) => i < currentIndex && i >= Math.max(0, currentIndex - recentChapterCount)
    )
    .sort((a: any, b: any) => a.orderIndex - b.orderIndex);

  if (recentChapters.length === 0) return '';

  const contextManager = new ContextManager();
  return recentChapters
    .map((c: any) => {
      const content = c.content || '';
      if (!content) {
        return `【第${c.orderIndex + 1}章 · ${c.title}】\n\n（本章暂无内容）`;
      }
      // 压缩为「摘要 + 结尾」，避免整章原文灌入 prompt 浪费 token（首尾已足够承载文风）
      const summary = contextManager.extractPreviousChapterSummary(content, 300);
      const ending = content.length > 500 ? content.slice(-500) : content;
      return `【第${c.orderIndex + 1}章 · ${c.title}】\n[摘要] ${summary}\n……\n[结尾] ${ending}`;
    })
    .join('\n\n==========\n\n');
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

  return result;
}

/**
 * 执行润色（必须在 blocking 通过后）
 *
 * 【设计说明】原 DeAIService.fix() 基于正则替换/删句，有误删正文风险，
 * 已于 2026-05-24 禁用自动改写。当前策略：
 * - 正文不改写（保持稳定，由系统提示词的"去AI味门控路由"在生成阶段预防）
 * - 仅做标题提取 + 可观测检测日志（不改内容），为后续决策提供数据
 */
async function performPolish(
  content: string,
  deAIEnabled: boolean
): Promise<{
  fixedContent: string;
  title: string | null;
  fixedCount: number;
}> {
  const result = DeAIService.extractAndValidateTitle(content);

  // 可观测检测：启用去AI味时记录检测到的问题（纯检测，不改写正文）
  if (deAIEnabled) {
    try {
      const detection = await DeAIService.detect(content);
      if (detection.issues.length > 0) {
        console.log(
          `[批量写作] 去AI味检测：发现 ${detection.issues.length} 处问题，AI味等级=${detection.level}（已由提示词门控预防，正文未改写）`
        );
      }
    } catch (err) {
      console.warn('[批量写作] 去AI味检测失败（不影响写作流程）:', err);
    }
  }

  return {
    fixedContent: result.content,
    title: result.title,
    fixedCount: 0,
  };
}

/**
 * 执行 Commit 提交
 */
async function performCommit(project: any, chapter: any, chapterIndex: number): Promise<boolean> {
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

/**
 * 内联计算伏笔紧急度
 * 不依赖 EndingPerceptionEngine 的私有方法
 */
function calculateInlineUrgency(
  foreshadow: any,
  currentChapterIndex: number
): 'critical' | 'high' | 'medium' | 'low' {
  const planted = foreshadow.createdChapter || 0;
  const expected = foreshadow.suggestedResolutionChapter;
  const plannedCount = 100;

  // 如果有期望揭示章节
  if (expected) {
    const remaining = expected - currentChapterIndex;
    if (remaining <= 0) return 'critical';
    if (remaining <= 3) return 'high';
    if (remaining <= 5) return 'medium';
    return 'low';
  }

  // 按总进度推算
  const plantedProgress = planted / plannedCount;
  const currentProgress = currentChapterIndex / plannedCount;

  if (plantedProgress > 0.8 && currentProgress > 0.9) return 'critical';
  if (plantedProgress > 0.6 && currentProgress > 0.75) return 'high';
  if (plantedProgress > 0.4 && currentProgress > 0.5) return 'medium';
  return 'low';
}

/**
 * 计算伏笔紧急度评分
 * 参考 webnovel-writer 的公式：紧急度 = (已过章节 / 目标回收章节) × 层级权重
 */
function calculateForeshadowUrgencyScore(
  createdChapter: number,
  suggestedResolutionChapter: number | undefined,
  currentChapterIndex: number,
  urgency: 'critical' | 'high' | 'medium' | 'low'
): number {
  const plannedCount = 100; // 默认计划章节数
  const elapsed = currentChapterIndex - createdChapter;

  // 基础紧急度
  let score = 0;
  const urgencyWeight = { critical: 100, high: 75, medium: 50, low: 25 };

  // 如果有目标章节，计算超期程度
  if (suggestedResolutionChapter) {
    const targetElapsed = suggestedResolutionChapter - createdChapter;
    if (currentChapterIndex > suggestedResolutionChapter) {
      // 超期
      const overdue = currentChapterIndex - suggestedResolutionChapter;
      score = Math.min(100, 50 + overdue * 10);
    } else {
      // 未超期
      const remaining = suggestedResolutionChapter - currentChapterIndex;
      score = Math.min(urgencyWeight[urgency], 100 - remaining * 5);
    }
  } else {
    // 按进度推算
    const progress = currentChapterIndex / plannedCount;
    if (progress > 0.9) {
      score = urgencyWeight.critical;
    } else if (progress > 0.75) {
      score = urgencyWeight.high;
    } else if (progress > 0.5) {
      score = urgencyWeight.medium;
    } else {
      score = urgencyWeight.low;
    }
  }

  return Math.round(score);
}

/**
 * 检查是否准备好完结
 * 基于情节完整性、大纲进度、伏笔完成度等判断
 */
function checkEndingReadiness(
  project: any,
  currentChapterIndex: number,
  memories: ChapterMemory[]
): EndingCheckResult {
  const plannedChapterCount =
    project?.metadata?.plannedChapterCount ||
    (project?.plotOutline?.length > 0 ? project.plotOutline.length : 100);

  // 创建完结感知引擎
  const engine = createEndingPerceptionEngine(
    project,
    currentChapterIndex,
    memories,
    project?.foreshadows || [],
    project?.plotOutline || []
  );

  // 获取完结准备度分析
  const readiness = engine.analyzeEndingReadiness();

  // 计算章节进度
  const chapterProgress = Math.round((currentChapterIndex / plannedChapterCount) * 100);

  // ========== 增强：计算伏笔紧急度评分 ==========
  const foreshadows = project?.foreshadows || [];
  const unresolvedForeshadows = foreshadows.filter(
    (f: any) => f.status !== 'resolved' && f.status !== 'abandoned'
  );

  // 计算每个伏笔的紧急度
  const criticalForeshadows: ForeshadowUrgencyItem[] = unresolvedForeshadows
    .map((f: any) => {
      // 计算伏笔紧急度（内联计算，不依赖私有方法）
      const urgency = calculateInlineUrgency(f, currentChapterIndex);
      const urgencyWeight = { critical: 100, high: 75, medium: 50, low: 25 };

      return {
        hint: f.hint || '',
        urgency,
        urgencyScore: calculateForeshadowUrgencyScore(
          f.createdChapter || 0,
          f.suggestedResolutionChapter,
          currentChapterIndex,
          urgency
        ),
        plantedChapter: f.createdChapter || 0,
        suggestedResolutionChapter: f.suggestedResolutionChapter,
        overdueChapters: f.suggestedResolutionChapter
          ? Math.max(0, currentChapterIndex - f.suggestedResolutionChapter)
          : 0,
      };
    })
    .sort((a: ForeshadowUrgencyItem, b: ForeshadowUrgencyItem) => b.urgencyScore - a.urgencyScore);

  // 计算平均伏笔紧急度评分
  const foreshadowUrgencyScore =
    criticalForeshadows.length > 0
      ? Math.round(
          criticalForeshadows.reduce(
            (sum: number, f: ForeshadowUrgencyItem) => sum + f.urgencyScore,
            0
          ) / criticalForeshadows.length
        )
      : 0;

  // ========== 增强：大纲节点完成度 ==========
  const plotOutline = project?.plotOutline || [];
  const chapterNodes = plotOutline.filter((n: any) => n.type === 'chapter' || n.chapterType);
  const outlineNodesTotal = chapterNodes.length;

  // 计算已完成的大纲节点（章节范围在当前章节之前的）
  const outlineNodesComplete = chapterNodes.filter((n: any) => {
    if (n.chapterRange) {
      return n.chapterRange[1] <= currentChapterIndex;
    }
    return n.orderIndex <= currentChapterIndex;
  }).length;

  // ========== 增强：卷级进度 ==========
  const volumes = project?.volumes || [];
  const currentVolume = volumes.find((v: any, idx: number) => {
    const startChapter =
      volumes.slice(0, idx).reduce((sum: number, prev: any) => sum + (prev.chapterCount || 10), 0) +
      1;
    const endChapter = startChapter + (v.chapterCount || 10) - 1;
    return currentChapterIndex >= startChapter && currentChapterIndex <= endChapter;
  });

  let volumeProgress: VolumeProgress | undefined;
  if (volumes.length > 0) {
    const volumeIndex = currentVolume ? volumes.indexOf(currentVolume) : -1;
    const chaptersInVolume = currentVolume?.chapterCount || 10;
    const chaptersWritten =
      currentVolume && volumeIndex >= 0
        ? Math.max(
            0,
            currentChapterIndex -
              volumes
                .slice(0, volumeIndex)
                .reduce((sum: number, v: any) => sum + (v.chapterCount || 10), 0)
          )
        : 0;

    volumeProgress = {
      currentVolume: volumeIndex + 1,
      totalVolumes: volumes.length,
      volumeProgress: Math.round((chaptersWritten / chaptersInVolume) * 100),
      chaptersInVolume,
      chaptersWritten,
      volumeStatus: chaptersWritten >= chaptersInVolume ? 'complete' : 'development',
      nextVolumeReady: chaptersWritten >= chaptersInVolume && volumeIndex < volumes.length - 1,
    };
  }

  // 判断是否可以创建新章节
  // 条件：1. 章节数未达到计划 2. 未处于收束阶段之后
  const canCreateNewChapter =
    currentChapterIndex < plannedChapterCount * 1.1 && readiness.overallProgress < 95;

  // 判断是否准备好完结
  // 核心条件：高潮完成 + 目标达成 + 章节进度 >= 90%
  const isReady =
    readiness.climaxApproaching === false && // 高潮已过（不是即将到来）
    readiness.overallProgress >= 90 &&
    (readiness.isInEndingPhase === 'ending' ||
      readiness.isInEndingPhase === 'conclusion' ||
      readiness.isInEndingPhase === 'pre_ending');

  return {
    isReady,
    chapterProgress,
    outlineProgress: readiness.outlineProgress,
    foreshadowCompletion: readiness.foreshadowCompletionRate,
    remainingChapters: readiness.remainingChapters,
    unresolvedForeshadows: unresolvedForeshadows.length,

    // 增强字段
    foreshadowUrgencyScore,
    criticalForeshadows,
    outlineNodesComplete,
    outlineNodesTotal,
    volumeProgress,

    isInEndingPhase: readiness.isInEndingPhase !== 'normal',
    phaseName: readiness.phaseName,
    canCreateNewChapter,
  };
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
  const strictnessHistory = ref<
    Array<{ chapter: number; strictness: ReviewStrictness; passed: boolean }>
  >([]);

  // 写到完结状态
  const endingStatus = ref<EndingCheckResult | null>(null);
  const isReadyToEnd = ref(false);

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
    maxRetries: 3,
  });

  // 失败重试状态
  const maxRetries = ref(3);
  const currentRetryCount = ref(0);

  // 上下文管理器
  const contextManager = new ContextManager();

  // 报告生成器
  const {
    generator: reportGenerator,
    generate: generateReport,
    exportToJSON,
    exportToMarkdown,
    getHistory,
    getLatestReport,
  } = useReportGenerator();

  // 报告存储
  const latestReports = ref<Map<number, StructuredReviewReport>>(new Map());

  // 失败恢复管理器
  const {
    manager: recoveryManager,
    registerFailure,
    getChapterFailures,
    getEventHistory: getRecoveryEventHistory,
    clearChapterFailures,
  } = useFailureRecovery({
    onUserDecision: async (failure: FailureState) => {
      return null;
    },
    onRecovery: async (failure: FailureState, strategy: RecoveryStrategy) => {
      return true;
    },
  });

  // 计算属性
  const totalChapters = computed(() => projectStore.sortedChapters.length);
  const writtenWordCount = computed(() => {
    return projectStore.sortedChapters.reduce((total: number, chapter: any) => {
      return total + (chapter.wordCount || 0);
    }, 0);
  });
  const writtenChapters = computed(() => {
    return projectStore.sortedChapters.filter((c: any) => c.content && c.content.trim().length > 0)
      .length;
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
    try {
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
      const recentChapterCount = projectStore.memoryConfig?.shortTermChapterCount || 5;

      // 初始化本章审查状态
      internalState.reviewAttempts = 0;
      internalState.currentChapter = chapterIndex;

      // 获取当前使用的严格度（从初始严格度开始）
      let currentReviewStrictness = internalState.currentStrictness;

      // ========== 步骤 1: 构建上下文（必须在 TaskBook 之前，因为 TaskBook 依赖它） ==========
      const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
      const { summary: previousSummary, ending: previousChapterEnding } = prevChapter?.content
        ? await extractPreviousChapterSummary(contextManager, prevChapter.content, 300)
        : { summary: '', ending: '' };

      const characters = buildCharactersInfo(project);
      const activeForeshadows = buildActiveForeshadows(project);
      // 窗口化大纲：当前章 ± 5 章给细纲，其余只给标题（替代全量灌入，省 token）
      const fullOutline = buildWindowedOutlineText(projectStore.plotOutline, chapterIndex, 5);
      const recentFullText = buildRecentChaptersFullText(
        projectStore,
        chapterIndex,
        recentChapterCount
      );

      // 使用统一的 OutlineContextBuilder（传入 chapterIndex 启用位置兜底）
      const chapterCtx = extractChapterContext(
        projectStore.plotOutline,
        chapter.id,
        chapter.title,
        chapterIndex
      );
      const currentChapterOutlineText = chapterCtx
        ? buildChapterOutlineText(chapterCtx, true)
        : chapter.plotSummary || '';
      const enhancedPrompt = buildEnhancedDesignPrompt({
        projectTitle: project.name,
        projectSynopsis: project.description || '',
        projectGenre: project.genre.map((g: any) => g.name),
        currentChapter: chapterCtx || {
          title: chapter.title,
          description: chapter.plotSummary || '',
          orderIndex: chapterIndex,
        },
        currentChapterOutline: currentChapterOutlineText,
        emotionGoal: project.emotionGoal,
        conflictDesign: project.conflictDesign,
        coolPointDesign: project.coolPointDesign,
        storyLines: project.storyLines,
        coreSellingPoints: project.coreSellingPoints,
        startupPack: project.metadata?.startupPack,
        writingStyle: options.writingStyle as any,
      });

      // ========== 步骤 2: 生成写作任务书（核心前置） ==========
      let taskBook: WritingTaskBook | null = null;
      if (options.useTaskBook) {
        currentPipelineStep.value = '生成任务书';

        taskBook = await generateTaskBook(
          project,
          chapterIndex,
          currentChapterOutlineText,
          options.writingStyle,
          options.wordsPerChapter
        );

        if (!taskBook) {
          console.error(`[executeChapterWriting] 任务书生成返回 null，章节 ${chapterIndex + 1}`);
          throw new WritingError('任务书生成失败', ErrorCode.WRITE_TASK_FAILED);
        }
      }

      // 构建增强版大纲（包含任务书）
      let enhancedOutline = currentChapterOutlineText || '';
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
          currentChapterOutline: enhancedOutline || currentChapterOutlineText || undefined,
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
        recoveryManager.registerFailure(
          chapter.id,
          chapterIndex + 1,
          'draft' as PipelineStep,
          errorMessage
        );
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
            passed: lastReviewResult.passed,
          });

          // 检查是否通过
          if (canProceedToPolish(lastReviewResult)) {
            reviewPassed = true;

            // 生成结构化报告
            const chapter = chapters[chapterIndex];
            const report = generateReport(
              chapter.id,
              chapterIndex + 1,
              chapter.title,
              lastReviewResult as any,
              {} as any,
              { strictness: currentReviewStrictness, passThreshold: 70 }
            );
            latestReports.value.set(chapterIndex + 1, report);

            break;
          }

          // 未通过，尝试降低严格度
          const lowerStrictness = getLowerStrictness(currentReviewStrictness);

          if (lowerStrictness) {
            currentReviewStrictness = lowerStrictness;
            // 继续循环，用更宽松的严格度重新审查
          } else {
            // 已经是最宽松的严格度，仍然未通过
            console.warn(
              `[批量写作] 第${chapterIndex + 1}章在最低严格度下仍未通过，将继续（润色会处理部分问题）`
            );

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
    } catch (err) {
      // 顶层兜底捕获：记录完整错误并重新抛出
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : '';
      console.error(
        `[executeChapterWriting] ❌ 章节 ${chapterIndex + 1} 顶层异常: ${errMsg}`,
        errStack
      );
      throw err;
    }
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
      config.value.maxRetries = batchConfig.maxRetries ?? 3;
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
    maxRetries.value = config.value.maxRetries;
    currentRetryCount.value = 0;
    error.value = null;
    strictnessHistory.value = [];
    endingStatus.value = null;
    isReadyToEnd.value = false;

    // 获取计划章节数
    const plannedChapterCount =
      project.metadata?.plannedChapterCount ||
      (project.plotOutline?.length > 0 ? project.plotOutline.length : 100);

    try {
      let currentIndex = getNextChapterIndex();
      let writtenCount = 0;

      let loopIter = 0;
      while (currentIndex >= 0 || writtenCount < chaptersToWrite) {
        loopIter++;
        if (loopIter > 200) {
          console.error(
            '[批量写作] 检测到可能的死循环，已写=' +
              writtenCount +
              ' 目标=' +
              chaptersToWrite +
              ' 当前=' +
              currentIndex
          );
          error.value = '检测到异常：循环次数超过200次，请检查日志中的错误信息';
          break;
        }

        // 检查停止
        if (internalState.shouldStop) {
          break;
        }

        // 检查暂停
        while (internalState.shouldPause && !internalState.shouldStop) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (internalState.shouldStop) break;

        // ========== 完结判断（写到完结模式） ==========
        if (target.value === 'finish') {
          // 检查完结准备度
          const memories = projectStore.chapterMemories || [];
          const endingCheck = checkEndingReadiness(project, writtenCount, memories);
          endingStatus.value = endingCheck;
          isReadyToEnd.value = endingCheck.isReady;

          // 检查是否应该停止（写到完结模式）
          if (!endingCheck.canCreateNewChapter) {
            if (endingCheck.isReady) {
              error.value = '已到达完结阶段，故事已完成！';
              break;
            } else if (currentIndex < 0) {
              // 没有更多大纲章节，且未准备好完结
              error.value = `没有更多大纲章节。剩余 ${endingCheck.unresolvedForeshadows} 个伏笔未解决，${endingCheck.remainingChapters} 章后可能完结`;
              break;
            }
          }

          // 如果已完成大纲章节但还可以创建新章节，继续创建
          if (currentIndex >= plannedChapterCount && !endingCheck.isReady) {
            // 可以继续创建章节，但需要明确告知用户
          }
        }

        // 检查是否达到指定数量目标
        if (target.value === 'specific' && writtenCount >= chaptersToWrite) {
          break;
        }

        // 如果没有空章节，创建新的
        if (currentIndex < 0) {
          // 写到完结模式：检查是否可以创建新章节
          if (target.value === 'finish') {
            const checkResult = endingStatus.value;
            if (checkResult && !checkResult.canCreateNewChapter) {
              if (checkResult.isReady) {
                break;
              } else {
                // 仍然允许创建最后一章用于完结
              }
            }
          }

          currentIndex = await createNewChapter();
          if (currentIndex < 0) {
            break;
          }
        }

        // ========== 单章写作（带重试 + 指数退避） ==========
        // 失败重试本章，重试耗尽则停止整个批量写作，章节保持空白以支持断点续写
        const chapterMaxRetries = config.value.maxRetries;
        let chapterSuccess = false;
        let chapterLastErr = '';

        for (let attempt = 1; attempt <= chapterMaxRetries; attempt++) {
          // 响应停止
          if (internalState.shouldStop) break;
          // 响应暂停（等待期间不消耗重试次数）
          while (internalState.shouldPause && !internalState.shouldStop) {
            await new Promise(r => setTimeout(r, 500));
          }
          if (internalState.shouldStop) break;

          currentRetryCount.value = attempt;

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
              chapterSuccess = true;
              writtenCount++;
              break;
            }
          } catch (err) {
            chapterLastErr = err instanceof Error ? err.message : String(err);
            const errStack = err instanceof Error ? err.stack : '';
            console.error(
              `[批量写作] ❌ 第${currentIndex + 1}章写作失败（第 ${attempt}/${chapterMaxRetries} 次）: ${chapterLastErr}`,
              { error: chapterLastErr, stack: errStack, writtenCount, currentIndex, chaptersToWrite }
            );

            // 还有重试机会：指数退避后重试本章
            if (attempt < chapterMaxRetries) {
              const waitSeconds = 2 ** attempt; // 2s, 4s, 8s...
              error.value = `第${currentIndex + 1}章写作失败（第 ${attempt}/${chapterMaxRetries} 次），${waitSeconds}s 后重试…`;
              await new Promise(r => setTimeout(r, waitSeconds * 1000));
            }
          }
        }

        // 重置重试计数（无重试时为 0）
        currentRetryCount.value = 0;

        // 重试耗尽：停止整个批量写作，章节保持空白（不写占位内容）
        if (!chapterSuccess) {
          error.value = `第${currentIndex + 1}章连续 ${chapterMaxRetries} 次失败，已停止批量写作：${chapterLastErr}`;
          internalState.shouldStop = true;
          break;
        }

        // 写到完结模式：每写完一章后重新检查完结条件
        if (target.value === 'finish') {
          const updatedMemories = projectStore.chapterMemories || [];
          const updatedCheck = checkEndingReadiness(project, writtenCount, updatedMemories);
          endingStatus.value = updatedCheck;
          isReadyToEnd.value = updatedCheck.isReady;
        }

        // 找下一个空章节
        currentIndex = getNextChapterIndex();
      }
    } finally {
      isWriting.value = false;
      isPaused.value = false;
      currentChapterIndex.value = -1;
      currentChapterTitle.value = '';
      currentRetryCount.value = 0;
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

  /**
   * 导出报告
   */
  function exportReport(chapterNumber: number, format: 'json' | 'markdown'): string | null {
    const report = latestReports.value.get(chapterNumber);
    if (!report) {
      console.warn('[BatchWriter] 没有第' + chapterNumber + '章的报告');
      return null;
    }

    if (format === 'json') {
      return exportToJSON(report);
    } else {
      return exportToMarkdown(report);
    }
  }

  /**
   * 获取指定章节报告
   */
  function getReport(chapterNumber: number): StructuredReviewReport | null {
    return latestReports.value.get(chapterNumber) || null;
  }

  /**
   * 获取所有报告
   */
  function getAllReports(): StructuredReviewReport[] {
    return Array.from(latestReports.value.values());
  }

  /**
   * 获取失败列表
   */
  function getFailures(chapterId?: string): FailureState[] {
    if (chapterId) {
      return getChapterFailures(chapterId);
    }
    return []; // 无 chapterId 时返回空
  }

  /**
   * 获取恢复事件历史
   */
  function getRecoveryHistory(limit?: number): RecoveryEvent[] {
    return getRecoveryEventHistory(undefined, limit);
  }

  /**
   * 清除失败记录
   */
  function clearFailures(): void {
    recoveryManager.clearAll();
    latestReports.value.clear();
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
    latestReports,
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
    // 失败重试状态
    maxRetries,
    currentRetryCount,
    // 写到完结状态
    endingStatus,
    isReadyToEnd,
    checkEndingReadiness,
    // 报告和失败恢复
    exportReport,
    getReport,
    getAllReports,
    getFailures,
    getRecoveryHistory,
    clearFailures,
  };
}
