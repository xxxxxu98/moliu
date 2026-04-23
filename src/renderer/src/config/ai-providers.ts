export type ProviderType = 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama' | 'groq' | 'gemini' | 'qwen' | 'mistral' | 'cohere' | 'nvidia' | 'perplexity' | 'together' | 'cerebras' | 'azure' | 'grok';

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
  google: 'Google Gemini',
  moonshot: 'Moonshot (Kimi)',
  deepseek: 'DeepSeek',
  ollama: 'Ollama (本地)',
  groq: 'Groq',
  gemini: 'Google Gemini',
  qwen: '通义千问',
  mistral: 'Mistral',
  cohere: 'Cohere',
  nvidia: 'NVIDIA NIM',
  perplexity: 'Perplexity',
  together: 'Together AI',
  cerebras: 'Cerebras',
  azure: 'Azure OpenAI',
  grok: 'xAI Grok',
};

export const defaultProviders: ProviderConfig[] = [
  {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [],
  },
  {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [],
  },
  {
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: [],
  },
  {
    provider: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [],
  },
  {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [],
  },
  {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [],
  },
  {
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [],
  },
  {
    provider: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [],
  },
  {
    provider: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [],
  },
  {
    provider: 'cohere',
    baseUrl: 'https://api.cohere.ai/v1',
    models: [],
  },
  {
    provider: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [],
  },
  {
    provider: 'perplexity',
    baseUrl: 'https://api.perplexity.ai',
    models: [],
  },
  {
    provider: 'together',
    baseUrl: 'https://api.together.xyz/v1',
    models: [],
  },
  {
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    models: [],
  },
  {
    provider: 'azure',
    baseUrl: '',
    models: [],
  },
  {
    provider: 'grok',
    baseUrl: 'https://api.x.ai/v1',
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
 * 将提供商配置转换为简单格式（用于 UI 显示）
 */
export function providerConfigToSimple(provider: ProviderConfig): { provider: ProviderType; baseUrl: string; models: string[] } {
  return {
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    models: provider.models.map(m => m.id),
  };
}
