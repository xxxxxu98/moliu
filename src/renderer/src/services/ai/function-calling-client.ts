/**
 * Function Calling Client
 * 提供跨 Provider 的统一 Function Calling 调用接口
 */

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
    onProgress?.('正在连接 AI...');
    
    // 如果不支持 Function Calling，回退到 JSON 模式
    if (!this.isSupported()) {
      onProgress?.('该 Provider 不支持 Function Calling，使用 JSON 模式...');
      return this.fallbackGenerateOutline(prompt, wordCountRange);
    }

    try {
      onProgress?.('正在生成大纲...');
      
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
      onProgress?.('Function Calling 调用失败，尝试回退到 JSON 模式...');
      
      // 回退到 JSON 模式
      return this.fallbackGenerateOutline(prompt, wordCountRange);
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

    onProgress?.('正在等待 AI 响应...');

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
      const parsed = JSON.parse(args);
      onProgress?.('大纲生成成功！');
      return { outlines: parsed.outlines || [] };
    }
    
    // 部分 Provider 返回格式不同，尝试其他字段
    if (data.choices?.[0]?.message?.function_call?.arguments) {
      const args = data.choices[0].message.function_call.arguments;
      const parsed = typeof args === 'string' ? JSON.parse(args) : args;
      onProgress?.('大纲生成成功！');
      return { outlines: parsed.outlines || [] };
    }

    // 如果没有 tool_call，尝试解析 content
    if (data.choices?.[0]?.message?.content) {
      try {
        const parsed = JSON.parse(data.choices[0].message.content);
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

    onProgress?.('正在等待 Claude 响应...');

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

    onProgress?.('正在等待 Gemini 响应...');

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
    return `你是一位专业的小说创作顾问。你的任务是根据用户提供的创意种子，生成多个简洁但完整的故事大纲。

重要：你必须使用 generate_story_outline 函数来返回结果，这是唯一的输出方式。

请生成2-3个不同风格的故事大纲，遵循以下简洁规范：

【输出规范 - 严格遵守】
- 简介：80-120字，简明扼要描述核心冲突和主题
- 世界观：地点最多3个，规则最多2条，势力最多2个，每个描述20-50字
- 角色：3-4个核心角色，每个角色用30-50字描述，包含姓名、身份、核心特质
- 四幕结构：每幕用2-3句话概括核心情节点（每幕60-100字）
- 子情节：1-2个，每个用一句话概括
- 伏笔：2-3个伏笔，每个用一句话描述
- 章节大纲：根据字数范围生成6-10章，每章用1-2句话概括（字数多时生成更多章节）
- 预估字数：${wordCountRange}

【语言风格】
- 使用简洁有力的语言
- 避免冗长的修饰词和详细描写
- 聚焦于故事的核心框架和关键情节点

请确保所有字段都填写完整，空字段用空数组[]或空字符串""表示。`;
  }
}
