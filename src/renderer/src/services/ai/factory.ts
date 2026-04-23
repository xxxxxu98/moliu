import type { ProviderType } from '@/config/ai-providers';
import { BaseAIService } from './base.service';
import {
  OpenAIService,
  AnthropicService,
  DeepSeekService,
  MoonshotService,
  OllamaService,
  GoogleService,
  ZhipuService,
} from './providers';

/**
 * AI 服务工厂
 * 用于创建和管理不同厂商的 AI 服务实例
 */
export class AIServiceFactory {
  private static services: Map<string, BaseAIService> = new Map();

  /**
   * 根据提供商类型创建 AI 服务实例
   */
  static createService(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    model?: string
  ): BaseAIService {
    const serviceKey = `${provider}-${model || 'default'}`;

    // 如果已存在相同配置的服务，直接返回
    const existing = this.services.get(serviceKey);
    if (existing) {
      return existing;
    }

    let service: BaseAIService;

    switch (provider) {
      case 'openai':
        service = new OpenAIService(apiKey, baseUrl, model);
        break;
      case 'anthropic':
        service = new AnthropicService(apiKey, baseUrl, model);
        break;
      case 'deepseek':
        service = new DeepSeekService(apiKey, baseUrl, model);
        break;
      case 'moonshot':
        service = new MoonshotService(apiKey, baseUrl, model);
        break;
      case 'ollama':
        service = new OllamaService(apiKey, baseUrl, model);
        break;
      case 'google':
        service = new GoogleService(apiKey, baseUrl, model);
        break;
      case 'zhipu':
        service = new ZhipuService(apiKey, baseUrl, model);
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    this.services.set(serviceKey, service);
    return service;
  }

  /**
   * 获取已存在的服务实例
   */
  static getService(provider: ProviderType, model?: string): BaseAIService | undefined {
    const serviceKey = `${provider}-${model || 'default'}`;
    return this.services.get(serviceKey);
  }

  /**
   * 清除所有服务实例
   */
  static clearAll(): void {
    this.services.clear();
  }

  /**
   * 清除指定提供商的服务实例
   */
  static clearProvider(provider: ProviderType): void {
    for (const key of this.services.keys()) {
      if (key.startsWith(`${provider}-`)) {
        this.services.delete(key);
      }
    }
  }

  /**
   * 获取提供商对应的默认模型
   */
  static getDefaultModel(provider: ProviderType): string {
    const defaults: Record<ProviderType, string> = {
      openai: 'gpt-4o',
      anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-1.5-pro',
      moonshot: 'moonshot-v1-8k',
      deepseek: 'deepseek-chat',
      ollama: 'llama3',
      zhipu: 'glm-4.7-flash',
    };
    return defaults[provider];
  }

  /**
   * 获取提供商对应的基础 URL
   */
  static getDefaultBaseUrl(provider: ProviderType): string {
    const baseUrls: Record<ProviderType, string> = {
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com',
      google: 'https://generativelanguage.googleapis.com/v1beta',
      moonshot: 'https://api.moonshot.cn/v1',
      deepseek: 'https://api.deepseek.com/v1',
      ollama: 'http://localhost:11434/v1',
      zhipu: 'https://open.bigmodel.cn/api',
    };
    return baseUrls[provider];
  }
}

export { BaseAIService } from './base.service';
export { PromptBuilder } from './base.service';
export type { ProjectContext, AISuggestion, AIWriteResult } from './base.service';
export type { AIWriteMode, ContinueMode, SuggestionType, SuggestionSeverity } from './types';
