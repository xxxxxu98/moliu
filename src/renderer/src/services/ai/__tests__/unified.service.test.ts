/**
 * UnifiedAIService.complete 的 jsonMode 强制输出测试
 *
 * 验证「按 provider 启用 JSON 强制」：
 * 1. jsonMode=true 时 chatOpts 携带 responseFormat: { type: 'json_object' }
 *    （multi-ai-sdk：OpenAI 兼容系/Ollama 透传为 response_format，Gemini 转为
 *    responseMimeType=application/json；Anthropic 等白名单构造自动忽略，安全降级）
 * 2. jsonMode 缺省时行为不变（不携带 responseFormat）
 * 3. 带 signal 的 stream 分支同样生效
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnifiedAIService } from '../unified.service';
import type { ProviderType } from '@/config/ai-providers';
import type { ProjectContext } from '../factory';

function makeService(provider: ProviderType = 'openai'): UnifiedAIService {
  const service = new UnifiedAIService(
    provider,
    'sk-test',
    'https://api.example.com/v1',
    'test-model',
  );
  return service;
}

describe('UnifiedAIService.complete - jsonMode 强制 JSON 输出', () => {
  const chatMock = vi.fn().mockResolvedValue('{"ok":true}');
  const streamMock = vi
    .fn()
    .mockImplementation(async function* () {
      yield { content: '{"ok":true}', done: true };
    });

  beforeEach(() => {
    chatMock.mockClear();
    streamMock.mockClear();
  });

  function stubClient(service: UnifiedAIService): void {
    (service as unknown as { client: unknown }).client = {
      chat: chatMock,
      stream: streamMock,
    };
  }

  it('jsonMode=true 时流式分支携带 responseFormat json_object', async () => {
    const service = makeService('openai');
    stubClient(service);

    await service.complete('返回 JSON', { jsonMode: true });

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [, chatOpts] = streamMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toEqual({ type: 'json_object' });
  });

  it('jsonMode 缺省时保持原行为（不携带 responseFormat）', async () => {
    const service = makeService('openai');
    stubClient(service);

    await service.complete('普通文本');

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [, chatOpts] = streamMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toBeUndefined();
  });

  it('jsonMode=true 时带 signal 同样携带 responseFormat', async () => {
    const service = makeService('openai');
    stubClient(service);

    const controller = new AbortController();
    await service.complete('返回 JSON', { jsonMode: true, signal: controller.signal });

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [, chatOpts] = streamMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toEqual({ type: 'json_object' });
  });

  it('jsonMode=false 显式传入时保持原行为（不携带 responseFormat）', async () => {
    const service = makeService('openai');
    stubClient(service);

    await service.complete('普通文本', { jsonMode: false });

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [, chatOpts] = streamMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toBeUndefined();
  });

  it('其他 provider（anthropic）传入 jsonMode 不抛错且正常返回（SDK 侧降级由适配层决定）', async () => {
    const service = makeService('anthropic');
    stubClient(service);

    // 不应抛错；responseFormat 是否透传由 SDK 适配层决定（Anthropic 白名单构造会忽略）
    const result = await service.complete('返回 JSON', { jsonMode: true });
    expect(result).toContain('ok');
  });
});

describe('UnifiedAIService 内部 JSON 方法 - JSON 强制覆盖', () => {
  const chatMock = vi.fn().mockResolvedValue('{"suggestions":[],"outlines":[]}');
  const streamMock = vi
    .fn()
    .mockImplementation(async function* () {
      yield { content: '{"outlines":[]}', done: true };
    });

  function stubClient(service: UnifiedAIService): void {
    (service as unknown as { client: unknown }).client = {
      chat: chatMock,
      stream: streamMock,
    };
  }

  beforeEach(() => {
    chatMock.mockClear();
    streamMock.mockClear();
  });

  function minimalContext(): ProjectContext {
    return {
      project: {
        id: 'p1',
        name: '测试项目',
        description: '',
        genre: [],
        wordCount: 0,
        status: 'planning',
        volumes: [],
        chapters: [],
        characters: [],
        worldSchema: { locations: [], factions: [], rules: [] },
        foreshadows: [],
        plotOutline: [],
        modelConfig: {},
        createdAt: '',
        updatedAt: '',
      },
      currentChapter: null,
      recentChapters: [],
      characters: [],
      locations: [],
      memory: undefined,
    } as unknown as ProjectContext;
  }

  it('analyzeChapter（拆文分析，提示词要求 JSON）携带 responseFormat', async () => {
    const service = makeService('openai');
    stubClient(service);

    const result = await service.analyzeChapter(minimalContext());
    expect(result).toEqual([]);

    const [, chatOpts] = chatMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toEqual({ type: 'json_object' });
  });

  it('getMemoryContext（记忆上下文，提示词要求 JSON）携带 responseFormat', async () => {
    const service = makeService('openai');
    stubClient(service);

    const result = await service.getMemoryContext(minimalContext());
    expect(result).toBeDefined();

    const [, chatOpts] = chatMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toEqual({ type: 'json_object' });
  });

  it('generateOutline（大纲生成，提示词要求纯 JSON）携带 responseFormat', async () => {
    const service = makeService('openai');
    stubClient(service);

    const result = await service.generateOutline('一个修仙故事');
    expect(result).not.toBeNull();

    const [, chatOpts] = chatMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(chatOpts.responseFormat).toEqual({ type: 'json_object' });
  });

  it('generateOutline 遇到网关 4xx 时自动降级重试（去掉 responseFormat）', async () => {
    const service = makeService('openai');
    const retryChat = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('400 Bad Request'), { status: 400 }))
      .mockResolvedValueOnce('{"outlines":[]}');
    (service as unknown as { client: unknown }).client = { chat: retryChat };

    const result = await service.generateOutline('一个修仙故事');
    expect(result).not.toBeNull();
    expect(retryChat).toHaveBeenCalledTimes(2);

    // 第一次带 responseFormat，降级重试不带
    const [, firstOpts] = retryChat.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(firstOpts.responseFormat).toEqual({ type: 'json_object' });
    const [, retryOpts] = retryChat.mock.calls[1] as [unknown, Record<string, unknown>];
    expect(retryOpts.responseFormat).toBeUndefined();
  });

  it('generateOutline 降级重试也失败时仍抛出原错误', async () => {
    const service = makeService('openai');
    const failingChat = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('400 Bad Request'), { status: 400 }))
      .mockRejectedValueOnce(Object.assign(new Error('400 Bad Request'), { status: 400 }));
    (service as unknown as { client: unknown }).client = { chat: failingChat };

    await expect(service.generateOutline('一个修仙故事')).rejects.toThrow('400 Bad Request');
    expect(failingChat).toHaveBeenCalledTimes(2);
  });

  it('continueWriting jsonMode=true 时携带 responseFormat，缺省时不携带', async () => {
    const service = makeService('openai');
    stubClient(service);
    chatMock.mockResolvedValue('这是正文');

    const withMode = await service.continueWriting(
      minimalContext(),
      'smartContinue',
      3000,
      undefined,
      true
    );
    expect(withMode.content).toBe('这是正文');
    const [, optsWith] = chatMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(optsWith.responseFormat).toEqual({ type: 'json_object' });

    chatMock.mockClear();
    await service.continueWriting(minimalContext(), 'smartContinue', 3000);
    const [, optsWithout] = chatMock.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(optsWithout.responseFormat).toBeUndefined();
  });
});

describe('UnifiedAIService.complete - 流式路径瞬态错误内层重试', () => {
  /** 把整段文本包成一次性 SSE 流；done=true 提供结束标记 */
  function stubChat(service: UnifiedAIService, impl: () => Promise<string>): void {
    (service as unknown as { client: unknown }).client = {
      stream: vi.fn().mockImplementation(() => {
        const controller = new AbortController();
        return {
          cancel: () => controller.abort(),
          async *[Symbol.asyncIterator]() {
            // 对齐 SDK 语义：cancel 后迭代器直接 return，不抛错
            const canceled = Symbol('canceled');
            const onCancel = new Promise<typeof canceled>(resolve => {
              controller.signal.addEventListener('abort', () => resolve(canceled), {
                once: true,
              });
            });
            const text = await Promise.race([impl(), onCancel]);
            if (text === canceled || controller.signal.aborted) return;
            yield { content: text, done: true, finishReason: 'stop' };
          },
        };
      }),
    };
  }

  it('瞬态网络错误重试后成功（chat 调用 2 次）', async () => {
    const service = makeService('openai');
    let calls = 0;
    stubChat(service, async () => {
      calls++;
      if (calls === 1) {
        throw new TypeError('fetch failed');
      }
      return '{"ok":true}';
    });

    const ctrl = new AbortController();
    const result = await service.complete('返回 JSON', { signal: ctrl.signal });

    expect(result).toContain('ok');
    expect(calls).toBe(2); // 第 1 次失败 + 第 2 次成功
  });

  it('重试次数用尽后抛出最后一个错误', async () => {
    const service = makeService('openai');
    stubChat(service, async () => {
      throw new TypeError('fetch failed');
    });

    const ctrl = new AbortController();
    await expect(
      service.complete('返回 JSON', { signal: ctrl.signal })
    ).rejects.toThrow('fetch failed');
  });

  it('持久错误（4xx）不重试，直接抛出', async () => {
    const service = makeService('openai');
    let calls = 0;
    const providerErr = Object.assign(new Error('Bad Request'), {
      name: 'AIError',
      status: 400,
    });
    stubChat(service, async () => {
      calls++;
      throw providerErr;
    });

    const ctrl = new AbortController();
    await expect(
      service.complete('返回 JSON', { signal: ctrl.signal })
    ).rejects.toThrow('Bad Request');
    expect(calls).toBe(1); // 持久错误，不重试
  });

  it('退避期间用户 abort 则立即抛出 AbortError，不再重试', async () => {
    const service = makeService('openai');
    let calls = 0;
    stubChat(service, async () => {
      calls++;
      throw new TypeError('fetch failed');
    });

    const ctrl = new AbortController();
    // 在 chat 第一次失败进入退避后立即 abort
    // （退避 1s，我们用 setTimeout 在 50ms 后 abort）
    setTimeout(() => ctrl.abort(), 50);

    await expect(
      service.complete('返回 JSON', { signal: ctrl.signal })
    ).rejects.toThrow();
    expect(calls).toBe(1); // 第 1 次失败后进入退避，退避中被 abort，没再重试
  });

  it('signal 预先 abort 时不调用 chat', async () => {
    const service = makeService('openai');
    let calls = 0;
    stubChat(service, async () => {
      calls++;
      return '{"ok":true}';
    });

    const ctrl = new AbortController();
    ctrl.abort();

    await expect(
      service.complete('返回 JSON', { signal: ctrl.signal })
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });

  it('请求进行中 abort 时 cancel 流并抛出 AbortError', async () => {
    const service = makeService('openai');
    let calls = 0;
    stubChat(service, () => {
      calls++;
      // 模拟慢请求：永不 resolve（真实场景是底层 fetch 卡住）
      return new Promise<string>(() => undefined);
    });

    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);

    await expect(
      service.complete('返回 JSON', { signal: ctrl.signal })
    ).rejects.toThrow();
    expect(calls).toBe(1); // 请求已发起（1 次），abort 后立即解除阻塞
  });

  it('流未收到结束标记时判定截断并重试，不把半截内容当成功', async () => {
    const service = makeService('openai');
    let calls = 0;
    (service as unknown as { client: unknown }).client = {
      stream: vi.fn().mockImplementation(() => ({
        cancel: () => undefined,
        async *[Symbol.asyncIterator]() {
          calls++;
          // 网关中途 RST：有内容但没有 finish_reason，迭代器静默结束
          yield { content: '{"ok":tr', done: false, finishReason: null };
          if (calls > 1) {
            yield { content: 'ue}', done: true, finishReason: 'stop' };
          }
        },
      })),
    };

    const result = await service.complete('返回 JSON');

    expect(calls).toBe(2); // 第 1 次截断被判瞬态错误并重试
    expect(result).toContain('ok');
  });

  it('finish_reason=length 时报长度上限截断，不把空正文当成功', async () => {
    const service = makeService('openai');
    (service as unknown as { client: unknown }).client = {
      stream: vi.fn().mockImplementation(() => ({
        cancel: () => undefined,
        async *[Symbol.asyncIterator]() {
          // 推理型模型烧光输出预算，content 全空
          yield { content: '', done: true, finishReason: 'length' };
        },
      })),
    };

    await expect(service.complete('返回 JSON')).rejects.toThrow(
      '输出被长度上限截断'
    );
  });
});
