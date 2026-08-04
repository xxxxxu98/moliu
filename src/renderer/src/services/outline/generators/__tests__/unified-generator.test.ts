/**
 * unified-generator 单测
 *
 * 覆盖请求参数的取值优先级：
 *   显式 options.temperature/topP > 厂商 generationConfig > 硬编码默认（0.7 / 0.9）
 * 通过真实 Pinia settingsStore + mock fetch 断言各分支请求体。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import type { ProviderType } from '@/config/ai-providers';
import { useSettingsStore } from '@/stores/settings.store';
import type { AIGenerationConfig } from '@/stores/settings.store';
import { UnifiedOutlineGenerator } from '../unified-generator';

/** 合法方向文本：与 direction-prompt 输出格式一致，可被 parseDirections 解析 */
const DIRECTION_TEXT = `## 方向方案1
- 标题：凡人修仙传
- 一句话卖点：凡人逆袭
- premise：普通山村少年踏上修仙之路
- 主角成长路径：从炼气到飞升
- 核心冲突：资源争夺与道统之争
- 爽点风格：打脸、升级
- 目标情绪：热血、爽快
- 风险提示：节奏
- 长篇承载力：前30章完成新手村闭环，后续扩展宗门与魔域
- 推荐理由：升级体系清晰
- 推荐分：88
`;

function mockChatFetch(body?: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () =>
      body ?? { choices: [{ message: { content: DIRECTION_TEXT } }] },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface ProviderSeed {
  provider: ProviderType;
  generationConfig?: AIGenerationConfig;
}

/** 注入 settingsStore（UnifiedOutlineGenerator.getAIConfig 依赖它） */
function injectSettings(seed: ProviderSeed): void {
  const pinia = createPinia();
  setActivePinia(pinia);
  const settings = useSettingsStore();
  settings.aiProviders = [
    {
      id: 'test-provider',
      name: 'test',
      provider: seed.provider,
      apiKey: 'test-key',
      baseUrl: 'https://mock.api',
      modelName: 'test-model',
      enabled: true,
      ...(seed.generationConfig ? { generationConfig: seed.generationConfig } : {}),
    },
  ];
  settings.defaultModel = { providerId: 'test-provider', modelName: 'test-model' };
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, any> {
  const call = fetchMock.mock.calls.at(-1)!;
  return JSON.parse(String((call[1] as RequestInit).body));
}

describe('UnifiedOutlineGenerator 请求参数', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('使用厂商 generationConfig 的 temperature/topP（openai 兼容）', async () => {
    injectSettings({
      provider: 'openai',
      generationConfig: { temperature: 0.2, topP: 0.6, frequencyPenalty: 0, presencePenalty: 0 },
    });
    const fetchMock = mockChatFetch();

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await generator.generateDirections('创意种子', { maxRetries: 1 });

    const body = lastRequestBody(fetchMock);
    expect(body.temperature).toBe(0.2);
    expect(body.top_p).toBe(0.6);
  });

  it('无厂商配置时回退硬编码默认 0.7 / 0.9', async () => {
    injectSettings({ provider: 'openai' });
    const fetchMock = mockChatFetch();

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await generator.generateDirections('创意种子', { maxRetries: 1 });

    const body = lastRequestBody(fetchMock);
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
  });

  it('显式 options 优先于厂商配置', async () => {
    injectSettings({
      provider: 'openai',
      generationConfig: { temperature: 0.2, topP: 0.6, frequencyPenalty: 0, presencePenalty: 0 },
    });
    const fetchMock = mockChatFetch();

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await generator.generateDirections('创意种子', { temperature: 0.5, topP: 0.8, maxRetries: 1 });

    const body = lastRequestBody(fetchMock);
    expect(body.temperature).toBe(0.5);
    expect(body.top_p).toBe(0.8);
  });

  it('重试降温基于厂商生效温度，不升温（厂商 0.2）', async () => {
    injectSettings({
      provider: 'openai',
      generationConfig: { temperature: 0.2, topP: 0.6, frequencyPenalty: 0, presencePenalty: 0 },
    });
    // 首轮返回不可解析内容触发重试，第二轮返回合法方向文本
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '抱歉，无法生成' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: DIRECTION_TEXT } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const generator = new UnifiedOutlineGenerator({ maxRetries: 2 });
    const result = await generator.generateDirections('创意种子', { maxRetries: 2 });

    expect(result.directions.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    // 首轮用厂商配置 0.2；重试从 0.2 降温（下限 0.2），绝不升温到 0.7 基准
    expect(first.temperature).toBe(0.2);
    expect(second.temperature).toBeLessThanOrEqual(first.temperature);
    expect(second.temperature).toBe(0.2);
  });

  it('Anthropic 分支同样使用厂商配置', async () => {
    injectSettings({
      provider: 'anthropic',
      generationConfig: { temperature: 0.4, topP: 0.8, frequencyPenalty: 0, presencePenalty: 0 },
    });
    // Anthropic 响应结构：content[].type === 'text'
    const fetchMock = mockChatFetch({ content: [{ type: 'text', text: DIRECTION_TEXT }] });

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await generator.generateDirections('创意种子', { maxRetries: 1 });

    const body = lastRequestBody(fetchMock);
    expect(body.temperature).toBe(0.4);
    expect(body.top_p).toBe(0.8);
  });

  it('Gemini 分支同样使用厂商配置', async () => {
    injectSettings({
      provider: 'gemini',
      generationConfig: { temperature: 0.3, topP: 0.7, frequencyPenalty: 0, presencePenalty: 0 },
    });
    // Gemini 响应结构：candidates[].content.parts[].text
    const fetchMock = mockChatFetch({
      candidates: [{ content: { parts: [{ text: DIRECTION_TEXT }] } }],
    });

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await generator.generateDirections('创意种子', { maxRetries: 1 });

    const body = lastRequestBody(fetchMock);
    expect(body.generationConfig.temperature).toBe(0.3);
    expect(body.generationConfig.topP).toBe(0.7);
  });
});
