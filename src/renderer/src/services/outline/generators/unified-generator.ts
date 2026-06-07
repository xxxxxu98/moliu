/**
 * Unified Outline Generator
 * Main entry point with multi-layered fallback strategy
 */

import { MarkdownOutlineGenerator } from './markdown-generator';
import { outlinePostProcessor } from '../processor/outline-post-processor';
import type { Outline } from '../schemas/outline.schema';
import type { ProviderType } from '@/config/ai-providers';
import { getBaseUrl } from '@/config/ai-providers';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import { useSettingsStore, type AIDefaultModelSelection } from '@/stores/settings.store';
import { robustJsonParse } from '@/utils/json-parser';
import type { DirectionGenerationResult, OutlineDirection } from '../types/direction';
import type { ExpandedOutlineResult } from '../types/executable-outline';
import { buildDirectionPrompt } from '../prompts/system/direction-prompt';
import { buildExpandDirectionPrompt } from '../prompts/system/expand-direction-prompt';
import { parseDirections } from '../parser/direction-parser';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';

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
 * 生成选项
 */
export interface GenerateOptions {
  temperature?: number;
  topP?: number;
  wordCountRange?: string;
  maxRetries?: number;
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
  private markdownGenerator: MarkdownOutlineGenerator | null = null;
  private defaultOptions: GenerateOptions = {
    temperature: 0.7,
    topP: 0.9,
    maxRetries: 2,
  };

  constructor(options?: GenerateOptions) {
    if (options) {
      this.defaultOptions = { ...this.defaultOptions, ...options };
    }
  }

  /**
   * 生成大纲
   */
  async generate(
    prompt: string,
    options?: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<GenerationResult> {
    const opts = { ...this.defaultOptions, ...options };
    let attempts = 0;
    const maxAttempts = opts.maxRetries || 2;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const result = await this.callMarkdownMode(prompt, opts);

        if (result.success) {
          return result;
        }

        onProgress?.('Markdown 解析失败，尝试其他解析策略...');

        const remarkResult = await this.generateWithFallback(prompt, opts, onProgress);
        if (remarkResult.success) {
          return remarkResult;
        }

        onProgress?.('尝试 JSON Mode 作为兜底...');
        const jsonResult = await this.callJSONModeFallback(prompt, opts);
        if (jsonResult.success) {
          return jsonResult;
        }

        if (attempts < maxAttempts) {
          onProgress?.(`重试生成... (${attempts}/${maxAttempts})`);
          opts.temperature = (opts.temperature || 0.7) + 0.1;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        onProgress?.(`生成出错: ${errorMsg}`);

        if (attempts >= maxAttempts) {
          return {
            success: false,
            outlines: [],
            warnings: [],
            errors: [`生成失败: ${errorMsg}`],
            strategy: 'legacy',
          };
        }
      }
    }

    return this.tryLegacyMode(prompt, opts);
  }

  async generateDirections(
    prompt: string,
    options?: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<DirectionGenerationResult> {
    const opts = { ...this.defaultOptions, ...options };
    const builtPrompt = buildDirectionPrompt({
      seed: prompt,
      wordCountRange: opts.wordCountRange || '50万-100万字',
    });

    onProgress?.('正在生成创作方向...');
    const rawText = await this.callStructuredTextMode(builtPrompt.system, builtPrompt.user, opts);
    const directions = parseDirections(rawText);

    return {
      directions,
      rawText,
      strategy: directions.length > 0 ? 'structured-text' : 'fallback',
      warnings: directions.length > 0 ? [] : ['未能完整解析 3 个方向，建议调整提示词后重试'],
    };
  }

  async expandDirection(
    prompt: string,
    direction: OutlineDirection,
    options?: GenerateOptions & { enhancementBrief?: string },
    onProgress?: (message: string) => void,
  ): Promise<ExpandedOutlineResult> {
    const opts = { ...this.defaultOptions, ...options };
    const builtPrompt = buildExpandDirectionPrompt({
      seed: prompt,
      direction,
      wordCountRange: opts.wordCountRange || '50万-100万字',
      enhancementBrief: opts.enhancementBrief,
    });

    onProgress?.('正在展开主方案...');
    const rawText = await this.callStructuredTextMode(builtPrompt.system, builtPrompt.user, opts);
    const outline = parseExpandedOutline(rawText);

    return {
      outline,
      rawText,
      strategy: outline ? 'structured-text' : 'fallback',
      warnings: outline ? [] : ['未能完整解析主方案，建议重新生成或微调方向描述'],
    };
  }

  private async generateWithFallback(
    prompt: string,
    options: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<GenerationResult> {
    if (!this.markdownGenerator) {
      const config = this.getAIConfig();
      this.markdownGenerator = new MarkdownOutlineGenerator(
        config.provider,
        config.apiKey,
        config.baseUrl,
        config.model,
      );
    }

    onProgress?.('正在生成大纲...');
    const markdown = await this.markdownGenerator.generate(prompt, options, onProgress);

    onProgress?.('正在解析大纲...');
    const postResult = outlinePostProcessor.process(markdown);

    if (postResult.success) {
      return {
        success: true,
        outlines: postResult.outlines,
        warnings: postResult.warnings,
        errors: postResult.errors,
        strategy: postResult.strategy as GenerationResult['strategy'],
        rawMarkdown: markdown,
      };
    }

    onProgress?.('尝试提取 JSON 数据...');
    const jsonResult = outlinePostProcessor.processJSON(markdown);

    if (jsonResult.success) {
      return {
        success: true,
        outlines: jsonResult.outlines,
        warnings: [...postResult.warnings, ...jsonResult.warnings],
        errors: jsonResult.errors,
        strategy: 'json-mode',
        rawMarkdown: markdown,
      };
    }

    return {
      success: false,
      outlines: [],
      warnings: postResult.warnings,
      errors: postResult.errors,
      strategy: 'markdown-regex',
      rawMarkdown: markdown,
    };
  }

  private async callMarkdownMode(
    prompt: string,
    options: GenerateOptions,
  ): Promise<GenerationResult> {
    const config = this.getAIConfig();

    const systemPrompt = this.buildMarkdownSystemPrompt(options.wordCountRange || '50万-100万字');
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `用户的创意种子：${prompt}` },
    ];

    try {
      const data = await this.requestChatCompletion(messages, options);
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('API 未返回内容');
      }

      const result = outlinePostProcessor.process(content);

      return {
        success: result.success,
        outlines: result.outlines,
        warnings: result.warnings,
        errors: result.errors,
        strategy: 'markdown-remark',
        rawMarkdown: content,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        outlines: [],
        warnings: [],
        errors: [`Markdown 模式失败: ${errorMsg}`],
        strategy: 'markdown-remark',
      };
    }
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
  ): Promise<string> {
    const data = await this.requestChatCompletion(
      [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt },
      ],
      options,
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
  ): Promise<any> {
    const config = this.getAIConfig();
    const provider = config.provider;
    const resolvedBaseUrl = config.baseUrl.replace(/\/$/, '');

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
            temperature: options.temperature || 0.7,
            topP: options.topP || 0.9,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API 请求失败: ${response.status}`);
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

      const response = await fetch(`${resolvedBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-5-sonnet-20241022',
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
          max_tokens: 8192,
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API 请求失败: ${response.status}`);
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
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
      }),
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    return response.json();
  }

  private buildMarkdownSystemPrompt(wordCountRange: string): string {
    const wordCountNum = this.parseWordCount(wordCountRange);
    const chaptersPerVolume = Math.ceil(wordCountNum / 150000);
    const totalChapters = Math.ceil(wordCountNum / 2000);

    return `你是一位专业的小说创作顾问。根据用户的创意种子，生成结构清晰的故事大纲。

【字数要求】
预估字数：${wordCountRange}
建议卷数：${chaptersPerVolume}卷
建议章节数：${totalChapters}章
每卷字数：约${Math.round(wordCountNum / chaptersPerVolume / 10000)}万字

请生成3个不同风格的大纲，每个大纲必须包含以下所有内容：

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
- **章节标题**：
- **摘要**：
- **关键事件**：

## 伏笔
- **伏笔**：
- **类型**：
- **回收章节**：
`;
  }

  private async callJSONModeFallback(
    prompt: string,
    options: GenerateOptions,
  ): Promise<GenerationResult> {
    try {
      const config = this.getAIConfig();
      const systemPrompt = this.buildJSONSystemPrompt(options.wordCountRange || '50万-100万字');
      const data = await this.requestChatCompletion(
        [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: prompt },
        ],
        options,
      );
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('API 未返回 JSON 内容');
      }

      const parsed = robustJsonParse(content);
      const outlines = Array.isArray(parsed?.outlines) ? parsed.outlines as Outline[] : [];

      if (outlines.length === 0) {
        return {
          success: false,
          outlines: [],
          warnings: [],
          errors: ['JSON 兜底未生成有效 outlines'],
          strategy: 'json-mode',
          rawMarkdown: content,
        };
      }

      return {
        success: true,
        outlines,
        warnings: ['使用 JSON Mode 兜底成功'],
        errors: [],
        strategy: 'json-mode',
        rawMarkdown: content,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        outlines: [],
        warnings: [],
        errors: [`JSON 兜底失败: ${errorMsg}`],
        strategy: 'json-mode',
      };
    }
  }

  private buildJSONSystemPrompt(wordCountRange: string): string {
    return `你是一位专业的小说创作顾问。请根据用户创意种子，输出 JSON 格式的大纲数据。预估字数范围：${wordCountRange}。JSON 顶层必须包含 outlines 数组。`;
  }

  private parseWordCount(wordCountRange: string): number {
    const numbers = wordCountRange.match(/\d+/g)?.map((value) => Number.parseInt(value, 10)) ?? [];
    if (numbers.length === 0) {
      return 500000;
    }

    const max = Math.max(...numbers);
    return wordCountRange.includes('万') ? max * 10000 : max;
  }

  private getAIConfig(): {
    provider: ProviderType;
    apiKey: string;
    baseUrl: string;
    model?: string;
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
    };
  }
}
