import type { ProviderType } from '@/config/ai-providers';
import { BaseAIService, PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from '../base.service';

interface MoonshotMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MoonshotResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * Moonshot (月之暗面) API 服务实现
 */
export class MoonshotService extends BaseAIService {
  readonly provider: ProviderType = 'moonshot';
  readonly defaultModel = 'moonshot-v1-8k';

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    super(apiKey, baseUrl || 'https://api.moonshot.cn/v1', model);
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { data: Array<{ id: string; object: string }> };
      const models = data.data
        .filter(m => m.id.includes('moonshot'))
        .map(m => m.id);

      return {
        success: true,
        models: models.length > 0 ? models : ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * 发送聊天请求
   */
  private async chat(messages: MoonshotMessage[], temperature: number = 0.8): Promise<AIWriteResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as MoonshotResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('No response from AI');
    }

    return {
      content: choice.message.content,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
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
    
    const messages: MoonshotMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return this.chat(messages, mode === 'polish' ? 0.7 : 0.8);
  }

  /**
   * 润色文本
   */
  async polishText(context: ProjectContext, selectedText?: string): Promise<AIWriteResult> {
    const contentToPolish = selectedText || context.currentChapterContent;
    
    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = `# 请润色以下内容：

${contentToPolish}

直接输出润色后的内容。`;

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.7);
  }

  /**
   * 分析章节
   */
  async analyzeChapter(context: ProjectContext): Promise<AISuggestion[]> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildAnalysisPrompt(context);

    try {
      const result = await this.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], 0.5);

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
      const result = await this.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], 0.3);

      const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/) ||
                        result.content.match(/```\n?([\s\S]*?)\n?```/) ||
                        result.content.match(/(\{[\s\S]*\})/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        
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
    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(context, mode);
    
    const messages: MoonshotMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    this.streamChat(messages, mode === 'polish' ? 0.7 : 0.8, onChunk, onComplete, onError);
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
    
    const systemPrompt = PromptBuilder.buildSystemPrompt();
    const userPrompt = `# 请润色以下内容：

${contentToPolish}

直接输出润色后的内容。`;

    this.streamChat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.7, onChunk, onComplete, onError);
  }

  /**
   * 流式聊天请求
   */
  private streamChat(
    messages: MoonshotMessage[],
    temperature: number,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void {
    const controller = new AbortController();

    fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: 2000,
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
            if (!trimmed || trimmed === 'data: [DONE]') continue;

            const data = trimmed.replace(/^data: /, '');
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
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
