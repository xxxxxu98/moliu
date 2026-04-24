/**
 * Function Calling Client
 * 提供跨 Provider 的统一 Function Calling 调用接口
 */

import { robustJsonParse } from '@/utils/json-parser';
import { UnifiedAIService } from './unified.service';
import { DEFAULT_WORD_COUNT_RANGE } from './unified.service';
import type { ProviderType } from '@/config/ai-providers';
import {
  OUTLINE_FUNCTION_SCHEMA,
  toOpenAISchema,
  toAnthropicSchema,
  supportsFunctionCalling,
  getFunctionCallingEndpoint,
  getFunctionCallingHeaders,
  needsCustomFunctionCalling,
  type FunctionDef
} from './function-calling';

/**
 * Function Calling 客户端配置
 */
export interface FunctionCallingConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Function Calling 响应
 */
export interface FunctionCallingResponse {
  success: boolean;
  result?: any;
  error?: string;
  rawResponse?: any;
}

/**
 * Function Calling Client
 */
export class FunctionCallingClient {
  private config: FunctionCallingConfig;
  private fallbackService: UnifiedAIService | null = null;

  constructor(config: FunctionCallingConfig) {
    this.config = config;
    
    // 创建 fallback 服务用于 JSON 模式（不传递 maxTokens，使用默认值）
    if (config.apiKey) {
      this.fallbackService = new UnifiedAIService(
        config.provider,
        config.apiKey,
        config.baseUrl,
        config.model,
        undefined, // 不设置 maxTokens
        { temperature: config.temperature ?? 0.8, topP: 0.9, frequencyPenalty: 0, presencePenalty: 0 }
      );
    }
  }

  /**
   * 检查是否支持 Function Calling
   */
  isSupported(): boolean {
    return supportsFunctionCalling(this.config.provider);
  }

  /**
   * 使用 Function Calling 生成大纲
   */
  async generateOutline(
    prompt: string,
    wordCountRange: string = DEFAULT_WORD_COUNT_RANGE,
    onProgress?: (message: string) => void
  ): Promise<{ outlines: any[] } | null> {
    onProgress?.('正在初始化 AI 模型，请稍候...');
    
    // 如果不支持 Function Calling，回退到 JSON 模式
    if (!this.isSupported()) {
      onProgress?.('当前模型不支持 Function Calling，使用标准模式生成...');
      return this.fallbackGenerateOutline(prompt, wordCountRange);
    }

    try {
      onProgress?.('正在分析创意种子，构建故事框架...');
      
      // 根据 Provider 选择不同的调用方式
      if (needsCustomFunctionCalling(this.config.provider)) {
        return await this.callAnthropic(prompt, wordCountRange, onProgress);
      } else if (this.config.provider === 'gemini') {
        return await this.callGemini(prompt, wordCountRange, onProgress);
      } else {
        return await this.callOpenAICompatible(prompt, wordCountRange, onProgress);
      }
    } catch (error) {
      console.error('[FunctionCallingClient] Error:', error);
      
      // 静默回退到 JSON 模式
      return this.fallbackGenerateOutline(prompt, wordCountRange);
    }
  }

  /**
   * 使用 robustJsonParse 解析 JSON（内部已集成 jsonrepair）
   */
  private safeJsonParse(jsonString: string): any {
    // 先尝试原生解析
    try {
      return JSON.parse(jsonString);
    } catch {
      // 使用 robustJsonParse（内部使用 jsonrepair）修复并解析
      const result = robustJsonParse(jsonString, {
        expectedType: 'object',
        enableCompletion: true,
      });
      if (result.success && result.data) {
        console.warn('[FunctionCallingClient] JSON parsed with jsonrepair:', result.warnings);
        return result.data;
      }
      // 最后再尝试原生解析（兜底）
      return JSON.parse(jsonString);
    }
  }

  /**
   * OpenAI 兼容 API 的 Function Calling 调用
   */
  private async callOpenAICompatible(
    prompt: string,
    wordCountRange: string,
    onProgress?: (message: string) => void
  ): Promise<{ outlines: any[] } | null> {
    const endpoint = getFunctionCallingEndpoint(this.config.provider, this.config.baseUrl || '');
    const headers = getFunctionCallingHeaders(this.config.provider, this.config.apiKey);
    
    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    
    const requestBody: any = {
      model: this.config.model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `用户的创意种子：${prompt}` }
      ],
      tools: [toOpenAISchema(OUTLINE_FUNCTION_SCHEMA)],
      tool_choice: {
        type: 'function',
        function: { name: OUTLINE_FUNCTION_SCHEMA.name }
      },
      temperature: this.config.temperature ?? 0.8,
    };

    // 部分 Provider 不支持 tool_choice
    if (this.config.provider === 'ollama') {
      delete requestBody.tool_choice;
    }

    onProgress?.(`正在生成大纲内容，请耐心等待...\n（大纲内容丰富，包含世界观、角色、四幕结构等多维度内容，预计需要 1-5 分钟）`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API 请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // 解析 tool_call
    if (data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments) {
      const args = data.choices[0].message.tool_calls[0].function.arguments;
      const parsed = this.safeJsonParse(args);
      onProgress?.('大纲生成成功！');
      return { outlines: parsed.outlines || [] };
    }
    
    // 部分 Provider 返回格式不同，尝试其他字段
    if (data.choices?.[0]?.message?.function_call?.arguments) {
      const args = data.choices[0].message.function_call.arguments;
      const parsed = typeof args === 'string' ? this.safeJsonParse(args) : args;
      onProgress?.('大纲生成成功！');
      return { outlines: parsed.outlines || [] };
    }

    // 如果没有 tool_call，尝试解析 content
    if (data.choices?.[0]?.message?.content) {
      try {
        const parsed = this.safeJsonParse(data.choices[0].message.content);
        return { outlines: parsed.outlines || [] };
      } catch {
        throw new Error('无法解析 AI 返回的内容');
      }
    }

    throw new Error('AI 返回格式异常');
  }

  /**
   * Anthropic Claude 的 Function Calling 调用
   */
  private async callAnthropic(
    prompt: string,
    wordCountRange: string,
    onProgress?: (message: string) => void
  ): Promise<{ outlines: any[] } | null> {
    const endpoint = getFunctionCallingEndpoint(this.config.provider, this.config.baseUrl || '');
    const headers = getFunctionCallingHeaders(this.config.provider, this.config.apiKey);
    
    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    
    const requestBody = {
      model: this.config.model || 'claude-3-5-sonnet-20241022',
      system: systemPrompt,
      messages: [
        { role: 'user', content: `用户的创意种子：${prompt}` }
      ],
      tools: [toAnthropicSchema(OUTLINE_FUNCTION_SCHEMA)]
    };

    onProgress?.(`正在生成大纲内容，请耐心等待...\n（需要构建完整的世界观、角色关系和情节发展，预计需要 1-5 分钟）`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API 请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Claude 返回 tool_use 类型的 content
    const toolUse = data.content?.find((c: any) => c.type === 'tool_use');
    if (toolUse?.input) {
      onProgress?.('大纲生成成功！');
      return { outlines: toolUse.input.outlines || [] };
    }

    throw new Error('Claude 返回格式异常');
  }

  /**
   * Google Gemini 的 Function Calling 调用
   */
  private async callGemini(
    prompt: string,
    wordCountRange: string,
    onProgress?: (message: string) => void
  ): Promise<{ outlines: any[] } | null> {
    const baseUrl = this.config.baseUrl?.replace(/\/$/, '') || '';
    const model = this.config.model || 'gemini-2.0-flash';
    const endpoint = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;
    
    const systemPrompt = this.buildSystemPrompt(wordCountRange);
    
    // Gemini 使用不同的 schema 格式
    const geminiSchema = {
      name: OUTLINE_FUNCTION_SCHEMA.name,
      description: OUTLINE_FUNCTION_SCHEMA.description,
      parameters: OUTLINE_FUNCTION_SCHEMA.parameters
    };
    
    const requestBody = {
      contents: [{
        role: 'user',
        parts: [{ text: `用户的创意种子：${prompt}` }]
      }],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      tools: [{
        functionDeclarations: [geminiSchema]
      }],
      generationConfig: {
        temperature: this.config.temperature ?? 0.8,
      }
    };

    onProgress?.(`正在生成大纲内容，请耐心等待...\n（需要构建完整的世界观、角色关系和情节发展，预计需要 1-5 分钟）`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API 请求失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Gemini 返回 functionCall
    const functionCall = data.candidates?.[0]?.content?.parts?.[0]?.functionCall;
    if (functionCall?.args) {
      onProgress?.('大纲生成成功！');
      return { outlines: functionCall.args.outlines || [] };
    }

    // 尝试使用 safeJsonParse 解析
    if (functionCall) {
      try {
        const args = typeof functionCall.args === 'string' 
          ? this.safeJsonParse(functionCall.args) 
          : functionCall.args;
        if (args?.outlines) {
          onProgress?.('大纲生成成功！');
          return { outlines: args.outlines };
        }
      } catch {
        // 解析失败
      }
    }

    throw new Error('Gemini 返回格式异常');
  }

  /**
   * 回退到 JSON 模式的生成
   */
  private async fallbackGenerateOutline(
    prompt: string,
    wordCountRange: string
  ): Promise<{ outlines: any[] } | null> {
    if (!this.fallbackService) {
      throw new Error('Fallback service not available');
    }
    
    return await this.fallbackService.generateOutline(prompt, {
      temperature: this.config.temperature,
      topP: 0.9,
    }, wordCountRange);
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(wordCountRange: string): string {
    return `你是一位专业的小说创作顾问。根据用户的创意种子，生成简洁的故事大纲。

重要：必须使用 generate_story_outline 函数返回结果。

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
- 确保JSON语法正确`;
  }
}
