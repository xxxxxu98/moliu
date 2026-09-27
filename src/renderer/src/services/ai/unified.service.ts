/**
 * Unified AI Service using multi-ai-sdk
 * Provides a unified interface for multiple AI providers
 */

import { AIClient, type Message, type ProviderName } from "multi-ai-sdk";
import {
  PromptBuilder,
  type ProjectContext,
  type AIWriteResult,
  type AISuggestion,
} from "./base.service";
import {
  getSDKProvider,
  type ProviderType,
  defaultProviders,
} from "@/config/ai-providers";
import {
  robustJsonParse,
  parseJsonWithRetry,
  type ParseResult,
} from "@/utils/json-parser";
import { extractErrorMessage } from "@/utils/error-message";
import { classifyError, isTransientError, parseAllowedTemperature, retryBackoffDelayMs } from "@/utils/ai-error-classify";
import { shouldDisableZhipuThinking } from "@/utils/zhipuThinking";
import {
  STREAM_IDLE_TIMEOUT_MESSAGE_PREFIX,
  STREAM_IDLE_TIMEOUT_MS,
  createStreamIdleGuard,
} from "@/utils/streamIdleWatchdog";

/**
 * 从原始响应中提取纯文本内容
 * 某些 SDK 可能返回原始 SSE 行而不是纯文本，需要统一处理
 */
function extractPureText(rawContent: string): string {
  // 检测是否包含 SSE JSON 格式
  if (
    rawContent.includes('"object":"chat.completion.chunk"') ||
    (rawContent.includes('"choices"') && rawContent.includes('"delta"'))
  ) {
    const texts: string[] = [];
    const lines = rawContent.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data: ")) {
        const jsonStr = trimmed.slice(6);
        if (jsonStr && jsonStr !== "[DONE]") {
          try {
            const obj = JSON.parse(jsonStr);
            if (obj.choices?.[0]?.delta?.content) {
              texts.push(obj.choices[0].delta.content);
            }
          } catch {
            texts.push(jsonStr);
          }
        }
      } else if (trimmed && trimmed !== "[DONE]") {
        try {
          const obj = JSON.parse(trimmed);
          if (obj.choices?.[0]?.delta?.content) {
            texts.push(obj.choices[0].delta.content);
          }
        } catch {
          texts.push(trimmed);
        }
      }
    }
    return texts.join("");
  }
  return rawContent;
}

export const DEFAULT_WORD_COUNT_RANGE = "300万-500万字";

export const WORD_COUNT_OPTIONS = [
  { label: "短篇 (1-3万字)", value: "1万-3万字", min: 10000, max: 30000 },
  { label: "中短篇 (3-10万字)", value: "3万-10万字", min: 30000, max: 100000 },
  { label: "中篇 (10-30万字)", value: "10万-30万字", min: 100000, max: 300000 },
  { label: "长篇 (30-80万字)", value: "30万-80万字", min: 300000, max: 800000 },
  {
    label: "长篇巨著 (80-150万字)",
    value: "80万-150万字",
    min: 800000,
    max: 1500000,
  },
  {
    label: "超长篇 (150-300万字)",
    value: "150万-300万字",
    min: 1500000,
    max: 3000000,
  },
  {
    label: "史诗级 (300-500万字)",
    value: "300万-500万字",
    min: 3000000,
    max: 5000000,
  },
  {
    label: "超史诗 (500-800万字)",
    value: "500万-800万字",
    min: 5000000,
    max: 8000000,
  },
  {
    label: "传说级 (800万字以上)",
    value: "800万字以上",
    min: 8000000,
    max: 15000000,
  },
];

export interface AIGenerationConfig {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  /**
   * 输出上限（tokens）。仅当用户为该厂商显式配置时才下发到请求，
   * 未配置一律不下发（沿用厂商默认；显式传超模型支持上限会被部分网关直接 400）。
   * 推理型模型的 reasoning 也计入输出预算，低默认上限的网关需要调高此项。
   */
  maxTokens?: number;
}

/**
 * 解析「max_tokens 超网关上限」的 400 错误（SDK AIError 或包装 Error）。
 * 返回网关报的上限值；确认超限但拿不到数值返回 0（调用方减半降级）；非此类错误返回 null。
 * 与 outline 侧 unified-generator.parseMaxTokensCapError 同规则（SDK 消息文案略异，合并兼容）：
 * 含 MiniMax OpenAI 兼容层 `does not support max tokens > 524288`（空格拼写 + `>` 分隔）。
 */
export function parseMaxTokensCap(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  if (!/max[_\s]?tokens|maximum context|too large|above maximum value/iu.test(message)) return null;
  // `<=` 可能是 JSON 字面转义 \u003c 或 HTML 实体 &lt;（错误 message 来自响应原文）；
  // MiniMax 空格形态用 `>` 分隔（`max tokens > 524288`）
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

/**
 * Unified AI Service
 * Uses multi-ai-sdk to provide consistent API across all providers
 */
export class UnifiedAIService {
  private client: AIClient | null = null;
  private provider: ProviderType;
  private model: string;
  private generationConfig: {
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
    maxTokens?: number;
  };
  private _baseUrl: string;
  private _apiKey: string;

  constructor(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    model?: string,
    _maxTokens?: number,
    generationConfig?: {
      temperature: number;
      topP: number;
      frequencyPenalty: number;
      presencePenalty: number;
      maxTokens?: number;
    },
  ) {
    this.provider = provider;
    this.model = model || "";
    this.generationConfig = generationConfig || {
      temperature: 0.5,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };
    this._baseUrl = "";
    this._apiKey = apiKey;
    this.initClient(apiKey, baseUrl);
  }

  private initClient(apiKey: string, baseUrl?: string) {
    // 使用统一的 SDK provider 映射
    const sdkProvider = getSDKProvider(this.provider);

    // 解析 baseUrl：如果用户没有提供自定义 URL，使用 provider 的默认 URL
    let resolvedBaseUrl = baseUrl;
    if (!resolvedBaseUrl?.trim()) {
      const providerConfig = defaultProviders.find(
        (p) => p.provider === this.provider,
      );
      resolvedBaseUrl = providerConfig?.baseUrl || "";
    }
    this._baseUrl = resolvedBaseUrl;

    // Create client with explicit provider — 禁止向 SDK/请求写入 maxTokens
    const config: {
      provider: ProviderName;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      contextWindowSafe?: boolean;
    } = {
      provider: sdkProvider,
      contextWindowSafe: true,
    };

    // Set API key (not needed for ollama)
    if (sdkProvider !== "ollama" && apiKey) {
      config.apiKey = apiKey;
    }

    // Set model if provided
    if (this.model) {
      config.model = this.model;
    }

    this.client = new AIClient(config);

    // 重要：SDK 的 baseUrl 参数对大多数 provider 不生效，需要直接设置 adapter 的 baseUrl
    if (this.client && resolvedBaseUrl) {
      (this.client as any).adapter.baseUrl = resolvedBaseUrl.replace(/\/$/, "");
    }

    // 智谱 glm 深度思考默认全开，写作链路必须显式关闭（实测整章 25-35 分钟，
    // 长篇冒烟物理上跑不完；关思考后 13.8s 出全文质量正常）。SDK buildBody
    // 白名单不透传 thinking，只能包装 adapter 注入。逃生口 MOLIU_ZHIPU_KEEP_THINKING=1。
    if (this.client && shouldDisableZhipuThinking(resolvedBaseUrl)) {
      const adapter = (this.client as any).adapter;
      const origBuildBody = adapter.buildBody.bind(adapter);
      adapter.buildBody = (messages: unknown, options: unknown, stream: boolean) => ({
        ...origBuildBody(messages, options, stream),
        thinking: { type: "disabled" },
      });
    }

    // Claude 系模型（claude-*/含 thinking 档）经网关转 Anthropic 上游时拒绝
    // OpenAI 风格采样参数（temperature/top_p 报 400 invalid_request_error——
    // 2026-09-24 双实证：opus-thinking 与 sonnet-4-6 大循环首调即败；opus 剥参
    // 后开题 10 步全通）：请求体剥除采样参数，用上游默认值。
    if (this.client && this.model && /claude|thinking/i.test(this.model)) {
      const adapter = (this.client as any).adapter;
      const origBuildBody = adapter.buildBody.bind(adapter);
      adapter.buildBody = (messages: unknown, options: unknown, stream: boolean) => {
        const body = origBuildBody(messages, options, stream) as Record<string, unknown>;
        delete body.temperature;
        delete body.top_p;
        delete body.topP;
        return body;
      };
    }
  }

  /**
   * Update service configuration
   */
  updateConfig(
    apiKey: string,
    baseUrl?: string,
    model?: string,
    _maxTokens?: number,
    generationConfig?: {
      temperature: number;
      topP: number;
      frequencyPenalty: number;
      presencePenalty: number;
      maxTokens?: number;
    },
  ) {
    this.model = model || this.model;
    if (generationConfig) {
      this.generationConfig = generationConfig;
    }
    this._apiKey = apiKey;
    this.initClient(apiKey, baseUrl);
  }

  /**
   * Test connection with abort signal support
   */
  async testConnection(
    signal?: AbortSignal,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: false, error: "Client not initialized" };
    }

    // Check if already aborted
    if (signal?.aborted) {
      return { success: false, error: "Test cancelled" };
    }

    try {
      return await new Promise((resolve, reject) => {
        // Listen for abort event
        const abortHandler = () => {
          reject(new DOMException("Aborted", "AbortError"));
        };

        // Add abort listener if signal provided
        if (signal) {
          signal.addEventListener("abort", abortHandler, { once: true });
        }

        // Execute the chat call — 禁止传 maxTokens
        this.client!.chat([{ role: "user", content: "Hi" }], {})
          .then(() => {
            // Clean up abort listener
            if (signal) {
              signal.removeEventListener("abort", abortHandler);
            }
            resolve({ success: true });
          })
          .catch((error) => {
            // Clean up abort listener
            if (signal) {
              signal.removeEventListener("abort", abortHandler);
            }
            reject(error);
          });
      });
    } catch (error) {
      // Handle abort error specially
      if (error instanceof DOMException && error.name === "AbortError") {
        return { success: false, error: "Test cancelled" };
      }
      return {
        success: false,
        error: extractErrorMessage(error, "Connection test failed"),
      };
    }
  }

  /**
   * 简单文本补全（开题刷新、记忆提取等内部任务）
   * 传入 signal 时走 stream + cancel，以真正中断底层 HTTP（SDK chat 不支持 abort）
   */
  async complete(
    prompt: string,
    options?: {
      temperature?: number;
      system?: string;
      signal?: AbortSignal;
      /** 结构化输出场景：按 provider 能力启用 JSON 强制（OpenAI 系/Ollama 走 response_format，Gemini 走 responseMimeType；不支持的 provider 自动降级为软约束） */
      jsonMode?: boolean;
    },
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const messages = options?.system
      ? [
          { role: "system" as const, content: options.system },
          { role: "user" as const, content: prompt },
        ]
      : [{ role: "user" as const, content: prompt }];

    const chatOpts = {
      temperature: options?.temperature ?? this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
      // 仅厂商显式配置时下发 maxTokens（正数）；未配置不下发，沿用网关默认上限。
      // 推理型模型的 reasoning 计入同一输出预算，低默认上限的网关需在设置页调高此项。
      ...(typeof this.generationConfig.maxTokens === 'number' &&
      Number.isFinite(this.generationConfig.maxTokens) &&
      this.generationConfig.maxTokens > 0
        ? { maxTokens: Math.floor(this.generationConfig.maxTokens) }
        : {}),
      // multi-ai-sdk：OpenAI 兼容（含 Ollama /v1 端点）透传为 response_format，
      // Gemini 转为 responseMimeType=application/json，Anthropic 等白名单构造自动忽略（安全降级）
      ...(options?.jsonMode
        ? { responseFormat: { type: "json_object" as const } }
        : {}),
    };

    return extractPureText(await this.requestWithGuards(messages, chatOpts, signal));
  }

  /**
   * 多轮对话补全（agent 检索循环等场景）：消息数组可含 assistant 轮，
   * 复用 complete() 的全部护栏（瞬态重试 / max_tokens 降级 / 流式截断校验）。
   */
  async chatComplete(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: {
      temperature?: number;
      signal?: AbortSignal;
      /** 结构化输出场景：按 provider 能力启用 JSON 强制（与 complete 同口径） */
      jsonMode?: boolean;
    },
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const signal = options?.signal;
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const chatOpts = {
      temperature: options?.temperature ?? this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
      ...(typeof this.generationConfig.maxTokens === 'number' &&
      Number.isFinite(this.generationConfig.maxTokens) &&
      this.generationConfig.maxTokens > 0
        ? { maxTokens: Math.floor(this.generationConfig.maxTokens) }
        : {}),
      ...(options?.jsonMode
        ? { responseFormat: { type: "json_object" as const } }
        : {}),
    };

    return extractPureText(await this.requestWithGuards(messages, chatOpts, signal));
  }

  /**
   * 单次请求 + 全套护栏（原 complete() 内联的重试循环抽出，complete/chatComplete 共用）。
   *
   * 走 SSE 流式：曾用非流式 chat() 以规避"网关裸透传 token、断流只给半截 JSON"的风险，
   * 但代价更大：网关只看到一条长时间零字节的连接，实测长正文请求会被静默挂死到客户端
   * 15 分钟超时才 abort，被丢弃的 socket 随后 RST 抛 socket hang up，单次就吃掉 15 分钟。
   * 流式下 token 持续到达，连接不再静默；半截 JSON 的风险改由结束标记校验兜住——
   * 未收到 finish_reason 即判定截断并抛可重试错误，不会把半截内容当成功。
   */
  private async requestWithGuards(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    chatOpts: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<string> {
    const SINGLE_REQUEST_MAX_RETRIES = 2;
    let lastError: unknown;
    // 可变副本：max_tokens 超网关上限的 400 发生时按网关上限降级改写（最多 3 轮收敛）
    let effectiveOpts = chatOpts;
    let capRoundsLeft = 3;
    for (let attempt = 0; attempt <= SINGLE_REQUEST_MAX_RETRIES; attempt++) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      try {
        return await this.streamChatText(messages, effectiveOpts, signal);
      } catch (error) {
        // max_tokens 超网关上限（统一配 1M 时低上限网关 400 拒）：解析网关报的上限
        // （拿不到就减半）改写 effectiveOpts 后立即重试本次请求，且记住该上限
        const cap = parseMaxTokensCap(error);
        if (cap !== null && capRoundsLeft > 0) {
          capRoundsLeft -= 1;
          const original = Number(effectiveOpts.maxTokens ?? 0);
          const fallback = cap > 0 ? cap : Math.max(1024, Math.floor(original / 2));
          if (fallback >= original && original > 0) throw error;
          console.warn(
            `[unified.service] max_tokens=${original} 超网关上限（${cap > 0 ? `网关报上限 ${cap}` : "上限未知"}），降级为 ${fallback} 重试`
          );
          this.generationConfig = { ...this.generationConfig, maxTokens: fallback };
          effectiveOpts = { ...effectiveOpts, maxTokens: fallback };
          attempt -= 1; // 降级重试不占用瞬态重试额度
          continue;
        }
        // 「该模型只允许 temperature=1」参数约束（kimi-k3 实测）：改值后立即重试，
        // 不占瞬态重试额度——同参数重试只会复现 400。与 outline 侧同口径。
        const allowedTemperature = parseAllowedTemperature(error);
        if (allowedTemperature !== null) {
          const current = Number(effectiveOpts.temperature ?? 0.5);
          if (current === allowedTemperature) throw error;
          console.warn(
            `[unified.service] 网关要求 temperature=${allowedTemperature}（当前 ${current}），改值重试`
          );
          this.generationConfig = { ...this.generationConfig, temperature: allowedTemperature };
          effectiveOpts = { ...effectiveOpts, temperature: allowedTemperature };
          attempt -= 1;
          continue;
        }
        // 用户主动取消：立即抛出，不重试
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        lastError = error;
        // 仅瞬态错误（网络/5xx/429/截断）才重试；持久错误（4xx/schema）直接抛
        const transient = isTransientError(error, signal);
        if (!transient || attempt >= SINGLE_REQUEST_MAX_RETRIES) {
          throw error;
        }
        // kind 感知退避：限流/网关地区拦截走 15/30s（长窗口下 1-4s 只会连吃失败），
        // 其余瞬态 1s/2s
        const delayMs = retryBackoffDelayMs(classifyError(error).kind, attempt + 1, 1000, 30_000);
        console.warn(
          `[unified.service] chat 瞬态失败，${delayMs}ms 后重试 ${attempt + 1}/${SINGLE_REQUEST_MAX_RETRIES}: ${error instanceof Error ? error.message : String(error)}`
        );
        if (signal) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              signal.removeEventListener("abort", onAbortSleep);
              resolve();
            }, delayMs);
            const onAbortSleep = (): void => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            };
            if (signal.aborted) {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            } else {
              signal.addEventListener("abort", onAbortSleep, { once: true });
            }
          }).catch((e: unknown) => {
            // 退避期间被 abort：抛出 AbortError，不再重试
            throw e instanceof Error ? e : new DOMException("Aborted", "AbortError");
          });
        } else {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    // 理论上不可达（循环内必 return 或 throw）
    throw lastError instanceof Error ? lastError : new Error("chat 重试耗尽");
  }

  /**
   * 读取 SSE 流并拼回完整文本，signal 触发时 cancel 真正中断底层 fetch。
   *
   * 必须校验结束标记：SDK 只在收到 finish_reason 时才产出 done chunk，网关中途 RST 时
   * 迭代器会静默正常结束，半截 JSON 会被当成完整响应交给下游解析。
   */
  private async streamChatText(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    chatOpts: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }
    const stream = this.client.stream(messages, chatOpts as any);
    const onAbort = (): void => {
      stream.cancel();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    // 空闲 watchdog：网关挂死（连接 ESTABLISHED 但分钟级零 chunk）时 cancel 流并
    // 抛「流式响应空闲超时」。cancel 后 for-await 会 return 而非 throw，靠下方
    // idleExpired 标志把静默中断变成可重试的显式超时错误。
    let idleExpired = false;
    const idleGuard = createStreamIdleGuard(() => {
      idleExpired = true;
      stream.cancel();
    });
    try {
      let content = "";
      let sawStreamEnd = false;
      let hitLengthCap = false;
      for await (const chunk of stream) {
        idleGuard.touch();
        if (signal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (chunk.content) {
          content += chunk.content;
        }
        if (chunk.done || chunk.finishReason != null) {
          sawStreamEnd = true;
          if (chunk.finishReason === "length") hitLengthCap = true;
        }
      }
      if (idleExpired) {
        throw new Error(
          `${STREAM_IDLE_TIMEOUT_MESSAGE_PREFIX}：${STREAM_IDLE_TIMEOUT_MS}ms 内未收到任何数据块（已收 ${content.length} 字）`
        );
      }
      // cancel() 后迭代器是 return 而非 throw，漏判会把已中断的半截内容当成功
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (!sawStreamEnd) {
        throw new Error(
          `AI 流式响应提前中断：已收到 ${content.length} 字，未见结束标记`
        );
      }
      // 推理型模型可能把厂商默认输出预算全烧在推理上，一个正文字都不吐；
      // 不显式报出 length 会让下游只看到"JSON 解析失败"，完全掩盖真因。
      if (hitLengthCap) {
        throw new Error(
          `AI 输出被长度上限截断：仅收到 ${content.length} 字`
        );
      }
      // 网关 200 + 正常 finish_reason 但正文 0 字（2026-08-15 冒烟实测 opencode 网关
      // 语义审查请求出现）：此前把空串交给下游 JSON 解析，报「无法解析」被归类
      // review_unavailable 持久错误 → 停整批。按瞬态「API 未返回内容」抛出，
      // 走内层 1s/2s 退避重试（isTransientError 已收录该文案）。
      if (!content.trim()) {
        throw new Error("API 未返回内容");
      }
      return content;
    } finally {
      idleGuard.dispose();
      signal?.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Continue writing content
   * @param context 项目上下文
   * @param mode 续写模式
   * @param targetWordCount 目标字数（默认3000）
   * @param signal 传入时走 stream + cancel，以真正中断底层 HTTP（SDK chat 不支持 abort）
   */
  async continueWriting(
    context: ProjectContext,
    mode: "smartContinue" | "polish",
    targetWordCount: number = 3000,
    signal?: AbortSignal,
    /** 结构化输出场景：按 provider 能力启用 JSON 强制（默认关闭，正文续写不受影响） */
    jsonMode?: boolean,
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(
      context,
      mode,
      targetWordCount,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const chatOpts = {
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
      ...(jsonMode
        ? { responseFormat: { type: "json_object" as const } }
        : {}),
    };

    // multi-ai-sdk 的 chat() 不透传 AbortSignal；stream().cancel() 才会 abort fetch
    if (signal) {
      const stream = this.client.stream(messages, chatOpts as any);
      const onAbort = (): void => {
        stream.cancel();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        let content = "";
        for await (const chunk of stream) {
          if (signal.aborted) {
            throw new DOMException("Aborted", "AbortError");
          }
          if (chunk.content) {
            content += chunk.content;
          }
        }
        return { content };
      } catch (error) {
        if (signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        throw error;
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    }

    const response = await this.client.chat(messages, chatOpts as any);

    return {
      content:
        typeof response === "string" ? response : JSON.stringify(response),
    };
  }

  /**
   * Stream continue writing
   * @param context 项目上下文
   * @param mode 续写模式
   * @param targetWordCount 目标字数（默认3000）
   */
  continueWritingStream(
    context: ProjectContext,
    mode: "smartContinue" | "polish",
    targetWordCount: number = 3000,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal,
  ): void {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(
      context,
      mode,
      targetWordCount,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    // Start streaming
    this.streamChat(messages, onChunk, onComplete, onError, signal);
  }

  /**
   * Analyze chapter
   */
  async analyzeChapter(context: ProjectContext): Promise<AISuggestion[]> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } =
      PromptBuilder.buildAnalysisPrompt(context);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    try {
      const response = await this.client.chat(messages, {
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
        // 结构化输出：按 provider 能力启用 JSON 强制
        responseFormat: { type: "json_object" as const },
      } as any);

      const rawContent = extractPureText(
        typeof response === "string" ? response : JSON.stringify(response),
      );

      // Use robust JSON parser
      const result = robustJsonParse<{ suggestions: any[] }>(rawContent, {
        expectedType: "object",
        enableCompletion: true,
      });

      if (
        result.success &&
        result.data?.suggestions &&
        Array.isArray(result.data.suggestions)
      ) {
        return result.data.suggestions.map((s: any, index: number) => ({
          id: `suggestion-${index}`,
          type: this.mapSuggestionType(s.type),
          severity: this.mapSeverity(s.severity),
          title: s.title || "Suggestion",
          description: s.description || "",
          suggestion: s.suggestion,
        }));
      }

      // Fallback to regex extraction
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
            return parsed.suggestions.map((s: any, index: number) => ({
              id: `suggestion-${index}`,
              type: this.mapSuggestionType(s.type),
              severity: this.mapSeverity(s.severity),
              title: s.title || "Suggestion",
              description: s.description || "",
              suggestion: s.suggestion,
            }));
          }
        } catch {
          // Regex fallback failed
        }
      }

      return [];
    } catch (error) {
      console.error("Failed to analyze chapter:", error);
      return [];
    }
  }

  /**
   * Get memory context
   */
  async getMemoryContext(context: ProjectContext): Promise<{
    charactersInScene: any[];
    location: string;
    time: string;
    mood: string;
  }> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } =
      PromptBuilder.buildMemoryContextPrompt(context);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    try {
      const response = await this.client.chat(messages, {
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
        // 结构化输出：按 provider 能力启用 JSON 强制
        responseFormat: { type: "json_object" as const },
      } as any);

      const rawContent = extractPureText(
        typeof response === "string" ? response : JSON.stringify(response),
      );

      // Use robust JSON parser
      const result = robustJsonParse<{
        charactersInScene?: any[];
        location?: string;
        time?: string;
        mood?: string;
      }>(rawContent, {
        expectedType: "object",
        enableCompletion: true,
      });

      if (result.success && result.data) {
        return {
          charactersInScene: result.data.charactersInScene || [],
          location: result.data.location || "未明确",
          time: result.data.time || "未明确",
          mood: result.data.mood || "未明确",
        };
      }

      // Fallback to regex extraction
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            charactersInScene: parsed.charactersInScene || [],
            location: parsed.location || "未明确",
            time: parsed.time || "未明确",
            mood: parsed.mood || "未明确",
          };
        } catch {
          // Regex fallback failed
        }
      }

      return {
        charactersInScene: [],
        location: "未明确",
        time: "未明确",
        mood: "未明确",
      };
    } catch (error) {
      console.error("Failed to get memory context:", error);
      return {
        charactersInScene: [],
        location: "未明确",
        time: "未明确",
        mood: "未明确",
      };
    }
  }

  /**
   * Generate dialogue
   */
  async generateDialogue(
    context: ProjectContext,
    options?: {
      speaker?: string;
      situation?: string;
      emotion?: string;
    },
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildDialoguePrompt(
      context,
      options,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content:
        typeof response === "string" ? response : JSON.stringify(response),
    };
  }

  /**
   * Generate plot
   */
  async generatePlot(
    context: ProjectContext,
    options?: {
      plotPoint?: string;
      targetChapter?: string;
    },
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildPlotPrompt(
      context,
      options,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content:
        typeof response === "string" ? response : JSON.stringify(response),
    };
  }

  /**
   * Generate scene description
   */
  async generateScene(
    context: ProjectContext,
    options?: {
      location?: string;
      time?: string;
      mood?: string;
    },
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildScenePrompt(
      context,
      options,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content:
        typeof response === "string" ? response : JSON.stringify(response),
    };
  }

  /**
   * Generate character description
   */
  async generateCharacterDescription(
    context: ProjectContext,
    options?: {
      characterName?: string;
      descriptionType?: "appearance" | "action" | "psychology" | "dialogue";
    },
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } =
      PromptBuilder.buildCharacterDescriptionPrompt(context, options);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content:
        typeof response === "string" ? response : JSON.stringify(response),
    };
  }

  /**
   * Stream chat with callbacks
   */
  private async streamChat(
    messages: Message[],
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    try {
      const stream = this.client.stream(messages, {
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
      } as any);

      // SDK 未必透传 signal；主动 cancel 才能中断底层 HTTP
      const onAbort = (): void => {
        stream.cancel();
      };
      if (signal) {
        if (signal.aborted) {
          stream.cancel();
          onError("Generation stopped by user");
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        for await (const chunk of stream) {
          if (signal?.aborted) {
            onError("Generation stopped by user");
            return;
          }
          if (chunk.content) {
            onChunk(chunk.content);
          }
        }
        onComplete();
      } finally {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    } catch (error) {
      // 如果是 AbortError，说明是用户主动停止，不算错误
      if (
        signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        onError("Generation stopped by user");
        return;
      }
      onError(error instanceof Error ? error.message : "Stream failed");
    }
  }


  /**
   * Map suggestion type from Chinese to English
   */
  private mapSuggestionType(type: string): AISuggestion["type"] {
    const typeMap: Record<string, AISuggestion["type"]> = {
      人物一致性: "characterConsistency",
      伏笔管理: "foreshadowManagement",
      伏笔提醒: "foreshadowReminder",
      逻辑自洽: "logicConsistency",
      逻辑漏洞: "logicGap",
      节奏把控: "paceSuggestion",
      对话质量: "dialogueQuality",
      描写密度: "descriptionDensity",
      情感曲线: "emotionCurve",
      风格一致: "styleConsistency",
    };
    return typeMap[type] || "logicGap";
  }

  /**
   * Map severity from string to enum
   */
  private mapSeverity(severity: string): AISuggestion["severity"] {
    const severityMap: Record<string, AISuggestion["severity"]> = {
      error: "error",
      警告: "warning",
      warning: "warning",
      info: "info",
      提示: "info",
    };
    return severityMap[severity] || "info";
  }

  /**
   * Generate alternative chapter titles based on chapter content
   * @param chapterTitle - Current chapter title
   * @param chapterContent - Current chapter content (full content)
   * @param context - Additional context
   * @returns Array of alternative titles
   */
  async generateChapterTitle(
    chapterTitle: string,
    chapterContent: string,
    context?: {
      previousChapterTitle?: string;
      nextChapterTitle?: string;
      projectDescription?: string;
      genre?: string;
      chapterNumber?: number;
    }
  ): Promise<string> {
    if (!this.client) {
      throw new Error("AI client not initialized");
    }

    const temperature = 0.7; // Lower temperature for more focused output

    // Build context info
    let contextInfo = "";
    if (context?.projectDescription) {
      contextInfo += `\n作品简介：${context.projectDescription}`;
    }
    if (context?.previousChapterTitle) {
      contextInfo += `\n上一章：${context.previousChapterTitle}`;
    }
    if (context?.nextChapterTitle) {
      contextInfo += `\n下一章：${context.nextChapterTitle}`;
    }

    // Use full content
    const fullContent = chapterContent || "（暂无内容）";

    const messages: Message[] = [
      {
        role: "user",
        content: `# 任务
为小说章节生成3个吸引人的替代标题。

# 输出格式（严格遵守）
直接输出3个标题，用中文顿号"、"分隔，不要换行，不要加引号，不要任何解释。
格式示例：拜师学艺、第一次接单、偶遇大佬
（注意：不要在标题前加"第X章"，那是显示时自动加的）

# 核心要求【非常重要】
1. **字数限制**：每个标题2-15个字
2. **标题要通俗易懂**：像普通人说话一样，一听就懂，不要文绉绉的
3. **口语化优先**：用大白话、短句，像朋友聊天那样自然
4. **偶尔可以用成语**：1-2个可以，但不要全是诗词、成语风格
5. **参考网络小说风格**：像《斗破苍穹》《赘婿》那种接地气的标题

# 反面例子（不要这样写）
❌ 龙啸九天、风云际会、江湖再见、岁月如梭
❌ 暗箭难防、风云变色、山雨欲来、一叶知秋
（这类太文绉绉了，普通读者看着费劲）

# 正面例子（多这样写）
✅ 拜师学艺、打败小BOSS、第一次赚钱、遇到麻烦
✅ 被骗了、捡到宝贝、朋友反目、真相大白
✅ 师父的秘密、身世之谜、意外收获、大战一场

# 章节信息
当前标题：${chapterTitle}${contextInfo}
这是第${context?.chapterNumber || '?'}章的内容

# 正文（关键内容）
${fullContent}`,
      },
    ];

    try {
      const response = await this.client.chat(messages, {
        temperature,
        topP: 0.9,
        // Try to disable reasoning/thinking if supported
        thinking: false,
      } as any);

      const content = extractPureText(
        typeof response === "string" ? response : JSON.stringify(response),
      ).trim();

      // Parse titles: look for 2-6 character Chinese strings
      // Strategy: find all candidate lines that look like titles
      const lines = content.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
      
      // Extract potential titles (2-10 chars, mostly Chinese)
      const potentialTitles: string[] = [];
      const chinesePattern = /^[\u4e00-\u9fa5]+$/;
      const mixedPattern = /^[\u4e00-\u9fa5\w，。！？、：；""''「」『』·]+$/;

      for (const line of lines) {
        // Clean the line
        let cleaned = line
          .replace(/^[""''「」『』【】\[\]（）\(\)]+/, "")
          .replace(/[""''「」『』【】\[\]（）\(\)]+$/, "")
          .replace(/^[\d\.\、\-\*\•\▸\▶\→]+\s*/, "")
          .replace(/^(标题|Title|推荐|建议)[:：]\s*/i, "")
          .trim();

        // Check if this looks like a title (2-15 Chinese chars)
        const pureChinese = cleaned.replace(/[^\u4e00-\u9fa5]/g, '');
        if (pureChinese.length >= 2 && pureChinese.length <= 15) {
          // Likely a title
          if (chinesePattern.test(pureChinese) || mixedPattern.test(cleaned)) {
            potentialTitles.push(cleaned);
          }
        }
      }

      // Also try splitting by common separators
      if (potentialTitles.length === 0) {
        const separators = ['、', '，', ',', '|', '｜'];
        for (const sep of separators) {
          if (content.includes(sep)) {
            const parts = content.split(sep).map(p => p.trim()).filter(p => p.length >= 2 && p.length <= 15);
            if (parts.length > 0) {
              potentialTitles.push(...parts);
              break;
            }
          }
        }
      }

      // Remove duplicates and limit to 3
      const uniqueTitles = [...new Set(potentialTitles)].slice(0, 3);

      // If still no valid titles, try to find the shortest non-empty line
      if (uniqueTitles.length === 0 && lines.length > 0) {
        const shortestLine = lines.reduce((shortest, line) => 
          line.length < shortest.length && line.length >= 2 ? line : shortest, lines[0]);
        if (shortestLine.length >= 2 && shortestLine.length <= 15) {
          uniqueTitles.push(shortestLine);
        }
      }

      // Final fallback
      if (uniqueTitles.length === 0) {
        return chapterTitle;
      }

      // Return all unique titles joined by "、"
      if (uniqueTitles.length === 0) {
        return chapterTitle;
      }

      // Return all titles joined by "、" for display
      return uniqueTitles.join("、");
    } catch (error) {
      console.error("[UnifiedAIService] Failed to generate chapter title:", error);
      throw error;
    }
  }
}
