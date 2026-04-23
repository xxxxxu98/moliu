/**
 * AI Provider Service
 * 使用 multi-ai-sdk 统一处理 AI API 调用
 */

import {
  AIClient,
  type ProviderName,
} from 'multi-ai-sdk';

// 支持的提供商类型（与 multi-ai-sdk 保持一致）
export type AIProviderType = 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'deepseek' | 'ollama' | 'groq' | 'qwen' | 'mistral' | 'cohere' | 'nvidia' | 'perplexity' | 'together' | 'cerebras' | 'azure' | 'grok' | 'fireworks';

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface TestResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  models?: string[];
  responseTime?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

// Default API endpoints for each provider
const DEFAULT_ENDPOINTS: Record<AIProviderType, string> = {
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
};

/**
 * Get the effective base URL for a provider
 */
export function getBaseUrl(provider: string, customUrl?: string): string {
  return customUrl?.trim() || DEFAULT_ENDPOINTS[provider as AIProviderType] || '';
}

/**
 * Get default models for a provider
 */
export function getDefaultModels(provider: AIProviderType): string[] {
  switch (provider) {
    case 'openai':
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
    case 'anthropic':
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229'];
    case 'gemini':
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    case 'moonshot':
      return ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'];
    case 'deepseek':
      return ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'];
    case 'ollama':
      return ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'phi3'];
    case 'groq':
      return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];
    case 'qwen':
      return ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-coder-plus'];
    case 'mistral':
      return ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'];
    case 'cohere':
      return ['command-r-plus-08-2024', 'command-r-08-2024', 'command-light'];
    case 'nvidia':
      return ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'];
    case 'perplexity':
      return ['sonar', 'sonar-pro', 'sonar-reasoning'];
    case 'together':
      return ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mistral-7B-Instruct-v0.3'];
    case 'cerebras':
      return ['llama3.3-70b', 'llama3.1-8b-instant'];
    case 'grok':
      return ['grok-2-latest', 'grok-2-mini'];
    case 'fireworks':
      return ['accounts/fireworks/models/llama-v3-70b-instruct', 'accounts/fireworks/models/llama-v3-8b-instruct'];
    default:
      return [];
  }
}

// System prompt for outline generation
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

// 获取模型的默认选择
function getModelForProvider(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'moonshot':
      return 'moonshot-v1-128k';
    case 'deepseek':
      return 'deepseek-chat';
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'qwen':
      return 'qwen-plus';
    case 'mistral':
      return 'mistral-large-latest';
    case 'ollama':
      return 'llama3';
    case 'groq':
      return 'llama-3.3-70b-versatile';
    case 'cohere':
      return 'command-r-plus-08-2024';
    case 'nvidia':
      return 'meta/llama-3.1-70b-instruct';
    case 'perplexity':
      return 'sonar';
    case 'together':
      return 'accounts/fireworks/models/llama-v3-70b-instruct';
    case 'cerebras':
      return 'llama3.3-70b';
    case 'grok':
      return 'grok-2-latest';
    case 'fireworks':
      return 'accounts/fireworks/models/llama-v3-70b-instruct';
    case 'azure':
      return 'gpt-4o';
    case 'openai':
    default:
      return 'gpt-4o';
  }
}

/**
 * Stream outline generation using multi-ai-sdk
 */
export async function generateOutlineStream(
  event: Electron.IpcMainInvokeEvent,
  prompt: string,
  provider: string,
  config: { apiKey: string; baseUrl?: string }
): Promise<void> {
  const baseUrl = getBaseUrl(provider, config.baseUrl);
  const model = getModelForProvider(provider);

  try {
    // Ollama 不需要真实的 API key
    const apiKey = provider === 'ollama' ? 'dummy' : config.apiKey;

    const client = new AIClient({
      provider: provider as ProviderName,
      apiKey,
      baseUrl: baseUrl || undefined,
      timeout: 60000,
      maxRetries: 2,
    });

    // 构建消息
    const messages = [
      { role: 'system' as const, content: OUTLINE_SYSTEM_PROMPT },
      { role: 'user' as const, content: `用户的创意种子：${prompt}` },
    ];

    // 使用流式 API
    const stream = client.stream(messages, {
      model,
      maxTokens: 4096,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      if (chunk.content) {
        fullContent += chunk.content;
        event.sender.send('ai:outline-chunk', { content: chunk.content, fullContent });
      }
      if (chunk.done) {
        break;
      }
    }

    event.sender.send('ai:outline-done', {});

    // 解析 JSON 结果
    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        event.sender.send('ai:outline-complete', { result });
      } else {
        event.sender.send('ai:outline-error', { error: 'Failed to parse AI response' });
      }
    } catch (e) {
      event.sender.send('ai:outline-error', { error: 'Failed to parse AI response as JSON' });
    }

  } catch (error) {
    event.sender.send('ai:outline-error', {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
