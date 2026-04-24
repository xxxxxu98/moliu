/**
 * 统一的 AI Provider 获取逻辑
 * 避免在多个地方重复编写相同的 provider 查找逻辑
 */

import { computed } from 'vue';
import { useSettingsStore, type AIProvider } from '@/stores/settings.store';
import { AIServiceFactory } from '@/services/ai/factory';
import type { UnifiedAIService } from '@/services/ai/factory';

/**
 * 统一的 AI Provider 获取 Hook
 * 优先使用用户在设置页面选择的默认模型
 */
export function useActiveAIProvider() {
  const settingsStore = useSettingsStore();

  /**
   * 获取当前启用的 AI 提供商配置
   * 优先使用用户在设置页面选择的默认模型
   */
  const activeProvider = computed<AIProvider | null>(() => {
    const providers = settingsStore.aiProviders;
    const defaultModelId = settingsStore.defaultModel;

    // 优先查找与 defaultModel 匹配的厂商
    if (defaultModelId) {
      const [providerId, modelName] = defaultModelId.split(':');
      const matched = providers.find(p =>
        p.id === providerId &&
        p.modelName === modelName &&
        p.enabled &&
        p.apiKey
      );
      if (matched) return matched;
    }

    // Fallback: 查找第一个已启用且配置了 API Key 的提供商
    return providers.find(p => p.enabled && p.apiKey) || null;
  });

  /**
   * 获取当前模型名称
   */
  const currentModel = computed(() => {
    const provider = activeProvider.value;
    if (!provider) return null;
    return provider.modelName || AIServiceFactory.getDefaultModel(provider.provider);
  });

  /**
   * 获取 AI 服务实例
   */
  const aiService = computed<UnifiedAIService | null>(() => {
    const provider = activeProvider.value;
    if (!provider) return null;

    try {
      return AIServiceFactory.createService(
        provider.provider,
        provider.apiKey,
        provider.baseUrl,
        currentModel.value || undefined,
        undefined,
        provider.generationConfig
      );
    } catch (err) {
      console.error('Failed to create AI service:', err);
      return null;
    }
  });

  /**
   * 是否有可用的 AI 服务
   */
  const hasProvider = computed(() => !!activeProvider.value);

  /**
   * 获取 AI 服务实例，如果不可用则抛出错误
   */
  function requireAIService(): UnifiedAIService {
    const service = aiService.value;
    if (!service) {
      throw new Error('请先配置 AI 服务');
    }
    return service;
  }

  return {
    activeProvider,
    currentModel,
    aiService,
    hasProvider,
    requireAIService,
  };
}

/**
 * 兼容旧接口的函数
 * 用于替换现有的 getAIClient() 逻辑
 */
export function getActiveAIService(): UnifiedAIService | null {
  const { aiService } = useActiveAIProvider();
  return aiService.value;
}
