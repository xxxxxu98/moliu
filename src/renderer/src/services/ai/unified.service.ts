/**
 * Unified AI Service using multi-ai-sdk
 * Provides a unified interface for multiple AI providers
 */

import { AIClient, type Message } from 'multi-ai-sdk';
import { PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from './base.service';

/**
 * Provider name mapping from our config to multi-ai-sdk
 */
const PROVIDER_MAP: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'gemini',
  moonshot: 'moonshot',
  deepseek: 'deepseek',
  ollama: 'ollama',
  zhipu: 'qwen', // Zhipu uses Qwen-compatible API
};

/**
 * Unified AI Service
 * Uses multi-ai-sdk to provide consistent API across all providers
 */
export class UnifiedAIService {
  private client: AIClient | null = null;
  private provider: string;
  private model: string;
  private maxTokens: number;

  constructor(provider: string, apiKey: string, baseUrl?: string, model?: string, maxTokens?: number) {
    this.provider = provider;
    this.model = model || '';
    this.maxTokens = maxTokens || 4096;
    this.initClient(apiKey, baseUrl);
  }

  private initClient(apiKey: string, baseUrl?: string) {
    const sdkProvider = PROVIDER_MAP[this.provider];
    if (!sdkProvider) {
      throw new Error(`Unsupported provider: ${this.provider}`);
    }

    // Create client with explicit provider
    const config: {
      provider: 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'deepseek' | 'ollama' | 'qwen';
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      maxTokens?: number;
      contextWindowSafe?: boolean;
    } = {
      provider: sdkProvider as 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'deepseek' | 'ollama' | 'qwen',
      maxTokens: this.maxTokens,
      contextWindowSafe: true, // Enable context window protection
    };

    // Set API key (not needed for ollama)
    if (sdkProvider !== 'ollama' && apiKey) {
      config.apiKey = apiKey;
    }

    // Set custom base URL if provided
    if (baseUrl && baseUrl.trim()) {
      config.baseUrl = baseUrl;
    }

    // Set model if provided
    if (this.model) {
      config.model = this.model;
    }

    this.client = new AIClient(config);
  }

  /**
   * Update service configuration
   */
  updateConfig(apiKey: string, baseUrl?: string, model?: string, maxTokens?: number) {
    this.model = model || this.model;
    this.maxTokens = maxTokens || this.maxTokens;
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
      const response = await this.client.chat([
        { role: 'user', content: 'Hi' },
      ]);
      
      if (response && typeof response === 'string') {
        return { success: true };
      }
      return { success: false, error: 'Invalid response format' };
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
    });

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
    });

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
      });

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
      });

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
    });

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
    });

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
    });

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
    });

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
      });

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
