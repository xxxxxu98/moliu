import type { ProviderType } from '@/config/ai-providers';
import { BaseAIService, PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from '../base.service';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text?: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic Claude API 服务实现
 */
export class AnthropicService extends BaseAIService {
  readonly provider: ProviderType = 'anthropic';
  readonly defaultModel = 'claude-3-5-sonnet-20241022';

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    super(apiKey, baseUrl || 'https://api.anthropic.com', model);
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      // Anthropic 使用不同的 API 格式，这里简单测试
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }

      // Anthropic 不提供模型列表 API，返回支持的模型
      return {
        success: true,
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * 发送消息请求
   */
  private async sendMessage(
    systemPrompt: string,
    userPrompt: string,
    temperature: number = 0.8
  ): Promise<AIWriteResult> {
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as AnthropicResponse;
    const content = data.content[0];

    if (!content || content.type !== 'text') {
      throw new Error('No response from AI');
    }

    return {
      content: content.text || '',
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      },
    };
  }

  /**
   * 续写内容
   */
  async continueWriting(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish'
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(context, mode);
    // Anthropic 的 system prompt 需要特殊处理
    const combinedSystem = systemPrompt + '\n\n请直接输出内容，不要添加任何说明。';
    return this.sendMessage(combinedSystem, userPrompt, mode === 'polish' ? 0.7 : 0.8);
  }

  /**
   * 润色文本
   */
  async polishText(context: ProjectContext, selectedText?: string): Promise<AIWriteResult> {
    const contentToPolish = selectedText || context.currentChapterContent;
    
    const systemPrompt = `你是一位专业的小说编辑，擅长润色和优化文本。
请润色以下内容，改善文笔和表达，保持原文风格。
直接输出润色后的内容，不要添加任何说明。`;

    const userPrompt = `请润色以下内容：

${contentToPolish}`;

    return this.sendMessage(systemPrompt, userPrompt, 0.7);
  }

  /**
   * 分析章节
   */
  async analyzeChapter(context: ProjectContext): Promise<AISuggestion[]> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildAnalysisPrompt(context);

    try {
      const result = await this.sendMessage(systemPrompt, userPrompt, 0.5);

      // 解析 JSON 响应
      const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/) ||
                        result.content.match(/```\n?([\s\S]*?)\n?```/) ||
                        result.content.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return parsed.suggestions || [];
      }

      return [];
    } catch (error) {
      console.error('Failed to analyze chapter:', error);
      return [];
    }
  }

  /**
   * 获取记忆上下文
   */
  async getMemoryContext(context: ProjectContext): Promise<{
    charactersInScene: import('@/types/project').Character[];
    location: string;
    time: string;
    mood: string;
  }> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildMemoryContextPrompt(context);

    try {
      const result = await this.sendMessage(systemPrompt, userPrompt, 0.3);

      // 解析 JSON 响应
      const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/) ||
                        result.content.match(/```\n?([\s\S]*?)\n?```/) ||
                        result.content.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        
        // 匹配角色名
        const charactersInScene = context.project.characters.filter(c =>
          parsed.charactersInScene?.some((name: string) => 
            c.name.includes(name) || name.includes(c.name)
          )
        );

        return {
          charactersInScene,
          location: parsed.location || '未知地点',
          time: parsed.time || '未知时间',
          mood: parsed.mood || '未知氛围',
        };
      }

      return {
        charactersInScene: [],
        location: '未知地点',
        time: '未知时间',
        mood: '未知氛围',
      };
    } catch (error) {
      console.error('Failed to get memory context:', error);
      return {
        charactersInScene: [],
        location: '未知地点',
        time: '未知时间',
        mood: '未知氛围',
      };
    }
  }

  /**
   * 流式续写
   */
  continueWritingStream(
    context: ProjectContext,
    mode: 'smartContinue' | 'polish',
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void {
    // Anthropic 目前不支持流式 API，需要使用 SSE 方式
    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(context, mode);
    const combinedSystem = systemPrompt + '\n\n请直接输出内容。';

    this.streamMessage(combinedSystem, userPrompt, mode === 'polish' ? 0.7 : 0.8, onChunk, onComplete, onError);
  }

  /**
   * 流式润色
   */
  polishTextStream(
    context: ProjectContext,
    selectedText: string | undefined,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void {
    const contentToPolish = selectedText || context.currentChapterContent;
    
    const systemPrompt = `你是一位专业的小说编辑，擅长润色和优化文本。
请润色以下内容，直接输出润色后的内容。`;

    const userPrompt = `请润色以下内容：

${contentToPolish}`;

    this.streamMessage(systemPrompt, userPrompt, 0.7, onChunk, onComplete, onError);
  }

  /**
   * 润色文本（使用专用润色提示词）
   */
  async polishWithPrompt(
    context: ProjectContext,
    selectedText?: string
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildPolishPrompt(context, selectedText);
    const combinedSystem = systemPrompt + '\n\n请直接输出润色后的内容，不要添加任何说明。';
    return this.sendMessage(combinedSystem, userPrompt, 0.7);
  }

  /**
   * 生成对话
   */
  async generateDialogue(
    context: ProjectContext,
    options?: {
      speaker?: string;
      situation?: string;
      emotion?: string;
    }
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildDialoguePrompt(context, options || {});
    const combinedSystem = systemPrompt + '\n\n请直接输出对话内容。';
    return this.sendMessage(combinedSystem, userPrompt, 0.8);
  }

  /**
   * 生成情节发展
   */
  async generatePlot(
    context: ProjectContext,
    options?: {
      plotPoint?: string;
      targetChapter?: string;
    }
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildPlotPrompt(context, options || {});
    const combinedSystem = systemPrompt + '\n\n请输出情节发展建议。';
    return this.sendMessage(combinedSystem, userPrompt, 0.7);
  }

  /**
   * 生成场景描写
   */
  async generateScene(
    context: ProjectContext,
    options?: {
      location?: string;
      time?: string;
      mood?: string;
    }
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildScenePrompt(context, options || {});
    const combinedSystem = systemPrompt + '\n\n请直接输出场景描写。';
    return this.sendMessage(combinedSystem, userPrompt, 0.75);
  }

  /**
   * 生成角色描写
   */
  async generateCharacterDescription(
    context: ProjectContext,
    options?: {
      characterName?: string;
      descriptionType?: 'appearance' | 'action' | 'psychology' | 'dialogue';
    }
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildCharacterDescriptionPrompt(context, options || {});
    const combinedSystem = systemPrompt + '\n\n请直接输出角色描写。';
    return this.sendMessage(combinedSystem, userPrompt, 0.75);
  }

  /**
   * 流式消息请求
   */
  private streamMessage(
    systemPrompt: string,
    userPrompt: string,
    temperature: number,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void {
    const controller = new AbortController();

    fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature,
        max_tokens: 4096,
        stream: true,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === 'content_block_delta') {
                const text = parsed.delta?.text;
                if (text) {
                  onChunk(text);
                }
              } else if (parsed.type === 'message_stop') {
                break;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }

        onComplete();
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          onError(error.message);
        }
      });
  }
}
