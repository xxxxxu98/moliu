/**
 * AI Provider Service
 * Handles connection testing and model listing for various AI providers
 * 基于 multi-ai-sdk 实现
 */

export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama' | 'groq' | 'gemini' | 'qwen' | 'mistral' | 'cohere' | 'nvidia' | 'perplexity' | 'together' | 'cerebras' | 'azure' | 'grok';

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
  google: 'https://generativelanguage.googleapis.com/v1beta',
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
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

/**
 * Get the effective base URL for a provider
 */
export function getBaseUrl(provider: string, customUrl?: string): string {
  return customUrl?.trim() || DEFAULT_ENDPOINTS[provider as AIProviderType] || '';
}

/**
 * Test connection to OpenAI API
 */
async function testOpenAI(config: ProviderConfig): Promise<TestResult> {
  const baseUrl = getBaseUrl('openai', config.baseUrl);
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key', errorCode: 'INVALID_API_KEY' };
      }
      if (response.status === 403) {
        return { success: false, error: 'API key lacks permission', errorCode: 'PERMISSION_DENIED' };
      }
      return { success: false, error: `API error: ${response.status} ${response.statusText}`, errorCode: 'API_ERROR' };
    }

    const data = await response.json();
    const models = (data.data || [])
      .filter((m: { id: string }) => m.id.startsWith('gpt-'))
      .map((m: { id: string }) => m.id)
      .slice(0, 20);

    return {
      success: true,
      models,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'Network error - check your connection', errorCode: 'NETWORK_ERROR' };
    }
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, errorCode: 'CONNECTION_FAILED' };
  }
}

/**
 * Test connection to Anthropic API
 */
async function testAnthropic(config: ProviderConfig): Promise<TestResult> {
  const baseUrl = getBaseUrl('anthropic', config.baseUrl);
  const startTime = Date.now();

  try {
    // Anthropic doesn't have a models list endpoint, so we test with a minimal completion request
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key', errorCode: 'INVALID_API_KEY' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMIT' };
      }
      return {
        success: false,
        error: errorData.error?.message || `API error: ${response.status}`,
        errorCode: 'API_ERROR'
      };
    }

    return {
      success: true,
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'Network error - check your connection', errorCode: 'NETWORK_ERROR' };
    }
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, errorCode: 'CONNECTION_FAILED' };
  }
}

/**
 * Test connection to Google Gemini API
 */
async function testGoogle(config: ProviderConfig): Promise<TestResult> {
  const baseUrl = getBaseUrl('google', config.baseUrl);
  const startTime = Date.now();

  try {
    // Use the models list endpoint
    const response = await fetch(`${baseUrl}/models?key=${config.apiKey}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Invalid or malformed API key', errorCode: 'INVALID_API_KEY' };
      }
      if (response.status === 429) {
        return { success: false, error: 'Rate limit exceeded', errorCode: 'RATE_LIMIT' };
      }
      return { success: false, error: `API error: ${response.status}`, errorCode: 'API_ERROR' };
    }

    const data = await response.json();
    const models = (data.models || [])
      .filter((m: { name: string }) => m.name.includes('gemini'))
      .map((m: { name: string }) => m.name.replace('models/', ''))
      .slice(0, 20);

    return {
      success: true,
      models,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'Network error - check your connection', errorCode: 'NETWORK_ERROR' };
    }
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, errorCode: 'CONNECTION_FAILED' };
  }
}

/**
 * Test connection to Moonshot (Kimi) API
 */
async function testMoonshot(config: ProviderConfig): Promise<TestResult> {
  const baseUrl = getBaseUrl('moonshot', config.baseUrl);
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key', errorCode: 'INVALID_API_KEY' };
      }
      if (response.status === 403) {
        return { success: false, error: 'Insufficient permissions', errorCode: 'PERMISSION_DENIED' };
      }
      return { success: false, error: `API error: ${response.status}`, errorCode: 'API_ERROR' };
    }

    const data = await response.json();
    const models = (data.data || []).map((m: { id: string }) => m.id).slice(0, 20);

    return {
      success: true,
      models,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'Network error - check your connection', errorCode: 'NETWORK_ERROR' };
    }
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, errorCode: 'CONNECTION_FAILED' };
  }
}

/**
 * Test connection to DeepSeek API
 */
async function testDeepSeek(config: ProviderConfig): Promise<TestResult> {
  const baseUrl = getBaseUrl('deepseek', config.baseUrl);
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid API key', errorCode: 'INVALID_API_KEY' };
      }
      return { success: false, error: `API error: ${response.status}`, errorCode: 'API_ERROR' };
    }

    const data = await response.json();
    const models = (data.data || [])
      .filter((m: { id: string }) => m.id.startsWith('deepseek-'))
      .map((m: { id: string }) => m.id)
      .slice(0, 20);

    return {
      success: true,
      models,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'Network error - check your connection', errorCode: 'NETWORK_ERROR' };
    }
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, errorCode: 'CONNECTION_FAILED' };
  }
}

/**
 * Test connection to Ollama (Local) API
 */
async function testOllama(config: ProviderConfig): Promise<TestResult> {
  const baseUrl = getBaseUrl('ollama', config.baseUrl);
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Ollama service not found - make sure it is running', errorCode: 'SERVICE_NOT_FOUND' };
      }
      return { success: false, error: `Service error: ${response.status}`, errorCode: 'SERVICE_ERROR' };
    }

    const data = await response.json();
    const models = (data.models || [])
      .map((m: { name: string }) => m.name)
      .slice(0, 20);

    return {
      success: true,
      models,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return { success: false, error: 'Cannot connect to Ollama - ensure it is running (default: localhost:11434)', errorCode: 'CONNECTION_REFUSED' };
    }
    return { success: false, error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`, errorCode: 'CONNECTION_FAILED' };
  }
}

/**
 * Main test function - routes to the appropriate provider
 */
export async function testAIProvider(provider: AIProviderType, config: ProviderConfig): Promise<TestResult> {
  switch (provider) {
    case 'openai':
      return testOpenAI(config);
    case 'anthropic':
      return testAnthropic(config);
    case 'google':
    case 'gemini':
      return testGoogle(config);
    case 'moonshot':
      return testMoonshot(config);
    case 'deepseek':
      return testDeepSeek(config);
    case 'ollama':
      return testOllama(config);
    case 'groq':
    case 'qwen':
    case 'mistral':
    case 'cohere':
    case 'nvidia':
    case 'perplexity':
    case 'together':
    case 'cerebras':
    case 'grok':
      return testOpenAI(config); // OpenAI-compatible APIs
    default:
      return { success: false, error: `Unknown provider type: ${provider}`, errorCode: 'UNKNOWN_PROVIDER' };
  }
}

/**
 * Get default models for a provider (fallback when API call fails)
 */
export function getDefaultModels(provider: AIProviderType): string[] {
  switch (provider) {
    case 'openai':
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
    case 'anthropic':
      return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
    case 'google':
    case 'gemini':
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    case 'moonshot':
      return ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'];
    case 'deepseek':
      return ['deepseek-chat', 'deepseek-coder'];
    case 'ollama':
      return ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'phi3'];
    case 'groq':
      return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    case 'qwen':
      return ['qwen-max', 'qwen-plus', 'qwen-turbo'];
    case 'mistral':
      return ['mistral-large-latest', 'mistral-small-latest'];
    case 'cohere':
      return ['command-r-plus-08-2024', 'command-r-08-2024'];
    case 'nvidia':
      return ['meta/llama-3.1-70b-instruct', 'meta/llama-3.1-8b-instruct'];
    case 'perplexity':
      return ['sonar', 'sonar-pro'];
    case 'together':
      return ['meta-llama/Llama-3.3-70B-Instruct-Turbo'];
    case 'cerebras':
      return ['llama3.3-70b'];
    case 'grok':
      return ['grok-2-latest', 'grok-2-mini'];
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

/**
 * Stream outline generation using OpenAI-compatible API
 */
export async function generateOutlineStream(
  event: Electron.IpcMainInvokeEvent,
  prompt: string,
  provider: string,
  config: { apiKey: string; baseUrl?: string }
): Promise<void> {
  const baseUrl = getBaseUrl(provider, config.baseUrl);
  const model = provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 
                provider === 'moonshot' ? 'moonshot-v1-128k' :
                provider === 'deepseek' ? 'deepseek-chat' :
                'gpt-4o';

  try {
    let endpoint: string;
    let headers: Record<string, string>;
    let body: any;

    if (provider === 'anthropic') {
      endpoint = `${baseUrl}/v1/messages`;
      headers = {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      };
      body = {
        model,
        max_tokens: 4096,
        messages: [
          { role: 'user', content: `${OUTLINE_SYSTEM_PROMPT}\n\n用户的创意种子：${prompt}` }
        ],
        stream: true,
      };
    } else {
      endpoint = `${baseUrl}/chat/completions`;
      headers = {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      };
      body = {
        model,
        messages: [
          { role: 'system', content: OUTLINE_SYSTEM_PROMPT },
          { role: 'user', content: `用户的创意种子：${prompt}` }
        ],
        stream: true,
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      event.sender.send('ai:outline-error', { 
        error: errorData.error?.message || `API error: ${response.status}` 
      });
      return;
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      event.sender.send('ai:outline-error', { error: 'No response stream available' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          event.sender.send('ai:outline-done', {});
          return;
        }

        try {
          const parsed = JSON.parse(data);
          
          if (provider === 'anthropic') {
            const content = parsed.delta?.text || parsed.content?.[0]?.text || '';
            if (content) {
              fullContent += content;
              event.sender.send('ai:outline-chunk', { content, fullContent });
            }
          } else {
            // Handle OpenAI-compatible format
            const delta = parsed.choices?.[0]?.delta;
            let content = '';
            
            if (delta?.content) {
              content = delta.content;
            }
            
            if (content) {
              fullContent += content;
              event.sender.send('ai:outline-chunk', { content, fullContent });
            }
          }
        } catch (e) {
          // Skip malformed JSON
        }
      }
    }

    // Parse final result
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
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
  }
}
