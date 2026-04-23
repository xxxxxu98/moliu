/**
 * AI Client Factory
 * 基于 multi-ai-sdk 的统一 AI 客户端创建模块
 */

import {
  AIClient,
  createClient,
  type AIClientOptions,
  type ProviderName,
  type Message,
  type CompletionOptions,
  type StreamChunk,
  type AbortableStream,
  AIError,
} from 'multi-ai-sdk';

// 支持的提供商映射
export const SUPPORTED_PROVIDERS: Record<string, { name: string; defaultModel: string }> = {
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o' },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-3-5-sonnet-20241022' },
  google: { name: 'Google Gemini', defaultModel: 'gemini-2.0-flash' },
  moonshot: { name: 'Moonshot (Kimi)', defaultModel: 'moonshot-v1-8k' },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat' },
  ollama: { name: 'Ollama (本地)', defaultModel: 'llama3' },
  groq: { name: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  gemini: { name: 'Google Gemini', defaultModel: 'gemini-2.0-flash' },
  qwen: { name: '通义千问', defaultModel: 'qwen-plus' },
  mistral: { name: 'Mistral', defaultModel: 'mistral-large-latest' },
  cohere: { name: 'Cohere', defaultModel: 'command-r-plus-08-2024' },
  nvidia: { name: 'NVIDIA NIM', defaultModel: 'meta/llama-3.1-70b-instruct' },
  perplexity: { name: 'Perplexity', defaultModel: 'sonar' },
  fireworks: { name: 'Fireworks AI', defaultModel: 'accounts/fireworks/models/llama-v3-70b-instruct' },
  together: { name: 'Together AI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  cerebras: { name: 'Cerebras', defaultModel: 'llama3.3-70b' },
  azure: { name: 'Azure OpenAI', defaultModel: 'gpt-4o' },
  grok: { name: 'xAI Grok', defaultModel: 'grok-2-latest' },
};

// multi-ai-sdk 的 ProviderName 类型
export type SDKProviderName = ProviderName;

// 检查提供商是否被支持
export function isProviderSupported(provider: string): provider is SDKProviderName {
  return provider in SUPPORTED_PROVIDERS;
}

// 创建 AI 客户端
export function createAIClient(
  provider: SDKProviderName,
  apiKey: string,
  options?: {
    model?: string;
    baseUrl?: string;
    timeout?: number;
    maxRetries?: number;
  }
): AIClient {
  return createClient(provider, apiKey, {
    timeout: options?.timeout || 60000,
    maxRetries: options?.maxRetries || 3,
    baseUrl: options?.baseUrl,
    model: options?.model,
  });
}

// 测试连接结果
export interface TestConnectionResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  models?: string[];
  responseTime?: number;
}

// 测试连接
export async function testConnection(
  provider: SDKProviderName,
  apiKey: string,
  baseUrl?: string
): Promise<TestConnectionResult> {
  const startTime = Date.now();

  try {
    const client = createAIClient(provider, apiKey, { baseUrl });

    // 尝试发送一个简单的测试请求
    const response = await client.chat(
      [{ role: 'user', content: 'Hi' }],
      { maxTokens: 5 }
    );

    return {
      success: true,
      responseTime: Date.now() - startTime,
      models: getDefaultModels(provider),
    };
  } catch (error) {
    if (error instanceof AIError) {
      return {
        success: false,
        error: error.message,
        errorCode: String(error.status || error.code || 'UNKNOWN'),
        responseTime: Date.now() - startTime,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'UNKNOWN',
      responseTime: Date.now() - startTime,
    };
  }
}

// 获取提供商的默认模型列表
function getDefaultModels(provider: SDKProviderName): string[] {
  switch (provider) {
    case 'openai':
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
    case 'anthropic':
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229'];
    case 'google':
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
    default:
      return [];
  }
}

// 流式生成回调类型
export type StreamCallback = (chunk: StreamChunk) => void;

// 带流式输出的聊天
export async function chatWithStream(
  provider: SDKProviderName,
  apiKey: string,
  messages: Message[],
  options: CompletionOptions & { baseUrl?: string; systemPrompt?: string },
  onChunk: StreamCallback,
  signal?: AbortSignal
): Promise<string> {
  const client = createAIClient(provider, apiKey, { baseUrl: options.baseUrl });

  // 如果有系统提示，添加到消息开头
  const allMessages = options.systemPrompt
    ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
    : messages;

  const stream = client.stream(allMessages, {
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
  });

  let fullContent = '';

  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        stream.cancel();
        break;
      }
      onChunk(chunk);
      fullContent += chunk.content;
      if (chunk.done) {
        break;
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      stream.cancel();
      throw error;
    }
    throw error;
  }

  return fullContent;
}

// 同步聊天（等待完整响应）
export async function chat(
  provider: SDKProviderName,
  apiKey: string,
  messages: Message[],
  options: CompletionOptions & { baseUrl?: string; systemPrompt?: string }
): Promise<string> {
  const client = createAIClient(provider, apiKey, { baseUrl: options.baseUrl });

  // 如果有系统提示，添加到消息开头
  const allMessages = options.systemPrompt
    ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
    : messages;

  return await client.chat(allMessages, {
    model: options.model,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    topP: options.topP,
  });
}

// JSON 响应（自动解析 JSON）
export async function chatJSON<T>(
  provider: SDKProviderName,
  apiKey: string,
  messages: Message[],
  options: CompletionOptions & { baseUrl?: string; systemPrompt?: string }
): Promise<T> {
  const client = createAIClient(provider, apiKey, { baseUrl: options.baseUrl });

  const allMessages = options.systemPrompt
    ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
    : messages;

  return await client.askJSON<T>(
    allMessages.map(m => m.content).join('\n'),
    {
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      systemPrompt: options.systemPrompt,
    }
  );
}

// 大纲生成系统提示词
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

// 大纲生成回调类型
export type OutlineChunkCallback = (data: { content: string; fullContent: string }) => void;
export type OutlineDoneCallback = () => void;
export type OutlineCompleteCallback = (data: { result: unknown }) => void;
export type OutlineErrorCallback = (data: { error: string }) => void;

/**
 * 生成故事大纲（流式）
 */
export async function generateOutline(
  provider: SDKProviderName,
  apiKey: string,
  prompt: string,
  options: { baseUrl?: string; model?: string },
  callbacks: {
    onChunk: OutlineChunkCallback;
    onDone: OutlineDoneCallback;
    onComplete: OutlineCompleteCallback;
    onError: OutlineErrorCallback;
  },
  signal?: AbortSignal
): Promise<void> {
  try {
    const messages: Message[] = [
      { role: 'user', content: `用户的创意种子：${prompt}` }
    ];

    const stream = await chatWithStream(
      provider,
      apiKey,
      messages,
      {
        model: options.model,
        systemPrompt: OUTLINE_SYSTEM_PROMPT,
        temperature: 0.8,
        maxTokens: 4096,
        baseUrl: options.baseUrl,
      },
      (chunk) => {
        callbacks.onChunk({
          content: chunk.content,
          fullContent: '', // 由调用方累积
        });
      },
      signal
    );

    callbacks.onDone();

    // 尝试解析 JSON
    try {
      const jsonMatch = stream.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        callbacks.onComplete({ result });
      } else {
        callbacks.onError({ error: 'Failed to parse AI response' });
      }
    } catch (e) {
      callbacks.onError({ error: 'Failed to parse AI response as JSON' });
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      callbacks.onError({ error: 'Request cancelled' });
    } else {
      callbacks.onError({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }
}
