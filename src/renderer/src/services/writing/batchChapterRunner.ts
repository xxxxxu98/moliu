/**
 * 批量续写单章执行器：useBatchWriter（App）、真实冒烟 harness、空章补写共用的
 * 「一章从开写到定局」流程——动态字数目标、错误分级重试、失败教训种子、
 * 伏笔时序熔断、履约域蓝图再生。
 *
 * 关键约束：
 * - 本模块只做单章；批量循环（找下一章/建章/完结判断/暂停 UI）留在调用方。
 * - 调用方差异只经 RunBatchChapterOptions 的回调注入（单章执行、项目快照、
 *   蓝图落库、暂停/停止信号），流程与判定在此唯一一份（规范 §10.5）。
 * - 重试耗尽返回 exhausted，由调用方结束整批（质量优先，App 与冒烟同口径）。
 */

import type { ChapterBlueprint } from '@/services/outline/types/executable-outline';
import {
  BlueprintRepairLedger,
  isFulfillmentDomainFailure,
  regenerateChapterBlueprint,
} from '@/services/outline/rolling/chapter-blueprint-regenerator';
import type { RollCaller } from '@/services/outline/rolling/outline-roller';
import type { Project } from '@/types/project';
import {
  classifyError,
  retryBackoffDelayMs,
  type ClassifiedError,
  type ErrorKind,
} from '@/utils/ai-error-classify';

import type { ChapterWriteOutput } from './ChapterWritingPipeline';
import { calculateDynamicWordCount } from './dynamicWordCount';

/** 持久错误（schema/审核/字数/auth/4xx）立即重试上限：给模型换写法的机会，但不退避 */
export const PERSISTENT_MAX_RETRIES = 3;

/** 截断/空响应重试的固定引导种子（这类失败无 gateResult，提不到门禁反馈） */
export const TRUNCATED_RETRY_SEED =
  '上一轮 AI 返回了空内容或被截断的 JSON。请务必一次性输出完整的 JSON 对象，paragraphs 数组必须包含完整的正文段落，不要在中途停笔，不要返回空字符串。';

/** 伏笔时序熔断：同一伏笔「提前揭示」拒稿达到该次数即本章豁免其时点禁令 */
const FORESHADOW_EXEMPT_AFTER_REJECTS = 2;

/**
 * 单章字数目标：按章节位置与蓝图密度动态计算（黄金三章/高潮章/密集/过渡）。
 * 节点按 orderIndex 定位（plotOutline 混有 act/subplot 节点，不能按数组下标取），
 * 缺失时回退「第 N 个 chapter 节点 = 第 N 章」的位置口径。
 */
export function resolveBatchChapterWordTarget(
  project: Pick<Project, 'plotOutline' | 'metadata'>,
  chapterNumber: number,
  baseWordCount: number
): number {
  const chapterNodes = (project.plotOutline ?? [])
    .filter(node => node?.type === 'chapter')
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const plotNode =
    chapterNodes.find(node => node.orderIndex === chapterNumber - 1) ??
    chapterNodes[chapterNumber - 1];
  const totalChapters = project.metadata?.plannedChapterCount || chapterNodes.length || 100;
  return calculateDynamicWordCount({
    chapterNumber,
    totalChapters,
    plotNode: plotNode
      ? {
          CBN: plotNode.CBN,
          CPNs: plotNode.CPNs,
          CEN: plotNode.CEN,
          mustCover: plotNode.mustCover,
        }
      : undefined,
    baseWordCount,
  });
}

/**
 * 失败输出的错误分类：管道结构化 errorKind/retryable 优先（门禁/补写/提交阶段用
 * 原始错误对象分类得出），缺失才回退 message 文本分类；retryable 缺失沿用文本分类口径。
 */
export function classifyChapterRunFailure(
  output: Pick<ChapterWriteOutput, 'errorKind' | 'retryable'> | null,
  message: string,
  signal?: AbortSignal
): ClassifiedError {
  const fromMessage = classifyError(new Error(message), signal);
  const kind = output?.errorKind;
  if (kind === undefined) {
    return fromMessage;
  }
  return {
    kind,
    retryable: output?.retryable ?? fromMessage.retryable,
    transient: false,
    message,
  };
}

/**
 * 从拒稿文本提取被引用的伏笔 hint 前缀（16 字）。
 * 这是格式解析而非语义判定：判官引伏笔的文案只有固定三种包裹形态
 * （「伏笔「X」notBeforeChapter=」「futureReveals 规定「X」不得早于」「伏笔『X』的埋设时点」），
 * 取出的前缀只用于计数同一伏笔的连续拒稿，语义结论仍是判官给的。
 */
export function extractForeshadowCitePrefix(message: string): string | null {
  const cite = message.match(/[伏笔规][」』"]?[：:]?\s*[「『"]([^「」『』"]{6,80})[」』"]/u);
  return cite ? cite[1].slice(0, 16) : null;
}

/**
 * 可中止的 sleep：退避期间 signal abort 立即 reject（AbortError），
 * 避免用户点击停止后还要等满退避时间。
 */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
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

/** 单次尝试的入参：由执行器决定，调用方原样透传给 pipeline.execute */
export interface BatchChapterAttemptInput {
  attempt: number;
  targetWordCount: number;
  seedRevisionHints?: string[];
  foreshadowExemptions?: string[];
}

/** 执行过程事件：调用方据此刷新 UI 状态或打日志，不影响流程 */
export type BatchChapterEvent =
  | { type: 'attempt-start'; attempt: number; maxRetries: number }
  | {
      type: 'attempt-failed';
      attempt: number;
      maxRetries: number;
      classified: ClassifiedError;
      message: string;
      /** retry-now=持久错误立即重试；backoff=瞬态退避后重试；give-up=本章不再重试 */
      next: 'retry-now' | 'backoff' | 'give-up';
      persistentAttempts: number;
      waitMs?: number;
    }
  | { type: 'fulfillment-failure'; failures: number }
  | { type: 'foreshadow-exempted'; prefix: string; rejects: number }
  | { type: 'blueprint-regenerating' }
  | { type: 'blueprint-regenerated'; defectKinds: string[] }
  | { type: 'blueprint-regeneration-failed'; error: string };

/** runBatchChapter 的注入点 */
export interface RunBatchChapterOptions {
  chapterId: string;
  /** 全书章号（1 起） */
  chapterNumber: number;
  /** 字数基准（用户配置的每章字数），实际目标经 resolveBatchChapterWordTarget 动态调整 */
  baseWordCount: number;
  /** 单章最大尝试次数（瞬态错误上限；持久错误另受 PERSISTENT_MAX_RETRIES 约束） */
  maxRetries: number;
  /** 批量级履约失败账本（每章再生预算跨尝试累计） */
  ledger: BlueprintRepairLedger;
  /** 最新项目快照：字数目标与蓝图再生的「已写状态」基底，必须反映已提交正文 */
  getProject: () => Project;
  /** 执行一次单章写作；失败可以返回失败输出，也可以抛错 */
  runAttempt: (input: BatchChapterAttemptInput) => Promise<ChapterWriteOutput>;
  /** 蓝图再生的 AI 调用器；缺省则不再生（只走文本重试） */
  repairBlueprint?: RollCaller;
  /** 再生蓝图落库（plot 节点 + 章节 outline/plotSummary 双侧同步） */
  applyRegeneratedBlueprint?: (blueprint: ChapterBlueprint) => Promise<void>;
  signal?: AbortSignal;
  /** 用户停止（App 的 shouldStop 标志） */
  shouldStop?: () => boolean;
  /** 暂停期间挂起，恢复后返回（等待不消耗重试次数） */
  waitWhilePaused?: () => Promise<void>;
  onEvent?: (event: BatchChapterEvent) => void;
}

interface BatchChapterOutcomeBase {
  attempts: number;
  targetWordCount: number;
}

/** 单章定局 */
export type BatchChapterOutcome =
  | (BatchChapterOutcomeBase & { status: 'success'; output: ChapterWriteOutput })
  | (BatchChapterOutcomeBase & { status: 'stopped'; lastError: string; aborted: boolean })
  | (BatchChapterOutcomeBase & {
      status: 'review_unavailable';
      lastError: string;
      lastOutput: ChapterWriteOutput | null;
    })
  | (BatchChapterOutcomeBase & {
      status: 'exhausted';
      lastError: string;
      lastErrorKind: ErrorKind;
      lastOutput: ChapterWriteOutput | null;
    });

function isCommittedSuccess(output: ChapterWriteOutput): boolean {
  return output.success && !output.forceAccepted && output.gateResult?.passed !== false;
}

function failureMessageOf(output: ChapterWriteOutput): string {
  if (output.error) return output.error;
  return output.forceAccepted || output.gateResult?.passed === false
    ? '严格门禁未通过，章节未提交'
    : '写作失败';
}

/**
 * 执行一章直到定局：成功 / 用户停止 / 审查服务不可用 / 重试耗尽。
 *
 * 重试口径：瞬态错误（网络/超时/截断/5xx/429）按 retryBackoffDelayMs 退避，最多
 * maxRetries 次；持久错误立即重试，最多 PERSISTENT_MAX_RETRIES 次；aborted 立即停；
 * review_unavailable 不整章重跑（引擎内已做步骤级重试）。
 */
export async function runBatchChapter(options: RunBatchChapterOptions): Promise<BatchChapterOutcome> {
  const { chapterId, chapterNumber, ledger, signal } = options;
  const maxRetries = Math.max(1, options.maxRetries);
  const targetWordCount = resolveBatchChapterWordTarget(
    options.getProject(),
    chapterNumber,
    options.baseWordCount
  );
  const stopRequested = (): boolean => Boolean(signal?.aborted || options.shouldStop?.());
  let seedRevisionHints: string[] | undefined;
  let persistentAttempts = 0;
  let attempts = 0;
  let lastError = '';
  let lastErrorKind: ErrorKind = 'unknown';
  let lastOutput: ChapterWriteOutput | null = null;
  const foreshadowRejects = new Map<string, number>();
  const foreshadowExemptions: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    if (stopRequested()) {
      return { status: 'stopped', attempts, targetWordCount, lastError, aborted: false };
    }
    await options.waitWhilePaused?.();
    if (stopRequested()) {
      return { status: 'stopped', attempts, targetWordCount, lastError, aborted: false };
    }
    attempts = attempt;
    options.onEvent?.({ type: 'attempt-start', attempt, maxRetries });

    let output: ChapterWriteOutput | null = null;
    let thrown: unknown;
    try {
      output = await options.runAttempt({
        attempt,
        targetWordCount,
        seedRevisionHints,
        foreshadowExemptions: foreshadowExemptions.length > 0 ? [...foreshadowExemptions] : undefined,
      });
    } catch (error) {
      thrown = error;
    }

    if (output && isCommittedSuccess(output)) {
      ledger.resetChapter(chapterId);
      return { status: 'success', attempts, targetWordCount, output };
    }

    let classified: ClassifiedError;
    if (output) {
      lastError = failureMessageOf(output);
      classified = classifyChapterRunFailure(output, lastError, signal);
      // 门禁 critical 问题作为下一轮反馈种子：重试带教训定向重写，而非盲目重跑
      if (output.gateResult) {
        const hints = (output.gateResult.allIssues ?? [])
          .filter(issue => issue.severity === 'critical')
          .map(issue => issue.description)
          .filter((description): description is string => Boolean(description))
          .slice(0, 5);
        seedRevisionHints = hints.length > 0 ? hints : undefined;
      }
      if (isFulfillmentDomainFailure(lastError)) {
        const failures = ledger.recordFailure(chapterId);
        options.onEvent?.({ type: 'fulfillment-failure', failures });
      }
    } else {
      lastError = thrown instanceof Error ? thrown.message : String(thrown);
      classified = classifyError(thrown, signal);
    }
    lastOutput = output;
    lastErrorKind = classified.kind;

    const citedForeshadow = extractForeshadowCitePrefix(lastError);
    if (citedForeshadow) {
      const rejects = (foreshadowRejects.get(citedForeshadow) ?? 0) + 1;
      foreshadowRejects.set(citedForeshadow, rejects);
      if (rejects >= FORESHADOW_EXEMPT_AFTER_REJECTS && !foreshadowExemptions.includes(citedForeshadow)) {
        foreshadowExemptions.push(citedForeshadow);
        options.onEvent?.({ type: 'foreshadow-exempted', prefix: citedForeshadow, rejects });
      }
    }

    if (classified.kind === 'truncated') {
      seedRevisionHints = [TRUNCATED_RETRY_SEED];
    }
    if (classified.kind === 'aborted') {
      return { status: 'stopped', attempts, targetWordCount, lastError, aborted: true };
    }
    if (classified.kind === 'review_unavailable') {
      return { status: 'review_unavailable', attempts, targetWordCount, lastError, lastOutput };
    }

    if (!classified.retryable) {
      // 履约连续失败 → 以已写状态+命运锁为基底再生本章蓝图（每章预算见 ledger）
      if (
        options.repairBlueprint &&
        options.applyRegeneratedBlueprint &&
        ledger.shouldTrigger(chapterId)
      ) {
        ledger.markRegenerated(chapterId);
        options.onEvent?.({ type: 'blueprint-regenerating' });
        try {
          const repair = await regenerateChapterBlueprint({
            project: options.getProject(),
            chapterNumber,
            callStructuredText: options.repairBlueprint,
          });
          if (repair.blueprint) {
            await options.applyRegeneratedBlueprint(repair.blueprint);
            // 蓝图换了，旧合同的失败教训作废
            seedRevisionHints = undefined;
            options.onEvent?.({
              type: 'blueprint-regenerated',
              defectKinds: repair.defects.map(defect => defect.kind),
            });
          } else {
            options.onEvent?.({
              type: 'blueprint-regeneration-failed',
              error: repair.error ?? '再生未产出蓝图',
            });
          }
        } catch (error) {
          options.onEvent?.({
            type: 'blueprint-regeneration-failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      persistentAttempts += 1;
      const giveUp = persistentAttempts >= PERSISTENT_MAX_RETRIES || attempt >= maxRetries;
      options.onEvent?.({
        type: 'attempt-failed',
        attempt,
        maxRetries,
        classified,
        message: lastError,
        next: giveUp ? 'give-up' : 'retry-now',
        persistentAttempts,
      });
      if (giveUp) break;
      continue;
    }

    if (attempt >= maxRetries) {
      options.onEvent?.({
        type: 'attempt-failed',
        attempt,
        maxRetries,
        classified,
        message: lastError,
        next: 'give-up',
        persistentAttempts,
      });
      break;
    }
    const waitMs = retryBackoffDelayMs(classified.kind, attempt);
    options.onEvent?.({
      type: 'attempt-failed',
      attempt,
      maxRetries,
      classified,
      message: lastError,
      next: 'backoff',
      persistentAttempts,
      waitMs,
    });
    try {
      await abortableSleep(waitMs, signal);
    } catch {
      return { status: 'stopped', attempts, targetWordCount, lastError, aborted: true };
    }
  }

  return { status: 'exhausted', attempts, targetWordCount, lastError, lastErrorKind, lastOutput };
}
