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
  zhipu: { name: '智谱 AI (GLM)', defaultModel: 'glm-4-flash' },
};

// 检查提供商是否被支持（包括通过 OpenAI 兼容模式支持的 zhipu）
export function isProviderSupported(provider: string): boolean {
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
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('API key is required');
  }
  if (provider !== 'ollama' && apiKey === 'dummy') {
    throw new Error('Invalid API key for non-Ollama provider');
  }

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
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  };
  return baseUrls[provider] || '';
}

// 获取提供商的默认模型
export function getDefaultModel(provider: string): string {
  return SUPPORTED_PROVIDERS[provider]?.defaultModel || 'gpt-4o-mini';
}

// 获取提供商的默认模型列表
export function getDefaultModels(provider: string): string[] {
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
    case 'zhipu':
      return ['glm-4-plus', 'glm-4-flash', 'glm-4-0520', 'glm-4-airx', 'glm-4-air', 'glm-4-flashx', 'glm-4-flash-plus', 'glm-4', 'glm-3.5-turbo', 'glm-3.5-turbo-250528', 'glm-3.5-turbo-250614'];
    default:
      return [];
  }
}

// 检查提供商是否支持自定义 baseUrl（ollama 和 azure 由 SDK 原生支持）
function supportsCustomBaseUrl(provider: string): boolean {
  const unsupported = ['ollama', 'azure'];
  return !unsupported.includes(provider);
}

/**
 * 使用 fetch 直接测试连接（绕过 multi-ai-sdk 的 baseUrl 限制）
 */
async function testConnectionWithFetch(
  provider: string,
  apiKey: string,
  baseUrl: string,
  timeout: number,
  model: string
): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  const endpoint = `${cleanBaseUrl}/chat/completions`;

  console.log(`[AI-Client-Fetch] Starting connection test`);
  console.log(`[AI-Client-Fetch] Provider: ${provider}`);
  console.log(`[AI-Client-Fetch] API Key: "${apiKey}"`);
  console.log(`[AI-Client-Fetch] Model: "${model}"`);
  console.log(`[AI-Client-Fetch] Base URL: ${cleanBaseUrl}`);
  console.log(`[AI-Client-Fetch] Endpoint: ${endpoint}`);
  console.log(`[AI-Client-Fetch] Timeout: ${timeout}ms`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(`[AI-Client-Fetch] Timeout triggered after ${timeout}ms`);
    controller.abort();
  }, timeout);

  try {
    console.log(`[AI-Client-Fetch] Sending request to ${endpoint}...`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log(`[AI-Client-Fetch] Response received: status=${response.status}`);

    if (response.ok) {
      console.log(`[AI-Client-Fetch] Success! Status: ${response.status}`);
      return {
        success: true,
        models: getDefaultModels(provider),
        responseTime: Date.now() - startTime,
      };
    }

    console.log(`[AI-Client-Fetch] Response not OK, status: ${response.status}`);
    const errorData = await response.json().catch(() => ({}));
    console.log(`[AI-Client-Fetch] Error response:`, errorData);

    return {
      success: false,
      error: errorData.error?.message || `HTTP ${response.status}`,
      errorCode: response.status === 401 ? 'INVALID_API_KEY' : 'UNKNOWN',
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.log(`[AI-Client-Fetch] Exception caught!`);
    console.log(`[AI-Client-Fetch] Error name: ${error instanceof Error ? error.name : 'Unknown'}`);
    console.log(`[AI-Client-Fetch] Error message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log(`[AI-Client-Fetch] Error cause: ${error instanceof Error && error.cause ? JSON.stringify(error.cause) : 'None'}`);

    const errorMessage = error instanceof Error ? error.message : 'Connection failed';

    let code = 'UNKNOWN';
    if (error instanceof Error) {
      if (error.name === 'AbortError' || errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        code = 'TIMEOUT';
        console.log(`[AI-Client-Fetch] Error classified as: TIMEOUT`);
      } else if (errorMessage.includes('fetch') || errorMessage.includes('network') ||
                 errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
        code = 'NETWORK_ERROR';
        console.log(`[AI-Client-Fetch] Error classified as: NETWORK_ERROR`);
      }
    }

    return {
      success: false,
      error: errorMessage,
      errorCode: code,
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * 测试连接
 */
export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string,
  model?: string
): Promise<TestConnectionResult> {
  const startTime = Date.now();
  const targetModel = model?.trim() || getDefaultModel(provider);

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

  const isZhipu = provider === 'zhipu';
  const timeout = isZhipu ? 30000 : (provider === 'ollama' ? 5000 : 10000);

  console.log(`[AI-Client] === Connection Test ===`);
  console.log(`[AI-Client] Provider: ${provider}`);
  console.log(`[AI-Client] API Key: "${apiKey}"`);
  console.log(`[AI-Client] Model: "${targetModel}"`);
  console.log(`[AI-Client] Custom Model provided: "${model || 'none'}"`);
  console.log(`[AI-Client] Custom BaseURL provided: "${baseUrl}"`);
  console.log(`[AI-Client] Default BaseURL: "${getDefaultBaseUrl(provider)}"`);
  console.log(`[AI-Client] Resolved Target BaseURL: "${targetBaseUrl}"`);
  console.log(`[AI-Client] Timeout: ${timeout}ms`);

  // 对于使用自定义 URL 的情况，使用原生 fetch（绕过 SDK 的 baseUrl 问题）
  const shouldUseDirectFetch = Boolean(targetBaseUrl && supportsCustomBaseUrl(provider) && baseUrl?.trim());
  console.log(`[AI-Client] Should use direct fetch: ${shouldUseDirectFetch}`);
  console.log(`[AI-Client] - has targetBaseUrl: ${!!targetBaseUrl}`);
  console.log(`[AI-Client] - supportsCustomBaseUrl: ${supportsCustomBaseUrl(provider)}`);
  console.log(`[AI-Client] - has custom baseUrl: ${!!baseUrl?.trim()}`);

  if (shouldUseDirectFetch) {
    console.log(`[AI-Client] Using direct fetch path`);
    return testConnectionWithFetch(provider, apiKey, targetBaseUrl, timeout, targetModel);
  }

  try {
    const sdkProvider = provider === 'zhipu' ? 'openai' : provider;

    const config: AIClientOptions = {
      provider: sdkProvider as SDKProviderName,
      apiKey: provider === 'ollama' ? 'dummy' : apiKey,
      baseUrl: targetBaseUrl || undefined,
      timeout,
      maxRetries: 0,
    };

    const client = new AIClient(config);

    await client.chat(
      [{ role: 'user', content: 'Hi' }],
      { model: targetModel, maxTokens: 5 }
    );

    console.log(`[AI-Client] ${provider} test SUCCESS!`);

    return {
      success: true,
      models: getDefaultModels(provider as SDKProviderName),
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[AI-Client] SDK call FAILED:`, error);
    console.log(`[AI-Client] Error type: ${error?.constructor?.name || typeof error}`);
    console.log(`[AI-Client] Error message: ${error instanceof Error ? error.message : 'Unknown'}`);

    const errorCode = error instanceof AIError ? error.code : undefined;
    const errorStatus = error instanceof AIError ? error.status : undefined;

    console.log(`[AI-Client] AIError code: ${errorCode}, status: ${errorStatus}`);

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
      } else if (error.message.includes('fetch') || error.message.includes('network') ||
                 error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
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
    allMessages.map(m => `[${m.role}]: ${m.content}`).join('\n'),
    {
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
    }
  );
}
