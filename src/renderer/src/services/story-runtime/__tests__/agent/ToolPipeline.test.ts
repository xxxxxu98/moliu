/**
 * 工具调用管线与表驱动工具箱基类测试(P1):
 * - ToolPipeline:错误归一化(致命/取消冒泡、其余转 ok:false)、观测记录(ok/ms/error)、透传查询;
 * - TableToolkit:参数校验、按名分发、未知工具文案、descriptor 与 handler 解耦。
 */
import { describe, expect, it } from 'vitest';

import {
  AgentLoopRunner,
  type AgentLoopTransport,
} from '../../agent/AgentLoopRunner';
import {
  AgentToolFatalError,
  TableToolkit,
  type AgentToolkit,
  type ToolCallResult,
  type ToolSpec,
} from '../../agent/AgentToolkit';
import { ToolPipeline, type ToolCallRecord } from '../../agent/ToolPipeline';

class ScriptedToolkit implements AgentToolkit {
  constructor(private readonly handler: (tool: string, args: unknown) => Promise<ToolCallResult>) {}
  listTools() {
    return [{ name: 'echo', description: '回显', args: '{}' }];
  }
  has(tool: string): boolean {
    return tool === 'echo';
  }
  toolNames(): string[] {
    return ['echo'];
  }
  call(tool: string, args: unknown): Promise<ToolCallResult> {
    return this.handler(tool, args);
  }
}

/** 单调递增的假时钟:每次读取前进 10ms,便于断言耗时 */
function fakeClock(): () => number {
  let t = 0;
  return () => {
    t += 10;
    return t;
  };
}

describe('ToolPipeline', () => {
  it('透传成功结果并记录观测(ok=true,耗时来自注入时钟)', async () => {
    const records: ToolCallRecord[] = [];
    const pipeline = new ToolPipeline(
      new ScriptedToolkit(async () => ({ ok: true, result: 'hi' })),
      { onCall: record => records.push(record), now: fakeClock() }
    );
    const result = await pipeline.call('echo', {});
    expect(result).toEqual({ ok: true, result: 'hi' });
    expect(records).toEqual([{ tool: 'echo', ok: true, ms: 10 }]);
  });

  it('工具返回 ok:false 时原样透传,观测记录失败原因', async () => {
    const records: ToolCallRecord[] = [];
    const pipeline = new ToolPipeline(
      new ScriptedToolkit(async () => ({ ok: false, error: '参数缺失' })),
      { onCall: record => records.push(record), now: fakeClock() }
    );
    const result = await pipeline.call('echo', {});
    expect(result).toEqual({ ok: false, error: '参数缺失' });
    expect(records).toEqual([{ tool: 'echo', ok: false, ms: 10, error: '参数缺失' }]);
  });

  it('普通异常归一化为 ok:false 回喂模型,不抛出', async () => {
    const records: ToolCallRecord[] = [];
    const pipeline = new ToolPipeline(
      new ScriptedToolkit(async () => {
        throw new Error('网络抖动');
      }),
      { onCall: record => records.push(record), now: fakeClock() }
    );
    const result = await pipeline.call('echo', {});
    expect(result).toEqual({ ok: false, error: '网络抖动' });
    expect(records[0]).toMatchObject({ ok: false, error: '网络抖动' });
  });

  it('致命错误原样冒泡,且仍被观测为失败', async () => {
    const records: ToolCallRecord[] = [];
    const fatal = new AgentToolFatalError('审查链不可用');
    const pipeline = new ToolPipeline(
      new ScriptedToolkit(async () => {
        throw fatal;
      }),
      { onCall: record => records.push(record), now: fakeClock() }
    );
    await expect(pipeline.call('echo', {})).rejects.toBe(fatal);
    expect(records).toEqual([{ tool: 'echo', ok: false, ms: 10, error: '审查链不可用' }]);
  });

  it('用户取消(AbortError)原样冒泡', async () => {
    const pipeline = new ToolPipeline(
      new ScriptedToolkit(async () => {
        throw new DOMException('Aborted', 'AbortError');
      }),
      { now: fakeClock() }
    );
    await expect(pipeline.call('echo', {})).rejects.toThrow('Aborted');
  });

  it('listTools / has / toolNames 直通底层工具箱', () => {
    const pipeline = new ToolPipeline(new ScriptedToolkit(async () => ({ ok: true, result: null })));
    expect(pipeline.toolNames()).toEqual(['echo']);
    expect(pipeline.has('echo')).toBe(true);
    expect(pipeline.has('nope')).toBe(false);
    expect(pipeline.listTools()[0]?.name).toBe('echo');
  });
});

/** 测试用表驱动工具箱:两个工具,一个回显、一个总是失败 */
class DemoTableToolkit extends TableToolkit {
  protected specs(): ToolSpec[] {
    return [
      {
        descriptor: { name: 'echo', description: '回显 text', args: '{"text":"..."}' },
        handler: args => ({ ok: true, result: args.text ?? null }),
      },
      {
        descriptor: { name: 'fail', description: '总是失败', args: '{}', dedupe: false },
        handler: () => ({ ok: false, error: '故意失败' }),
      },
    ];
  }
}

describe('TableToolkit', () => {
  it('按名分发到对应 handler,并把 args 原样传入', async () => {
    const toolkit = new DemoTableToolkit();
    expect(await toolkit.call('echo', { text: 'hi' })).toEqual({ ok: true, result: 'hi' });
    expect(await toolkit.call('fail', {})).toEqual({ ok: false, error: '故意失败' });
  });

  it('未知工具返回统一文案,列出可用工具', async () => {
    const result = await new DemoTableToolkit().call('hack_tool', {});
    expect(result).toEqual({ ok: false, error: '未知工具:hack_tool。可用:echo/fail' });
  });

  it('非对象 args 在分发前拒绝(先于未知工具检查)', async () => {
    const toolkit = new DemoTableToolkit();
    expect(await toolkit.call('echo', 'not-object')).toEqual({
      ok: false,
      error: 'args 必须是 JSON 对象,收到:string',
    });
    expect(await toolkit.call('hack_tool', 'not-object')).toEqual({
      ok: false,
      error: 'args 必须是 JSON 对象,收到:string',
    });
  });

  it('listTools 只暴露描述符,不泄露 handler;dedupe 字段保留', () => {
    const toolkit = new DemoTableToolkit();
    const tools = toolkit.listTools();
    expect(tools).toEqual([
      { name: 'echo', description: '回显 text', args: '{"text":"..."}' },
      { name: 'fail', description: '总是失败', args: '{}', dedupe: false },
    ]);
    expect(tools.every(tool => !('handler' in tool))).toBe(true);
    expect(toolkit.has('fail')).toBe(true);
    expect(toolkit.toolNames()).toEqual(['echo', 'fail']);
  });
});

describe('AgentLoopRunner 接入工具管线', () => {
  it('每次工具调用经 onToolCall 观测,工具失败回喂模型而不打断循环', async () => {
    const records: ToolCallRecord[] = [];
    const replies = [
      '{"action":"tool_call","tool":"echo","args":{"text":"a"}}',
      '{"action":"tool_call","tool":"fail","args":{}}',
      '{"action":"finish","note":"done"}',
    ];
    let cursor = 0;
    const transport: AgentLoopTransport = { send: async () => replies[cursor++] ?? '' };
    let version = 0;
    const runner = new AgentLoopRunner(transport, new DemoTableToolkit(), {
      onToolCall: record => records.push(record),
      now: fakeClock(),
    });
    const outcome = await runner.run<{ note: string }>({
      systemPrompt: '你是测试代理。',
      kickoffMessage: '开始。',
      wrapUpPrompt: '请收尾。',
      parseFinish: record => (typeof record.note === 'string' ? { note: record.note } : null),
      onToolResult: () => {
        version += 1;
      },
      progressVersion: () => version,
    });
    expect(outcome.finishReason).toBe('model-finish');
    expect(records.map(record => [record.tool, record.ok])).toEqual([
      ['echo', true],
      ['fail', false],
    ]);
    expect(outcome.stats.toolCalls).toBe(2);
  });
});
