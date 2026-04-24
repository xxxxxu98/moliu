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

// Outline generation system prompt - optimized for reliable JSON parsing
// @param wordCountRange - 用户选择的字数范围，如 "50万-100万字"
function buildOutlineSystemPrompt(
  wordCountRange: string = "50万-100万字",
): string {
  return `你是一位专业的小说创作顾问。根据用户的创意种子，生成简洁的故事大纲。

生成2个不同风格的大纲，每个大纲包含：
- 标题：一个吸引人的故事标题
- 题材标签：1-2个题材
- 简介：60-80字核心冲突和主题
- 世界观（精简）：
  - 地点1-2个，每个描述15-30字
  - 规则1条，描述20字
  - 势力1个，描述20字
- 角色：2-3个，每个20-40字（姓名+身份+核心特质）
- 四幕结构：每幕1-2句话（40-60字/幕）
- 子情节：0-1个，一句话概括
- 伏笔：1-2个，每个一句话
- 章节大纲：5-8章，每章用一句话概括
- 预估字数：${wordCountRange}

【要求】
- 语言简洁，避免冗长描写
- 只输出纯JSON，不要markdown代码块
- 确保JSON语法正确
- 所有字段填写完整

JSON示例：
{"outlines":[{"title":"标题","genres":["仙侠"],"synopsis":"60-80字简介","worldSetting":{"locations":[{"name":"地点","description":"15-30字","level":"city"}],"factions":[{"name":"势力","description":"20字"}],"rules":[{"name":"规则","description":"20字","category":"custom"}]},"structure":{"act1":"第一幕40-60字","act2a":"第二幕上40-60字","act2b":"第二幕下40-60字","act3":"第三幕40-60字"},"subplots":[],"chapters":[{"title":"第一章","summary":"一句话概括"}],"characters":[{"name":"角色","role":"主角","description":"20-40字","personality":[],"appearance":"","abilities":[],"background":"","relationships":[]}],"foreshadows":[{"hint":"一句话伏笔","type":"mystery","suggestedChapter":1}],"estimatedWordCount":0}]}
`;
}

export const DEFAULT_WORD_COUNT_RANGE = "80万-150万字";

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
    label: "史诗级 (300万字以上)",
    value: "300万字以上",
    min: 3000000,
    max: 10000000,
  },
];

export interface AIGenerationConfig {
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

/**
 * Unified AI Service
 * Uses multi-ai-sdk to provide consistent API across all providers
 */
export class UnifiedAIService {
  private client: AIClient | null = null;
  private provider: ProviderType;
  private model: string;
  private maxTokens: number | undefined;
  private generationConfig: {
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
  };
  private _baseUrl: string;
  private _apiKey: string;

  constructor(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    model?: string,
    maxTokens?: number,
    generationConfig?: {
      temperature: number;
      topP: number;
      frequencyPenalty: number;
      presencePenalty: number;
    },
  ) {
    this.provider = provider;
    this.model = model || "";
    this.maxTokens = maxTokens;
    this.generationConfig = generationConfig || {
      temperature: 0.8,
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

    // Create client with explicit provider
    const config: {
      provider: ProviderName;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      maxTokens?: number;
      contextWindowSafe?: boolean;
    } = {
      provider: sdkProvider,
      contextWindowSafe: true,
    };

    // Only set maxTokens if explicitly provided
    if (this.maxTokens !== undefined) {
      config.maxTokens = this.maxTokens;
    }

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
  }

  /**
   * Update service configuration
   */
  updateConfig(
    apiKey: string,
    baseUrl?: string,
    model?: string,
    maxTokens?: number,
    generationConfig?: {
      temperature: number;
      topP: number;
      frequencyPenalty: number;
      presencePenalty: number;
    },
  ) {
    this.model = model || this.model;
    this.maxTokens = maxTokens;
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

        // Execute the chat call
        this.client!.chat([{ role: "user", content: "Hi" }], { maxTokens: 5 })
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
        error:
          error instanceof Error ? error.message : "Connection test failed",
      };
    }
  }

  /**
   * Continue writing content
   */
  async continueWriting(
    context: ProjectContext,
    mode: "smartContinue" | "polish",
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(
      context,
      mode,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: this.maxTokens,
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
   * Stream continue writing
   */
  continueWritingStream(
    context: ProjectContext,
    mode: "smartContinue" | "polish",
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
  ): void {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(
      context,
      mode,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    // Start streaming
    this.streamChat(messages, onChunk, onComplete, onError);
  }

  /**
   * Polish text
   */
  async polishText(
    context: ProjectContext,
    selectedText?: string,
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildPolishPrompt(
      context,
      selectedText,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: this.maxTokens,
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
   * Stream polish text
   */
  polishTextStream(
    context: ProjectContext,
    selectedText: string | undefined,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
  ): void {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildPolishPrompt(
      context,
      selectedText,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    this.streamChat(messages, onChunk, onComplete, onError);
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
        maxTokens: 2048,
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
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
        maxTokens: 512,
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
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
      maxTokens: 1024,
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
      maxTokens: 2048,
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
      maxTokens: 512,
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
      maxTokens: 512,
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
  ): Promise<void> {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    try {
      const stream = this.client.stream(messages, {
        maxTokens: this.maxTokens,
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
      } as any);

      for await (const chunk of stream) {
        if (chunk.content) {
          onChunk(chunk.content);
        }
      }

      onComplete();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Stream failed");
    }
  }

  /**
   * Generate outline with streaming
   * This method runs in Renderer process, so requests are visible in DevTools
   * @param wordCountRange - 字数范围，可选
   */
  generateOutlineStream(
    prompt: string,
    onChunk: (data: { content: string; fullContent: string }) => void,
    onDone: () => void,
    onComplete: (result: any) => void,
    onError: (error: string) => void,
    config?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    },
    wordCountRange?: string,
  ): void {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    const maxTokens = config?.maxTokens;
    const temperature = config?.temperature ?? 0.8;
    const topP = config?.topP ?? 0.9;

    // 构建动态的系统提示词
    const systemPrompt = buildOutlineSystemPrompt(
      wordCountRange || DEFAULT_WORD_COUNT_RANGE,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `用户的创意种子：${prompt}` },
    ];

    this.generateOutlineStreamInternal(
      messages,
      { maxTokens: maxTokens ? maxTokens : undefined, temperature, topP },
      onChunk,
      onDone,
      onComplete,
      onError,
    );
  }

  /**
   * Generate outline without streaming (recommended for better JSON parsing)
   * Returns the complete result after AI finishes generating
   * @param prompt - 用户的创意种子
   * @param config - 生成配置
   * @param wordCountRange - 字数范围，可选，默认为 "50万-100万字"
   */
  async generateOutline(
    prompt: string,
    config?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
    },
    wordCountRange?: string,
  ): Promise<{ outlines: any[] } | null> {
    if (!this.client) {
      throw new Error("Client not initialized");
    }

    const maxTokens = config?.maxTokens;
    const temperature = config?.temperature ?? 0.8;
    const topP = config?.topP ?? 0.9;

    // 构建动态的系统提示词
    const systemPrompt = buildOutlineSystemPrompt(
      wordCountRange || DEFAULT_WORD_COUNT_RANGE,
    );

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `用户的创意种子：${prompt}` },
    ];

    try {
      const response = await this.client.chat(messages, {
        maxTokens,
        temperature,
        topP,
      } as any);

      const rawContent = extractPureText(
        typeof response === "string" ? response : JSON.stringify(response),
      );

      // Use robust JSON parser
      const result = robustJsonParse<{ outlines: any[] }>(rawContent, {
        expectedType: "object",
        enableCompletion: true,
      });

      if (result.success && result.data) {
        // Validate the structure
        if (Array.isArray(result.data.outlines)) {
          if (result.warnings) {
            console.warn(
              "[UnifiedAIService] JSON parsed with warnings:",
              result.warnings,
            );
          }
          return result.data;
        }
      }

      // Fallback: try to extract outlines field specifically
      const outlinesResult = robustJsonParse<any[]>(rawContent, {
        expectedType: "array",
        enableCompletion: true,
      });

      if (outlinesResult.success && outlinesResult.data) {
        return { outlines: outlinesResult.data };
      }

      // Last resort: try the original extraction logic
      const legacyResult = this.extractOutlinesLegacy(rawContent);
      if (legacyResult) {
        return legacyResult;
      }

      console.error("[UnifiedAIService] All JSON parsing methods failed");
      console.error(
        "[UnifiedAIService] Response preview:",
        rawContent.substring(0, 500),
      );
      return null;
    } catch (error) {
      console.error("[UnifiedAIService] Outline generation error:", error);
      throw error;
    }
  }

  /**
   * Legacy outline extraction - kept for backward compatibility
   */
  private extractOutlinesLegacy(content: string): { outlines: any[] } | null {
    let cleanedContent = content.trim();

    // Remove markdown code blocks
    cleanedContent = cleanedContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*$/g, "")
      .trim();

    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Try fixing trailing commas
        const cleaned = jsonMatch[0]
          .replace(/,\s*\]/g, "]")
          .replace(/,\s*\}/g, "}")
          .trim();

        try {
          return JSON.parse(cleaned);
        } catch {
          // Try extracting outlines array
          const outlinesMatch = cleanedContent.match(
            /"outlines"\s*:\s*\[([\s\S]*)\]/,
          );
          if (outlinesMatch) {
            const outlinesStr = "[" + outlinesMatch[1];
            const fixed = outlinesStr
              .replace(/,\s*\]/g, "]")
              .replace(/}\s*\n\s*\{/g, "},{");

            try {
              const outlines = JSON.parse(fixed);
              return { outlines };
            } catch {
              console.error("[UnifiedAIService] Legacy extraction also failed");
            }
          }
        }
      }
    }

    return null;
  }

  private async generateOutlineStreamInternal(
    messages: Message[],
    options: {
      maxTokens: number | undefined;
      temperature: number;
      topP: number;
    },
    onChunk: (data: { content: string; fullContent: string }) => void,
    onDone: () => void,
    onComplete: (result: any) => void,
    onError: (error: string) => void,
  ): Promise<void> {
    if (!this.client) {
      onError("Client not initialized");
      return;
    }

    let fullContent = "";

    try {
      const stream = this.client.stream(messages, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
      });

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          onChunk({ content: chunk.content, fullContent });
        }
        if (chunk.done) {
          break;
        }
      }

      onDone();

      // Parse JSON result using robust parser
      const rawContent = extractPureText(fullContent);
      let cleanedContent = rawContent.replace(/\[DONE\]\s*$/g, "").trim();

      // Use robust JSON parser with completion enabled
      const result = robustJsonParse<{ outlines: any[] }>(cleanedContent, {
        expectedType: "object",
        enableCompletion: true,
      });

      if (result.success && result.data) {
        if (result.warnings) {
          console.warn(
            "[UnifiedAIService] Stream JSON parsed with warnings:",
            result.warnings,
          );
        }
        onComplete(result.data);
        return;
      }

      // Fallback: try to extract outlines array
      const arrayResult = robustJsonParse<any[]>(cleanedContent, {
        expectedType: "array",
        enableCompletion: true,
      });

      if (arrayResult.success && arrayResult.data) {
        onComplete({ outlines: arrayResult.data });
        return;
      }

      // Last fallback: legacy extraction
      const legacyResult = this.extractOutlinesLegacy(cleanedContent);
      if (legacyResult) {
        onComplete(legacyResult);
        return;
      }

      console.error(
        "[UnifiedAIService] Stream JSON parsing failed. Preview:",
        cleanedContent.substring(0, 500),
      );
      onError("Failed to parse AI response as JSON");
    } catch (error) {
      console.error("[UnifiedAIService] Stream error:", error);
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
}
