import type { ProviderType } from '@/config/ai-providers';
import { UnifiedAIService } from './unified.service';

/**
 * AI 服务工厂
 * 用于创建和管理不同厂商的 AI 服务实例
 */
export class AIServiceFactory {
  private static services: Map<string, UnifiedAIService> = new Map();

  /**
   * 根据提供商类型创建 AI 服务实例
   */
  static createService(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    model?: string,
    maxTokens?: number
  ): UnifiedAIService {
    const serviceKey = `${provider}-${model || 'default'}`;

    // 如果已存在相同配置的服务，直接返回
    const existing = this.services.get(serviceKey);
    if (existing) {
      return existing;
    }

    const service = new UnifiedAIService(provider, apiKey, baseUrl, model, maxTokens);

    this.services.set(serviceKey, service);
    return service;
  }

  /**
   * 获取已存在的服务实例
   */
  static getService(provider: ProviderType, model?: string): UnifiedAIService | undefined {
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
      gemini: 'gemini-2.0-flash',
      moonshot: 'moonshot-v1-8k',
      deepseek: 'deepseek-chat',
      ollama: 'llama3',
      groq: 'llama-3.3-70b-versatile',
      qwen: 'qwen-plus',
      mistral: 'mistral-large-latest',
      cohere: 'command-r-plus-08-2024',
      nvidia: 'meta/llama-3.1-70b-instruct',
      perplexity: 'sonar',
      together: 'accounts/fireworks/models/llama-v3-70b-instruct',
      cerebras: 'llama3.3-70b',
      azure: 'gpt-4o',
      grok: 'grok-2-latest',
      fireworks: 'accounts/fireworks/models/llama-v3-70b-instruct',
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
    return baseUrls[provider];
  }
}

export { UnifiedAIService } from './unified.service';
export { PromptBuilder } from './base.service';
export type { ProjectContext, AISuggestion, AIWriteResult } from './base.service';
export type { AIWriteMode, ContinueMode, SuggestionType, SuggestionSeverity } from './types';
