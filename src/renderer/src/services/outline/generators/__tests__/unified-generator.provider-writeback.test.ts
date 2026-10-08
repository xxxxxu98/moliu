/**
 * 网关约束写回厂商配置的回归测试（代码审查修复）：
 * 多个厂商配置共用同一 apiKey 时，写回必须按厂商 id 精确定位，不能误改另一个配置。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useSettingsStore } from '@/stores/settings.store';
import { UnifiedOutlineGenerator } from '../unified-generator';

/** 访问私有写回方法（测试专用，避免为单测暴露内部 API） */
interface WritebackAccess {
  rememberProviderTemperatureLock(
    config: { providerId: string; generationConfig?: unknown },
    temperature: number,
  ): void;
  rememberProviderMaxTokensCap(
    config: { providerId: string; generationConfig?: unknown },
    cappedMaxTokens: number,
  ): void;
}

function seedSharedKeyProviders(): void {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.aiProviders = [
    {
      id: 'provider-a',
      name: 'A',
      provider: 'openai',
      apiKey: 'shared-key',
      baseUrl: 'https://a.mock.api',
      modelName: 'model-a',
      enabled: true,
    },
    {
      id: 'provider-b',
      name: 'B',
      provider: 'openai',
      apiKey: 'shared-key',
      baseUrl: 'https://b.mock.api',
      modelName: 'model-b',
      enabled: true,
    },
  ] as typeof settings.aiProviders;
}

describe('网关约束写回：按厂商 id 定位', () => {
  beforeEach(() => {
    seedSharedKeyProviders();
  });

  it('温度约束只写回 id 命中的厂商，共用 apiKey 的另一配置保持不变', () => {
    const generator = new UnifiedOutlineGenerator() as unknown as WritebackAccess;
    generator.rememberProviderTemperatureLock({ providerId: 'provider-b' }, 1);

    const settings = useSettingsStore();
    const a = settings.aiProviders.find(item => item.id === 'provider-a');
    const b = settings.aiProviders.find(item => item.id === 'provider-b');
    expect(b?.generationConfig?.temperature).toBe(1);
    expect(a?.generationConfig).toBeUndefined();
  });

  it('输出上限写回只命中 id 对应的厂商', () => {
    const generator = new UnifiedOutlineGenerator() as unknown as WritebackAccess;
    generator.rememberProviderMaxTokensCap({ providerId: 'provider-a' }, 16384);

    const settings = useSettingsStore();
    const a = settings.aiProviders.find(item => item.id === 'provider-a');
    const b = settings.aiProviders.find(item => item.id === 'provider-b');
    expect(a?.maxTokens).toBe(16384);
    expect(a?.generationConfig?.maxTokens).toBe(16384);
    expect(b?.maxTokens).toBeUndefined();
  });

  it('写回补全 generationConfig 的必填字段（与请求层兜底口径一致）', () => {
    const generator = new UnifiedOutlineGenerator() as unknown as WritebackAccess;
    generator.rememberProviderMaxTokensCap({ providerId: 'provider-a' }, 8192);

    const settings = useSettingsStore();
    const a = settings.aiProviders.find(item => item.id === 'provider-a');
    expect(a?.generationConfig).toEqual({
      temperature: 0.7,
      topP: 0.9,
      frequencyPenalty: 0,
      presencePenalty: 0,
      maxTokens: 8192,
    });
  });
});
