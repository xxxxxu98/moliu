export type ProviderType = 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama';

export interface ProviderConfig {
  provider: ProviderType;
  baseUrl: string;
  models: string[];
}

export const providerNameMap: Record<ProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  moonshot: 'Moonshot',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
};

export const defaultProviders: ProviderConfig[] = [
  {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  },
  {
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  },
  {
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  {
    provider: 'moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
  },
  {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [],
  },
];
