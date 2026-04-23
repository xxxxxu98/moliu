import type { ProviderType } from '@/config/ai-providers';
import { BaseAIService, PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from '../base.service';

interface GoogleMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GoogleResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
  promptFeedback?: {
    blockReason: string;
  };
  error?: {
    message: string;
    status: string;
  };
}

/**
 * Google Gemini API 服务实现
 */
export class GoogleService extends BaseAIService {
  readonly provider: ProviderType = 'google';
  readonly defaultModel = 'gemini-1.5-pro';

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    super(apiKey, baseUrl || 'https://generativelanguage.googleapis.com/v1beta', model);
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      const baseUrl = this.baseUrl.replace('/v1beta', '');
      const response = await fetch(`${baseUrl}/models?key=${this.apiKey}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      const models = data.models
        .filter(m => m.name.includes('gemini'))
        .map(m => m.name.replace('models/', ''));

      return {
        success: true,
        models: models.length > 0 ? models : ['gemini-1.5-pro', 'gemini-1.5-flash'],
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
  private async generate(
    systemInstruction: string,
    userPrompt: string,
    temperature: number = 0.8
  ): Promise<AIWriteResult> {
    const response = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as GoogleResponse;
    const candidate = data.candidates?.[0];

    if (!candidate) {
      throw new Error('No response from AI');
    }

    const content = candidate.content.parts[0]?.text || '';

    return {
      content,
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
    return this.generate(systemPrompt, userPrompt, mode === 'polish' ? 0.7 : 0.8);
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

    return this.generate(systemPrompt, userPrompt, 0.7);
  }

  /**
   * 分析章节
   */
  async analyzeChapter(context: ProjectContext): Promise<AISuggestion[]> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildAnalysisPrompt(context);

    try {
      const result = await this.generate(systemPrompt, userPrompt, 0.5);

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
      const result = await this.generate(systemPrompt, userPrompt, 0.3);

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
    this.streamGenerate(systemPrompt, userPrompt, mode === 'polish' ? 0.7 : 0.8, onChunk, onComplete, onError);
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

    this.streamGenerate(systemPrompt, userPrompt, 0.7, onChunk, onComplete, onError);
  }

  /**
   * 流式生成内容
   */
  private streamGenerate(
    systemInstruction: string,
    userPrompt: string,
    temperature: number,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void
  ): void {
    const controller = new AbortController();

    fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature,
            maxOutputTokens: 2000,
          },
        }),
        signal: controller.signal,
      }
    )
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
            if (!trimmed || !trimmed.startsWith('{"candidates')) continue;

            try {
              const parsed = JSON.parse(trimmed);
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                onChunk(text);
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
