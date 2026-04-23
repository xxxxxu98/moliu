/**
 * AI Client Service
 * 使用 multi-ai-sdk 统一处理 AI API 调用
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

// multi-ai-sdk 支持的提供商类型
export type SDKProviderName = ProviderName;

// 支持的提供商映射
export const SUPPORTED_PROVIDERS: Record<string, { name: string; defaultModel: string }> = {
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o' },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-3-5-sonnet-20241022' },
  gemini: { name: 'Google Gemini', defaultModel: 'gemini-2.0-flash' },
  moonshot: { name: 'Moonshot (Kimi)', defaultModel: 'moonshot-v1-8k' },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat' },
  ollama: { name: 'Ollama (本地)', defaultModel: 'llama3' },
  groq: { name: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  qwen: { name: '通义千问', defaultModel: 'qwen-plus' },
  mistral: { name: 'Mistral', defaultModel: 'mistral-large-latest' },
  cohere: { name: 'Cohere', defaultModel: 'command-r-plus-08-2024' },
  nvidia: { name: 'NVIDIA NIM', defaultModel: 'meta/llama-3.1-70b-instruct' },
  perplexity: { name: 'Perplexity', defaultModel: 'sonar' },
  together: { name: 'Together AI', defaultModel: 'accounts/fireworks/models/llama-v3-70b-instruct' },
  cerebras: { name: 'Cerebras', defaultModel: 'llama3.3-70b' },
  azure: { name: 'Azure OpenAI', defaultModel: 'gpt-4o' },
  grok: { name: 'xAI Grok', defaultModel: 'grok-2-latest' },
  fireworks: { name: 'Fireworks AI', defaultModel: 'accounts/fireworks/models/llama-v3-70b-instruct' },
};

// 检查提供商是否被支持
export function isProviderSupported(provider: string): provider is SDKProviderName {
  return provider in SUPPORTED_PROVIDERS;
}

// 测试连接结果
export interface TestConnectionResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  models?: string[];
  responseTime?: number;
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
    timeout: options?.timeout || 10000,
    maxRetries: options?.maxRetries || 3,
    baseUrl: options?.baseUrl,
    model: options?.model,
  });
}

// 获取提供商的默认基础 URL
export function getDefaultBaseUrl(provider: string): string {
  const baseUrls: Record<string, string> = {
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
  return baseUrls[provider] || '';
}

// 获取提供商的默认模型
export function getDefaultModel(provider: string): string {
  return SUPPORTED_PROVIDERS[provider]?.defaultModel || 'gpt-4o-mini';
}

// 获取提供商的默认模型列表
export function getDefaultModels(provider: SDKProviderName): string[] {
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

/**
 * 测试连接 - 使用 multi-ai-sdk
 */
export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<TestConnectionResult> {
  const startTime = Date.now();

  // 检查是否支持该提供商
  if (!isProviderSupported(provider)) {
    return {
      success: false,
      error: `Unsupported provider: ${provider}`,
      errorCode: 'UNSUPPORTED_PROVIDER',
      responseTime: Date.now() - startTime,
    };
  }

  const targetBaseUrl = baseUrl?.trim() || getDefaultBaseUrl(provider);

  if (!targetBaseUrl && provider !== 'ollama') {
    return {
      success: false,
      error: 'No API endpoint configured',
      errorCode: 'NO_ENDPOINT',
      responseTime: Date.now() - startTime,
    };
  }

  try {
    // Ollama 不需要 API key
    const config: AIClientOptions = {
      provider: provider as SDKProviderName,
      apiKey: provider === 'ollama' ? 'dummy' : apiKey,
      baseUrl: targetBaseUrl || undefined,
      timeout: provider === 'ollama' ? 5000 : 10000,
      maxRetries: 0, // 测试连接不需要重试
    };

    const client = new AIClient(config);

    // 发送一个简单的测试请求
    const response = await client.chat(
      [{ role: 'user', content: 'Hi' }],
      { maxTokens: 5 }
    );

    return {
      success: true,
      models: getDefaultModels(provider as SDKProviderName),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    const errorCode = error instanceof AIError ? error.code : undefined;
    const errorStatus = error instanceof AIError ? error.status : undefined;

    // 根据错误类型设置错误码
    let code = 'UNKNOWN';
    if (errorStatus === 401 || errorCode === 'invalid_api_key') {
      code = 'INVALID_API_KEY';
    } else if (errorStatus === 403 || errorCode === 'insufficient_permissions') {
      code = 'PERMISSION_DENIED';
    } else if (errorStatus === 429 || errorCode === 'rate_limit_exceeded') {
      code = 'RATE_LIMITED';
    } else if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        code = 'TIMEOUT';
      } else if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        code = 'NETWORK_ERROR';
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
      errorCode: code,
      responseTime: Date.now() - startTime,
    };
  }
}

// 流式生成回调类型
export type StreamCallback = (chunk: StreamChunk) => void;

/**
 * 带流式输出的聊天
 */
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

/**
 * 同步聊天（等待完整响应）
 */
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

/**
 * JSON 响应（自动解析 JSON）
 */
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
