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

const OUTLINE_STREAM_DONE_MARK = '[DONE]';

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

  it('openai 兼容分支走 SSE 流式，按增量拼回完整文本', async () => {
    injectSettings({ provider: 'openai' });
    // 把方向文本切成多个 SSE 事件，并混入 reasoning_content 与半截事件边界
    const pieces = [DIRECTION_TEXT.slice(0, 40), DIRECTION_TEXT.slice(40, 200), DIRECTION_TEXT.slice(200)];
    const sse = [
      'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}',
      ...pieces.map(piece => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}`),
      `data: ${OUTLINE_STREAM_DONE_MARK}`,
    ].join('\n\n') + '\n\n';
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => {
          // 故意在事件中间切断，验证跨分片的半截事件能被正确补齐
          const chunks = [sse.slice(0, 60), sse.slice(60, 300), sse.slice(300)];
          let index = 0;
          return {
            read: async () =>
              index < chunks.length
                ? { done: false, value: encoder.encode(chunks[index++]) }
                : { done: true, value: undefined },
          };
        },
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    const result = await generator.generateDirections('创意种子', { maxRetries: 1 });

    expect(lastRequestBody(fetchMock).stream).toBe(true);
    expect(result.directions.length).toBeGreaterThan(0);
    expect(result.rawText).toBe(DIRECTION_TEXT);
  });

  it('网关忽略 stream 参数直接返回整包 JSON 时仍能取到内容', async () => {
    injectSettings({ provider: 'openai' });
    const encoder = new TextEncoder();
    const payload = JSON.stringify({ choices: [{ message: { content: DIRECTION_TEXT } }] });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: encoder.encode(payload) };
            },
          };
        },
      },
    })));

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    const result = await generator.generateDirections('创意种子', { maxRetries: 1 });

    expect(result.directions.length).toBeGreaterThan(0);
  });

  it('流在无结束标记时中断，报错而不是把半截大纲当成功', async () => {
    injectSettings({ provider: 'openai' });
    // 网关中途 RST：reader 正常 done，但没有 [DONE] 也没有 finish_reason
    const sse =
      [
        'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}',
        `data: ${JSON.stringify({ choices: [{ delta: { content: DIRECTION_TEXT.slice(0, 30) } }] })}`,
      ].join('\n\n') + '\n\n';
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: encoder.encode(sse) };
            },
          };
        },
      },
    })));

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await expect(
      generator.generateDirections('创意种子', { maxRetries: 1 }),
    ).rejects.toThrow('提前中断');
  });

  it('finish_reason=length 且正文为空时报长度上限截断，而非“未返回内容”', async () => {
    injectSettings({ provider: 'openai' });
    // 推理型模型把输出预算全烧在 reasoning_content 上，content 一个字都没吐
    const sse =
      [
        'data: {"choices":[{"delta":{"content":"","reasoning_content":"让我仔细想想"}}]}',
        'data: {"choices":[{"delta":{"content":""},"finish_reason":"length"}]}',
        'data: [DONE]',
      ].join('\n\n') + '\n\n';
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined };
              sent = true;
              return { done: false, value: encoder.encode(sse) };
            },
          };
        },
      },
    })));

    const generator = new UnifiedOutlineGenerator({ maxRetries: 1 });
    await expect(
      generator.generateDirections('创意种子', { maxRetries: 1 }),
    ).rejects.toThrow('输出被长度上限截断');
  });

  it('长请求悬挂时按单次超时中断，不无限占用生成链路', async () => {
    vi.useFakeTimers();
    try {
      injectSettings({ provider: 'openai' });
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }),
      ));
      const generator = new UnifiedOutlineGenerator({
        maxRetries: 1,
        requestTimeoutMs: 25,
      });

      const pending = generator.generateDirections('创意种子', {
        maxRetries: 1,
        requestTimeoutMs: 25,
      });
      const assertion = expect(pending).rejects.toThrow('大纲请求超时');
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
