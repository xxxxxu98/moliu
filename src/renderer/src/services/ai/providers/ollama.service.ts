import type { ProviderType } from '@/config/ai-providers';
import { BaseAIService, PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from '../base.service';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

/**
 * Ollama 本地模型服务实现
 */
export class OllamaService extends BaseAIService {
  readonly provider: ProviderType = 'ollama';
  readonly defaultModel = 'llama3';

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    // Ollama 不需要 API Key，但为了接口一致性保留此参数
    super(apiKey, baseUrl || 'http://localhost:11434/v1', model);
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      // 首先尝试获取模型列表
      const baseUrl = this.baseUrl.replace('/v1', '');
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
        };
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      const models = data.models.map(m => m.name);

      return {
        success: true,
        models: models.length > 0 ? models : [this.defaultModel],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed. Make sure Ollama is running.',
      };
    }
  }

  /**
   * 发送聊天请求
   */
  private async chat(messages: OllamaMessage[], temperature: number = 0.8): Promise<AIWriteResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('No response from AI');
    }

    return {
      content: choice.message.content,
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
    
    const messages: OllamaMessage[] = [
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
    
    const messages: OllamaMessage[] = [
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
    messages: OllamaMessage[],
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
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        stream: true,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
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

  /**
   * 润色文本（使用专用润色提示词）
   */
  async polishWithPrompt(
    context: ProjectContext,
    selectedText?: string
  ): Promise<AIWriteResult> {
    const { systemPrompt, userPrompt } = PromptBuilder.buildPolishPrompt(context, selectedText);

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.7);
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

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.8);
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

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.7);
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

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.75);
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

    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], 0.75);
  }
}

