/**
 * Unified Outline Generator
 * Main entry point with multi-layered fallback strategy
 */

import { outlinePostProcessor } from '../processor/outline-post-processor';
import type { Outline } from '../schemas/outline.schema';
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
import { buildWebnovelCraftPrompt } from '../prompts/system/core-principles';
import type { DirectionGenerationResult, OutlineDirection } from '../types/direction';
import type { ExpandedOutlineResult } from '../types/executable-outline';
import { buildDirectionPrompt } from '../prompts/system/direction-prompt';
import { generateExpandedOutlineInSteps } from './outline-stepper';
import { parseDirections } from '../parser/direction-parser';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import { inspectOutlineQuality, reviewAndFixOutline } from './outline-reviewer';
import {
  hasStructuralOutlineBlockers,
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
} from '../validation/outlineCompleteness';
import {
  completeIncompleteOutline,
  findUnregisteredCharacterNames,
  repairChapterBlueprints,
  repairUnregisteredCharacters,
} from './outline-completer';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';
import { readPositiveIntEnv } from '@/utils/env';

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
    const { done, value } = await reader.read();
    if (done) break;
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
 * 判断异常是否由 AbortController 触发。
 * fetch 被 abort 时抛出的 DOMException name 为 'AbortError'；
 * 上层在竞态场景下主动 abort 旧请求，这类异常不应被当作"生成失败"提示。
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && error.name === 'AbortError') return true;
  return false;
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
 * 生成结果
 */
export interface GenerationResult {
  success: boolean;
  outlines: Outline[];
  warnings: string[];
  errors: string[];
  strategy: 'markdown-remark' | 'markdown-regex' | 'json-mode' | 'legacy';
  rawMarkdown?: string;
}

/**
 * 统一大纲生成器
 * 实现多层级降级策略：
 * 1. Markdown 生成 -> Remark AST 解析
 * 2. Markdown 生成 -> 正则提取
 * 3. JSON Mode 生成 -> JSON 解析（兜底）
 * 4. 传统模式
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

  /**
   * 生成大纲
   *
   * 一次 API 调用得到的 markdown 会依次尝试：remark 解析 → 正则兜底 → JSON 兜底，
   * 三种策略共享同一次模型输出，避免每轮重试都重新打 API（旧实现每轮会发起
   * 最多 3 次 fetch，且首次成功后的 rawMarkdown 被直接丢弃）。
   * 仅当三种策略都失败、且还有重试机会时才重新请求模型；重试时降温而不是
   * 升温（升温会让模型更偏离模板，反而降低解析成功率）。
   */
  async generate(
    prompt: string,
    options?: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<GenerationResult> {
    const opts = { ...this.defaultOptions, ...options };
    const maxAttempts = Math.max(1, opts.maxRetries || 2);
    let lastResult: GenerationResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        onProgress?.(attempt === 1 ? '正在生成大纲...' : `重试生成... (${attempt}/${maxAttempts})`);

        // 单次模型调用，markdown 先后喂给 remark / 正则 / JSON 三条解析链
        const markdown = await this.callMarkdownRaw(prompt, opts);
        const result = this.parseMarkdownWithFallbacks(markdown, opts, onProgress);
        lastResult = result;

        if (result.success) {
          return result;
        }

        if (attempt < maxAttempts) {
          // 解析失败通常是因为模型偏离格式：降温 + 收敛，而不是升温。
          // 降温基准必须是“本次实际生效温度”（显式 options > 厂商 generationConfig > 0.7），
          // 否则厂商配置为低温度（如 0.2）时，重试会从 0.7 基准“升温”到 0.6 并覆盖厂商配置。
          // resolveTemperature 已按「显式 options > 厂商 generationConfig > 0.7」解析生效值
          opts.temperature = Math.max(0.2, this.resolveTemperature(opts) - 0.1);
        }
      } catch (error) {
        // 主动取消（竞态 / 重置）直接向上抛，由调用方按 currentId 判定丢弃，
        // 不再走 legacy 兜底，避免取消后还多打一次 API。
        if (isAbortError(error)) {
          throw error;
        }
        const errorMsg = error instanceof Error ? error.message : String(error);
        // 瞬态错误（429 / 网络抖动 / 5xx）按指数退避重试，不降温（同 runWithRetry 口径）
        if (attempt < maxAttempts && isTransientError(error)) {
          const delayMs = transientRetryDelayMs(error, attempt);
          onProgress?.(`请求被限流或网络抖动，${delayMs}ms 后重试 (${attempt}/${maxAttempts}): ${errorMsg}`);
          await sleep(delayMs, opts.signal);
          continue;
        }
        onProgress?.(`生成出错: ${errorMsg}`);
        lastResult = {
          success: false,
          outlines: [],
          warnings: [],
          errors: [`生成失败: ${errorMsg}`],
          strategy: 'markdown-remark',
        };
        // 非瞬态错误（长度上限截断等）重试同参数必然复现，跳过剩余尝试直接走 legacy 兜底
        break;
      }
    }

    // 最后再尝试一次 legacy 兜底
    const legacy = await this.tryLegacyMode(prompt, opts);
    if (legacy.success) {
      return legacy;
    }

    return (
      lastResult ?? {
        success: false,
        outlines: [],
        warnings: [],
        errors: ['生成失败'],
        strategy: 'legacy',
      }
    );
  }

  /**
   * 单次调用模型，仅返回原始 markdown 文本。
   */
  private async callMarkdownRaw(
    prompt: string,
    options: GenerateOptions,
  ): Promise<string> {
    const systemPrompt = this.buildMarkdownSystemPrompt(
      options.wordCountRange || DEFAULT_WORD_COUNT_RANGE,
      options.count ?? 3,
    );
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `用户的创意种子：${prompt}` },
    ];

    const data = await this.requestChatCompletion(messages, options);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('API 未返回内容');
    }
    return content;
  }

  /**
   * 把同一份 markdown 依次喂给 remark / 正则 / JSON 三条解析链，
   * 任一成功即返回。这是在“单次模型调用”前提下尽量榨干结果的兜底链。
   */
  private parseMarkdownWithFallbacks(
    markdown: string,
    options: GenerateOptions,
    onProgress?: (message: string) => void,
  ): GenerationResult {
    // 1. remark AST 解析
    const remarkResult = outlinePostProcessor.process(markdown);
    if (remarkResult.success) {
      return {
        success: true,
        outlines: remarkResult.outlines,
        warnings: remarkResult.warnings,
        errors: remarkResult.errors,
        strategy: remarkResult.strategy as GenerationResult['strategy'],
        rawMarkdown: markdown,
      };
    }

    // 2. 从同一份文本中尝试正则提取（process 内部已经做过一次，这里走 JSON 兜底）
    onProgress?.('Markdown 解析失败，尝试 JSON 兜底...');
    const jsonResult = outlinePostProcessor.processJSON(markdown);
    if (jsonResult.success) {
      return {
        success: true,
        outlines: jsonResult.outlines,
        warnings: [...remarkResult.warnings, ...jsonResult.warnings],
        errors: jsonResult.errors,
        strategy: 'json-mode',
        rawMarkdown: markdown,
      };
    }

    return {
      success: false,
      outlines: [],
      warnings: remarkResult.warnings,
      errors: remarkResult.errors,
      strategy: 'markdown-regex',
      rawMarkdown: markdown,
    };
  }

  async generateDirections(
    prompt: string,
    options?: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<DirectionGenerationResult> {
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

        return {
          directions,
          rawText,
          strategy: directions.length > 0 ? 'structured-text' : 'fallback',
          warnings:
            directions.length > 0 ? [] : ['未能完整解析 3 个方向，建议调整提示词后重试'],
        };
      },
      (result) => result.directions.length > 0,
      options?.maxRetries ?? 2,
      onProgress,
      // 冷却基准 = 本次生效温度，避免厂商低温度配置被 0.7 基准“升温”
      options?.temperature ?? this.getAIConfig().generationConfig?.temperature ?? 0.7,
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
              if (isAbortError(error)) throw error;
              const message = error instanceof Error ? error.message : String(error);
              warnings.push(`分段补全失败：${message.slice(0, 160)}`);
            }
          }
          severelyTruncated = hasStructuralOutlineBlockers(completeness);
          blockers = completeness.blockers.map(blocker => blocker.message);
        }

        // 方案 A：初稿内容质检不通过时，发起一次"审查+修正"二次请求（低温稳定重出）。
        // 修正稿解析失败 / 质量未提升 / 请求异常时回退初稿；
        // 回退后仍会过最终硬门禁，不合格则禁止应用。
        let appliedFixRawText: string | undefined;
        if (outline && !severelyTruncated) {
          onProgress?.('正在审查并修正大纲内容...');
          const fix = await reviewAndFixOutline({
            initialRawText: rawText,
            direction,
            options: opts,
            callStructuredTextMode: (system, user, callOpts) =>
              this.callStructuredTextMode(system, user, callOpts, 'outline-review'),
          });
          if (fix.applied) {
            const fixedOutline = parseExpandedOutline(fix.rawText);
            if (fixedOutline) {
              outline = fixedOutline;
              appliedFixRawText = fix.rawText;
              const fixedCompleteness = inspectOutlineCompleteness(fixedOutline);
              severelyTruncated = !fixedCompleteness.canApply;
              blockers = fixedCompleteness.blockers.map(blocker => blocker.message);
            }
          }
          if (fix.warnings.length > 0) {
            warnings.push(...fix.warnings);
          }

          // 章级缺陷不进审查请求，改为按批重写对应章节，避免二次请求重发全部逐章内容。
          if (outline && fix.chapterIssueNumbers.length > 0) {
            try {
              const repaired = await repairChapterBlueprints({
                rawText: appliedFixRawText ?? rawText,
                outline,
                direction,
                options: opts,
                callStructuredTextMode: (system, user, callOptions) =>
                  this.callStructuredTextMode(system, user, callOptions, 'outline-expand'),
                chapterNumbers: fix.chapterIssueNumbers,
                phase: '定点修复',
                onProgress,
              });
              const repairedOutline = repaired.outline;
              const before = inspectOutlineQuality(outline).length;
              const after = inspectOutlineQuality(repairedOutline).length;
              if (after <= before) {
                outline = repairedOutline;
                appliedFixRawText = repaired.rawText;
              } else {
                warnings.push(`单章蓝图定点修复后质量未提升（${before}→${after} 处问题），保留原稿`);
              }
              warnings.push(...repaired.warnings);
            } catch (error) {
              if (isAbortError(error)) throw error;
              const message = error instanceof Error ? error.message : String(error);
              warnings.push(`单章蓝图定点修复失败：${message.slice(0, 160)}`);
            }
          }

          // 修正请求失败或回退初稿时也必须重新执行最终硬门禁，格式不合格不得应用。
          let finalCompleteness = inspectOutlineCompleteness(outline);

          // 门禁的章级阻断项（钩子/标题超长、CPN 数量、占位标题等）此前没有定点修复通道，
          // 只能整份大纲重新生成——而模型钩子超几个字是常态，重来一次仍会踩同类问题，
          // 一轮就是 20 分钟且基本不收敛。这里先按章重写，重写不掉才升级为整体重试。
          const gateChapterNumbers = [
            ...new Set(
              finalCompleteness.blockers
                .map(blocker => blocker.chapterNumber)
                .filter((no): no is number => no !== undefined),
            ),
          ].sort((a, b) => a - b);
          if (!finalCompleteness.canApply && gateChapterNumbers.length > 0) {
            const issuesByChapter = new Map<number, string[]>();
            for (const blocker of finalCompleteness.blockers) {
              if (blocker.chapterNumber === undefined) continue;
              const list = issuesByChapter.get(blocker.chapterNumber) ?? [];
              list.push(blocker.message);
              issuesByChapter.set(blocker.chapterNumber, list);
            }
            try {
              const repaired = await repairChapterBlueprints({
                rawText: appliedFixRawText ?? rawText,
                outline,
                direction,
                options: opts,
                callStructuredTextMode: (system, user, callOptions) =>
                  this.callStructuredTextMode(system, user, callOptions, 'outline-expand'),
                chapterNumbers: gateChapterNumbers,
                phase: '定点修复',
                onProgress,
                issuesByChapter,
              });
              const repairedCompleteness = inspectOutlineCompleteness(repaired.outline);
              if (repairedCompleteness.blockers.length < finalCompleteness.blockers.length) {
                outline = repaired.outline;
                appliedFixRawText = repaired.rawText;
                finalCompleteness = repairedCompleteness;
              } else {
                warnings.push(
                  `门禁章级缺陷定点修复后未减少（${finalCompleteness.blockers.length}→${repairedCompleteness.blockers.length} 项），保留原稿`,
                );
              }
              warnings.push(...repaired.warnings);
            } catch (error) {
              if (isAbortError(error)) throw error;
              const message = error instanceof Error ? error.message : String(error);
              warnings.push(`门禁章级缺陷定点修复失败：${message.slice(0, 160)}`);
            }
          }

          // 门禁的全局阻断项：卷纲/支线/伏笔引用了未登记角色（unknown-character-reference）。
          // 分步生成中卷纲先于角色步产出，卷纲自创的姓名没被角色步骤全部登记是实测常态
          // （2026-08-15 冒烟：26 个未登记角色把整份大纲拦在 fail-closed，只能整体重试）。
          // 这里把姓名提取出来定向补登记，补不齐才交给外层整体重试。
          if (!finalCompleteness.canApply) {
            const unregisteredNames = findUnregisteredCharacterNames(finalCompleteness.blockers);
            if (unregisteredNames.length > 0) {
              try {
                const repaired = await repairUnregisteredCharacters({
                  rawText: appliedFixRawText ?? rawText,
                  outline,
                  direction,
                  options: opts,
                  callStructuredTextMode: (system, user, callOptions) =>
                    this.callStructuredTextMode(system, user, callOptions, 'outline-expand'),
                  names: unregisteredNames,
                  onProgress,
                });
                const repairedCompleteness = inspectOutlineCompleteness(repaired.outline);
                if (repairedCompleteness.blockers.length < finalCompleteness.blockers.length) {
                  outline = repaired.outline;
                  appliedFixRawText = repaired.rawText;
                  finalCompleteness = repairedCompleteness;
                } else {
                  warnings.push(
                    `未登记角色补登记后阻断项未减少（${finalCompleteness.blockers.length}→${repairedCompleteness.blockers.length} 项），保留原稿`,
                  );
                }
                warnings.push(...repaired.warnings);
              } catch (error) {
                if (isAbortError(error)) throw error;
                const message = error instanceof Error ? error.message : String(error);
                warnings.push(`未登记角色补登记失败：${message.slice(0, 160)}`);
              }
            }
          }

          severelyTruncated = !finalCompleteness.canApply;
          blockers = finalCompleteness.blockers.map(blocker => blocker.message);
        }
        for (const blocker of blockers) {
          if (!warnings.includes(blocker)) warnings.push(blocker);
        }

        return {
          outline,
          // applied 时同步采用修正稿文本，避免 outline 与 rawText 错配
          rawText: appliedFixRawText ?? rawText,
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
        if (isAbortError(error)) {
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

  private async tryLegacyMode(prompt: string, options: GenerateOptions): Promise<GenerationResult> {
    try {
      const config = this.getAIConfig();
      const { UnifiedAIService } = await import('@/services/ai/unified.service');

      const service = new UnifiedAIService(
        config.provider,
        config.apiKey,
        config.baseUrl,
        config.model,
        undefined,
        // 透传厂商 generationConfig：legacy 兜底同样遵循「显式 options > 厂商配置 > 默认」
        config.generationConfig,
      );

      const result = await service.generateOutline(
        prompt,
        {
          temperature: options.temperature,
          topP: options.topP,
        },
        options.wordCountRange,
      );

      if (result && result.outlines) {
        return {
          success: true,
          outlines: result.outlines as Outline[],
          warnings: ['使用传统模式生成'],
          errors: [],
          strategy: 'legacy',
        };
      }

      return {
        success: false,
        outlines: [],
        warnings: [],
        errors: ['传统模式也未能生成有效大纲'],
        strategy: 'legacy',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        outlines: [],
        warnings: [],
        errors: [`传统模式失败: ${errorMsg}`],
        strategy: 'legacy',
      };
    }
  }

  private async callStructuredTextMode(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateOptions,
    purpose: OutlineTracePurpose = 'outline-markdown',
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

  private async requestChatCompletion(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    options: GenerateOptions,
    purpose: OutlineTracePurpose = 'outline-markdown',
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
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

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
      const normalizedError = timeoutController.signal.aborted && !signal?.aborted
        ? new Error(`[大纲请求超时] 单次 AI 请求超过 ${requestTimeoutMs}ms`)
        : error;
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
    messages: Array<{ role: 'system' | 'user'; content: string }>,
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
          contents: messages
            .filter((message) => message.role === 'user')
            .map((message) => ({
              role: 'user',
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
      const userContent = messages
        .filter((message) => message.role === 'user')
        .map((message) => ({ type: 'text', text: message.content }));
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
          messages: [{ role: 'user', content: userContent }],
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

  private buildMarkdownSystemPrompt(wordCountRange: string, count: number = 3): string {
    const breakdown = buildWordCountBreakdown(wordCountRange);
    const { targetWordCount, estimatedChapterCount, suggestedVolumeCount } = breakdown;
    const wordsPerVolume = Math.round(targetWordCount / suggestedVolumeCount / 10000);
    // 启动包章数与可应用门槛共用同一常量：写死 30 会让模型收到两把规划尺子
    // （提示词说前 30 章，完整性门槛按 50 章卡），拆章阶段被迫补跑。
    const startupChapterCount = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;
    const startupBlockCount = Math.ceil(startupChapterCount / 5);
    const startupBlockRanges = Array.from(
      { length: startupBlockCount },
      (_, index) => `${index * 5 + 1}-${Math.min((index + 1) * 5, startupChapterCount)}`,
    ).join(' / ');

    return `你是一位专业的小说创作顾问。根据用户的创意种子，生成结构清晰的故事大纲。

${buildWebnovelCraftPrompt()}

【字数要求】
预估字数：${wordCountRange}
建议卷数：${suggestedVolumeCount}卷
建议章节数：${estimatedChapterCount}章
每卷字数：约${wordsPerVolume}万字

请生成${count}个不同风格的大纲，每个大纲必须包含以下所有内容：

# 大纲1

## 基本信息

- **标题**：故事标题
- **题材标签**：题材1、题材2
- **预估字数**：500000
- **一句话简介**：200-400字的故事简介

## 情绪目标

- **核心情绪**：热血/甜蜜/紧张等
- **次要情绪**：次要情绪
- **情绪弧线**：上升/下降/波动/混合
- **情绪密度**：3000
- **情绪高点**：5, 20, 50
- **情绪低点**：10, 30

## 世界设定

- **世界类型**：世界类型

### 主要地点

| 地点名称 | 描述 | 等级 |
|----------|------|------|
| 地点1 | 描述 | 新手村/主城/禁地 |

### 主要势力

| 势力名称 | 描述 | 盟友 | 敌人 |
|----------|------|------|------|
| 势力1 | 描述 | 盟友 | 敌人 |

### 核心规则

| 规则名称 | 描述 | 类别 |
|----------|------|------|
| 规则1 | 描述 | 修炼/魔法/社会 |

## 四幕结构
- **第一幕**：
- **第二幕上**：
- **第二幕下**：
- **第三幕**：

## 角色

### 主角
- **姓名**：
- **定位**：
- **描述**：

### 配角
- **姓名**：
- **定位**：
- **描述**：

## 子情节
- **标题**：
- **描述**：
- **作用**：

## 章节规划
- **规划原则**：不要列出全书 ${estimatedChapterCount} 章；只输出前${startupChapterCount}章启动包和后续卷级概览，避免长篇大纲被章节目录挤占。
- **前${startupChapterCount}章启动包**：按 ${startupBlockRanges} 共 ${startupBlockCount} 个区间输出，每区间写目标、关键事件、爽点、钩子。
- **开篇钩子**：必须是 30 字以内的单场景动作钩子（如「一睁眼正在验尸」「金手指砸脸」），只写开局第一幕的瞬间画面，禁止写整卷剧情概括、目标陈述或倒计时预告。
- **关键事件粒度**：每个区间的「关键事件」必须是单章可兑现的独立事件——同一场景链（如「醒来→验尸→当众指认→被诬入狱」）必须合并为一条，禁止拆成多条；每条一句话写完（8～30 字，最多 40 字），禁止换行、禁止括号注解。
- **后续章节概览**：按卷输出，每卷写章节范围、卷目标、核心冲突、高潮、卷尾钩子。
- **规模校验**：总章节规模约 ${estimatedChapterCount} 章，前${startupChapterCount}章只完成开局承诺和第一轮冲突闭环。

## 伏笔
- **伏笔**：
- **类型**：
- **回收章节**：

## 反 AI 腔要求（大纲层就要避免）
- 卖点/冲突要具体到事件、角色、代价，禁止空泛口号（"命运的齿轮""成长的代价""热血征途"）
- 角色动机要可执行（"想夺回家族商路控制权"），不要写成价值观（"追求正义"）
- 章节标题口语化，禁止文绉绉的四字词堆叠（"龙啸九天""风云际会"）
- 爽点/伏笔必须配触发场景与代价，不能只列类型名词`;
  }

  private buildJSONSystemPrompt(wordCountRange: string): string {
    return `你是一位专业的小说创作顾问。请根据用户创意种子，输出 JSON 格式的大纲数据。预估字数范围：${wordCountRange}。JSON 顶层必须包含 outlines 数组。`;
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
