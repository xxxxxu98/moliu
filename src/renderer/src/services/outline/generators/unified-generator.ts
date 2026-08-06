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
  isAbortedError,
  isTransientError,
  backoffDelayMs,
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
import { buildExpandDirectionPrompt } from '../prompts/system/expand-direction-prompt';
import { parseDirections } from '../parser/direction-parser';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import { reviewAndFixOutline } from './outline-reviewer';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';

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
  /** 一次生成的大纲数量，默认 3 */
  count?: number;
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
          const delayMs = backoffDelayMs(attempt, 2000, 30_000);
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

        if (attempt >= maxAttempts) {
          break;
        }
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
    return this.runWithRetry<ExpandedOutlineResult>(
      async (attempt, temperature) => {
        const opts = {
          ...this.defaultOptions,
          ...options,
          ...(temperature !== undefined ? { temperature } : {}),
        };
        const builtPrompt = buildExpandDirectionPrompt({
          seed: prompt,
          direction,
          wordCountRange: opts.wordCountRange || DEFAULT_WORD_COUNT_RANGE,
          enhancementBrief: opts.enhancementBrief,
        });

        onProgress?.(attempt === 1 ? '正在展开主方案...' : `重新展开主方案... (${attempt})`);

        const rawText = await this.callStructuredTextMode(builtPrompt.system, builtPrompt.user, opts, 'outline-expand');
        let outline = parseExpandedOutline(rawText);

        // 角色 / 伏笔位于模板末尾，最易被截断；这里检测"看似成功实则残缺"的情况。
        // 严重残缺（角色 < 4 或伏笔 < 3）时通过 isSuccess=false 触发重试（降温收敛），
        // 避免一次截断就把残缺方案固化；重试耗尽后仍返回最后一次结果 + warning，
        // 由 UI 提示用户手动重新生成。
        const warnings: string[] = [];
        let severelyTruncated = false;
        if (outline) {
          if (outline.keyCharacters.length < 4) {
            severelyTruncated = true;
            warnings.push(`关键角色仅解析到 ${outline.keyCharacters.length} 个（建议至少 4 个），可能被输出截断，可尝试重新生成`);
          }
          if (outline.foreshadowPlan.length < 3) {
            severelyTruncated = true;
            warnings.push(`伏笔仅解析到 ${outline.foreshadowPlan.length} 条（建议至少 3 条），可能被输出截断，可尝试重新生成`);
          }
          // 单章蓝图完整性：30 章允许漏 2 章（< 28 视为残缺）。
          // 残缺时丢弃 chapterBlueprints（让下游 toChapters 回退算法派生），避免用半截蓝图建章导致章节缺失；
          // 不判 severelyTruncated，因为块级大纲仍可用、可正常建 30 章。
          const blueprints = outline.chapterBlueprints;
          if (blueprints && blueprints.length < 28) {
            warnings.push(
              `单章蓝图仅解析到 ${blueprints.length} 章（期望约 30 章），可能被输出截断；本次回退到块级算法派生单章节点。可尝试重新生成以获得逐章标题与节点。`,
            );
            outline = { ...outline, chapterBlueprints: undefined };
          }
        }

        // 方案 A：初稿内容质检不通过时，发起一次"审查+修正"二次请求（低温稳定重出）。
        // 修正稿解析失败 / 质量未提升 / 请求异常时回退初稿，绝不阻塞主流程。
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
            }
          }
          if (fix.warnings.length > 0) {
            warnings.push(...fix.warnings);
          }
        }

        return {
          outline,
          // applied 时同步采用修正稿文本，避免 outline 与 rawText 错配
          rawText: appliedFixRawText ?? rawText,
          strategy: outline ? 'structured-text' : 'fallback',
          severelyTruncated,
          warnings: outline ? warnings : ['未能完整解析主方案，建议重新生成或微调方向描述'],
        };
      },
      (result) => result.outline !== null && !result.severelyTruncated,
      options?.maxRetries ?? 2,
      onProgress,
      // 冷却基准 = 本次生效温度，避免厂商低温度配置被 0.7 基准“升温”
      options?.temperature ?? this.getAIConfig().generationConfig?.temperature ?? 0.7,
    );
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
          const delayMs = backoffDelayMs(attempt, 2000, 30_000);
          onProgress?.(`请求被限流或网络抖动，${delayMs}ms 后重试 (${attempt}/${total}): ${errorMsg}`);
          await sleep(delayMs);
          // 瞬态重试不降温：保持 coolingTemp 不变（首次为 undefined = 沿用原温度）
          continue;
        }
        onProgress?.(`生成出错: ${errorMsg}`);
        if (attempt >= total) {
          throw error;
        }
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
    const tracer = this.getTracer(options);
    const startedAt = tracer ? Date.now() : 0;
    const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    try {
      const result = await this.doRequestChatCompletion(messages, options, config, provider, resolvedBaseUrl, signal);
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
      if (tracer) {
        tracer.record({
          purpose,
          system: systemText,
          prompt: userText,
          error: error instanceof Error ? error.message : String(error),
          ms: Date.now() - startedAt,
        });
      }
      throw error;
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
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model || undefined,
        messages,
        temperature: options.temperature ?? config.generationConfig?.temperature ?? 0.7,
        top_p: options.topP ?? config.generationConfig?.topP ?? 0.9,
      }),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      throw await buildHttpError(response, 'API 请求失败');
    }

    return response.json();
  }

  private buildMarkdownSystemPrompt(wordCountRange: string, count: number = 3): string {
    const breakdown = buildWordCountBreakdown(wordCountRange);
    const { targetWordCount, estimatedChapterCount, suggestedVolumeCount } = breakdown;
    const wordsPerVolume = Math.round(targetWordCount / suggestedVolumeCount / 10000);

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
- **规划原则**：不要列出全书 ${estimatedChapterCount} 章；只输出前30章启动包和后续卷级概览，避免长篇大纲被章节目录挤占。
- **前30章启动包**：按 1-5 / 6-10 / 11-15 / 16-20 / 21-25 / 26-30 六个区间输出，每区间写目标、关键事件、爽点、钩子。
- **开篇钩子**：必须是 30 字以内的单场景动作钩子（如「一睁眼正在验尸」「金手指砸脸」），只写开局第一幕的瞬间画面，禁止写整卷剧情概括、目标陈述或倒计时预告。
- **关键事件粒度**：每个区间的「关键事件」必须是单章可兑现的独立事件——同一场景链（如「醒来→验尸→当众指认→被诬入狱」）必须合并为一条，禁止拆成多条；每条一句话写完（8～30 字，最多 40 字），禁止换行、禁止括号注解。
- **后续章节概览**：按卷输出，每卷写章节范围、卷目标、核心冲突、高潮、卷尾钩子。
- **规模校验**：总章节规模约 ${estimatedChapterCount} 章，前30章只完成开局承诺和第一轮冲突闭环。

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
}
