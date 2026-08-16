/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { migrateMaxTokens, useSettingsStore } from '../settings.store';

const KIB_GEN_PROVIDER = {
  id: 'provider-kib',
  name: 'KiB 旧配置',
  provider: 'openai',
  apiKey: 'sk-test',
  baseUrl: '',
  modelName: 'deepseek-v4-flash',
  enabled: true,
  // 08-16 实测形态：UI 顶层已是十进制，generationConfig 仍残留 KiB 值
  maxTokens: 1000000,
  generationConfig: { maxTokens: 1048576 },
};

function installElectronAPI(providers: unknown[]) {
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    getSettings: vi.fn(async () => ({})),
    getAIProviders: vi.fn(async () => providers),
    saveAIProviders: vi.fn(async () => undefined),
  };
}

describe('migrateMaxTokens', () => {
  it('KiB 旧值换算为十进制', () => {
    expect(migrateMaxTokens(1048576)).toBe(1000000);
    expect(migrateMaxTokens(131072)).toBe(128000);
  });

  it('非旧选项值与非法值原样返回/归 undefined', () => {
    expect(migrateMaxTokens(123456)).toBe(123456);
    expect(migrateMaxTokens(undefined)).toBeUndefined();
    expect(migrateMaxTokens(Number.NaN)).toBeUndefined();
  });
});

describe('settings.store 启动迁移', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('generationConfig.maxTokens 的 KiB 残留被独立迁移并与顶层统一', async () => {
    const save = vi.fn(async () => undefined);
    installElectronAPI([{ ...KIB_GEN_PROVIDER, generationConfig: { maxTokens: 1048576 } }]);
    (window as unknown as { electronAPI: { saveAIProviders: unknown } }).electronAPI.saveAIProviders = save;

    const store = useSettingsStore();
    await store.initializeSettings();

    const provider = store.aiProviders.find(p => p.id === 'provider-kib');
    // 请求层只读 generationConfig.maxTokens：修复前这里是 1048576，请求照传 KiB 值
    expect(provider?.generationConfig?.maxTokens).toBe(1000000);
    expect(provider?.maxTokens).toBe(1000000);
    expect(save).toHaveBeenCalled();
  });

  it('两字段一致且无 KiB 值时不触发回写', async () => {
    const save = vi.fn(async () => undefined);
    installElectronAPI([{
      ...KIB_GEN_PROVIDER,
      id: 'provider-clean',
      maxTokens: 1000000,
      generationConfig: { maxTokens: 1000000 },
    }]);
    (window as unknown as { electronAPI: { saveAIProviders: unknown } }).electronAPI.saveAIProviders = save;

    const store = useSettingsStore();
    await store.initializeSettings();

    expect(save).not.toHaveBeenCalled();
  });
});
