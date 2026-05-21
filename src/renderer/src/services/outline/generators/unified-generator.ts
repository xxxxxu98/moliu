/**
 * Unified Outline Generator
 * Main entry point with multi-layered fallback strategy
 */

import { MarkdownOutlineGenerator } from './markdown-generator';
import { outlinePostProcessor } from '../processor/outline-post-processor';
import type { Outline } from '../schemas/outline.schema';
import type { ProviderType } from '@/config/ai-providers';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import { useSettingsStore } from '@/stores/settings.store';
import { robustJsonParse } from '@/utils/json-parser';

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
 * 3. JSON Mode 生成 -> JSON 解析
 * 4. 传统 JSON 解析
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
        // 尝试 Markdown 生成 + 多层解析
        const result = await this.generateWithFallback(
          prompt,
          opts,
          onProgress,
        );

        if (result.success) {
          return result;
        }

        // 如果失败，尝试降级到 JSON Mode
        onProgress?.(`Markdown 解析失败，尝试 JSON Mode...`);
        const jsonResult = await this.callJSONMode(prompt, opts);

        if (jsonResult.success) {
          return jsonResult;
        }

        // 再次尝试 Markdown（带不同参数）
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

    // 最后尝试传统方式
    return this.tryLegacyMode(prompt, opts);
  }

  /**
   * 使用 Markdown 生成 + 多层解析
   */
  private async generateWithFallback(
    prompt: string,
    options: GenerateOptions,
    onProgress?: (message: string) => void,
  ): Promise<GenerationResult> {
    // 1. 初始化生成器
    if (!this.markdownGenerator) {
      const config = this.getAIConfig();
      this.markdownGenerator = new MarkdownOutlineGenerator(
        config.provider,
        config.apiKey,
        config.baseUrl,
        config.model,
      );
    }

    // 2. 生成 Markdown
    onProgress?.('正在生成大纲...');
    const markdown = await this.markdownGenerator.generate(prompt, options, onProgress);

    // 3. 后处理（Remark AST 解析 -> 正则提取 -> JSON 提取）
    onProgress?.('正在解析大纲...');
    const postResult = outlinePostProcessor.process(markdown);

    if (postResult.success) {
      return {
        success: true,
        outlines: postResult.outlines,
        warnings: postResult.warnings,
        errors: postResult.errors,
        strategy: postResult.strategy as any,
        rawMarkdown: markdown,
      };
    }

    // 4. 提取 JSON 作为最后兜底
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

  /**
   * JSON Mode 生成
   */
  private async callJSONMode(
    prompt: string,
    options: GenerateOptions,
  ): Promise<GenerationResult> {
    const config = this.getAIConfig();

    const systemPrompt = this.buildJSONSystemPrompt(options.wordCountRange || '50万-100万字');
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `用户的创意种子：${prompt}` },
    ];

    try {
      // 使用 fetch 直接调用 API
      const response = await fetch(config.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model || undefined,
          messages,
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('API 未返回内容');
      }

      // 解析 JSON
      const result = outlinePostProcessor.processJSON(content);

      return {
        success: result.success,
        outlines: result.outlines,
        warnings: result.warnings,
        errors: result.errors,
        strategy: 'json-mode',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        outlines: [],
        warnings: [],
        errors: [`JSON Mode 失败: ${errorMsg}`],
        strategy: 'json-mode',
      };
    }
  }

  /**
   * 传统模式（直接使用 UnifiedAIService）
   */
  private async tryLegacyMode(
    prompt: string,
    options: GenerateOptions,
  ): Promise<GenerationResult> {
    try {
      const config = this.getAIConfig();
      const { UnifiedAIService } = await import('@/services/ai/unified.service');

      const service = new UnifiedAIService(
        config.provider,
        config.apiKey,
        config.baseUrl,
        config.model,
      );

      const result = await service.generateOutline(prompt, {
        temperature: options.temperature,
        topP: options.topP,
      }, options.wordCountRange);

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

  /**
   * 构建 JSON Mode 系统提示词
   */
  private buildJSONSystemPrompt(wordCountRange: string): string {
    return `你是一位专业的小说创作顾问。根据用户的创意种子，生成简洁的故事大纲。

生成3个不同风格的大纲，每个大纲包含：
- 标题：一个吸引人的故事标题
- 题材标签：1-2个题材
- 简介：60-80字核心冲突和主题
- 世界观（精简）：地点1-2个，规则1条，势力1个
- 角色：2-3个，每个20-40字
- 四幕结构：每幕40-60字
- 章节大纲：5-8章，每章一句话概括
- 伏笔：1-2个

【要求】
- 只输出纯JSON对象，不要任何其他内容
- JSON格式：{"outlines":[...]}
- 确保JSON语法完全正确`;

  }

  /**
   * 获取 AI 配置
   */
  private getAIConfig(): {
    provider: ProviderType;
    apiKey: string;
    baseUrl: string;
    model: string;
  } {
    try {
      // 使用 useActiveAIProvider 获取当前配置
      const { activeProvider } = useActiveAIProvider();
      const provider = activeProvider.value;

      if (provider) {
        return {
          provider: provider.provider,
          apiKey: provider.apiKey || '',
          baseUrl: provider.baseUrl || '',
          model: provider.modelName || '',
        };
      }

      // 如果没有活跃的 provider，尝试从设置获取
      const settingsStore = useSettingsStore();
      const defaultModelId = settingsStore.defaultModel;

      if (defaultModelId) {
        const [providerId, modelName] = defaultModelId.split(':');
        const matchedProvider = settingsStore.aiProviders.find(
          (p) => p.id === providerId && p.enabled && p.apiKey,
        );

        if (matchedProvider) {
          return {
            provider: matchedProvider.provider,
            apiKey: matchedProvider.apiKey || '',
            baseUrl: matchedProvider.baseUrl || '',
            model: modelName || matchedProvider.modelName || '',
          };
        }
      }

      // 最后一个兜底：找第一个启用的
      const firstEnabled = settingsStore.aiProviders.find((p) => p.enabled && p.apiKey);
      if (firstEnabled) {
        return {
          provider: firstEnabled.provider,
          apiKey: firstEnabled.apiKey || '',
          baseUrl: firstEnabled.baseUrl || '',
          model: firstEnabled.modelName || '',
        };
      }
    } catch (e) {
      console.warn('[UnifiedOutlineGenerator] Failed to get AI config:', e);
    }

    // 返回默认配置
    return {
      provider: 'openai' as ProviderType,
      apiKey: '',
      baseUrl: '',
      model: '',
    };
  }

  /**
   * 更新配置
   */
  updateConfig(
    apiKey: string,
    baseUrl?: string,
    model?: string,
  ) {
    if (this.markdownGenerator) {
      this.markdownGenerator.updateConfig(apiKey, baseUrl, model);
    }
  }
}

// 导出单例（延迟初始化）
let instance: UnifiedOutlineGenerator | null = null;

export function getUnifiedOutlineGenerator(): UnifiedOutlineGenerator {
  if (!instance) {
    instance = new UnifiedOutlineGenerator();
  }
  return instance;
}
