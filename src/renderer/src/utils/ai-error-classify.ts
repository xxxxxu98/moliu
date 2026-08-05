/**
 * AI 错误分类工具
 *
 * 批量续写链路里，单章失败可能源于多种原因：网络抖动、JSON 截断、schema 缺字段、
 * 审核未通过、配额耗尽等。这些错误的"可重试性"截然不同：
 * - 网络抖动重试大概率成功；
 * - schema 缺字段或审核硬伤重试几乎必败，只会白白烧预算。
 *
 * 本工具把任意错误归一成 {@link ClassifiedError}，供批量层（useBatchWriter）做"整章重试决策"，
 * 供管道层 / AI 服务层做"细粒度单步重试决策"。
 *
 * 设计依据（错误来源）：
 * - multi-ai-sdk 的 AIError：`name === 'AIError'`，带 `status`（HTTP 状态码）。网络错误反而是
 *   原生 `TypeError("Failed to fetch")`，没有 status——因为它根本到不了 HTTP 响应。
 * - 超时护栏产生的 AbortError 和用户主动取消的 AbortError 都叫 AbortError，区分点是
 *   `signal.aborted`：用户取消会先 abort signal，超时护栏不会。
 * - schema/审核/字数错误是项目内抛的普通 Error，靠 message 前缀匹配。
 *
 * 复用并提升了现有正则：
 * - `src/renderer/src/services/writing/__tests__/realStructuredAI.ts:34-44`（isTransientAiError）
 * - `src/renderer/src/services/story-runtime/ContinuityValidator.ts:309-313`（isTransientNetwork）
 */

// ============================================
// 类型定义
// ============================================

export type ErrorKind =
  | 'network'      // fetch 失败 / ERR_CONNECTION_CLOSED / ECONNRESET / TypeError(fetch)
  | 'timeout'      // AbortError 且 signal 未 abort（超时护栏触发）
  | 'truncated'    // JSON 截断 / 解析失败
  | 'schema'       // "结构校验失败:" / zod 报错
  | 'review'       // "严格门禁未通过" / "严格连续性门禁未通过"
  | 'wordcount'    // "字数严重不足" / "word-count-short:"
  | 'rate_limit'   // HTTP 429
  | 'server'       // HTTP 5xx
  | 'auth'         // HTTP 401/403
  | 'provider'     // HTTP 400/404 等业务 4xx
  | 'aborted'      // signal.aborted === true（用户主动停止）
  | 'unknown';

export interface ClassifiedError {
  /** 错误类别 */
  kind: ErrorKind;
  /** 是否值得在批量层重试整章（瞬态错误为 true） */
  retryable: boolean;
  /** 是否值得在 AI 调用层 / 管道层做细粒度单步重试 */
  transient: boolean;
  /** 归一化后的错误消息（便于日志和 UI） */
  message: string;
}

// ============================================
// 内部常量
// ============================================

/**
 * 网络瞬时错误消息特征。
 * 覆盖：fetch 失败、连接重置/超时/拒绝、TLS、断流、429 文案等。
 */
const TRANSIENT_NETWORK_RE =
  /socket hang up|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ERR_CONNECTION_CLOSED|fetch\s*(\(\))?|failed to fetch|network|TLS|disconnected|connection\s+(closed|reset|aborted)|too many requests|429|server overload|unable to handle additional requests/iu;

/**
 * JSON 截断 / 解析失败特征。
 * "无法解析 AI 返回的 JSON"、"AI 返回的结构化 JSON 无法解析"、"Unexpected end of JSON input"
 * 等，多半是流式响应中途断开的连带症状。
 */
const TRUNCATED_RE =
  /unexpected end of (json )?input|无法解析 AI 返回的 JSON|AI 返回的结构化 JSON 无法解析|AI 未返回可解析的结构化 JSON|json\s*解析失败|json repair|bad control character/iu;

/** schema 校验失败特征（来自 schemas.ts:234 的 `${label} 结构校验失败:` 模板） */
const SCHEMA_RE = /结构校验失败|expected .+ received|invalid_enum_value|invalid_type|required/iu;

/** 审核未通过特征 */
const REVIEW_RE = /严格门禁未通过|严格连续性门禁未通过|门禁未通过|审查未通过|review blocked/iu;

/** 字数不足特征（来自 supplement.ts:212-230 的 buildWordCountShortfallIssue） */
const WORDCOUNT_RE = /字数严重不足|word-count-short|字数不足/iu;

/** 超时特征（超时护栏自己抛的文案，非 AbortError 路径） */
const TIMEOUT_RE = /timeout|超时|timed?\s*out/iu;

/** 配额耗尽文案特征（部分 provider 会用文案而非 429） */
const QUOTA_RE = /quota|配额|rate\s*limit|insufficient.*quota|余额不足/iu;

// ============================================
// 辅助判定
// ============================================

/** 安全读取任意对象的 status 字段（multi-ai-sdk AIError 上有） */
function readStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/** 是否是 AbortError / DOMException('Aborted') */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return err instanceof Error && err.name === 'AbortError';
}

// ============================================
// 主分类函数
// ============================================

/**
 * 把任意错误归一成 {@link ClassifiedError}。
 *
 * @param err 原始错误（可能是原生 Error / TypeError / DOMException / AIError / AppError / 字符串）
 * @param signal 关联的 AbortSignal，用于区分"用户主动取消"与"超时护栏触发"。
 *   - 传 signal 且 `signal.aborted === true` → 归为 `aborted`（立即停，不重试）；
 *   - 未传 signal 或未 abort，但错误是 AbortError → 归为 `timeout`（可重试）。
 */
export function classifyError(err: unknown, signal?: AbortSignal): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);

  // 1) 用户主动停止优先级最高
  if (signal?.aborted || isAbortErrorWithSignal(err, signal)) {
    return { kind: 'aborted', retryable: false, transient: false, message };
  }

  // 2) AbortError 但 signal 未 abort → 超时护栏
  if (isAbortError(err)) {
    return { kind: 'timeout', retryable: true, transient: true, message };
  }

  // 3) HTTP 状态码（multi-ai-sdk AIError 携带 status）
  const status = readStatus(err);
  if (typeof status === 'number') {
    const fromStatus = classifyHttpStatus(status);
    if (fromStatus) return { ...fromStatus, message };
  }

  // 4) message 模式匹配（项目内抛的普通 Error）
  const fromMessage = classifyByMessage(message);
  if (fromMessage) return { ...fromMessage, message };

  // 5) 兜底
  return { kind: 'unknown', retryable: false, transient: false, message };
}

/**
 * 判定 AbortError 是否真的对应"用户主动取消"。
 * 用户取消时外部会先 abort signal，错误抛出时 signal.aborted 必为 true；
 * 超时护栏触发的 AbortError 不会 abort 用户传入的 signal。
 */
function isAbortErrorWithSignal(err: unknown, signal?: AbortSignal): boolean {
  if (!isAbortError(err)) return false;
  return signal?.aborted === true;
}

/** 按 HTTP status 分类（multi-ai-sdk AIError 走这条） */
function classifyHttpStatus(status: number): Omit<ClassifiedError, 'message'> | null {
  if (status === 429) {
    return { kind: 'rate_limit', retryable: true, transient: true };
  }
  if (status >= 500) {
    return { kind: 'server', retryable: true, transient: true };
  }
  if (status === 401 || status === 403) {
    return { kind: 'auth', retryable: false, transient: false };
  }
  if (status >= 400 && status < 500) {
    // 400/404/422 等：业务/配置错误，重试无用
    return { kind: 'provider', retryable: false, transient: false };
  }
  return null;
}

/** 按 message 文案分类（项目内抛的普通 Error 走这条） */
function classifyByMessage(message: string): Omit<ClassifiedError, 'message'> | null {
  if (SCHEMA_RE.test(message)) {
    return { kind: 'schema', retryable: false, transient: false };
  }
  if (REVIEW_RE.test(message)) {
    return { kind: 'review', retryable: false, transient: false };
  }
  if (WORDCOUNT_RE.test(message)) {
    return { kind: 'wordcount', retryable: false, transient: false };
  }
  if (TRUNCATED_RE.test(message)) {
    return { kind: 'truncated', retryable: true, transient: true };
  }
  if (QUOTA_RE.test(message)) {
    return { kind: 'rate_limit', retryable: true, transient: true };
  }
  if (TIMEOUT_RE.test(message)) {
    return { kind: 'timeout', retryable: true, transient: true };
  }
  if (TRANSIENT_NETWORK_RE.test(message)) {
    return { kind: 'network', retryable: true, transient: true };
  }
  return null;
}

// ============================================
// 便捷谓词
// ============================================

/** 是否瞬态错误（值得在 AI 调用层 / 管道层细粒度重试） */
export function isTransientError(err: unknown, signal?: AbortSignal): boolean {
  return classifyError(err, signal).transient;
}

/** 是否值得在批量层重试整章 */
export function isRetryableError(err: unknown, signal?: AbortSignal): boolean {
  return classifyError(err, signal).retryable;
}

/** 是否用户主动取消（应立即停整批，不进任何重试） */
export function isAbortedError(err: unknown, signal?: AbortSignal): boolean {
  return classifyError(err, signal).kind === 'aborted';
}

/**
 * 指数退避延迟（毫秒）。
 *
 * 批量层用：attempt 从 1 开始，返回 4000 / 8000 / 16000 / 30000 / 30000（封顶 30s）。
 * AI 调用层细粒度重试用更短的：传 base=1000，返回 1000 / 2000 / 4000。
 *
 * @param attempt 第几次重试（从 1 起）
 * @param baseMs 基数，默认 4000（批量层用）
 * @param maxMs 上限，默认 30000
 */
export function backoffDelayMs(
  attempt: number,
  baseMs = 4000,
  maxMs = 30_000
): number {
  // attempt=1 → base, attempt=2 → base*2, ...
  const raw = baseMs * 2 ** (attempt - 1);
  return Math.min(raw, maxMs);
}
