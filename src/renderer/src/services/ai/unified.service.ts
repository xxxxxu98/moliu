/**
 * Unified AI Service using multi-ai-sdk
 * Provides a unified interface for multiple AI providers
 */

import { AIClient, type Message, type ProviderName } from 'multi-ai-sdk';
import { PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from './base.service';
import { getSDKProvider, type ProviderType, defaultProviders } from '@/config/ai-providers';

// Outline generation system prompt
const OUTLINE_SYSTEM_PROMPT = `你是一位专业的小说创作顾问和故事架构师。你的任务是根据用户提供的创意种子，生成多个独特的故事大纲。

请生成2-3个不同风格的故事大纲，每个大纲包含：
1. 标题：一个吸引人的故事标题
2. 简介：200字以内的故事概述
3. 结构：按照三幕式结构描述
   - 第一幕：建置（介绍背景和主要冲突）
   - 第二幕上：对抗（主角面临的挑战）
   - 第二幕下：危机（最困难的时刻）
   - 第三幕：解决（成长和结局）
4. 主要角色：2-3个核心角色，包括名字、角色定位、简要描述
5. 伏笔设定：2-3个贯穿全文的伏笔或悬念
6. 预估字数：50万-100万字

请用JSON格式返回，结构如下：
{
  "outlines": [
    {
      "title": "标题",
      "synopsis": "简介",
      "structure": {
        "act1": "第一幕内容",
        "act2a": "第二幕上内容",
        "act2b": "第二幕下内容",
        "act3": "第三幕内容"
      },
      "characters": [
        {"name": "角色名", "role": "角色定位", "description": "角色描述"}
      ],
      "foreshadows": ["伏笔1", "伏笔2"],
      "estimatedWordCount": 预估字数
    }
  ]
}

请确保生成的故事大纲具有独特性，避免套路化，富有创意。`;

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
  private maxTokens: number;
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
    generationConfig?: { temperature: number; topP: number; frequencyPenalty: number; presencePenalty: number }
  ) {
    this.provider = provider;
    this.model = model || '';
    this.maxTokens = maxTokens || 4096;
    this.generationConfig = generationConfig || {
      temperature: 0.8,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };
    this._baseUrl = '';
    this._apiKey = apiKey;
    this.initClient(apiKey, baseUrl);
  }

  private initClient(apiKey: string, baseUrl?: string) {
    // 使用统一的 SDK provider 映射
    const sdkProvider = getSDKProvider(this.provider);

    // 解析 baseUrl：如果用户没有提供自定义 URL，使用 provider 的默认 URL
    let resolvedBaseUrl = baseUrl;
    if (!resolvedBaseUrl?.trim()) {
      const providerConfig = defaultProviders.find(p => p.provider === this.provider);
      resolvedBaseUrl = providerConfig?.baseUrl || '';
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
      maxTokens: this.maxTokens,
      contextWindowSafe: true,
    };

    // Set API key (not needed for ollama)
    if (sdkProvider !== 'ollama' && apiKey) {
      config.apiKey = apiKey;
    }

    // Set model if provided
    if (this.model) {
      config.model = this.model;
    }


    this.client = new AIClient(config);

    // 重要：SDK 的 baseUrl 参数对大多数 provider 不生效，需要直接设置 adapter 的 baseUrl
    if (this.client && resolvedBaseUrl) {
      (this.client as any).adapter.baseUrl = resolvedBaseUrl.replace(/\/$/, '');
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
    generationConfig?: { temperature: number; topP: number; frequencyPenalty: number; presencePenalty: number }
  ) {
    this.model = model || this.model;
    this.maxTokens = maxTokens || this.maxTokens;
    if (generationConfig) {
      this.generationConfig = generationConfig;
    }
    this._apiKey = apiKey;
    this.initClient(apiKey, baseUrl);
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Client not initialized' };
    }

    try {
      await this.client.chat([{ role: 'user', content: 'Hi' }], { maxTokens: 5 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
      };
    }
  }

  /**
   * Continue writing content
   */
  async continueWriting(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish'
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(context, mode);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: this.maxTokens,
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
    };
  }

  /**
   * Stream continue writing
   */
  continueWritingStream(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish',
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void {
    if (!this.client) {
      onError('Client not initialized');
      return;
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(context, mode);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    // Start streaming
    this.streamChat(messages, onChunk, onComplete, onError);
  }

  /**
   * Polish text
   */
  async polishText(
    context: ProjectContext,
    selectedText?: string
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildPolishPrompt(context, selectedText);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: this.maxTokens,
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
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
    onError: (error: string) => void
  ): void {
    if (!this.client) {
      onError('Client not initialized');
      return;
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildPolishPrompt(context, selectedText);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    this.streamChat(messages, onChunk, onComplete, onError);
  }

  /**
   * Analyze chapter
   */
  async analyzeChapter(context: ProjectContext): Promise<AISuggestion[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildAnalysisPrompt(context);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    try {
      const response = await this.client.chat(messages, {
        maxTokens: 2048,
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
      } as any);

      const content = typeof response === 'string' ? response : JSON.stringify(response);
      
      // Try to parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
          return parsed.suggestions.map((s: any, index: number) => ({
            id: `suggestion-${index}`,
            type: this.mapSuggestionType(s.type),
            severity: this.mapSeverity(s.severity),
            title: s.title || 'Suggestion',
            description: s.description || '',
            suggestion: s.suggestion,
          }));
        }
      }
      
      return [];
    } catch (error) {
      console.error('Failed to analyze chapter:', error);
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
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildMemoryContextPrompt(context);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    try {
      const response = await this.client.chat(messages, {
        maxTokens: 512,
        temperature: this.generationConfig.temperature,
        topP: this.generationConfig.topP,
        frequencyPenalty: this.generationConfig.frequencyPenalty,
        presencePenalty: this.generationConfig.presencePenalty,
      } as any);

      const content = typeof response === 'string' ? response : JSON.stringify(response);
      
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          charactersInScene: parsed.charactersInScene || [],
          location: parsed.location || '未明确',
          time: parsed.time || '未明确',
          mood: parsed.mood || '未明确',
        };
      }
      
      return {
        charactersInScene: [],
        location: '未明确',
        time: '未明确',
        mood: '未明确',
      };
    } catch (error) {
      console.error('Failed to get memory context:', error);
      return {
        charactersInScene: [],
        location: '未明确',
        time: '未明确',
        mood: '未明确',
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
    }
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildDialoguePrompt(context, options);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: 1024,
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
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
    }
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildPlotPrompt(context, options);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: 2048,
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
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
    }
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildScenePrompt(context, options);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: 512,
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
    };
  }

  /**
   * Generate character description
   */
  async generateCharacterDescription(
    context: ProjectContext,
    options?: {
      characterName?: string;
      descriptionType?: 'appearance' | 'action' | 'psychology' | 'dialogue';
    }
  ): Promise<AIWriteResult> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const { systemPrompt, userPrompt } = PromptBuilder.buildCharacterDescriptionPrompt(context, options);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const response = await this.client.chat(messages, {
      maxTokens: 512,
      temperature: this.generationConfig.temperature,
      topP: this.generationConfig.topP,
      frequencyPenalty: this.generationConfig.frequencyPenalty,
      presencePenalty: this.generationConfig.presencePenalty,
    } as any);

    return {
      content: typeof response === 'string' ? response : JSON.stringify(response),
    };
  }

  /**
   * Stream chat with callbacks
   */
  private async streamChat(
    messages: Message[],
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!this.client) {
      onError('Client not initialized');
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
      onError(error instanceof Error ? error.message : 'Stream failed');
    }
  }

  /**
   * Generate outline with streaming
   * This method runs in Renderer process, so requests are visible in DevTools
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
    }
  ): void {
    if (!this.client) {
      onError('Client not initialized');
      return;
    }

    const maxTokens = config?.maxTokens || 4096;
    const temperature = config?.temperature ?? 0.8;
    const topP = config?.topP ?? 0.9;

    const messages = [
      { role: 'system' as const, content: OUTLINE_SYSTEM_PROMPT },
      { role: 'user' as const, content: `用户的创意种子：${prompt}` },
    ];

    this.generateOutlineStreamInternal(
      messages,
      { maxTokens, temperature, topP },
      onChunk,
      onDone,
      onComplete,
      onError
    );
  }

  private async generateOutlineStreamInternal(
    messages: Message[],
    options: { maxTokens: number; temperature: number; topP: number },
    onChunk: (data: { content: string; fullContent: string }) => void,
    onDone: () => void,
    onComplete: (result: any) => void,
    onError: (error: string) => void
  ): Promise<void> {
    if (!this.client) {
      onError('Client not initialized');
      return;
    }

    let fullContent = '';

    try {
      const stream = this.client.stream(messages, {
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        // Note: frequencyPenalty and presencePenalty are not supported by all providers
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

      // Parse JSON result
      try {
        // 清理 SSE 的 [DONE] 标记和空白字符
        const cleanedContent = fullContent.replace(/\[DONE\]\s*$/g, '').trim();
        
        // 尝试多种方式解析 JSON
        let jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          onComplete(result);
        } else {
          // 如果没有找到 JSON 格式，尝试清理常见的格式问题
          // 例如：移除最后一个可能的尾随逗号或多余的闭合括号
          const cleanedForJson = cleanedContent
            .replace(/,\s*\]/g, ']')  // 移除数组末尾的逗号
            .replace(/,\s*\}/g, '}'); // 移除对象末尾的逗号
          
          jsonMatch = cleanedForJson.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            onComplete(result);
          } else {
            onError('Failed to parse AI response as JSON');
          }
        }
      } catch {
        onError('Failed to parse AI response as JSON');
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Stream failed');
    }
  }

  /**
   * Map suggestion type from Chinese to English
   */
  private mapSuggestionType(type: string): AISuggestion['type'] {
    const typeMap: Record<string, AISuggestion['type']> = {
      '人物一致性': 'characterConsistency',
      '伏笔管理': 'foreshadowManagement',
      '伏笔提醒': 'foreshadowReminder',
      '逻辑自洽': 'logicConsistency',
      '逻辑漏洞': 'logicGap',
      '节奏把控': 'paceSuggestion',
      '对话质量': 'dialogueQuality',
      '描写密度': 'descriptionDensity',
      '情感曲线': 'emotionCurve',
      '风格一致': 'styleConsistency',
    };
    return typeMap[type] || 'logicGap';
  }

  /**
   * Map severity from string to enum
   */
  private mapSeverity(severity: string): AISuggestion['severity'] {
    const severityMap: Record<string, AISuggestion['severity']> = {
      'error': 'error',
      '警告': 'warning',
      'warning': 'warning',
      'info': 'info',
      '提示': 'info',
    };
    return severityMap[severity] || 'info';
  }
}
