import type { ProviderType } from '@/config/ai-providers';
import { getModelMaxOutputTokens } from '@/config/ai-providers';
import { BaseAIService, PromptBuilder, type ProjectContext, type AIWriteResult, type AISuggestion } from '../base.service';

interface ZhipuMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZhipuResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 智谱 AI (Zhipu AI) 服务实现
 * 支持 GLM-4.7-Flash 等模型
 * API 文档: https://docs.bigmodel.cn/api-reference/模型api/对话补全
 */
export class ZhipuService extends BaseAIService {
  readonly provider: ProviderType = 'zhipu';
  readonly defaultModel = 'glm-4.7-flash';

  constructor(apiKey: string, baseUrl?: string, model?: string) {
    super(apiKey, baseUrl || 'https://open.bigmodel.cn/api', model);
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    try {
      // 智谱 AI 目前没有公开的 models 列表 API
      // 我们通过发送一个简单的测试请求来验证连接
      const response = await fetch(`${this.baseUrl}/paas/v4/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'user', content: '你好' }
          ],
          max_tokens: 10,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error?.message || `HTTP ${response.status}`,
        };
      }

      // 返回成功，用户需要自己配置模型
      return {
        success: true,
        models: [],
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
  private async chat(messages: ZhipuMessage[], temperature: number = 0.8, thinking: boolean = false): Promise<AIWriteResult> {
    const maxTokens = getModelMaxOutputTokens(this.provider, this.model);

    const response = await fetch(`${this.baseUrl}/paas/v4/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        ...(thinking && {
          thinking: {
            type: 'enabled',
          },
        }),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as ZhipuResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('No response from AI');
    }

    return {
      content: choice.message.content || '',
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

    const messages: ZhipuMessage[] = [
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
    const userPrompt = `# 请润色以下内容，改善文笔和表达：

${contentToPolish}

## 要求
1. 改善句子的流畅度和可读性
2. 消除语法错误和表达不当
3. 丰富修辞手法，增强文字感染力
4. 保持原文的风格和意图
5. 直接输出润色后的内容，不要添加任何说明`;

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
      const result = await this.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], 0.3);

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
    const { systemPrompt, userPrompt } = PromptBuilder.buildContinuePrompt(context, mode);

    const messages: ZhipuMessage[] = [
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
    messages: ZhipuMessage[],
    temperature: number,
    onChunk: (text: string) => void,
    onComplete: () => void,
    onError: (error: string) => void,
    thinking: boolean = false
  ): void {
    const controller = new AbortController();
    const maxTokens = getModelMaxOutputTokens(this.provider, this.model);

    fetch(`${this.baseUrl}/paas/v4/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        ...(thinking && {
          thinking: {
            type: 'enabled',
          },
        }),
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
