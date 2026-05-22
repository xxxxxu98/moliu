/**
 * Unified AI Configuration
 * 统一的 AI 配置获取模块 - 消除重复代码
 * 
 * 所有 AI Provider 配置相关的逻辑都集中在这里
 */

import type { ProviderType } from '@/config/ai-providers';
import { getSDKProvider } from '@/config/ai-providers';
import type { AIClient, Message } from 'multi-ai-sdk';

/**
 * AI 配置信息
 */
export interface AIConfig {
  /** Provider 类型 */
  provider: ProviderType;
  /** API Key */
  apiKey: string;
  /** Base URL（可选） */
  baseUrl?: string;
  /** 模型名称 */
  model?: string;
  /** 温度参数 */
  temperature?: number;
  /** Top P 参数 */
  topP?: number;
}

/**
 * AI 配置默认值
 */
export const DEFAULT_AI_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 8192,
  contextWindowSafe: true,
} as const;

/**
 * 各 Provider 的默认模型映射
 */
export const PROVIDER_DEFAULT_MODELS: Record<ProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
  gemini: 'gemini-2.0-flash-exp',
  ollama: 'llama3.1:8b',
  siliconflow: 'Qwen/Qwen2.5-72B-Instruct',
  deepseek: 'deepseek-chat',
  moonshot: 'moonshot-v1-8k',
  zhipu: 'glm-4',
  minimax: 'abab6.5s-chat',
  hunyuan: 'hunyuan',
  dify: 'dify',
  custom: 'custom',
};

/**
 * 各 Provider 的默认 Base URL
 */
export const PROVIDER_BASE_URLS: Partial<Record<ProviderType, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  deepseek: 'https://api.deepseek.com/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
  minimax: 'https://api.minimax.chat/v1',
  hunyuan: 'https://api.hunyuan.cloud.tencent.com/v1',
};

/**
 * 获取 AI 配置
 * 
 * 从 Settings Store 获取当前配置的 AI Provider 信息
 */
export function getAIConfig(): AIConfig {
  // 动态导入以避免循环依赖
  const { useSettingsStore } = require('@/stores/settings.store');
  const settingsStore = useSettingsStore();
  
  const provider = settingsStore.aiProvider as ProviderType || 'openai';
  const apiKey = settingsStore.apiKey || '';
  const baseUrl = settingsStore.baseUrl || PROVIDER_BASE_URLS[provider];
  const model = settingsStore.model || PROVIDER_DEFAULT_MODELS[provider];
  
  return {
    provider,
    apiKey,
    baseUrl,
    model,
    temperature: settingsStore.temperature || DEFAULT_AI_CONFIG.temperature,
    topP: settingsStore.topP || DEFAULT_AI_CONFIG.topP,
  };
}

/**
 * 创建 AIClient 实例
 * 
 * 根据配置创建对应的 AI 客户端
 */
export function createAIClient(config?: Partial<AIConfig>): AIClient {
  const fullConfig = {
    ...getAIConfig(),
    ...config,
  };
  
  const sdkProvider = getSDKProvider(fullConfig.provider);
  
  const clientConfig: {
    provider: any;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    contextWindowSafe?: boolean;
  } = {
    provider: sdkProvider,
    contextWindowSafe: DEFAULT_AI_CONFIG.contextWindowSafe,
  };
  
  // 非本地 Provider 需要 API Key
  if (sdkProvider !== 'ollama' && fullConfig.apiKey) {
    clientConfig.apiKey = fullConfig.apiKey;
  }
  
  // 如果有自定义 baseUrl 或默认 URL
  if (fullConfig.baseUrl) {
    clientConfig.baseUrl = fullConfig.baseUrl;
  }
  
  // 如果有自定义 model
  if (fullConfig.model) {
    clientConfig.model = fullConfig.model;
  }
  
  return new AIClient(clientConfig);
}

/**
 * 检查是否有可用的 AI 配置
 */
export function hasAIConfig(): boolean {
  const config = getAIConfig();
  return !!(config.apiKey || config.provider === 'ollama');
}

/**
 * 获取 Provider 显示名称
 */
export function getProviderDisplayName(provider: ProviderType): string {
  const names: Record<ProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
    gemini: 'Google Gemini',
    ollama: 'Ollama (本地)',
    deepseek: 'DeepSeek',
    moonshot: 'Moonshot',
    zhipu: '智谱 GLM',
    siliconflow: 'SiliconFlow',
    minimax: 'MiniMax',
    hunyuan: '腾讯混元',
    dify: 'Dify',
    custom: '自定义',
  };
  return names[provider] || provider;
}

/**
 * 获取模型上下文窗口大小（估算）
 */
export function getModelContextWindow(model?: string): number {
  if (!model) return 8192;
  
  // 大致估算各模型的上下文窗口
  const contextWindows: Record<string, number> = {
    'gpt-4o': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16385,
    'claude-3-5-sonnet': 200000,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'gemini-2.0-flash-exp': 1000000,
    'gemini-1.5-pro': 2000000,
    'gemini-1.5-flash': 1000000,
    'deepseek-chat': 64000,
    'moonshot-v1-8k': 8000,
    'moonshot-v1-32k': 32000,
    'glm-4': 128000,
  };
  
  // 精确匹配
  if (contextWindows[model]) {
    return contextWindows[model];
  }
  
  // 前缀匹配
  for (const [key, value] of Object.entries(contextWindows)) {
    if (model.startsWith(key)) {
      return value;
    }
  }
  
  return 8192; // 默认值
}

/**
 * 估算安全的内容长度（保留 20% 给输出）
 */
export function getSafeContentLength(
  model: string | undefined,
  estimatedOutputTokens: number = 2000
): number {
  const contextWindow = getModelContextWindow(model);
  const safeLength = Math.floor(contextWindow * 0.8 - estimatedOutputTokens);
  return Math.min(safeLength, contextWindow);
}

/**
 * 创建聊天消息
 */
export function createMessage(
  role: 'system' | 'user' | 'assistant',
  content: string
): Message {
  return {
    role,
    content,
  };
}

/**
 * 创建系统消息
 */
export function createSystemMessage(content: string): Message {
  return createMessage('system', content);
}

/**
 * 创建用户消息
 */
export function createUserMessage(content: string): Message {
  return createMessage('user', content);
}

/**
 * 创建助手消息
 */
export function createAssistantMessage(content: string): Message {
  return createMessage('assistant', content);
}

/**
 * 构建聊天消息列表
 */
export function buildMessages(
  systemPrompt: string,
  userPrompt: string,
  assistantHistory: string[] = []
): Message[] {
  const messages: Message[] = [];
  
  if (systemPrompt) {
    messages.push(createSystemMessage(systemPrompt));
  }
  
  // 添加历史对话
  for (const content of assistantHistory) {
    messages.push(createUserMessage('')); // 用户消息（占位）
    messages.push(createAssistantMessage(content));
  }
  
  // 添加当前用户消息
  messages.push(createUserMessage(userPrompt));
  
  return messages;
}

/**
 * 导出配置获取器和客户端创建器
 */
export const aiConfigManager = {
  getConfig: getAIConfig,
  createClient: createAIClient,
  hasConfig: hasAIConfig,
  getProviderName: getProviderDisplayName,
  getModelContextWindow,
  getSafeContentLength,
  createMessage,
  createSystemMessage,
  createUserMessage,
  createAssistantMessage,
  buildMessages,
};
