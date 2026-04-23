/**
 * AI 厂商配置
 * 仅包含 multi-ai-sdk 支持的厂商
 * ProviderName = "groq" | "openai" | "gemini" | "anthropic" | "grok" | "qwen" | "nvidia" | "ollama" | "mistral" | "deepseek" | "cohere" | "together" | "perplexity" | "fireworks" | "cerebras" | "azure" | "moonshot"
 */

import type { ProviderName } from 'multi-ai-sdk';

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'moonshot' | 'deepseek' | 'ollama' | 'groq' | 'qwen' | 'mistral' | 'cohere' | 'nvidia' | 'perplexity' | 'together' | 'cerebras' | 'azure' | 'grok' | 'fireworks' | 'zhipu';

/**
 * 将 App Provider 映射到 multi-ai-sdk 的 ProviderName
 * zhipu 使用 OpenAI 兼容 API
 */
export const providerToSDKMap: Record<ProviderType, ProviderName> = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  moonshot: 'moonshot',
  deepseek: 'deepseek',
  ollama: 'ollama',
  groq: 'groq',
  qwen: 'qwen',
  mistral: 'mistral',
  cohere: 'cohere',
  nvidia: 'nvidia',
  perplexity: 'perplexity',
  together: 'together',
  cerebras: 'cerebras',
  azure: 'azure',
  grok: 'grok',
  fireworks: 'fireworks',
  zhipu: 'openai', // 智谱使用 OpenAI 兼容 API
};

/**
 * 获取 SDK Provider
 */
export function getSDKProvider(provider: ProviderType): ProviderName {
  return providerToSDKMap[provider] || 'openai';
}

/**
 * 模型配置信息
 */
export interface ModelConfig {
  /** 模型标识符 */
  id: string;
  /** 上下文长度限制（token） */
  contextLength?: number;
  /** 最大输出长度（token），必填 */
  maxOutputTokens: number;
  /** 是否免费 */
  isFree?: boolean;
  /** 模型描述 */
  description?: string;
}

export interface ProviderConfig {
  provider: ProviderType;
  baseUrl: string;
  models: ModelConfig[];
}

export const providerNameMap: Record<ProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  moonshot: 'Moonshot (Kimi)',
  deepseek: 'DeepSeek',
  ollama: 'Ollama (本地)',
  groq: 'Groq',
  qwen: '通义千问',
  mistral: 'Mistral',
  cohere: 'Cohere',
  nvidia: 'NVIDIA NIM',
  perplexity: 'Perplexity',
  together: 'Together AI',
  cerebras: 'Cerebras',
  azure: 'Azure OpenAI',
  grok: 'xAI Grok',
  fireworks: 'Fireworks AI',
  zhipu: '智谱 AI (GLM)',
};

// Default API endpoints for each provider
export const DEFAULT_ENDPOINTS: Record<ProviderType, string> = {
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

export const defaultProviders: ProviderConfig[] = [
  {
    provider: 'openai',
    baseUrl: DEFAULT_ENDPOINTS.openai,
    models: [],
  },
  {
    provider: 'anthropic',
    baseUrl: DEFAULT_ENDPOINTS.anthropic,
    models: [],
  },
  {
    provider: 'gemini',
    baseUrl: DEFAULT_ENDPOINTS.gemini,
    models: [],
  },
  {
    provider: 'moonshot',
    baseUrl: DEFAULT_ENDPOINTS.moonshot,
    models: [],
  },
  {
    provider: 'deepseek',
    baseUrl: DEFAULT_ENDPOINTS.deepseek,
    models: [],
  },
  {
    provider: 'ollama',
    baseUrl: DEFAULT_ENDPOINTS.ollama,
    models: [],
  },
  {
    provider: 'groq',
    baseUrl: DEFAULT_ENDPOINTS.groq,
    models: [],
  },
  {
    provider: 'qwen',
    baseUrl: DEFAULT_ENDPOINTS.qwen,
    models: [],
  },
  {
    provider: 'mistral',
    baseUrl: DEFAULT_ENDPOINTS.mistral,
    models: [],
  },
  {
    provider: 'cohere',
    baseUrl: DEFAULT_ENDPOINTS.cohere,
    models: [],
  },
  {
    provider: 'nvidia',
    baseUrl: DEFAULT_ENDPOINTS.nvidia,
    models: [],
  },
  {
    provider: 'perplexity',
    baseUrl: DEFAULT_ENDPOINTS.perplexity,
    models: [],
  },
  {
    provider: 'together',
    baseUrl: DEFAULT_ENDPOINTS.together,
    models: [],
  },
  {
    provider: 'cerebras',
    baseUrl: DEFAULT_ENDPOINTS.cerebras,
    models: [],
  },
  {
    provider: 'azure',
    baseUrl: DEFAULT_ENDPOINTS.azure,
    models: [],
  },
  {
    provider: 'grok',
    baseUrl: DEFAULT_ENDPOINTS.grok,
    models: [],
  },
  {
    provider: 'fireworks',
    baseUrl: DEFAULT_ENDPOINTS.fireworks,
    models: [],
  },
  {
    provider: 'zhipu',
    baseUrl: DEFAULT_ENDPOINTS.zhipu,
    models: [],
  },
];

/**
 * 获取提供商配置
 */
export function getProviderConfig(provider: ProviderType): ProviderConfig | undefined {
  return defaultProviders.find(p => p.provider === provider);
}

/**
 * 获取模型配置
 */
export function getModelConfig(provider: ProviderType, modelId: string): ModelConfig | undefined {
  const providerConfig = getProviderConfig(provider);
  return providerConfig?.models.find(m => m.id === modelId);
}

/**
 * 获取模型的上下文长度限制
 */
export function getModelContextLength(provider: ProviderType, modelId: string): number | undefined {
  const modelConfig = getModelConfig(provider, modelId);
  return modelConfig?.contextLength;
}

/**
 * 获取模型的最大输出 token 数
 * 用户自定义模型时，默认使用 4096
 */
export function getModelMaxOutputTokens(provider: ProviderType, modelId: string): number {
  const modelConfig = getModelConfig(provider, modelId);
  return modelConfig?.maxOutputTokens ?? 4096;
}

/**
 * 获取有效的基础 URL
 * @param provider 提供商类型
 * @param customUrl 用户自定义 URL
 */
export function getBaseUrl(provider: ProviderType, customUrl?: string): string {
  return customUrl?.trim() || DEFAULT_ENDPOINTS[provider] || '';
}

/**
 * 获取默认模型列表
 */
export function getDefaultModels(provider: ProviderType): string[] {
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
    case 'azure':
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
    default:
      return [];
  }
}

/**
 * 将提供商配置转换为简单格式（用于 UI 显示）
 */
export function providerConfigToSimple(provider: ProviderConfig): { provider: ProviderType; baseUrl: string; models: string[] } {
  return {
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    models: provider.models.map(m => m.id),
  };
}
