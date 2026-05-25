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
        // 优先使用 Markdown 模式生成
        const result = await this.callMarkdownMode(prompt, opts);

        if (result.success) {
          return result;
        }

        // 如果 Markdown 模式失败，尝试降级策略
        onProgress?.(`Markdown 解析失败，尝试其他解析策略...`);

        // 尝试 Remark AST 解析
        const remarkResult = await this.generateWithFallback(prompt, opts, onProgress);
        if (remarkResult.success) {
          return remarkResult;
        }

        // 最后尝试 JSON Mode 作为兜底
        onProgress?.(`尝试 JSON Mode 作为兜底...`);
        const jsonResult = await this.callJSONModeFallback(prompt, opts);
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
   * Markdown 模式生成（优先使用）
   */
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

      // 使用后处理器解析 Markdown
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
   * 构建 Markdown 格式系统提示词（优先使用）
   */
  private buildMarkdownSystemPrompt(wordCountRange: string): string {
    // 解析字数范围
    const wordCountNum = this.parseWordCount(wordCountRange);
    const chaptersPerVolume = Math.ceil(wordCountNum / 150000); // 每卷约15万字
    const totalChapters = Math.ceil(wordCountNum / 2000); // 每章约2000字

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
- **一句话简介**：60-80字的故事简介

## 情绪目标

- **核心情绪**：热血/甜蜜/紧张等
- **次要情绪**：次要情绪
- **情绪弧线**：rising/falling/wave/mixed
- **情绪密度**：3000
- **情绪高点**：5, 20, 50
- **情绪低点**：10, 30

## 世界设定

- **世界类型**：世界类型

### 主要地点

| 地点名称 | 描述 | 等级 |
|----------|------|------|
| 地点1 | 描述 | city/district/special |

### 主要势力

| 势力名称 | 描述 | 盟友 | 敌人 |
|----------|------|------|------|
| 势力1 | 描述 | 盟友 | 敌人 |

### 核心规则

| 规则名称 | 描述 | 类别 |
|----------|------|------|
| 规则1 | 描述 | cultivation/magic/social |

## 角色设定

### 主角

- **姓名**：角色名
- **角色类型**：protagonist
- **描述**：角色描述
- **性格标签**：性格标签1、性格标签2
- **金手指**：金手指（如有）
- **优势**：优势1
- **短板**：短板1
- **人际关系**：
  - 关联角色（friend/enemy/mentor）：关系描述

### 其他角色

- 角色名（角色类型）：描述

## 三幕结构

### 第一幕（建置，约20%）

第一幕描述

### 第二幕A（对抗上半，约25%）

第二幕A描述

### 第二幕B（对抗下半，约25%）

第二幕B描述

### 第三幕（结局，约30%）

第三幕描述

## 爽点设计

### 爽点类型

打脸爽、装逼爽、身份揭秘、实力碾压

### 爽点安排

| 章节 | 类型 | 描述 |
|------|------|------|
| 5 | micro | 爽点描述 |
| 10 | small | 爽点描述 |
| 30 | big | 爽点描述 |

## 核心卖点

| 名称 | 描述 | 优先级 |
|------|------|--------|
| 卖点名称 | 卖点描述 | 1 |

## 矛盾设计

- **冲突来源**：资源/利益、阵营/种族等

### 矛盾递进

1. 一级矛盾
2. 二级矛盾
3. 三级矛盾
4. 四级矛盾

### 主要冲突

- 主要冲突1
- 主要冲突2

## 八条故事线

### 地图线

地图线规划（地点递进）

### 阵营线

阵营线规划（势力发展）

### 人物线

人物线规划（角色登场）

### 金手指线

金手指线规划（能力升级）

### 世界观线

世界观线规划（设定揭示）

### 矛盾线

矛盾线规划（冲突递进）

### 收集线

收集线规划（材料收集）

### 感情线

感情线规划（感情发展）

## 伏笔规划

| 内容 | 类型 | 建议章节 |
|------|------|----------|
| 伏笔内容 | item/dialogue/event/mystery | 10 |

## 章节概览

| 章节 | 标题 | 摘要 | 关键事件 | 涉及角色 |
|------|------|------|----------|----------|
| 1 | 章节标题 | 章节摘要 | 关键事件1 | 角色1 |
| 2 | 章节标题 | 章节摘要 | 关键事件2 | 角色2 |

【要求】
- 使用 Markdown 格式输出
- 每个大纲使用二级标题（## 大纲X）
- 确保所有字段都有具体内容
- 所有大纲都要完整填写以上所有模块
- **字数规划必须符合目标字数范围**
- 卷数和章节数要与目标字数匹配
- 每卷约${Math.round(wordCountNum / chaptersPerVolume / 10000)}万字
- 前30章（前约10万字）必须包含：钩子、人设、爽点、悬念`;

  }

  /**
   * 解析字数范围为数字
   */
  private parseWordCount(wordCountRange: string): number {
    // 匹配两个数字（支持 "50万-100万字" 或 "50-100万字" 等格式）
    const rangeMatch = wordCountRange.match(/(\d+(?:\.\d+)?)\s*万\s*[-~]\s*(\d+(?:\.\d+)?)\s*万/);
    if (rangeMatch) {
      const minWan = parseFloat(rangeMatch[1]);
      const maxWan = parseFloat(rangeMatch[2]);
      return Math.round(((minWan + maxWan) / 2) * 10000);
    }

    // 匹配单个数字（如 "80万字"）
    const singleMatch = wordCountRange.match(/(\d+(?:\.\d+)?)\s*万/);
    if (singleMatch) {
      const wan = parseFloat(singleMatch[1]);
      return Math.round(wan * 10000);
    }

    return 500000;
  }

  /**
   * JSON Mode 降级方法（兜底用）
   */
  private async callJSONModeFallback(
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
        errors: [`JSON Mode 降级失败: ${errorMsg}`],
        strategy: 'json-mode',
      };
    }
  }

  /**
   * 旧版 JSON 系统提示词（仅用于降级）
   */
  private buildJSONSystemPrompt(wordCountRange: string): string {
    // 解析字数范围
    const wordCountNum = this.parseWordCount(wordCountRange);
    const chaptersPerVolume = Math.ceil(wordCountNum / 150000);
    const totalChapters = Math.ceil(wordCountNum / 2000);

    return `你是一位专业的小说创作顾问。根据用户的创意种子，生成结构清晰的故事大纲。

【字数要求】
预估字数：${wordCountRange}
建议卷数：${chaptersPerVolume}卷
建议章节数：${totalChapters}章

请生成3个不同风格的大纲，每个大纲必须包含以下所有字段：

{
  "outlines": [
    {
      "title": "故事标题",
      "synopsis": "60-80字简介",
      "genres": ["题材标签"],
      "estimatedWordCount": 500000,
      "emotionGoal": { "primary": "核心情绪", "secondary": "次要情绪", "arc": "rising/falling/wave/mixed", "density": 3000, "highPoints": [5, 20, 50], "lowPoints": [10, 30] },
      "worldSetting": { "type": "世界类型", "locations": [{ "name": "地点", "description": "描述", "level": "city" }], "factions": [{ "name": "势力", "description": "描述" }], "rules": [{ "name": "规则", "description": "描述" }] },
      "characters": [{ "name": "角色名", "role": "protagonist", "description": "描述", "personality": ["性格标签"], "goldenFinger": "金手指", "strengths": ["优势"], "weaknesses": ["短板"] }],
      "structure": { "act1": "第一幕", "act2a": "第二幕A", "act2b": "第二幕B", "act3": "第三幕" },
      "coolPointDesign": { "patterns": ["打脸爽", "装逼爽"], "arranged": [{ "type": "类型", "description": "描述", "suggestedChapter": 5 }] },
      "coreSellingPoints": [{ "name": "卖点", "description": "描述", "priority": 1 }],
      "conflictDesign": { "source": "冲突来源", "escalation": ["一级", "二级", "三级", "四级"], "majorConflicts": ["冲突1"] },
      "storyLines": { "map": "地图线", "faction": "阵营线", "character": "人物线", "goldenfinger": "金手指线", "worldRules": "世界观线", "conflict": "矛盾线", "collection": "收集线", "romance": "感情线" },
      "foreshadows": [{ "hint": "伏笔", "type": "mystery", "suggestedChapter": 10 }],
      "chapters": [{ "title": "章节标题", "summary": "摘要", "keyEvents": ["事件"], "involvedCharacters": ["角色"] }]
    }
  ]
}

【要求】
- 只输出纯JSON对象，不要任何其他内容
- JSON格式：{"outlines":[...]}
- 确保JSON语法完全正确
- 所有大纲都要完整填写以上所有字段
- **字数规划必须符合目标字数范围**
- 卷数和章节数要与目标字数匹配
- 每卷约${Math.round(wordCountNum / chaptersPerVolume / 10000)}万字
- 前30章（前约10万字）必须包含：钩子、人设、爽点、悬念`;
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
        // 优先使用用户配置的 baseUrl，如果没有则使用 provider 的默认 URL
        const baseUrl = provider.baseUrl || this.getDefaultBaseUrl(provider.provider);
        return {
          provider: provider.provider,
          apiKey: provider.apiKey || '',
          baseUrl,
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
          const baseUrl = matchedProvider.baseUrl || this.getDefaultBaseUrl(matchedProvider.provider);
          return {
            provider: matchedProvider.provider,
            apiKey: matchedProvider.apiKey || '',
            baseUrl,
            model: modelName || matchedProvider.modelName || '',
          };
        }
      }

      // 最后一个兜底：找第一个启用的
      const firstEnabled = settingsStore.aiProviders.find((p) => p.enabled && p.apiKey);
      if (firstEnabled) {
        const baseUrl = firstEnabled.baseUrl || this.getDefaultBaseUrl(firstEnabled.provider);
        return {
          provider: firstEnabled.provider,
          apiKey: firstEnabled.apiKey || '',
          baseUrl,
          model: firstEnabled.modelName || '',
        };
      }
    } catch (e) {
      console.warn('[UnifiedOutlineGenerator] Failed to get AI config:', e);
    }

    // 返回默认配置（OpenAI）
    return {
      provider: 'openai' as ProviderType,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    };
  }

  /**
   * 获取 provider 的默认 base URL
   */
  private getDefaultBaseUrl(provider: ProviderType): string {
    const defaultUrls: Partial<Record<ProviderType, string>> = {
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com',
      gemini: 'https://generativelanguage.googleapis.com/v1beta',
      moonshot: 'https://api.moonshot.cn/v1',
      deepseek: 'https://api.deepseek.com/v1',
      ollama: 'http://localhost:11434',
      groq: 'https://api.groq.com/openai/v1',
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      mistral: 'https://api.mistral.ai/v1',
      cohere: 'https://api.cohere.ai/v1',
      nvidia: 'https://integrate.api.nvidia.com/v1',
      perplexity: 'https://api.perplexity.ai',
      together: 'https://api.together.xyz/v1',
      cerebras: 'https://api.cerebras.ai/v1',
      azure: '',
      grok: 'https://api.x.ai/v1',
      fireworks: 'https://api.fireworks.ai/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    };
    return defaultUrls[provider] || '';
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
