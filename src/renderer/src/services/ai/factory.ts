import type { ProviderType } from '@/config/ai-providers';
import { UnifiedAIService } from './unified.service';
import { getDefaultModels, getBaseUrl } from '@/config/ai-providers';

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
    maxTokens?: number,
    generationConfig?: { temperature: number; topP: number; frequencyPenalty: number; presencePenalty: number }
  ): UnifiedAIService {
    const serviceKey = `${provider}-${model || 'default'}`;

    // 如果已存在相同配置的服务，直接返回
    const existing = this.services.get(serviceKey);
    if (existing) {
      return existing;
    }

    const service = new UnifiedAIService(provider, apiKey, baseUrl, model, maxTokens, generationConfig);

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
   * 优先使用用户配置的模型，否则使用厂商推荐的第一个模型
   */
  static getDefaultModel(provider: ProviderType): string {
    const models = getDefaultModels(provider);
    return models[0] || 'gpt-4o';
  }

  /**
   * 获取提供商对应的基础 URL
   */
  static getDefaultBaseUrl(provider: ProviderType): string {
    return getBaseUrl(provider);
  }
}

export { UnifiedAIService, type AIGenerationConfig } from './unified.service';
export { PromptBuilder } from './base.service';
export type { ProjectContext, AISuggestion, AIWriteResult } from './base.service';
export type { AIWriteMode, ContinueMode, SuggestionType, SuggestionSeverity } from './types';
