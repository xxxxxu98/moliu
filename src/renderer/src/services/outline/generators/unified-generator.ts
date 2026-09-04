/**
 * Unified Outline Generator
 * 生产主链：generateDirections → expandDirection（含 OutlineAgent 修复）。
 */

import type { ProviderType } from '@/config/ai-providers';
import { getBaseUrl } from '@/config/ai-providers';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import {
  classifyError,
  isAbortedError,
  isTransientError,
  parseAllowedTemperature,
  retryBackoffDelayMs,
} from '@/utils/ai-error-classify';
import { createOutlineTracer, type OutlineTracer, type OutlineTracePurpose } from '../utils/outline-trace';
import {
  useSettingsStore,
  type AIDefaultModelSelection,
  type AIGenerationConfig,
} from '@/stores/settings.store';
import { buildWordCountBreakdown } from '../utils';
import type { DirectionGenerationResult, OutlineDirection } from '../types/direction';
import type { ExpandedOutlineResult } from '../types/executable-outline';
import { buildDirectionPrompt } from '../prompts/system/direction-prompt';
import { generateExpandedOutlineInSteps } from './outline-stepper';
import { parseDirections } from '../parser/direction-parser';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import {
  hasStructuralOutlineBlockers,
  inspectOutlineCompleteness,
} from '../validation/outlineCompleteness';
import { completeIncompleteOutline, sanitizeOutlineHookLengths } from './outline-completer';
import { runOutlineRepairAgent } from '../agent/OutlineAgent';
import type { AgentLoopTransport, AgentMessage } from '@/services/story-runtime/agent/AgentLoopRunner';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';
import { readPositiveIntEnv } from '@/utils/env';
import { readWithIdleTimeout } from '@/utils/streamIdleWatchdog';

/**
 * 大纲单次请求超时（默认 30 分钟）。慢模型单步实测可达 6 分钟+，9 厂商矩阵中
 * qwen3.8-max 单步 379s、glm 网关一次卡满 900s 被误杀。
 * 可用 MOLIU_OUTLINE_TIMEOUT_MS 覆盖（冒烟脚本/矩阵按需调整）。
 */
export const OUTLINE_REQUEST_TIMEOUT_MS = readPositiveIntEnv('MOLIU_OUTLINE_TIMEOUT_MS') ?? 1_800_000;

/**
 * 大纲请求走 SSE 流式。
 *
 * 非流式下网关只看到一条长时间零字节的连接：实测 bigmodel 网关在 735 秒整点
 * RST（socket hang up），与请求体大小无关，客户端超时永远轮不到触发。
 * 流式下 token 持续到达，连接不再静默，长输出才可能跑完。
 */
const OUTLINE_STREAM_DONE = '[DONE]';

/** 读取 OpenAI 兼容 SSE 流并拼回完整文本；网关忽略 stream 参数时回退整包 JSON */
async function readOpenAiCompatibleStream(response: Response): Promise<string> {
  const body = response.body;
  if (!body?.getReader) {
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? '';
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawBody = '';
  let content = '';
  let sawStreamEvent = false;
  let sawStreamEnd = false;
  let hitLengthCap = false;
  let reasoningChars = 0;

  const consumeEvent = (rawEvent: string): void => {
    for (const line of rawEvent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      sawStreamEvent = true;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      if (payload === OUTLINE_STREAM_DONE) {
        sawStreamEnd = true;
        continue;
      }
      try {
        const chunk = JSON.parse(payload);
        const choice = chunk?.choices?.[0];
        if (choice?.finish_reason) {
          sawStreamEnd = true;
          if (choice.finish_reason === 'length') hitLengthCap = true;
        }
        // reasoning_content 只用于维持连接，不进正文
        const piece = choice?.delta?.content ?? choice?.message?.content;
        if (typeof piece === 'string') content += piece;
        const reasoning = choice?.delta?.reasoning_content;
        if (typeof reasoning === 'string') reasoningChars += reasoning.length;
      } catch {
        // 半截事件在下一个分片补齐，忽略即可
      }
    }
  };

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await readWithIdleTimeout(reader);
    } catch (error) {
      // 空闲超时（网关挂死）时必须释放底层连接，否则连接会一直挂着占资源
      void reader.cancel().catch(() => {});
      throw error;
    }
    if (chunk.done) break;
    const value = chunk.value;
    const text = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    rawBody += text;
    buffer += text;
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      consumeEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) consumeEvent(buffer);

  if (!sawStreamEvent) {
    try {
      const data = JSON.parse(rawBody);
      return data?.choices?.[0]?.message?.content ?? '';
    } catch {
      throw new Error('大纲流式响应无法解析：既不是 SSE 事件也不是合法 JSON');
    }
  }

  // 网关中途 RST 时 reader 也会正常 done，只能靠 [DONE]/finish_reason 判断是否真的写完
  if (!sawStreamEnd) {
    throw new Error(
      `大纲流式响应提前中断：已收到 ${content.length} 字，未见结束标记`,
    );
  }

  // finish_reason=length 说明撞到厂商默认输出上限。推理型模型可能把预算全烧在
  // reasoning_content 上，一个正文字都没吐，此时只报"未返回内容"会完全掩盖真因。
  if (hitLengthCap) {
    throw new Error(
      `大纲输出被长度上限截断：正文 ${content.length} 字、推理 ${reasoningChars} 字` +
        (content.length === 0
          ? '（输出预算全部消耗在推理上，请换用输出上限更高的厂商配置或非推理模型）'
          : ''),
    );
  }

  return content;
}

function transientRetryDelayMs(error: unknown, attempt: number): number {
  // kind 感知退避：账户级 429 走 15s/30s/60s/120s（2 秒后再打只会再吃一个 429）；
  // 其余瞬态错误 2s 起步、30s 封顶。
  return retryBackoffDelayMs(classifyError(error).kind, attempt, 2000, 30_000);
}

/**
 * 解析「max_tokens 超网关上限」的 400 错误。
 * 匹配两类文案：minimax/ARK 风格 `expected a value <= 131072`、
 * OpenAI 风格 `maximum value ... 16384` / `max_tokens is too large: 16384`、
 * MiniMax OpenAI 兼容层 `does not support max tokens > 524288`（空格形态 + `>` 分隔）。
 * 注意错误 message 来自 response.text() 原文，`<` 可能仍是 JSON 字面转义 `\u003c`
 * 或 HTML 实体 `&lt;`，三种写法都兼容。
 * 返回网关报的上限值；确认是超限错误但拿不到数值时返回 0（调用方减半降级）；
 * 不是这类错误返回 null。
 */
export function parseMaxTokensCapError(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!/max[_\s]?tokens|maximum context|too large|above maximum value/iu.test(message)) return null;
  const capPattern = /(?:<=|\\u003c=?|&lt;=?|：|:|>)\s*(\d{4,7})/u;
  const match =
    message.match(capPattern) ??
    // DeepSeek 风格：`the valid range of max_tokens is [1, 393216]`（区间上界即上限）
    message.match(/\[\s*\d{1,7}\s*,\s*(\d{4,7})\s*\]/u) ??
    // minimax/ARK 拼写形式：`less than or equal to 131072`（`<=` 符号形式走 capPattern）
    message.match(/(?:less than or equal to|at most|不超过|最大)\s*(\d{4,7})/iu) ??
    message.match(/maximum value\D{0,20}(\d{4,7})/u) ??
    message.match(/max[_\s]?tokens\D{0,20}?(\d{4,7})/u);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 1024) return value;
  }
  return 0;
}

function matchesDefaultModelSelection(
  provider: {
    id: string;
    modelName: string;
    enabled: boolean;
    apiKey: string;
  },
  selection: AIDefaultModelSelection | null,
): boolean {
  if (!selection) return false;

  return provider.id === selection.providerId
    && provider.modelName === selection.modelName
    && provider.enabled
    && !!provider.apiKey;
}

/**
 * 读取失败响应体，构造带上下文的错误。
 * 之前只抛 `xxx API 请求失败: ${status}`，401/400/429 等只能看到状态码，
 * 无法定位是 key 失效、参数错误还是限流。这里读取响应文本并截断拼接进错误信息，
 * 便于用户和排查。AbortError 不走此路径（fetch 会直接 reject）。
 */
async function buildHttpError(response: Response, prefix: string): Promise<Error> {
  let detail = '';
  try {
    const text = await response.text();
    detail = text ? text.slice(0, 500) : '';
  } catch {
    detail = '';
  }
  const message = detail
    ? `${prefix}: ${response.status} ${detail}`
    : `${prefix}: ${response.status}`;
  return new Error(message);
}

/**
 * 判断异常是否为「用户主动取消」：AbortError 且关联 signal 已 abort。
 * 只看 error name 是不够的——网关 RST 时 undici/Electron net 也会抛
 * DOMException AbortError（2026-08-16 矩阵 5 家全灭的根因），必须结合
 * signal.aborted 才能区分；未关联 signal 的 AbortError 按连接层断流处理，
 * 交给瞬态重试。调用方拿不到 signal 的场景传 undefined 之外没有安全默认。
 */
function isUserCancelled(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!(error instanceof Error) || error.name !== 'AbortError') return false;
  return signal?.aborted === true;
}

/**
 * 可中断的 sleep。用于瞬态错误（429/网络抖动）的指数退避：
 * 用户取消（signal.aborted）时立即抛 AbortError，不拖时间。
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * 生成选项
 */
export interface GenerateOptions {
  temperature?: number;
  topP?: number;
  wordCountRange?: string;
  maxRetries?: number;
  /** 单次大纲 AI 请求超时；默认 15 分钟。 */
  requestTimeoutMs?: number;
  /** 一次生成的大纲数量，默认 3 */
  count?: number;
  /** 默认 preserve-genre；只有用户明确授权时才允许跨题材增加超自然机制。 */
  creativeExpansionMode?: 'preserve-genre' | 'allow-cross-genre';
  /** 可选 AbortSignal：用于在发起新请求 / 重置时取消旧的在飞请求，避免竞势与多余计费。 */
  signal?: AbortSignal;
  /**
   * trace 配置（P1-2）：传入 runId 即启用，所有 AI 请求/响应/耗时落盘到 temp/ai-traces/{runId}.jsonl。
   * 失败时不影响主流程。生产环境默认不传（不写盘），测试/冒烟显式传入。
   */
  trace?: {
    runId: string;
    model?: string;
    provider?: string;
  };
}

/**
 * 统一大纲生成器：方向卡 + 可执行大纲展开。
 */
export class UnifiedOutlineGenerator {
  /**
   * 默认选项不含 temperature/topP：两者均交给请求层按
   * 「显式 options > 厂商 generationConfig > 硬编码默认」解析，
   * 否则这里的默认值会永远遮蔽厂商配置（?? 链取不到厂商值）。
   */
  private defaultOptions: GenerateOptions = {
    maxRetries: 2,
  };

  /** tracer 缓存：按 runId 复用，避免每次请求都新建（同一个生成会话共享一个 trace 文件） */
  private tracerCache = new Map<string, OutlineTracer>();

  constructor(options?: GenerateOptions) {
    if (options) {
      this.defaultOptions = { ...this.defaultOptions, ...options };
    }
  }

  /** 从 options.trace 解析或复用 tracer；未配置时返回 undefined（不写 trace） */
  private getTracer(options: GenerateOptions): OutlineTracer | undefined {
    const traceCfg = options.trace ?? this.defaultOptions.trace;
    if (!traceCfg?.runId) return undefined;
    const cached = this.tracerCache.get(traceCfg.runId);
    if (cached) return cached;
    const tracer = createOutlineTracer({
      runId: traceCfg.runId,
      model: traceCfg.model,
      provider: traceCfg.provider,
    });
    this.tracerCache.set(traceCfg.runId, tracer);
    return tracer;
  }

  /** 测试/冒烟用：等待所有 trace 落盘完成 */
  async flushTrace(): Promise<void> {
    await Promise.all([...this.tracerCache.values()].map(t => t.flush()));
  }

  async generateDirections(
    prompt: string,
    options?: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<DirectionGenerationResult> {
    const expectedCount = Math.max(1, options?.count ?? 3);
    // 成功门槛 = 至少解析出期望方向数的一半：此前「解出任意 1 个即算成功」，
    // 3 个方向只回 1 个残卡也通过，用户拿到的选择面塌缩且无重试机会。
    // 收紧后部分解析会触发 runWithRetry 的降温重试；耗尽后仍返回已解析的部分（优雅降级）。
    const minimumAcceptable = Math.max(1, Math.ceil(expectedCount / 2));
    return this.runWithRetry<DirectionGenerationResult>(
      async (attempt, temperature) => {
        const opts = { ...this.defaultOptions, ...options, ...(temperature !== undefined ? { temperature } : {}) };
        const builtPrompt = buildDirectionPrompt({
          seed: prompt,
          wordCountRange: opts.wordCountRange || DEFAULT_WORD_COUNT_RANGE,
          creativeExpansionMode: opts.creativeExpansionMode ?? 'preserve-genre',
        });

        onProgress?.(attempt === 1 ? '正在生成创作方向...' : `重新生成创作方向... (${attempt})`);

        const rawText = await this.callStructuredTextMode(builtPrompt.system, builtPrompt.user, opts, 'outline-direction');
        const directions = parseDirections(rawText);

        const warnings: string[] = [];
        if (directions.length === 0) {
          warnings.push('未能解析出任何创作方向，建议调整提示词后重试');
        } else if (directions.length < expectedCount) {
          warnings.push(`仅完整解析出 ${directions.length}/${expectedCount} 个方向`);
        }

        return {
          directions,
          rawText,
          strategy:
            directions.length >= expectedCount
              ? 'structured-text'
              : directions.length > 0
                ? 'fallback'
                : 'fallback',
          warnings,
        };
      },
      (result) => result.directions.length >= minimumAcceptable,
      options?.maxRetries ?? 2,
      onProgress,
      // 冷却基准 = 本次生效温度，避免厂商低温度配置被 0.7 基准“升温”
      options?.temperature ?? this.getAIConfig().generationConfig?.temperature ?? 0.7,
      options?.signal,
    );
  }

  async expandDirection(
    prompt: string,
    direction: OutlineDirection,
    options?: GenerateOptions & { enhancementBrief?: string },
    onProgress?: (message: string) => void,
  ): Promise<ExpandedOutlineResult> {
    const result = await this.runWithRetry<ExpandedOutlineResult>(
      async (attempt, temperature) => {
        const opts = {
          ...this.defaultOptions,
          ...options,
          ...(temperature !== undefined ? { temperature } : {}),
        };
        const wordCountRange = opts.wordCountRange || DEFAULT_WORD_COUNT_RANGE;

        onProgress?.(attempt === 1 ? '正在展开主方案...' : `重新展开主方案... (${attempt})`);

        // 主请求拆成 5 步分步生成（骨架→卷纲→启动包→角色伏笔→节奏包装），
        // 单步输出量大幅下降，显著降低推理型模型撞 finish_reason=length 的概率。
        // 拼装完成的 rawText 与原一次性产出的格式完全一致，后续补全/审查/修复流程不变。
        const stepped = await generateExpandedOutlineInSteps({
          seed: prompt,
          direction,
          options: opts,
          enhancementBrief: opts.enhancementBrief,
          wordCountRange,
          callStructuredTextMode: (system, user, callOptions) =>
            this.callStructuredTextMode(system, user, callOptions, 'outline-expand'),
          onProgress,
        });
        let rawText = stepped.rawText;
        let outline = parseExpandedOutline(rawText);

        // 主请求只产出启动包与卷纲，单章蓝图常规就走分批补全；角色与伏笔若被截断也在这里补齐。
        // 完整性门槛与 prompt 的 50 章 / 10 角色 / 10 伏笔要求共用同一策略，任何硬缺口都触发重试。
        const warnings: string[] = [...stepped.warnings];
        let severelyTruncated = false;
        let blockers: string[] = [];
        if (outline) {
          let completeness = inspectOutlineCompleteness(outline);
          if (hasStructuralOutlineBlockers(completeness)) {
            onProgress?.('主方案已就绪，正在分批拆解单章蓝图...');
            try {
              const completed = await completeIncompleteOutline({
                rawText,
                outline,
                direction,
                options: opts,
                callStructuredTextMode: (system, user, callOptions) =>
                  this.callStructuredTextMode(system, user, callOptions, 'outline-expand'),
                onProgress,
              });
              rawText = completed.rawText;
              outline = completed.outline;
              warnings.push(...completed.warnings);
              completeness = inspectOutlineCompleteness(outline);
            } catch (error) {
              if (isUserCancelled(error, opts.signal)) throw error;
              const message = error instanceof Error ? error.message : String(error);
              warnings.push(`分段补全失败：${message.slice(0, 160)}`);
            }
          }
          severelyTruncated = hasStructuralOutlineBlockers(completeness);
          blockers = completeness.blockers.map(blocker => blocker.message);
        }

        // 结构补齐后的修复交给大纲 agent（docs/agent-architecture-refactor.md P3）：
        // 模型按门禁结果读段/读章、局部改写、复检，blockers=0 才收尾。
        // 进 agent 前先做零成本本地收缩（超长标题/CBN/CEN 是模型常态，省掉一轮往返）。
        if (outline && !severelyTruncated) {
          const preSanitized = sanitizeOutlineHookLengths(rawText, outline);
          if (preSanitized) {
            outline = preSanitized.outline;
            rawText = preSanitized.rawText;
            warnings.push(...preSanitized.warnings);
          }

          const repaired = await runOutlineRepairAgent({
            rawText,
            outline,
            direction,
            transport: this.createAgentTransport(opts),
            signal: opts.signal,
            onProgress,
          });
          rawText = repaired.rawText;
          outline = repaired.outline;
          warnings.push(...repaired.warnings);
          if (repaired.agentRan) {
            warnings.push(
              `大纲 agent:${repaired.finishReason},${repaired.stats.rounds} 轮 ${repaired.stats.toolCalls} 次工具调用,复检 ${repaired.checksUsed} 次`,
            );
          }

          // agent 收束后的门禁结论即出口结论：agent 只采用校验过的稿，这里无需重跑
          severelyTruncated = !repaired.completeness.canApply;
          blockers = repaired.completeness.blockers.map(blocker => blocker.message);
        }
        for (const blocker of blockers) {
          if (!warnings.includes(blocker)) warnings.push(blocker);
        }

        return {
          outline,
          rawText,
          strategy: outline ? 'structured-text' : 'fallback',
          severelyTruncated,
          canApply: Boolean(outline) && !severelyTruncated,
          blockers,
          warnings: outline ? warnings : ['未能完整解析主方案，建议重新生成或微调方向描述'],
        };
      },
      (result) => result.outline !== null && !result.severelyTruncated,
      options?.maxRetries ?? 2,
      onProgress,
      // 冷却基准 = 本次生效温度，避免厂商低温度配置被 0.7 基准“升温”
      options?.temperature ?? this.getAIConfig().generationConfig?.temperature ?? 0.7,
      options?.signal,
    );

    // fail-closed：残缺稿可留作诊断，但不得通过 outline 字段进入 UI 应用链路。
    if (result.outline && result.severelyTruncated) {
      return {
        ...result,
        partialOutline: result.outline,
        outline: null,
        canApply: false,
      };
    }
    return { ...result, canApply: Boolean(result.outline) };
  }

  /**
   * 通用重试包装：success 判定由 isSuccess 回调决定，
   * 解析类失败重试时降温收敛。仅对真正的运行时异常（API 报错等）才重试。
   *
   * 降温温度通过 run 的第二个参数注入（旧实现算出 coolingTemp 后被 `void` 丢弃，
   * run 闭包仍持有原始 options，温度从未真正改变）。
   */
  private async runWithRetry<T>(
    run: (attempt: number, temperature?: number) => Promise<T>,
    isSuccess: (result: T) => boolean,
    maxAttempts: number,
    onProgress?: (message: string) => void,
    /** 重试降温的基准温度：应为本次请求生效温度（显式 options > 厂商 generationConfig > 0.7） */
    baseTemperature?: number,
    /** 用户取消信号：runWithRetry 自身拿不到 options，由调用方传入 */
    signal?: AbortSignal,
  ): Promise<T> {
    const total = Math.max(1, maxAttempts);
    let lastResult: T | null = null;
    // 第 2 次及以后重试使用的降温温度；首次请求为 undefined，沿用调用方原始温度。
    let coolingTemp: number | undefined;

    for (let attempt = 1; attempt <= total; attempt++) {
      try {
        lastResult = await run(attempt, coolingTemp);
        if (isSuccess(lastResult)) {
          return lastResult;
        }
        if (attempt < total) {
          coolingTemp = Math.max(0.2, (baseTemperature ?? 0.7) - 0.1 * attempt);
          onProgress?.(`结果不完整，重试中... (${attempt}/${total})`);
        }
      } catch (error) {
        // 主动取消（竞态 / 重置）不重试，直接向上抛，由调用方按 currentId 判定丢弃。
        if (isUserCancelled(error, signal)) {
          throw error;
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        // 瞬态错误（429 限流 / 网络抖动 / 5xx）按指数退避重试，不降温
        // —— 降温对限流毫无意义，限流不是输出质量问题，反复立即重试只会再吃一个 429。
        // 实测 ARK provider 6/6 模块全部触发 429，无退避时重试额度白白耗尽。
        if (attempt < total && isTransientError(error)) {
          const delayMs = transientRetryDelayMs(error, attempt);
          onProgress?.(`请求被限流或网络抖动，${delayMs}ms 后重试 (${attempt}/${total}): ${errorMsg}`);
          await sleep(delayMs);
          // 瞬态重试不降温：保持 coolingTemp 不变（首次为 undefined = 沿用原温度）
          continue;
        }
        onProgress?.(`生成出错: ${errorMsg}`);
        // 非瞬态错误（长度上限截断、schema 等）重试同参数必然复现，立即上抛；
        // 只有解析结果不完整（不抛异常的 soft-fail）才值得降温重试。
        throw error;
      }
    }

    return lastResult as T;
  }


  private async callStructuredTextMode(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateOptions,
    purpose: OutlineTracePurpose = 'outline-direction',
  ): Promise<string> {
    const data = await this.requestChatCompletion(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt },
      ],
      options,
      purpose,
    );

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('API 未返回内容');
    }

    return content;
  }

  /**
   * 滚动续纲（outline-roller）等外部流程的结构化文本调用入口：
   * 复用 callStructuredTextMode 的流式读回/超时/trace/错误归一，不暴露私有状态。
   */
  async callStructuredTextForRoll(
    systemPrompt: string,
    userPrompt: string,
    options?: GenerateOptions,
  ): Promise<string> {
    return this.callStructuredTextMode(
      systemPrompt,
      userPrompt,
      { ...this.defaultOptions, ...options },
      'outline-roll',
    );
  }

  /**
   * 大纲 agent 回合的多轮传输通道：与 callStructuredTextMode 同一请求层
   * （流式读回 / 超时 / max_tokens 与温度约束降级 / trace / 错误归一），
   * 只是消息数组允许 assistant 角色。温度用辅助档 0.2（修复判定任务，非创作）。
   * 冒烟与 App 都从这里拿 transport，是大纲 agent 的唯一注入点（单轨）。
   */
  private createAgentTransport(options: GenerateOptions): AgentLoopTransport {
    return {
      send: async (messages, sendOptions) => {
        let content = await this.requestAgentContent(messages, options, sendOptions?.signal);
        // 空响应重试一次:网关抖动的常见形态是 200 但 content 为空(2026-09-03 反重力
        // 100 章实证,修复 agent 直接按 transport 失败收束,整轮大纲作废)
        if (!content) {
          content = await this.requestAgentContent(messages, options, sendOptions?.signal);
        }
        if (!content) {
          throw new Error('API 未返回内容');
        }
        return content;
      },
    };
  }

  private async requestAgentContent(
    messages: AgentMessage[],
    options: GenerateOptions,
    signal?: AbortSignal,
  ): Promise<string> {
    const data = await this.requestChatCompletion(
      messages,
      { ...options, temperature: 0.2, signal: signal ?? options.signal },
      'outline-agent',
    );
    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }

  private async requestChatCompletion(
    messages: AgentMessage[],
    options: GenerateOptions,
    purpose: OutlineTracePurpose = 'outline-direction',
  ): Promise<any> {
    const config = this.getAIConfig();
    const provider = config.provider;
    const resolvedBaseUrl = config.baseUrl.replace(/\/$/, '');
    const signal = options.signal;
    const requestTimeoutMs = Math.max(
      1,
      options.requestTimeoutMs ?? this.defaultOptions.requestTimeoutMs ?? OUTLINE_REQUEST_TIMEOUT_MS,
    );
    const timeoutController = new AbortController();
    const timeoutTimer = setTimeout(() => timeoutController.abort(), requestTimeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;
    const tracer = this.getTracer(options);
    const startedAt = tracer ? Date.now() : 0;
    const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    // trace 的 prompt 字段：单轮请求即 user 正文；多轮 agent 回合记末条 user（工具结果）以免逐轮膨胀
    const userMessages = messages.filter(m => m.role === 'user');
    const userText =
      messages.some(m => m.role === 'assistant')
        ? (userMessages.at(-1)?.content ?? '')
        : userMessages.map(m => m.content).join('\n\n');

    try {
      // max_tokens 超网关上限的 400（统一配 1M 时低上限网关会拒）：解析网关报的上限
      // （拿不到就减半）降级重试，循环最多 3 轮（首降减半后仍超限时靠新一轮错误里的
      // 网关上限收敛），并把最终收敛值记回厂商配置，后续请求不再踩。
      // 同一循环还兜「该模型只允许 temperature=1」的参数约束（kimi-k3 实测）：
      // 显式 options 温度优先于厂商配置，必须双写 effectiveOptions/effectiveConfig。
      const MAX_TOKENS_CAP_ROUNDS = 3;
      let effectiveConfig = config;
      let effectiveOptions = options;
      let result: any;
      for (let capRound = 0; ; capRound += 1) {
        try {
          result = await this.doRequestChatCompletion(
            messages,
            effectiveOptions,
            effectiveConfig,
            provider,
            resolvedBaseUrl,
            requestSignal,
          );
          break;
        } catch (error) {
          if (capRound >= MAX_TOKENS_CAP_ROUNDS) throw error;
          const capped = parseMaxTokensCapError(error);
          if (capped === null) {
            const allowedTemperature = parseAllowedTemperature(error);
            const currentTemperature =
              effectiveOptions.temperature ?? effectiveConfig.generationConfig?.temperature ?? 0.7;
            if (allowedTemperature === null || currentTemperature === allowedTemperature) {
              throw error;
            }
            console.warn(
              `[UnifiedOutlineGenerator] 网关要求 temperature=${allowedTemperature}（当前 ${currentTemperature}），改值重试（第 ${capRound + 1} 轮）`,
            );
            this.rememberProviderTemperatureLock(effectiveConfig, allowedTemperature);
            effectiveOptions = { ...effectiveOptions, temperature: allowedTemperature };
            effectiveConfig = {
              ...effectiveConfig,
              generationConfig: { ...effectiveConfig.generationConfig, temperature: allowedTemperature },
            };
          } else {
            const original = effectiveConfig.generationConfig?.maxTokens ?? 0;
            const fallback = capped > 0 ? capped : Math.max(1024, Math.floor(original / 2));
            if (fallback >= original && original > 0) throw error;
            console.warn(
              `[UnifiedOutlineGenerator] max_tokens=${original} 超网关上限（${capped > 0 ? `网关报上限 ${capped}` : '上限未知'}），降级为 ${fallback} 重试（第 ${capRound + 1} 轮）`,
            );
            this.rememberProviderMaxTokensCap(effectiveConfig, fallback);
            effectiveConfig = {
              ...effectiveConfig,
              generationConfig: { ...effectiveConfig.generationConfig, maxTokens: fallback },
            };
          }
        }
      }
      if (tracer) {
        const content = result?.choices?.[0]?.message?.content ?? '';
        tracer.record({
          purpose,
          system: systemText,
          prompt: userText,
          response: typeof content === 'string' ? content : String(content ?? ''),
          ms: Date.now() - startedAt,
        });
      }
      return result;
    } catch (error) {
      // 错误归一（用户取消原样上抛 / 超时改写文案 / 网关断连的 AbortError 改写为网络错误）：
      // 网关 RST 时 undici/Electron net 会抛 DOMException AbortError（message='aborted'），
      // 若原样上抛，上层 isUserCancelled/isAbortedError 会误判「用户主动取消」零重试直接终止
      // 整轮（2026-08-16 矩阵 5 家全部死于此）。真正的用户取消只可能来自 options.signal——
      // signal 未 abort 且超时控制器也未触发的 AbortError 一律是连接层断流，按瞬态重试。
      let normalizedError: unknown = error;
      if (timeoutController.signal.aborted && !signal?.aborted) {
        normalizedError = new Error(`[大纲请求超时] 单次 AI 请求超过 ${requestTimeoutMs}ms`);
      } else if (error instanceof Error && error.name === 'AbortError' && !signal?.aborted) {
        normalizedError = new Error('网络连接中断：AI 流式连接被远端重置（AbortError）');
      }
      if (tracer) {
        tracer.record({
          purpose,
          system: systemText,
          prompt: userText,
          error: normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
          ms: Date.now() - startedAt,
        });
      }
      throw normalizedError;
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  private async doRequestChatCompletion(
    messages: AgentMessage[],
    options: GenerateOptions,
    config: { provider: ProviderType; apiKey: string; baseUrl: string; model?: string; generationConfig?: AIGenerationConfig },
    provider: ProviderType,
    resolvedBaseUrl: string,
    signal: AbortSignal | undefined,
  ): Promise<any> {
    // 厂商显式配置的输出上限（正数才下发；未配置不下发沿用网关默认，见 AIGenerationConfig.maxTokens）
    const configuredMaxTokens = config.generationConfig?.maxTokens;
    const maxTokens =
      typeof configuredMaxTokens === 'number' &&
      Number.isFinite(configuredMaxTokens) &&
      configuredMaxTokens > 0
        ? Math.floor(configuredMaxTokens)
        : undefined;

    if (provider === 'gemini') {
      const model = config.model || 'gemini-2.0-flash';
      const response = await fetch(`${resolvedBaseUrl}/models/${model}:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 多轮对话：assistant 在 Gemini 协议里是 model 角色
          contents: messages
            .filter((message) => message.role !== 'system')
            .map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
          systemInstruction: {
            parts: [{
              text: messages
                .filter((message) => message.role === 'system')
                .map((message) => message.content)
                .join('\n\n'),
            }],
          },
          generationConfig: {
            temperature: options.temperature ?? config.generationConfig?.temperature ?? 0.7,
            topP: options.topP ?? config.generationConfig?.topP ?? 0.9,
            ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          },
        }),
        ...(signal ? { signal } : {}),
      });

      if (!response.ok) {
        throw await buildHttpError(response, 'Gemini API 请求失败');
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text || '')
        .join('') || '';

      return {
        choices: [
          {
            message: {
              content: text,
            },
          },
        ],
      };
    }

    if (provider === 'anthropic') {
      const systemPrompt = messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n');
      // 多轮对话：非 system 消息按原顺序保留角色，Anthropic 要求 user/assistant 交替
      const conversation = messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role,
          content: [{ type: 'text', text: message.content }],
        }));
      const model = config.model || 'claude-3-5-sonnet-20241022';

      const response = await fetch(`${resolvedBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: conversation,
          temperature: options.temperature ?? config.generationConfig?.temperature ?? 0.7,
          top_p: options.topP ?? config.generationConfig?.topP ?? 0.9,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        }),
        ...(signal ? { signal } : {}),
      });

      if (!response.ok) {
        throw await buildHttpError(response, 'Anthropic API 请求失败');
      }

      const data = await response.json();
      const text = data.content
        ?.filter((part: { type?: string }) => part.type === 'text')
        .map((part: { text?: string }) => part.text || '')
        .join('') || '';

      return {
        choices: [
          {
            message: {
              content: text,
            },
          },
        ],
      };
    }

    const endpoint = `${resolvedBaseUrl}/chat/completions`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model || undefined,
        messages,
        stream: true,
        temperature: options.temperature ?? config.generationConfig?.temperature ?? 0.7,
        top_p: options.topP ?? config.generationConfig?.topP ?? 0.9,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      throw await buildHttpError(response, 'API 请求失败');
    }

    return {
      choices: [{ message: { content: await readOpenAiCompatibleStream(response) } }],
    };
  }


  private parseWordCount(wordCountRange: string): number {
    return buildWordCountBreakdown(wordCountRange).targetWordCount;
  }

  /**
   * 解析本次请求的生效温度：显式 options > 厂商 generationConfig > 硬编码默认 0.7。
   * 供重试降温等场景作为“降温基准”，避免硬编码 0.7 基准遮蔽低温度厂商配置。
   */
  private resolveTemperature(options?: GenerateOptions): number {
    if (options?.temperature !== undefined) {
      return options.temperature;
    }
    return this.getAIConfig().generationConfig?.temperature ?? 0.7;
  }

  private getAIConfig(): {
    provider: ProviderType;
    apiKey: string;
    baseUrl: string;
    model?: string;
    /** 厂商级生成参数（设置页「生成参数」），请求未显式指定时作为默认值 */
    generationConfig?: AIGenerationConfig;
  } {
    const settingsStore = useSettingsStore();
    const providers = settingsStore.aiProviders;
    const defaultModelSelection = settingsStore.defaultModel;

    let providerConfig = null;

    if (defaultModelSelection) {
      providerConfig = providers.find((item) =>
        matchesDefaultModelSelection(item, defaultModelSelection),
      ) ?? null;
    }

    if (!providerConfig) {
      providerConfig = providers.find((item) => item.enabled && item.apiKey) ?? null;
    }

    if (!providerConfig) {
      throw new Error('未找到当前激活的 AI 提供商配置');
    }

    return {
      provider: providerConfig.provider as ProviderType,
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl || getBaseUrl(providerConfig.provider as ProviderType),
      model: providerConfig.modelName,
      generationConfig: providerConfig.generationConfig,
    };
  }

  /**
   * 把网关实际接受的输出上限记回厂商配置（含顶层 maxTokens 与 generationConfig.maxTokens），
   * 让后续请求直接用正确值，不再每次靠 400 降级重试。写失败只告警不影响主流程。
   */
  private rememberProviderMaxTokensCap(
    config: { apiKey: string; generationConfig?: AIGenerationConfig },
    cappedMaxTokens: number,
  ): void {
    try {
      const settingsStore = useSettingsStore();
      const target = settingsStore.aiProviders.find(item => item.apiKey === config.apiKey);
      if (!target) return;
      target.maxTokens = cappedMaxTokens;
      target.generationConfig = {
        ...target.generationConfig,
        maxTokens: cappedMaxTokens,
      };
    } catch (error) {
      console.warn(
        `[UnifiedOutlineGenerator] 记录网关输出上限失败（不影响本次请求）：`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * 把「只允许 temperature=N」的网关约束记回厂商配置（kimi-k3 等推理型模型只放行 1），
   * 后续请求不再每次先吃一个 400。写失败只告警不影响主流程。
   */
  private rememberProviderTemperatureLock(
    config: { apiKey: string; generationConfig?: AIGenerationConfig },
    temperature: number,
  ): void {
    try {
      const settingsStore = useSettingsStore();
      const target = settingsStore.aiProviders.find(item => item.apiKey === config.apiKey);
      if (!target) return;
      target.generationConfig = {
        ...target.generationConfig,
        temperature,
      };
    } catch (error) {
      console.warn(
        `[UnifiedOutlineGenerator] 记录网关温度约束失败（不影响本次请求）：`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
