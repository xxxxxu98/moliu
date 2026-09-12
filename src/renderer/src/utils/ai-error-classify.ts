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
  | 'truncated'    // JSON 截断 / 解析失败（多半是流式中断的连带症状，瞬态）
  | 'length_capped' // finish_reason=length 确定性截断（撞厂商输出上限，同参数重试必然复现）
  | 'schema'       // "结构校验失败:" / zod 报错
  | 'review'       // "严格门禁未通过" / "严格连续性门禁未通过"
  | 'review_unavailable' // 审查服务异常；不得伪装成内容未履约，也不得整章重写
  | 'wordcount'    // 正文字数低于下限或超过上限
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
 * 覆盖：fetch 失败、连接重置/超时/拒绝、TLS、断流、429 文案、空响应体等。
 * 「API 未返回内容」是大纲请求层对流正常结束但 0 字正文的抛错（矩阵实测
 * minimax/glm 网关抖动会这样返回）——与 length_capped 的确定性截断不同，
 * 无结束异常的空响应大概率是网关抖动，按瞬态处理才能进退避重试。
 */
const TRANSIENT_NETWORK_RE =
  /socket hang up|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ERR_CONNECTION_CLOSED|fetch\s*(\(\))?|failed to fetch|network|TLS|disconnected|connection\s+(closed|reset|aborted)|too many requests|429|server overload|unable to handle additional requests|response body is null|body is null|api\s*未返回内容|连接中断|断连|连接被远端重置/iu;

/**
 * JSON 截断 / 解析失败特征。
 * "无法解析 AI 返回的 JSON"、"AI 返回的结构化 JSON 无法解析"、"Unexpected end of JSON input"
 * 等，多半是流式响应中途断开的连带症状。
 */
const TRUNCATED_RE =
  /unexpected end of (json )?input|无法解析 AI 返回的 JSON|AI 返回的结构化 JSON 无法解析|AI 未返回可解析的结构化 JSON|json\s*解析失败|json repair|bad control character|流式响应提前中断/iu;

/**
 * finish_reason=length 的确定性截断特征（readOpenAiCompatibleStream / unified.service 抛出）。
 * 撞厂商输出上限是确定性失败：同参数重试必然复现，重试只会白烧几分钟长请求。
 * 必须先于 TRUNCATED_RE 判定（「长度上限截断」字样已从 TRUNCATED_RE 移除，避免误伤）。
 */
const LENGTH_CAPPED_RE = /输出被长度上限截断/iu;

/** schema 校验失败特征（来自 schemas.ts:234 的 `${label} 结构校验失败:` 模板） */
const SCHEMA_RE = /结构校验失败|expected .+ received|invalid_enum_value|invalid_type|required/iu;

/** 审核未通过特征 */
const REVIEW_RE = /严格门禁未通过|严格连续性门禁未通过|门禁未通过|审查未通过|review blocked/iu;

const REVIEW_UNAVAILABLE_RE = /\[review-unavailable\]|语义审查不可用/iu;

/** 字数边界特征（来自 supplement.ts 的 buildWordCountBoundsIssue） */
const WORDCOUNT_RE = /字数严重不足|字数严重超限|word-count-(?:short|over)|字数不足|字数超限/iu;

/**
 * 超时特征（超时护栏自己抛的文案，非 AbortError 路径）。
 * 「空闲超时」来自 streamIdleWatchdog：网关挂死、连接 ESTABLISHED 但分钟级零
 * chunk（2026-08-21 反重力实测静默 35 分钟）。归 timeout 瞬态可重试——重试换新
 * 连接，能穿过挂死窗口，这正是 watchdog 存在的意义。
 */
const TIMEOUT_RE = /timeout|超时|timed?\s*out|空闲超时/iu;

/** 配额耗尽文案特征（部分 provider 会用文案而非 429） */
const QUOTA_RE = /quota|配额|rate\s*limit|insufficient.*quota|余额不足|速率限制|请求频率/iu;

/**
 * 窗口级配额耗尽特征（opencode GoUsageLimitError，文案形如
 * "5-hour usage limit reached. Resets in 2hr 13min"）。
 * 与秒级 429 限流不同：窗口配额重置以小时计，退避重试注定失败，
 * 只会空转烧时间（2026-08-18 回归实测：写作阶段空转 85 分钟），
 * 必须快速失败把错误冒给用户。
 */
const WINDOW_QUOTA_RE = /usage\s*limit\s*reached/iu;

/**
 * 网关上游地区路由拦截（实测反重力网关 HTTP 400 "User location is not supported
 * for the API use"）：网关多上游通道轮换，同轮稍后请求常即恢复（gemini-3.7 矩阵
 * 全绿轮 ch4 同签名第 1 次重试即过）。属通道抖动而非业务 4xx，必须先于
 * classifyHttpStatus 的 4xx 分支判定，否则会被归成 provider 不可重试，
 * 一次拦截就废掉整章/整份大纲。
 */
const GEO_BLOCK_RE = /user location is not supported/iu;

// ============================================
// 辅助判定
// ============================================

/** 安全读取任意对象的 status 字段（multi-ai-sdk AIError 上有） */
function readStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

/** 从「API 请求失败: 429 {…}」这类包装错误里抽出 HTTP 状态码 */
function readStatusFromMessage(message: string): number | undefined {
  const match = message.match(/请求失败:\s*(\d{3})\b/u);
  if (!match) return undefined;
  const status = Number(match[1]);
  return Number.isInteger(status) ? status : undefined;
}

/**
 * 是否是 AbortError / DOMException('Aborted')。
 * 除 name === 'AbortError' 外，还须认 Node http/undici 断流抛的裸 `Error('aborted')`
 * （name='Error'）——智谱网关 RST 时实测此形态（2026-09-09 glm-5.3-flash 200 章矩阵
 * outline-expand 381s 处 0 字断连），name-only 判定会漏成 unknown 不重试整轮全灭。
 * 用户取消安全：classifyError 先查 signal.aborted，用户取消必归 'aborted' 不重试。
 */
function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return err instanceof Error && /^aborted$/iu.test(err.message);
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

  // 3) 窗口级配额耗尽（GoUsageLimitError，HTTP 429 或纯文案）：重置以小时计，
  //    必须先于 status=429 判定，否则会被当秒级限流退避重试空转到天荒地老
  if (WINDOW_QUOTA_RE.test(message) || readErrorType(err) === 'GoUsageLimitError') {
    return { kind: 'rate_limit', retryable: false, transient: false, message };
  }

  // 3.5) 网关上游地区路由拦截：通道轮换级瞬态，先于 4xx 业务分类判定。
  // 归 rate_limit 而非 server：同为「上游资源窗口限制、分钟级恢复」，可复用
  // 15-120s 长退避（1-4s 短退避在长阻断窗口下只会连吃 400 耗尽预算——
  // 2026-08-18 gemini-3.6 20 章矩阵 ch16 实测）。
  if (GEO_BLOCK_RE.test(message)) {
    return { kind: 'rate_limit', retryable: true, transient: true, message };
  }

  // 4) HTTP 状态码（multi-ai-sdk AIError 携带 status；项目内 fetch 包装成「请求失败: 429 …」）
  const status = readStatus(err) ?? readStatusFromMessage(message);
  if (typeof status === 'number') {
    const fromStatus = classifyHttpStatus(status);
    if (fromStatus) return { ...fromStatus, message };
  }

  // 5) message 模式匹配（项目内抛的普通 Error）
  const fromMessage = classifyByMessage(message);
  if (fromMessage) return { ...fromMessage, message };

  // 6) 兜底
  return { kind: 'unknown', retryable: false, transient: false, message };
}

/** 安全读取错误对象上的 type 字段（multi-ai-sdk 的 AIError 子类用它区分业务错误） */
function readErrorType(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const type = (err as { type?: unknown }).type;
  return typeof type === 'string' ? type : undefined;
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
  // 章节语义审查结果的结构校验失败是 judge 输出「形状抖动」（顶层数组/缺字段等），
  // 与正文合同的确定性 schema 失败不同：步级重试大概率换回合法形状。必须先于
  // SCHEMA_RE 判定归瞬态，否则单次形状抖动即非瞬态硬拒，烧光整章预算成洞
  // （2026-09-10 glm-5.3-flash 200 章实测 ch147 死于此：5 次尝试全部
  // review_unavailable，scene-draft 反复重写后整章 0 字）。
  if (/章节语义审查结果.*结构校验失败/u.test(message)) {
    return { kind: 'truncated', retryable: true, transient: true };
  }
  if (REVIEW_UNAVAILABLE_RE.test(message)) {
    return { kind: 'review_unavailable', retryable: false, transient: false };
  }
  if (SCHEMA_RE.test(message)) {
    return { kind: 'schema', retryable: false, transient: false };
  }
  if (REVIEW_RE.test(message)) {
    return { kind: 'review', retryable: false, transient: false };
  }
  if (WORDCOUNT_RE.test(message)) {
    return { kind: 'wordcount', retryable: false, transient: false };
  }
  if (LENGTH_CAPPED_RE.test(message)) {
    // 确定性失败：撞输出上限，重试同参数必然复现
    return { kind: 'length_capped', retryable: false, transient: false };
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

/**
 * kind 感知的重试退避。
 *
 * 账户级 429（「已达到速率限制」）下，2-4 秒后再打只会再吃一个 429 并白白耗尽重试额度
 * （实测 ARK provider 6/6 模块全部触发），因此 rate_limit 用独立基数 15s 起步、
 * 120s 封顶；其余瞬态错误沿用调用方传入的默认基数。
 *
 * @param kind 错误类别（来自 classifyError）
 * @param attempt 第几次重试（从 1 起）
 * @param baseMs 非限流错误的基数，默认 4000
 * @param maxMs 非限流错误的上限，默认 30000；限流固定 15s/30s/60s/120s
 */
export function retryBackoffDelayMs(
  kind: ErrorKind,
  attempt: number,
  baseMs = 4000,
  maxMs = 30_000
): number {
  if (kind === 'rate_limit') {
    return backoffDelayMs(attempt, 15_000, 120_000);
  }
  return backoffDelayMs(attempt, baseMs, maxMs);
}

/**
 * 解析「该模型只允许 temperature=1」的网关 400。
 * 实测 kimi-k3 OpenAI 兼容层：`invalid temperature: only 1 is allowed for this model`。
 * 这是参数约束而非瞬态错误：同参数重试必然复现，应改 temperature=1 后立即重试。
 * 返回网关允许的温度值（目前只见过 1）；不是这类约束返回 null。
 */
export function parseAllowedTemperature(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!/temperature/iu.test(message)) return null;
  if (
    /only\s*1\s*(?:is\s*)?allowed/iu.test(message) ||
    /(?:must\s*be|only\s*supports?|只允许|仅支持)\s*1\b/iu.test(message)
  ) {
    return 1;
  }
  return null;
}
