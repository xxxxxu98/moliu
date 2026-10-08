/**
 * AgentLoopRunner 韧性测试：transport 失败的轮内重试 + 单轮墙钟截断 + 用户取消。
 * 对应 docs/agent-architecture-refactor.md 的「改稿墙钟预算 / transport 失败」治理。
 */
import { describe, expect, it } from 'vitest';

import {
  AgentLoopRunner,
  type AgentLoopTransport,
  type AgentMessage,
  type AgentSession,
} from '../../agent/AgentLoopRunner';
import type { AgentToolkit, ToolCallResult, ToolDescriptor } from '../../agent/AgentToolkit';

const FINISH = '{"action":"finish","note":"ok"}';

class NoTools implements AgentToolkit {
  listTools(): ToolDescriptor[] {
    return [];
  }
  has(): boolean {
    return false;
  }
  toolNames(): string[] {
    return [];
  }
  async call(): Promise<ToolCallResult> {
    return { ok: false, error: 'no tools' };
  }
}

/** 按脚本依次返回:字符串为回复,Error 为抛出 */
class FlakyTransport implements AgentLoopTransport {
  calls = 0;
  constructor(private readonly script: Array<string | Error>) {}
  async send(_messages: AgentMessage[]): Promise<string> {
    const next = this.script[this.calls];
    this.calls += 1;
    if (next === undefined) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    return next;
  }
}

/** 永不返回、只响应 abort 的传输:模拟 30 分钟级挂起的单请求 */
class HangingTransport implements AgentLoopTransport {
  calls = 0;
  async send(_messages: AgentMessage[], options?: { signal?: AbortSignal }): Promise<string> {
    this.calls += 1;
    await new Promise((_resolve, reject) => {
      options?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true }
      );
    });
    return FINISH;
  }
}

function session(): AgentSession<{ note: string }> {
  return {
    systemPrompt: '测试任务书。',
    kickoffMessage: '开始。',
    wrapUpPrompt: '请收尾。',
    parseFinish: record => (typeof record.note === 'string' ? { note: record.note } : null),
    progressVersion: () => 0,
  };
}

describe('transport 失败的轮内重试', () => {
  it('首次失败后原地重试一次并成功,消息历史不重复', async () => {
    const transport = new FlakyTransport([new Error('API 未返回内容'), FINISH]);
    const runner = new AgentLoopRunner(transport, new NoTools(), { transportRetryDelayMs: 1 });
    const outcome = await runner.run(session());

    expect(outcome.finishReason).toBe('model-finish');
    expect(transport.calls).toBe(2);
    expect(outcome.transcript.map(entry => entry.action)).toEqual(['transport-retry', 'finish']);
  });

  it('重试耗尽后按 protocol-error 优雅降级,不抛出', async () => {
    const transport = new FlakyTransport([new Error('e1'), new Error('e2'), FINISH]);
    const runner = new AgentLoopRunner(transport, new NoTools(), { transportRetryDelayMs: 1 });
    const outcome = await runner.run(session());

    expect(outcome.finishReason).toBe('protocol-error');
    expect(transport.calls).toBe(2);
  });

  it('transportRetries=0 时关闭轮内重试', async () => {
    const transport = new FlakyTransport([new Error('e1'), FINISH]);
    const runner = new AgentLoopRunner(transport, new NoTools(), { transportRetries: 0 });
    const outcome = await runner.run(session());

    expect(outcome.finishReason).toBe('protocol-error');
    expect(transport.calls).toBe(1);
  });

  it('剩余墙钟不足 minRetryBudgetMs 时不重试', async () => {
    const transport = new FlakyTransport([new Error('e1'), FINISH]);
    // 总预算 60s < 默认 minRetryBudgetMs(120s):重试吃不起
    const runner = new AgentLoopRunner(transport, new NoTools(), { timeoutMs: 60_000 });
    const outcome = await runner.run(session());

    expect(outcome.finishReason).toBe('protocol-error');
    expect(transport.calls).toBe(1);
  });

  it('退避等待期间用户取消,立即以 AbortError 冒泡', async () => {
    const controller = new AbortController();
    const transport = new FlakyTransport([new Error('e1'), FINISH]);
    const runner = new AgentLoopRunner(transport, new NoTools(), {
      signal: controller.signal,
      transportRetryDelayMs: 10_000,
    });
    const pending = runner.run(session());
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow('Aborted');
    expect(transport.calls).toBe(1);
  });
});

describe('单轮墙钟截断', () => {
  it('单轮超出剩余墙钟即中止,按 budget 收束而不抛出', async () => {
    const transport = new HangingTransport();
    const runner = new AgentLoopRunner(transport, new NoTools(), {
      timeoutMs: 80,
      minRetryBudgetMs: 0,
    });
    const started = Date.now();
    const outcome = await runner.run(session());

    expect(outcome.finishReason).toBe('budget');
    expect(transport.calls).toBe(1);
    // 不得拖到 transport 的 30 分钟级超时
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('用户取消(非墙钟)仍原样冒泡,不被当成 budget', async () => {
    const controller = new AbortController();
    const runner = new AgentLoopRunner(new HangingTransport(), new NoTools(), {
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    const pending = runner.run(session());
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toThrow('Aborted');
  });
});
