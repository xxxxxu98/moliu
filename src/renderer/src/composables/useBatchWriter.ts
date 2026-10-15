/**
 * 批量写作 Composable - 增强版（v3.1）
 *
 * 单章执行已委托给 ChapterWritingPipeline（与智能续写共用同一条流水线），
 * 选项通过 BATCH_CONTINUE_PRESET 统一（跳过预检、开启任务书与自动补字）。
 * 本 composable 只保留批量特有的控制逻辑：
 * 1. 循环控制（暂停/恢复/停止响应）
 * 2. 单章定局交给 runBatchChapter（与真实冒烟 harness 共用：分级重试/蓝图再生/伏笔熔断），
 *    耗尽则停止整个批量
 * 3. 完结判断（checkEndingReadiness，"写到完结"模式）
 * 4. 进度统计（writtenChapters / writtenWords）
 * 5. 创建新章节（无空章节时自动 createNewChapter）
 *
 * 审查范式：LongFormWritingEngine 严格连续性校验 + 判官；失败稿保留供诊断，但绝不提交
 *
 * 副作用（记忆提取/标题/元数据）已下沉到 persistence/memoryClient 适配器，
 * 单章与批量双受益。
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Volume, ChapterMemory, Foreshadow } from '@/types/project';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { calculateForeshadowUrgency } from '@/services/story-runtime/foreshadowLifecycle';
import { useActiveAIProvider } from './useActiveAIProvider';
import { ContextManager } from '@/services/writing/context-manager';
import {
  WritingPipelineManager,
  type BlockingReviewResult,
  type WritingPipelineStage,
  type ReviewStrictness,
} from '@/services/review/blocking-review.service';
import { WritingError, ErrorCode } from '@/types/errors';
import type { ErrorKind } from '@/utils/ai-error-classify';
import { createEndingPerceptionEngine } from '@/services/writing/ending-perception-engine';
import {
  useReportGenerator,
  type StructuredReviewReport,
} from '@/services/writing/review/report-generator';
import {
  useChapterWritingPipeline,
  type ChapterWriteOutput,
} from '@/services/writing/ChapterWritingPipeline';
import {
  BATCH_CONTINUE_PRESET,
  resolveChapterWriteOptions,
} from '@/services/writing/chapterWritePresets';
import {
  classifyChapterRunFailure,
  PERSISTENT_MAX_RETRIES,
  runBatchChapter,
  type BatchChapterAttemptInput,
} from '@/services/writing/batchChapterRunner';
import {
  useFailureRecovery,
  type PipelineStep,
  type FailureState,
  type RecoveryStrategy,
  type RecoveryEvent,
} from '@/services/writing/failure-recovery';
import {
  computeOutlineRunway,
  rollOutlineForward,
  OUTLINE_ROLL_RUNWAY_THRESHOLD,
} from '@/services/outline/rolling/outline-roller';
import {
  applyBlueprintToPlotNode,
  blueprintToChapterUpdate,
  BlueprintRepairLedger,
  inspectChapterBlueprintDefects,
} from '@/services/outline/rolling/chapter-blueprint-regenerator';
import { volumeAssignmentSourceFromProject, volumeIdForChapter } from '@/services/outline/volumeAssignment';
import { UnifiedOutlineGenerator } from '@/services/outline/generators/unified-generator';

export type WritingTarget = 'specific' | 'finish';

// ============================================
// 严格度降级策略
// ============================================

/** 严格度降级顺序 */
const STRICTNESS_LEVELS: ReviewStrictness[] = ['strict', 'normal', 'relaxed'];

/** 「指定章数」模式未传章数时的默认写作章数（与 BatchWritingPanel 默认值一致） */
const DEFAULT_SPECIFIC_CHAPTER_COUNT = 10;

/**
 * 连续多轮「既没写入新章、章节位置也没推进」即判定为停滞。
 * 注意：这是进展判定，不是迭代次数上限——合法的长批量（200+ 章）每轮都会写入新章，不会触发。
 */
const MAX_STALLED_LOOP_ITERATIONS = 3;

/** 判断章节是否为空章（无正文） */
function isChapterEmpty(chapter: { content?: string }): boolean {
  return !chapter.content || chapter.content.trim().length === 0;
}

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
 * 批量进度持久化（localStorage）。
 *
 * 批量写作结束（含失败跳过 / 用户停止 / 完结）后，把 batchSummary 落盘，
 * 下次进入面板时若发现未确认的进度，可弹"上次批量到第 N 章、失败 M 章，是否重试失败章"。
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
  // 滚动续纲：51 章后细纲跑道的后台补充状态
  outlineRollStatus: Ref<string | null>;

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
    useTaskBook: boolean;
    useReview: boolean;
    requireBlockingPass: boolean;
    // 审查配置
    initialStrictness: ReviewStrictness; // 初始严格度
    // 失败重试配置
    maxRetries: number; // 单章失败重试次数
  }>;

  // 方法
  startBatchWriting: (
    targetChapters?: number,
    batchConfig?: BatchConfig,
    scopeChapterIds?: string[]
  ) => Promise<void>;
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
// v3.1 说明：deAI/useCommit 已随流水线演进移除——去AI味并入正文写作规则，
// 提交由 canonical commit（SQLite 原子写）语义接管，无可关闭的开关面。
export interface BatchConfig {
  wordsPerChapter: number;
  writingStyle: 'concise' | 'elegant' | 'humorous' | 'ancient';
  temperature?: number;
  useTaskBook?: boolean;
  useReview?: boolean;
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
// 已于 v3.1 随单章执行委托 ChapterWritingPipeline 一并移除——
// 单章上下文构建/任务书/起草/门禁/润色/提交/记忆提取均由共享管道 + 下沉的
// persistence/memoryClient 适配器统一处理。

/**
 * 内联计算伏笔紧急度
 * 不依赖 EndingPerceptionEngine 的私有方法
 */
function calculateInlineUrgency(
  foreshadow: Foreshadow,
  currentChapterIndex: number,
  plannedChapterCount?: number
): 'critical' | 'high' | 'medium' | 'low' {
  return calculateForeshadowUrgency(foreshadow, currentChapterIndex, plannedChapterCount).level;
}

/**
 * 计算伏笔紧急度评分
 * 参考 webnovel-writer 的公式：紧急度 = (已过章节 / 目标回收章节) × 层级权重
 */
function calculateForeshadowUrgencyScore(
  foreshadow: Foreshadow,
  currentChapterIndex: number,
  plannedChapterCount?: number
): number {
  return calculateForeshadowUrgency(foreshadow, currentChapterIndex, plannedChapterCount).score;
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
  // planned = 大纲预埋未埋设，不参与「应回收」统计与催收排序
  const unresolvedForeshadows = foreshadows.filter(
    (f: Foreshadow) =>
      f.status !== 'resolved' && f.status !== 'abandoned' && f.status !== 'planned'
  );

  // 计算每个伏笔的紧急度
  const criticalForeshadows: ForeshadowUrgencyItem[] = unresolvedForeshadows
    .map((f: Foreshadow) => {
      // 计算伏笔紧急度（统一口径：实际埋设章 + plannedChapterCount，旧实现
      // 硬编码 100 且拿规划章号当埋设章，千章书伏笔恒为 critical）
      const urgency = calculateInlineUrgency(f, currentChapterIndex, plannedChapterCount);

      return {
        hint: f.hint || '',
        urgency,
        urgencyScore: calculateForeshadowUrgencyScore(f, currentChapterIndex, plannedChapterCount),
        plantedChapter: f.actualPlantedChapter ?? f.createdChapter ?? 0,
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
  const volumePlans = project?.metadata?.volumePlans || [];
  const perVolumeEstimate =
    project?.metadata?.storyScale?.estimatedChaptersPerVolume &&
    project.metadata.storyScale.estimatedChaptersPerVolume > 0
      ? project.metadata.storyScale.estimatedChaptersPerVolume
      : 10;
  // 各卷覆盖章数：优先卷纲声明的章节区间，缺失（旧项目）按规模估算
  const volumeSizes = volumes.map((volume: Volume, idx: number) => {
    const range = volumePlans[idx]?.chapterRange;
    if (range && range.end >= range.start) return range.end - range.start + 1;
    return perVolumeEstimate;
  });
  const currentVolume = volumes.find((v: any, idx: number) => {
    const startChapter = volumes.slice(0, idx).reduce((sum: number, _prev: any, i: number) => sum + volumeSizes[i], 0) + 1;
    const endChapter = startChapter + volumeSizes[idx] - 1;
    return currentChapterIndex >= startChapter && currentChapterIndex <= endChapter;
  });

  let volumeProgress: VolumeProgress | undefined;
  if (volumes.length > 0) {
    const volumeIndex = currentVolume ? volumes.indexOf(currentVolume) : -1;
    const chaptersInVolume = volumeIndex >= 0 ? volumeSizes[volumeIndex] : volumeSizes[0];
    const chaptersWritten =
      currentVolume && volumeIndex >= 0
        ? Math.max(
            0,
            currentChapterIndex -
              volumes
                .slice(0, volumeIndex)
                .reduce((sum: number, _prev: any, i: number) => sum + volumeSizes[i], 0)
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

  // 共享单章写作管道：管道内部装配 LongFormWritingEngine + persistence/memoryClient 适配器，
  // 与智能续写（V2）共用同一条单章流水线。
  // 批量层只保留：循环控制、重试、完结判断、进度统计。
  const pipeline = useChapterWritingPipeline();

  // 内部状态
  const internalState: InternalWritingState = {
    shouldStop: false,
    shouldPause: false,
    abortController: null,
    pipeline: new WritingPipelineManager(),
    currentReviewResult: null,
    // 自适应审查相关状态
    currentStrictness: 'normal',
    reviewAttempts: 0,
    currentChapter: 0,
  };

  // 单章蓝图再生账本：履约域失败连续 ≥2 次后触发蓝图体检/再生（每章最多 1 次）
  const blueprintRepairLedger = new BlueprintRepairLedger();

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

  // 滚动续纲状态（后台异步，不阻塞写作循环）
  const outlineRollStatus = ref<string | null>(null);
  let outlineRollInFlight: Promise<void> | null = null;

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
    useTaskBook: true,
    useReview: true,
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
      if (isChapterEmpty(chapters[i]) && chapters[i].writeStatus !== 'failed') {
        return i;
      }
    }
    return -1;
  }

  /**
   * 限定范围的下一章：只在 scope 章节集合内找空章（重试失败章节专用）。
   * scope 为空时退化为普通的 getNextChapterIndex。
   */
  function nextPendingIndex(scopeIds: Set<string> | null): number {
    if (!scopeIds) return getNextChapterIndex();
    return projectStore.sortedChapters.findIndex(
      chapter => scopeIds.has(chapter.id) && isChapterEmpty(chapter)
    );
  }

  /** 计划章数（实时读取：滚动续纲会推进 metadata.plannedChapterCount；兜底与既有口径一致为 100） */
  function getPlannedChapterCount(): number {
    const current = projectStore.currentProject;
    const fromMetadata = current?.metadata?.plannedChapterCount ?? 0;
    if (fromMetadata > 0) return fromMetadata;
    const outlineSize = current?.plotOutline?.length ?? 0;
    return outlineSize > 0 ? outlineSize : 100;
  }

  /** 全书已写章数（正文非空的章），用于完结判断等需要全书进度的场景 */
  function countWrittenChaptersInStore(): number {
    return projectStore.sortedChapters.filter(chapter => !isChapterEmpty(chapter)).length;
  }

  function getTotalChapters(): number {
    return projectStore.sortedChapters.length;
  }

  async function createNewChapter(): Promise<number> {
    const project = projectStore.currentProject;
    if (!project) return -1;

    // 新章全局章号 = 既有章节数（sortedChapters 按 orderIndex 排序，追加即末尾+1）
    const nextChapterNumber = projectStore.sortedChapters.length + 1;

    let volumeId: string | undefined;
    if (project.volumes.length > 0) {
      // 卷区间存在时按新章章号挂对应卷；无区间/旧项目走估算回退（见 volumeAssignment）
      volumeId = volumeIdForChapter(
        nextChapterNumber,
        volumeAssignmentSourceFromProject(project),
      );
    }
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

    const newChapter = await projectStore.createChapter(volumeId, {
      globalOrderIndex: nextChapterNumber - 1,
    });
    if (newChapter) {
      return projectStore.sortedChapters.findIndex((c: any) => c.id === newChapter.id);
    }
    return -1;
  }

  /**
   * 细纲跑道不足时后台滚动补充下一批章级蓝图（不 await，不阻塞写作循环）。
   *
   * 触发口径：chapter 型 plot 节点数 − 已建章节数 < 阈值。启动包只有前 50 章细纲，
   * 不补的话第 51 章起章节合同退化为标题兜底，CBN/CPNs/CEN/mustCover 全部失效。
   * 失败只记入 outlineRollStatus 供 UI 展示——续纲挂了不该拖死正文写作，
   * 写不出的章走 buildWindowedOutlineText 的无细纲声明路径。
   */
  function ensureOutlineRunwayAsync(): void {
    const project = projectStore.currentProject;
    if (!project || outlineRollInFlight) return;

    const runwayState = computeOutlineRunway(projectStore.sortedChapters, project.plotOutline || []);
    if (runwayState.runway >= OUTLINE_ROLL_RUNWAY_THRESHOLD) return;

    const rollFromEstimate =
      Math.max(runwayState.chapterNodeCount, runwayState.writtenThrough) + 1;
    outlineRollStatus.value =
      `细纲跑道不足（还有 ${runwayState.runway} 章有细纲待写，已写到第 ${runwayState.writtenThrough} 章），` +
      `正在滚动补充第 ${rollFromEstimate} 章起的蓝图...`;
    outlineRollInFlight = (async () => {
      try {
        const generator = new UnifiedOutlineGenerator();
        const result = await rollOutlineForward({
          project: projectStore.currentProject ?? project,
          callStructuredText: (system, user, temperature) =>
            generator.callStructuredTextForRoll(system, user, { temperature }),
          persist: async (nodes, plannedChapterCount) => {
            for (const node of nodes) {
              await projectStore.createPlotNode(node);
            }
            if (projectStore.currentProject) {
              projectStore.currentProject.metadata = {
                ...projectStore.currentProject.metadata,
                plannedChapterCount,
              };
              await projectStore.saveCurrentProject();
            }
          },
        });
        if (result.appendedCount > 0) {
          outlineRollStatus.value = `已滚动补充第 ${result.fromChapter}-${result.toChapter} 章细纲`;
        } else {
          outlineRollStatus.value = result.skippedReason
            ?? `滚动续纲未产出可用蓝图：${result.warnings[0] ?? '原因未知'}`;
        }
        for (const warning of result.warnings) {
          console.warn(`[批量写作] 滚动续纲：${warning}`);
        }
      } catch (err) {
        outlineRollStatus.value = `滚动续纲失败：${err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120)}`;
      } finally {
        outlineRollInFlight = null;
      }
    })();
  }

  /**
   * 单章单次尝试 —— 委托共享管道（ChapterWritingPipeline）。
   *
   * 重试/退避/失败教训种子/伏笔熔断/蓝图再生由 runBatchChapter 统一编排
   * （与真实冒烟 harness 同一份），本函数只做：
   * 1. 调管道执行单章（字数目标与重试种子由执行器给出）
   * 2. 映射管道输出到批量 UI 状态（pipelineStep/blockingIssues/strictnessHistory）
   * 3. 失败时登记恢复项
   *
   * 审查范式：引擎内严格连续性校验 + 判官（重写取最佳供诊断，全失败则不提交）
   */
  async function runChapterAttempt(
    chapterIndex: number,
    attempt: BatchChapterAttemptInput,
    options: {
      useTaskBook: boolean;
      useReview: boolean;
      writingStyle: string;
      requireBlockingPass: boolean;
    }
  ): Promise<ChapterWriteOutput> {
    try {
      // 每次尝试重新取章节：蓝图再生会经 updateChapter 替换章节对象
      const chapters = projectStore.sortedChapters;
      const chapter = chapters[chapterIndex];
      if (!chapter) {
        throw new WritingError(`第${chapterIndex + 1}章不存在`, ErrorCode.AI_GENERATION_FAILED);
      }

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

      // 委托共享管道执行单章（批量预设：跳过预检，开启补字）。
      // v3.1 管道的真实开关面是 useTaskBook/enablePreflight/enableSupplement/maxRewriteRounds；
      // 旧 UI 旋钮按语义映射接线（此前四个旋钮收参后被直接忽略，关审查实际照跑）：
      // - useReview=false → maxRewriteRounds=0（引擎内不再整章重写，语义门仍产出报告）
      // - requireBlockingPass=false → enableSupplement=false（不强制补字达标）
      const writeOptions = resolveChapterWriteOptions(BATCH_CONTINUE_PRESET, {
        useTaskBook: options.useTaskBook,
        enableSupplement: options.requireBlockingPass ? undefined : false,
      });
      const result = await pipeline.execute({
        project,
        chapter,
        targetWordCount: attempt.targetWordCount,
        writingStyle: options.writingStyle as any,
        ...writeOptions,
        maxRewriteRounds: options.useReview === false ? 0 : undefined,
        previousChapter,
        signal: internalState.abortController?.signal,
        seedRevisionHints: attempt.seedRevisionHints,
        foreshadowExemptions: attempt.foreshadowExemptions,
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
        // 失败：登记恢复项，失败输出原样交回执行器分级重试
        const failureMessage = result.error
          || (result.forceAccepted || result.gateResult?.passed === false
            ? '严格门禁未通过，章节未提交'
            : '写作失败');
        const classified = classifyChapterRunFailure(
          result,
          failureMessage,
          internalState.abortController?.signal
        );
        recoveryManager.registerFailure(
          chapter.id,
          chapterIndex + 1,
          'draft' as PipelineStep,
          failureMessage,
          undefined,
          { errorKind: classified.kind, retryable: classified.retryable }
        );
      }
      return result;
    } catch (err) {
      // 顶层兜底捕获：记录完整错误并重新抛出（由执行器按 classifyError 分级）
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : '';
      console.error(
        `[runChapterAttempt] ❌ 章节 ${chapterIndex + 1} 顶层异常: ${errMsg}`,
        errStack
      );
      throw err;
    }
  }

  /** 单章提交成功后的批量侧收尾：清失败标记、计进度、复位流水线 UI */
  function recordChapterSuccess(chapterIndex: number, result: ChapterWriteOutput): void {
    const chapter = projectStore.sortedChapters[chapterIndex];
    if (chapter && (chapter.writeStatus === 'failed' || chapter.lastError || chapter.lastErrorKind)) {
      void projectStore.updateChapter(chapter.id, {
        writeStatus: 'success',
        lastError: undefined,
        lastErrorKind: undefined,
        lastErrorAt: undefined,
      }).catch((err: unknown) => {
        console.warn(`[批量写作] 第${chapterIndex + 1}章失败标记清除失败（不影响正文）:`, err);
      });
    }

    progress.value.writtenChapters++;
    progress.value.writtenWords += result.prose.length;

    internalState.pipeline.reset();
    internalState.currentReviewResult = null;
    blockingIssues.value = [];
    currentPipelineStep.value = 'idle';
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
  /**
   * @param targetChapters 指定章数模式的目标章数（写到完结模式忽略）
   * @param batchConfig 本轮写作配置（缺省沿用当前 config）
   * @param scopeChapterIds 限定范围：只写这些章节中的空章（重试失败章节用），
   *   范围写完即结束，不会继续写范围外的空章，也不会在细纲用尽时新建章节
   */
  async function startBatchWriting(
    targetChapters?: number,
    batchConfig?: BatchConfig,
    scopeChapterIds?: string[]
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
      config.value.useTaskBook = true;
      config.value.useReview = batchConfig.useReview ?? true;
      config.value.requireBlockingPass = batchConfig.requireBlockingPass ?? true;
      config.value.initialStrictness = batchConfig.initialStrictness ?? 'normal';
      config.value.maxRetries = batchConfig.maxRetries ?? 5;
    }

    // 限定范围（重试失败章节）：范围即目标，不受指定章数影响
    const scopeIds = scopeChapterIds ? new Set(scopeChapterIds) : null;
    // 设置目标：范围模式按范围大小；写到完结模式的进度分母用计划章数；指定章数模式用目标章数
    const chaptersToWrite = scopeIds
      ? scopeIds.size
      : targetChapters || DEFAULT_SPECIFIC_CHAPTER_COUNT;
    const isFinishMode = target.value === 'finish' && !scopeIds;
    progress.value = {
      writtenChapters: 0,
      writtenWords: 0,
      targetChapters: isFinishMode ? getPlannedChapterCount() : chaptersToWrite,
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

    const batchStartedAt = Date.now();
    let writtenCount = 0; // 提到 try 外，finally 的 batchSummary 需要访问

    try {
      let currentIndex = nextPendingIndex(scopeIds);

      // 停滞判定（替代旧的「循环次数 > 200」硬上限——后者会把合法的 200+ 章长批量误判为死循环）
      let stalledIterations = 0;
      let lastProgressSignature = '';
      while (currentIndex >= 0 || writtenCount < chaptersToWrite) {
        const progressSignature = `${writtenCount}:${currentIndex}`;
        stalledIterations = progressSignature === lastProgressSignature ? stalledIterations + 1 : 0;
        lastProgressSignature = progressSignature;
        if (stalledIterations >= MAX_STALLED_LOOP_ITERATIONS) {
          console.error(
            '[批量写作] 检测到停滞（连续多轮无新章写入、位置未推进），已写=' +
              writtenCount +
              ' 目标=' +
              chaptersToWrite +
              ' 当前=' +
              currentIndex
          );
          error.value = '检测到停滞：连续多轮没有写入新章节，已停止批量，请检查日志中的错误信息';
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

        // 限定范围（重试失败章）：范围内没有空章即结束，不创建新章、不走完结判断
        if (scopeIds && currentIndex < 0) {
          break;
        }

        // ========== 完结判断（写到完结模式） ==========
        if (isFinishMode) {
          // 完结判断必须用全书进度（已写章数），不能用本轮写了几章：从中途续写时两者相差很大
          const memories = projectStore.chapterMemories || [];
          const endingCheck = checkEndingReadiness(project, countWrittenChaptersInStore(), memories);
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
        }

        // 检查是否达到指定数量目标
        if (target.value === 'specific' && writtenCount >= chaptersToWrite) {
          break;
        }

        // 如果没有空章节，创建新的
        if (currentIndex < 0) {
          // 写到完结模式：已完结准备好时不再新建章节
          if (isFinishMode) {
            const checkResult = endingStatus.value;
            if (checkResult && !checkResult.canCreateNewChapter && checkResult.isReady) {
              break;
            }
          }

          // 空章用尽 = 细纲跑道归零。若滚动续纲正在后台跑，等它落地再建章——
          // 位置兜底按「第 N 个 chapter 节点 = 第 N 章」对齐，先建章后补节点同样能对上，
          // 但等落地能让新章直接带蓝图进写作合同，而不是先裸写一章。
          if (outlineRollInFlight) {
            currentPipelineStep.value = '等待滚动续纲落地...';
            await outlineRollInFlight;
            currentPipelineStep.value = 'idle';
            if (internalState.shouldStop) break;
          }

          currentIndex = await createNewChapter();
          if (currentIndex < 0) {
            break;
          }
        }

        // ========== 单章写作（runBatchChapter：错误分级重试 + 失败即停） ==========
        // 与真实冒烟 harness 共用同一执行器；单章重试耗尽 → 标记 writeStatus='failed'
        // 后结束整批（质量优先：宁可不写，也不继续产出有问题的章节）。
        const chapterForRun = projectStore.sortedChapters[currentIndex];
        if (!chapterForRun) break;
        if (!isChapterEmpty(chapterForRun)) {
          writtenCount++;
          currentIndex = nextPendingIndex(scopeIds);
          continue;
        }
        currentChapterIndex.value = currentIndex;
        currentChapterTitle.value = chapterForRun.title;
        const chapterIndexForRun = currentIndex;
        const chapterNumberForRun = currentIndex + 1;
        const chapterMaxRetries = config.value.maxRetries;
        const blueprintGenerator = new UnifiedOutlineGenerator();
        const outcome = await runBatchChapter({
          chapterId: chapterForRun.id,
          chapterNumber: chapterNumberForRun,
          baseWordCount: config.value.wordsPerChapter,
          maxRetries: chapterMaxRetries,
          ledger: blueprintRepairLedger,
          getProject: () => projectStore.currentProject!,
          runAttempt: async attemptInput => {
            if (attemptInput.attempt === 1) {
              console.log(
                `[批量写作] 第${chapterNumberForRun}章字数目标: ${attemptInput.targetWordCount} 字（基准 ${config.value.wordsPerChapter}）`
              );
            }
            return runChapterAttempt(chapterIndexForRun, attemptInput, {
              useTaskBook: config.value.useTaskBook,
              useReview: config.value.useReview,
              writingStyle: config.value.writingStyle,
              requireBlockingPass: config.value.requireBlockingPass,
            });
          },
          repairBlueprint: (system, user, temperature) =>
            blueprintGenerator.callStructuredTextForRoll(system, user, { temperature }),
          applyRegeneratedBlueprint: async blueprint => {
            applyBlueprintToPlotNode(
              projectStore.currentProject!.plotOutline ?? [],
              chapterNumberForRun,
              blueprint
            );
            // 同步 Chapter 实体文本字段：pipeline 的 goal/角色白名单来自
            // chapter.outline/plotSummary，只改 plotOutline 会造成合同半新半旧
            await projectStore.updateChapter(chapterForRun.id, blueprintToChapterUpdate(blueprint));
            await projectStore.saveCurrentProject();
          },
          signal: internalState.abortController?.signal,
          shouldStop: () => internalState.shouldStop,
          waitWhilePaused: async () => {
            while (internalState.shouldPause && !internalState.shouldStop) {
              await new Promise(r => setTimeout(r, 500));
            }
          },
          onEvent: event => {
            switch (event.type) {
              case 'attempt-start':
                currentRetryCount.value = event.attempt;
                break;
              case 'attempt-failed': {
                const { classified } = event;
                console.error(
                  `[批量写作] ❌ 第${chapterNumberForRun}章写作失败（第 ${event.attempt}/${event.maxRetries} 次, ${classified.kind}${classified.retryable ? '/可重试' : '/持久'}）: ${event.message}`,
                  { writtenCount, currentIndex: chapterIndexForRun, chaptersToWrite, classified }
                );
                if (event.next === 'retry-now') {
                  error.value = `第${chapterNumberForRun}章持久错误（${classified.kind}，第 ${event.persistentAttempts}/${PERSISTENT_MAX_RETRIES} 次），立即重试…`;
                } else if (event.next === 'backoff') {
                  error.value = `第${chapterNumberForRun}章失败（第 ${event.attempt}/${event.maxRetries} 次，${classified.kind}），${Math.round((event.waitMs ?? 0) / 1000)}s 后重试…`;
                }
                break;
              }
              case 'fulfillment-failure':
                console.warn(
                  `[批量写作] 第${chapterNumberForRun}章履约域失败（累计 ${event.failures} 次），达阈值后触发蓝图体检/再生`
                );
                break;
              case 'foreshadow-exempted':
                console.warn(
                  `[批量写作] 第${chapterNumberForRun}章伏笔时序熔断：伏笔「${event.prefix}…」连续 ${event.rejects} 次提前揭示拒稿，本章豁免该伏笔时点禁令（源头应修蓝图）`
                );
                break;
              case 'blueprint-regenerating':
                error.value = `第${chapterNumberForRun}章履约连续失败，正在体检并再生本章蓝图...`;
                break;
              case 'blueprint-regenerated': {
                const defectSummary = event.defectKinds.length > 0
                  ? `（体检缺陷：${event.defectKinds.join('、')}）`
                  : '';
                console.warn(`[批量写作] 第${chapterNumberForRun}章蓝图已再生${defectSummary}，继续重写正文`);
                error.value = `第${chapterNumberForRun}章蓝图已再生${defectSummary}，重试写作...`;
                break;
              }
              case 'blueprint-regeneration-failed':
                console.warn(`[批量写作] 第${chapterNumberForRun}章蓝图再生未成功（不影响原重试路径）：${event.error}`);
                break;
            }
          },
        });

        currentRetryCount.value = 0;

        if (outcome.status === 'success') {
          writtenCount++;
          recordChapterSuccess(chapterIndexForRun, outcome.output);
        } else if (outcome.status === 'stopped') {
          // 用户停止 / 中止：停整批
          if (outcome.aborted) error.value = '已停止批量写作';
          internalState.shouldStop = true;
          break;
        } else if (outcome.status === 'review_unavailable') {
          // 审查服务不可用：停整批，本章保持空白（不标记失败），错误文案保留给用户
          error.value = `第${chapterNumberForRun}章语义审查暂时不可用，本章未提交，已停止批量（未重复起草），请稍后重试`;
          internalState.shouldStop = true;
          break;
        } else {
          // 单章重试耗尽（持久/瞬态）：标记 writeStatus='failed'，结束整批（质量优先）
          failedChapters.value.push({
            index: chapterIndexForRun,
            id: chapterForRun.id,
            title: chapterForRun.title ?? `第${chapterNumberForRun}章`,
            error: outcome.lastError,
            errorKind: outcome.lastErrorKind,
            attempts: outcome.attempts,
          });
          void projectStore.updateChapter(chapterForRun.id, {
            writeStatus: 'failed',
            lastError: outcome.lastError,
            lastErrorKind: outcome.lastErrorKind,
            lastErrorAt: new Date().toISOString(),
          }).catch((err: unknown) => {
            console.warn(`[批量写作] 第${chapterNumberForRun}章失败标记写入失败:`, err);
          });
          error.value = `第${chapterNumberForRun}章重试耗尽（${outcome.lastErrorKind}），结束批量写作`;
          internalState.shouldStop = true;
          break;
        }

        // 写到完结模式：每写完一章后重新检查完结条件（同样用全书已写章数）
        if (isFinishMode) {
          const updatedMemories = projectStore.chapterMemories || [];
          const updatedCheck = checkEndingReadiness(project, countWrittenChaptersInStore(), updatedMemories);
          endingStatus.value = updatedCheck;
          isReadyToEnd.value = updatedCheck.isReady;
        }

        // 细纲跑道不足时后台补下一批蓝图（异步，不等待）；下一轮循环若仍在途则跳过
        ensureOutlineRunwayAsync();

        // 找下一个空章节（范围模式下只在范围内找）
        currentIndex = nextPendingIndex(scopeIds);
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
   * 然后跑一轮只针对这些章的批量（复用 runBatchChapter 分级重试）。
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

    // 重置这些章节的失败标记，让 nextPendingIndex 能再次选中。
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

    // 复用 startBatchWriting 跑一轮，并把范围限定为本次要重试的章节：
    // 只写这些章，写完或再次失败即结束，不会顺延写范围外的空章
    await startBatchWriting(undefined, {
      wordsPerChapter: config.value.wordsPerChapter,
      writingStyle: config.value.writingStyle,
      temperature: config.value.temperature,
      useReview: config.value.useReview,
      requireBlockingPass: config.value.requireBlockingPass,
      initialStrictness: config.value.initialStrictness,
      maxRetries: config.value.maxRetries,
    }, targets.map(chapter => chapter.id));
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
    // 滚动续纲状态（供 UI 展示补充进度/失败原因）
    outlineRollStatus,
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
