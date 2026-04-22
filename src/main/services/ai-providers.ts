/**
 * AI Provider Service
 * Handles connection testing and model listing for various AI providers
 */

export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama';

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
};

/**
 * Get the effective base URL for a provider
 */
export function getBaseUrl(provider: AIProviderType, customUrl?: string): string {
  return customUrl?.trim() || DEFAULT_ENDPOINTS[provider];
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
      return testGoogle(config);
    case 'moonshot':
      return testMoonshot(config);
    case 'deepseek':
      return testDeepSeek(config);
    case 'ollama':
      return testOllama(config);
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
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    case 'moonshot':
      return ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'];
    case 'deepseek':
      return ['deepseek-chat', 'deepseek-coder'];
    case 'ollama':
      return ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'phi3'];
    default:
      return [];
  }
}
