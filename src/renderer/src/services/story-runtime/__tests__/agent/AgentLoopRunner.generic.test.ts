/**
 * AgentLoopRunner 通用内核测试：暂存写工具箱 + finish 前置条件（写完必检）+ CompositeToolkit。
 * 检索回合(research)适配器的行为由 AgentLoopRunner.test.ts 覆盖。
 */
import { describe, expect, it } from 'vitest';

import {
  AgentLoopRunner,
  type AgentLoopTransport,
  type AgentMessage,
  type AgentSession,
} from '../../agent/AgentLoopRunner';
import {
  CompositeToolkit,
  isPlainObject,
  readStringArg,
  type AgentToolkit,
  type ToolCallResult,
  type ToolDescriptor,
} from '../../agent/AgentToolkit';
import { StagedArtifact } from '../../agent/StagedArtifact';

class ScriptedTransport implements AgentLoopTransport {
  readonly calls: AgentMessage[][] = [];
  constructor(private readonly replies: string[]) {}
  async send(messages: AgentMessage[]): Promise<string> {
    this.calls.push(messages.map(message => ({ ...message })));
    const reply = this.replies[this.calls.length - 1];
    if (reply === undefined) throw new Error('ScriptedTransport replies 耗尽');
    return reply;
  }
}

/** 最小暂存写工具箱：submit_text 写稿、run_checks 校验（非空且含「结尾」二字才通过） */
class TinyWriterToolkit implements AgentToolkit {
  readonly draft = new StagedArtifact<string>();
  checkVersion = 0;

  listTools(): ToolDescriptor[] {
    return [
      { name: 'submit_text', description: '提交全文草稿', args: '{"text":"..."}' },
      { name: 'run_checks', description: '对当前草稿跑确定性校验', args: '{}', dedupe: false },
    ];
  }
  has(tool: string): boolean {
    return this.toolNames().includes(tool);
  }
  toolNames(): string[] {
    return this.listTools().map(tool => tool.name);
  }
  async call(tool: string, args: unknown): Promise<ToolCallResult> {
    if (!isPlainObject(args)) return { ok: false, error: 'args 必须是对象' };
    if (tool === 'submit_text') {
      const text = readStringArg(args, 'text');
      if (!text) return { ok: false, error: 'text 不能为空' };
      const revision = this.draft.set(text, { tool });
      return { ok: true, result: { revision, chars: text.length } };
    }
    if (tool === 'run_checks') {
      if (!this.draft.has()) return { ok: false, error: '尚无草稿,先 submit_text' };
      this.checkVersion += 1;
      const issues = this.draft.get()?.includes('结尾') ? [] : ['缺少结尾钩子'];
      this.draft.markVerified({ blocking: issues.length, summary: issues.join(';') });
      return { ok: true, result: { blocking: issues.length, issues } };
    }
    return { ok: false, error: `未知工具:${tool}` };
  }
}

function makeSession(toolkit: TinyWriterToolkit): AgentSession<{ note: string }> {
  return {
    systemPrompt: '你是写手。',
    kickoffMessage: '开始。',
    wrapUpPrompt: '请收尾。',
    parseFinish: record => (typeof record.note === 'string' ? { note: record.note } : null),
    guardFinish: () => {
      if (!toolkit.draft.has()) return '尚未提交草稿,不能收尾。';
      if (!toolkit.draft.isVerified()) {
        const last = toolkit.draft.lastVerification();
        return last && last.revision === toolkit.draft.revision()
          ? `当前稿未通过校验(${last.summary || `${last.blocking} 项阻断`}),请修改后重新 run_checks。`
          : '当前稿尚未 run_checks,请先校验。';
      }
      return null;
    },
    // 进展 = 稿有变化 或 跑过一次新校验
    progressVersion: () => toolkit.draft.revision() * 1000 + toolkit.checkVersion,
  };
}

const call = (tool: string, args: Record<string, unknown>) =>
  JSON.stringify({ thought: 't', action: 'tool_call', tool, args });
const finish = (note = 'done') => JSON.stringify({ action: 'finish', note });

describe('AgentLoopRunner.run 通用内核', () => {
  it('写完必检:未校验就 finish 被拒并回喂原因,校验后放行', async () => {
    const toolkit = new TinyWriterToolkit();
    const transport = new ScriptedTransport([
      finish(), // 无草稿
      call('submit_text', { text: '正文……结尾' }),
      finish(), // 有草稿未校验
      call('run_checks', {}),
      finish('ok'),
    ]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('model-finish');
    expect(outcome.finishPayload).toEqual({ note: 'ok' });
    expect(outcome.stats.toolCalls).toBe(2);
    const rejected = outcome.transcript.filter(item => item.action === 'rejected');
    expect(rejected).toHaveLength(2);
    expect(rejected[0]?.summary).toContain('尚未提交草稿');
    expect(rejected[1]?.summary).toContain('尚未 run_checks');
    // 拒绝原因作为 user 消息回喂
    const secondRound = transport.calls[1] ?? [];
    expect(secondRound[secondRound.length - 1]?.content).toContain('尚未提交草稿');
  });

  it('校验失败后改稿使已验证状态失效,必须重新校验才能收尾', async () => {
    const toolkit = new TinyWriterToolkit();
    const transport = new ScriptedTransport([
      call('submit_text', { text: '没有钩子的正文' }),
      call('run_checks', {}),
      finish(), // blocking=1 → 拒
      call('submit_text', { text: '改稿……结尾' }),
      finish(), // 改稿后未重检 → 拒
      call('run_checks', {}),
      finish(),
    ]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('model-finish');
    expect(toolkit.draft.get()).toBe('改稿……结尾');
    expect(toolkit.draft.revision()).toBe(2);
    const rejected = outcome.transcript.filter(item => item.action === 'rejected');
    expect(rejected[0]?.summary).toContain('缺少结尾钩子');
    expect(rejected[1]?.summary).toContain('尚未 run_checks');
  });

  it('finish 连续被拒达上限 → stall 收束,不无限循环', async () => {
    const toolkit = new TinyWriterToolkit();
    const transport = new ScriptedTransport([finish(), finish(), finish(), finish()]);
    const outcome = await new AgentLoopRunner(transport, toolkit, {
      maxFinishRejections: 3,
    }).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('stall');
    expect(outcome.finishPayload).toBeUndefined();
    expect(transport.calls).toHaveLength(3);
  });

  it('finish 载荷不合法按协议违规处理并纠偏', async () => {
    const toolkit = new TinyWriterToolkit();
    const transport = new ScriptedTransport([
      call('submit_text', { text: '结尾' }),
      call('run_checks', {}),
      JSON.stringify({ action: 'finish' }), // 缺 note
      finish('fixed'),
    ]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('model-finish');
    expect(outcome.finishPayload?.note).toBe('fixed');
    expect(outcome.transcript.filter(item => item.action === 'parse-error')).toHaveLength(1);
  });

  it('同稿重复 submit(相同参数)被停滞检测拒绝,不重复写入', async () => {
    const toolkit = new TinyWriterToolkit();
    const same = call('submit_text', { text: '结尾' });
    const transport = new ScriptedTransport([same, same, call('run_checks', {}), finish()]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('model-finish');
    expect(toolkit.draft.revision()).toBe(1);
    expect(outcome.transcript.some(item => item.summary?.includes('重复调用'))).toBe(true);
  });

  // 2026-09-03 反重力 100 章大纲修复 agent 实证:收尾提示本身要求「做最后一批修复
  // 并 run_checks 再 finish」,旧实现却在收尾提示后一刀切击杀任何工具调用,导致
  // 模型照提示做出的修复(append_to_section)在执行前被丢弃,整轮大纲带 blocker 报废。
  it('收尾提示后的实质修复解除收尾状态,继续直至 finish(而非一刀切击杀)', async () => {
    const toolkit = new TinyWriterToolkit();
    const first = call('submit_text', { text: '没有钩子的初稿' });
    const transport = new ScriptedTransport([
      first, // 进展:revision 1
      first, // 重复 → 无进展 1
      first, // 重复 → 无进展 2 = 上限 → 注入收尾提示
      call('submit_text', { text: '修复后的正文……结尾' }), // 收尾提示后的有效修复
      call('run_checks', {}), // 复检通过
      finish('修好了'),
    ]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('model-finish');
    expect(toolkit.draft.get()).toBe('修复后的正文……结尾');
    expect(toolkit.draft.revision()).toBe(2);
    // 收尾提示确实注入过(第 4 轮消息里)
    const fourthRound = transport.calls[3] ?? [];
    expect(fourthRound.some(message => message.content.includes('请收尾'))).toBe(true);
  });

  it('收尾提示后的新调用未产生实质进展(工具报错) → stall 收束', async () => {
    const toolkit = new TinyWriterToolkit();
    const first = call('submit_text', { text: '结尾' });
    const transport = new ScriptedTransport([
      first, // 进展
      first, // 无进展 1
      first, // 无进展 2 → 收尾提示
      call('submit_text', { text: '' }), // 新签名但参数非法 → 无版本前进
      finish(),
    ]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('stall');
    // 第 5 条回复(finish)从未被请求
    expect(transport.calls).toHaveLength(4);
  });

  it('解析失败且输出形似被截断的 JSON → 纠偏提示带截断指引', async () => {
    const toolkit = new TinyWriterToolkit();
    // 2026-09-03 反重力 100 章现场形态:响应在 "calls": 处被掐断,任何补全都救不回
    const truncated =
      '{"thought":"读取第4章蓝图、关键角色规划段正文与模板","action":"tool_call","calls":';
    const transport = new ScriptedTransport([
      truncated,
      call('submit_text', { text: '结尾' }),
      call('run_checks', {}),
      finish(),
    ]);
    const outcome = await new AgentLoopRunner(transport, toolkit).run(makeSession(toolkit));

    expect(outcome.finishReason).toBe('model-finish');
    const secondRound = transport.calls[1] ?? [];
    const hint = secondRound[secondRound.length - 1]?.content ?? '';
    expect(hint).toContain('只输出一个 JSON 对象');
    expect(hint).toContain('截断');
  });
});

describe('CompositeToolkit', () => {
  class OneTool implements AgentToolkit {
    constructor(private readonly name: string) {}
    listTools(): ToolDescriptor[] {
      return [{ name: this.name, description: this.name, args: '{}' }];
    }
    has(tool: string): boolean {
      return tool === this.name;
    }
    toolNames(): string[] {
      return [this.name];
    }
    async call(tool: string): Promise<ToolCallResult> {
      return { ok: true, result: `${tool} by ${this.name}` };
    }
  }

  it('按注册顺序路由到持有者,合并工具清单', async () => {
    const composite = new CompositeToolkit([new OneTool('a'), new OneTool('b')]);
    expect(composite.toolNames()).toEqual(['a', 'b']);
    expect(composite.has('b')).toBe(true);
    expect(await composite.call('b', {})).toEqual({ ok: true, result: 'b by b' });
    const missing = await composite.call('zzz', {});
    expect(missing.ok).toBe(false);
  });

  it('工具名冲突在构造期抛错(而不是静默覆盖)', () => {
    expect(() => new CompositeToolkit([new OneTool('a'), new OneTool('a')])).toThrow('冲突');
  });
});

describe('StagedArtifact', () => {
  it('update 基于当前值局部修改并递增 revision;无产物时返回 null', () => {
    const artifact = new StagedArtifact<string[]>();
    expect(artifact.update(list => [...list, 'x'], { tool: 'revise' })).toBeNull();
    artifact.set(['a'], { tool: 'submit' });
    expect(artifact.update(list => [...list, 'b'], { tool: 'revise', note: '补段' })).toBe(2);
    expect(artifact.get()).toEqual(['a', 'b']);
    expect(artifact.history().map(item => item.tool)).toEqual(['submit', 'revise']);
  });
});
