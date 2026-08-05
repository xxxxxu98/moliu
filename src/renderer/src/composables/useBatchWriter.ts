/**
 * 批量写作 Composable - 增强版（v3.1）
 *
 * 单章执行已委托给 ChapterWritingPipeline（与智能续写共用同一条流水线），
 * 选项通过 BATCH_CONTINUE_PRESET 统一（跳过预检、开启任务书与自动补字）。
 * 本 composable 只保留批量特有的控制逻辑：
 * 1. 循环控制（暂停/恢复/停止响应）
 * 2. 指数退避重试（单章失败重试本章，耗尽则停止整个批量）
 * 3. 完结判断（checkEndingReadiness，"写到完结"模式）
 * 4. 进度统计（writtenChapters / writtenWords）
 * 5. 创建新章节（无空章节时自动 createNewChapter）
 *
 * 审查范式（v3.1 转变）：
 * - 老版本：strict→normal→relaxed 自适应降级重审
 * - 新版本：StateDriven G1-G7 严格门禁；失败稿保留供诊断，但绝不提交
 *
 * 副作用（记忆提取/标题/元数据）已下沉到 persistence/memoryClient 适配器，
 * 单章与批量双受益。
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Volume, ChapterMemory } from '@/types/project';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { ContextManager } from '@/services/writing/context-manager';
import {
  WritingPipelineManager,
  type BlockingReviewResult,
  type WritingPipelineStage,
  type ReviewStrictness,
} from '@/services/review/blocking-review.service';
import { WritingError, ErrorCode } from '@/types/errors';
import {
  classifyError,
  backoffDelayMs,
  type ErrorKind,
  type ClassifiedError,
} from '@/utils/ai-error-classify';
import { createEndingPerceptionEngine } from '@/services/writing/ending-perception-engine';
import {
  useReportGenerator,
  type StructuredReviewReport,
} from '@/services/writing/review/report-generator';
import {
  useChapterWritingPipeline,
} from '@/services/writing/ChapterWritingPipeline';
import {
  BATCH_CONTINUE_PRESET,
  resolveChapterWriteOptions,
} from '@/services/writing/chapterWritePresets';
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

/**
 * 可中止的 sleep：退避期间若 signal abort 则立即 reject（AbortError），
 * 避免用户点击"停止"后还要等满退避时间。
 * signal 为空时退化为普通 setTimeout。
 */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 批量进度持久化（localStorage）。
 *
 * 批量写作结束（含失败跳过 / 用户停止 / 完结）后，把 batchSummary 落盘，
 * 下次进入面板时若发现未确认的进度，可弹"上次批量到第 N 章、失败 M 章，是否重试失败章"。
 * 不依赖 CheckpointManager（那套只服务 StateDriven 路径）。
 */
const BATCH_PROGRESS_KEY_PREFIX = 'moliu_batch_progress_';

function batchProgressKey(projectId: string): string {
  return `${BATCH_PROGRESS_KEY_PREFIX}${projectId}`;
}

function saveBatchProgress(projectId: string, summary: BatchSummary): void {
  try {
    localStorage.setItem(batchProgressKey(projectId), JSON.stringify(summary));
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级
  }
}

function loadBatchProgress(projectId: string): BatchSummary | null {
  try {
    const raw = localStorage.getItem(batchProgressKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as BatchSummary;
  } catch {
    return null;
  }
}

function clearBatchProgress(projectId: string): void {
  try {
    localStorage.removeItem(batchProgressKey(projectId));
  } catch {
    // ignore
  }
}

// ============================================
// 接口定义
// ============================================

/** 批量写作中跳过的失败章节记录（内存，批量结束时汇总用） */
export interface FailedChapterRecord {
  index: number;
  id: string;
  title: string;
  error: string;
  errorKind: ErrorKind;
  attempts: number;
}

/** 批量写作结束时的汇总（供 UI 弹"完成 N 章 / 失败 M 章"） */
export interface BatchSummary {
  total: number;          // 本轮尝试章节数
  written: number;        // 成功章节数
  failed: FailedChapterRecord[]; // 跳过的失败章节
  stopped: boolean;       // 是否因用户停止 / 死循环保护中断
  startedAt: number;      // 开始时间戳
  finishedAt: number;     // 结束时间戳
  durationMs: number;     // 耗时
}

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

  // 批量失败章节 + 汇总（P0-2/P2-3）
  failedChapters: Ref<FailedChapterRecord[]>; // 本轮跳过的失败章节
  batchSummary: Ref<BatchSummary | null>; // 最近一次批量结束汇总
  retryFailedChapters: (failedIds?: string[]) => Promise<void>; // 重试失败章节队列
  // 批量进度持久化（P2-2）：跨会话恢复未完成的批量
  resumableBatch: Ref<BatchSummary | null>; // localStorage 里未确认的上次进度
  dismissResumableBatch: () => void; // 用户忽略后清除

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
// 注：原 buildCharactersInfo / buildActiveForeshadows / buildRecentChaptersFullText /
// generateTaskBook / buildEnhancedOutline / performBlockingReview / performPolish /
// performCommit / extractMemoryAfterApply / saveChapterContent 等内联辅助函数，
// 已于 v3.1 随 executeChapterWriting 委托 ChapterWritingPipeline 一并移除——
// 单章上下文构建/任务书/起草/门禁/润色/提交/记忆提取均由共享管道 + 下沉的
// persistence/memoryClient 适配器统一处理。

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

  // 共享单章写作管道（v3.1 集成）
  // 管道内部创建 StateDriven + persistence/memoryClient 适配器，
  // 与智能续写（V2）共用同一条单章流水线。
  // 批量层只保留：循环控制、重试、完结判断、进度统计。
  const pipeline = useChapterWritingPipeline();

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

  // 批量失败章节 + 汇总
  const failedChapters = ref<FailedChapterRecord[]>([]);
  const batchSummary = ref<BatchSummary | null>(null);
  // 跨会话恢复：初始化时从 localStorage 读取上次未确认的批量进度
  const resumableBatch = ref<BatchSummary | null>(null);
  try {
    const pid = projectStore.currentProject?.id;
    if (pid) {
      const saved = loadBatchProgress(pid);
      // 只在有失败章节时提示恢复（全成功的批量无需恢复）
      if (saved && saved.failed.length > 0) {
        resumableBatch.value = saved;
      }
    }
  } catch {
    // ignore
  }

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
    maxRetries: 5,
  });

  // 失败重试状态
  const maxRetries = ref(5);
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
      // 空章节且非"已知失败"（writeStatus==='failed'）：可写。
      // 已知失败章跳过，避免原地反复重试同一个坏章；用户可通过"重试失败章节"入口显式清状态后再写。
      const isEmpty =
        !chapters[i].content || chapters[i].content.trim().length === 0;
      if (isEmpty && chapters[i].writeStatus !== 'failed') {
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
   * 执行单章写作（核心逻辑）—— v3.1 委托给共享管道
   *
   * 老版本（内联 9 步流水线：TaskBook→起草→blockingReview→润色→保存→Commit→记忆→伏笔）
   * 已由 ChapterWritingPipeline + 下沉的 persistence/memoryClient 适配器统一取代。
   *
   * 审查范式转变：
   * - 老版本：strict→normal→relaxed 自适应降级重审（同一份草稿换严格度）
   * - 新版本：StateDriven G1-G7 严格门禁（重写取最佳供诊断，全失败则停止）
   *
   * 本函数只做：
   * 1. 调管道执行单章
   * 2. 映射管道输出到批量 UI 状态（pipelineStep/progress/blockingIssues/reports）
   * 3. 进度统计
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
      const prevChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;

      // 前章衔接（供管道构建上下文）
      const previousChapter = prevChapter?.content
        ? {
            title: prevChapter.title,
            summary: contextManager.extractPreviousChapterSummary(prevChapter.content, 300),
            ending: contextManager.extractChapterEnding(prevChapter.content),
          }
        : undefined;

      currentPipelineStep.value = '写作中';

      // 委托共享管道执行单章（批量预设：跳过预检，开启补字）
      const writeOptions = resolveChapterWriteOptions(BATCH_CONTINUE_PRESET, {
        useTaskBook: options.useTaskBook,
      });
      const result = await pipeline.execute({
        project,
        chapter,
        targetWordCount: options.wordsPerChapter,
        writingStyle: options.writingStyle as any,
        ...writeOptions,
        previousChapter,
        signal: internalState.abortController?.signal,
      });

      if (result.supplementRounds > 0) {
        console.log(
          `[批量写作] 第${chapterIndex + 1}章自动补写 ${result.supplementRounds} 轮`
        );
      }

      // 映射管道输出到批量 UI 状态
      if (result.gateResult) {
        // 门禁问题映射到 blockingIssues（兼容 BatchWritingPanel UI）
        blockingIssues.value = result.gateResult.allIssues
          .filter(i => i.severity === 'critical' || i.severity === 'high')
          .slice(0, 10)
          .map(i => ({
            severity: i.severity,
            location: i.location,
            description: i.description,
            evidence: i.evidence || '',
            suggestion: i.suggestion || '',
          }));

        // 记录门禁历史（兼容 strictnessHistory UI 字段）
        strictnessHistory.value.push({
          chapter: chapterIndex,
          strictness: result.gateResult.passed ? 'normal' : 'relaxed',
          passed: result.gateResult.passed,
        });
      } else {
        blockingIssues.value = [];
      }

      if (!result.success || result.forceAccepted || result.gateResult?.passed === false) {
        // 失败：记录恢复项，抛出让上层重试。
        // 携带 errorKind/retryable，供批量层决定是否退避重试（瞬态）或直接跳过（持久）。
        const failureMessage = result.error
          || (result.forceAccepted || result.gateResult?.passed === false
            ? '严格门禁未通过，章节未提交'
            : '写作失败');
        const failureKind: ErrorKind = result.errorKind ?? classifyError(failureMessage).kind;
        const failureRetryable: boolean = result.retryable ?? classifyError(failureMessage).retryable;
        recoveryManager.registerFailure(
          chapter.id,
          chapterIndex + 1,
          'draft' as PipelineStep,
          failureMessage,
          undefined,
          { errorKind: failureKind, retryable: failureRetryable }
        );
        throw new WritingError(
          failureMessage,
          ErrorCode.AI_GENERATION_FAILED,
          { details: { errorKind: failureKind, retryable: failureRetryable } }
        );
      }

      // 成功：清章节失败标记
      if (chapter.writeStatus === 'failed' || chapter.lastError || chapter.lastErrorKind) {
        void projectStore.updateChapter(chapter.id, {
          writeStatus: 'success',
          lastError: undefined,
          lastErrorKind: undefined,
          lastErrorAt: undefined,
        }).catch(() => {
          // 状态字段写入失败不影响主流程
        });
      }

      // 进度统计
      progress.value.writtenChapters++;
      progress.value.writtenWords += result.prose.length;

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
      config.value.maxRetries = batchConfig.maxRetries ?? 5;
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
    internalState.abortController = new AbortController();
    maxRetries.value = config.value.maxRetries;
    currentRetryCount.value = 0;
    error.value = null;
    strictnessHistory.value = [];
    endingStatus.value = null;
    isReadyToEnd.value = false;
    failedChapters.value = [];
    batchSummary.value = null;
    resumableBatch.value = null; // 开始新批量，清除上次恢复提示

    // 获取计划章节数
    const plannedChapterCount =
      project.metadata?.plannedChapterCount ||
      (project.plotOutline?.length > 0 ? project.plotOutline.length : 100);

    const batchStartedAt = Date.now();
    let writtenCount = 0; // 提到 try 外，finally 的 batchSummary 需要访问

    try {
      let currentIndex = getNextChapterIndex();

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

        // ========== 单章写作（错误分级重试 + 失败跳过） ==========
        // 瞬态错误（网络/超时/截断/5xx/429）：指数退避重试，耗尽才跳过。
        // 持久错误（schema/审核/auth/4xx）：首次即跳过，不浪费重试预算。
        // 用户停止（aborted）：立即停整批。
        // 单章耗尽不再停整批，而是标记 Chapter.writeStatus='failed' 后跳过，继续下一章。
        const chapterMaxRetries = config.value.maxRetries;
        let chapterSuccess = false;
        let chapterLastErr = '';
        let chapterLastErrorKind: ErrorKind = 'unknown';
        let chapterAttempts = 0; // 实际消耗的重试次数
        let chapterForceStop = false; // aborted 触发，需立即停整批

        for (let attempt = 1; attempt <= chapterMaxRetries; attempt++) {
          // 响应停止
          if (internalState.shouldStop) { chapterForceStop = true; break; }
          // 响应暂停（等待期间不消耗重试次数）
          while (internalState.shouldPause && !internalState.shouldStop) {
            await new Promise(r => setTimeout(r, 500));
          }
          if (internalState.shouldStop) { chapterForceStop = true; break; }

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
              chapterAttempts = attempt;
              writtenCount++;
              break;
            }
          } catch (err) {
            chapterAttempts = attempt;
            chapterLastErr = err instanceof Error ? err.message : String(err);
            // 优先用管道层透传的分类（details.errorKind），fallback 到 message 分类
            const sig = internalState.abortController?.signal;
            const detailsKind = (err as WritingError)?.details?.errorKind as ErrorKind | undefined;
            const detailsRetryable = (err as WritingError)?.details?.retryable as boolean | undefined;
            const classified: ClassifiedError = detailsKind !== undefined
              ? { kind: detailsKind, retryable: detailsRetryable ?? false, transient: false, message: chapterLastErr }
              : classifyError(err, sig);
            chapterLastErrorKind = classified.kind;
            const errStack = err instanceof Error ? err.stack : '';
            console.error(
              `[批量写作] ❌ 第${currentIndex + 1}章写作失败（第 ${attempt}/${chapterMaxRetries} 次, ${classified.kind}${classified.retryable ? '/可重试' : '/持久'}）: ${chapterLastErr}`,
              { error: chapterLastErr, stack: errStack, writtenCount, currentIndex, chaptersToWrite, classified }
            );

            // aborted（用户主动停止）：立即停整批，不进任何重试
            if (classified.kind === 'aborted') {
              chapterForceStop = true;
              error.value = `已停止批量写作`;
              break;
            }

            // 持久错误：不退避、不重试，直接判定本章失败跳出 → 进下面的跳过逻辑
            if (!classified.retryable) {
              error.value = `第${currentIndex + 1}章失败（${classified.kind}，不可重试），跳过该章继续`;
              break;
            }

            // 瞬态错误：仍有重试机会则指数退避（4/8/16/30s 封顶）
            if (attempt < chapterMaxRetries) {
              const waitMs = backoffDelayMs(attempt); // 默认 base=4000, max=30000
              const waitSeconds = Math.round(waitMs / 1000);
              error.value = `第${currentIndex + 1}章失败（第 ${attempt}/${chapterMaxRetries} 次，${classified.kind}），${waitSeconds}s 后重试…`;
              // 退避期间响应 abort（避免退避中途用户停止还要等满）
              await abortableSleep(waitMs, internalState.abortController?.signal).catch(() => {
                chapterForceStop = true;
              });
              if (chapterForceStop) break;
            }
          }
        }

        // 重置重试计数（无重试时为 0）
        currentRetryCount.value = 0;

        // 用户主动停止：停整批
        if (chapterForceStop) {
          internalState.shouldStop = true;
          break;
        }

        // 单章耗尽/持久失败：标记 Chapter.writeStatus='failed'，加入 failedChapters，跳过继续
        if (!chapterSuccess) {
          const failedChapter = projectStore.sortedChapters[currentIndex];
          const failedId = failedChapter?.id ?? `unknown-${currentIndex}`;
          const failedTitle = failedChapter?.title ?? `第${currentIndex + 1}章`;
          failedChapters.value.push({
            index: currentIndex,
            id: failedId,
            title: failedTitle,
            error: chapterLastErr,
            errorKind: chapterLastErrorKind,
            attempts: chapterAttempts,
          });
          void projectStore.updateChapter(failedId, {
            writeStatus: 'failed',
            lastError: chapterLastErr,
            lastErrorKind: chapterLastErrorKind,
            lastErrorAt: new Date().toISOString(),
          }).catch(() => {
            // 状态字段写入失败不阻断批量
          });
          error.value = `第${currentIndex + 1}章跳过（${chapterLastErrorKind}）：${chapterLastErr}`;
          // 注意：不再 shouldStop=true，继续下一章
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
      const batchFinishedAt = Date.now();
      // 产出批量汇总供 UI 展示"成功 N 章 / 失败 M 章"
      const summary: BatchSummary = {
        total: writtenCount + failedChapters.value.length,
        written: writtenCount,
        failed: [...failedChapters.value],
        stopped: internalState.shouldStop,
        startedAt: batchStartedAt,
        finishedAt: batchFinishedAt,
        durationMs: batchFinishedAt - batchStartedAt,
      };
      batchSummary.value = summary;
      // 落盘：有失败章节时存 localStorage 供下次会话恢复；全成功则清除旧进度
      if (summary.failed.length > 0 && project.id) {
        saveBatchProgress(project.id, summary);
      } else if (project.id) {
        clearBatchProgress(project.id);
      }
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

  /**
   * 重试失败章节队列（P2-3）。
   *
   * 把指定（或全部 writeStatus==='failed'）章节的状态重置为 pending，
   * 然后跑一轮只针对这些章的批量（复用 executeChapterWriting + 分级重试）。
   * 不会触碰已成功或正常的空章节。
   *
   * @param failedIds 指定重试的章节 ID；不传则重试所有 writeStatus==='failed' 的章节
   */
  async function retryFailedChapters(failedIds?: string[]): Promise<void> {
    if (isWriting.value) {
      error.value = '批量写作进行中，无法重试失败章节';
      return;
    }
    const project = projectStore.currentProject;
    if (!project) {
      error.value = '请先选择一个项目';
      return;
    }

    // 选出目标失败章节，按 orderIndex 升序
    const targets = projectStore.sortedChapters.filter(c =>
      c.writeStatus === 'failed'
      && (!failedIds || failedIds.includes(c.id))
    );
    if (targets.length === 0) {
      error.value = '没有需要重试的失败章节';
      return;
    }

    // 重置这些章节的失败标记，让 executeChapterWriting / getNextChapterIndex 能再次选中。
    // updateChapter 是 async（会落盘），但这里需要等它完成后再启动批量，否则 getNextChapterIndex
    // 可能读到旧的 writeStatus==='failed' 而跳过。
    await Promise.all(targets.map(ch =>
      projectStore.updateChapter(ch.id, {
        writeStatus: 'pending',
        lastError: undefined,
        lastErrorKind: undefined,
        lastErrorAt: undefined,
      }).catch(() => {
        // ignore
      })
    ));

    // 复用 startBatchWriting 跑一轮：getNextChapterIndex 现在会选中刚重置的 pending 章
    await startBatchWriting(undefined, {
      wordsPerChapter: config.value.wordsPerChapter,
      writingStyle: config.value.writingStyle,
      temperature: config.value.temperature,
      deAIEnabled: config.value.deAIEnabled,
      useReview: config.value.useReview,
      useCommit: config.value.useCommit,
      requireBlockingPass: config.value.requireBlockingPass,
      initialStrictness: config.value.initialStrictness,
      maxRetries: config.value.maxRetries,
    });
  }

  /** 用户忽略上次进度提示后，清除 localStorage 里的 resumableBatch */
  function dismissResumableBatch(): void {
    resumableBatch.value = null;
    const pid = projectStore.currentProject?.id;
    if (pid) clearBatchProgress(pid);
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
    // 批量失败章节 + 汇总
    failedChapters,
    batchSummary,
    retryFailedChapters,
    resumableBatch,
    dismissResumableBatch,
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
