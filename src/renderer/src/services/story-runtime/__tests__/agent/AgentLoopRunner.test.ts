import { describe, expect, it } from 'vitest';

import type {
  ContractPack,
  SceneChunk,
  ScenePlan,
  StoryState,
} from '@/types/story-runtime';

import { AgentLoopRunner, type AgentLoopTransport, type AgentMessage } from '../../agent/AgentLoopRunner';
import { BookToolkit } from '../../agent/BookToolkit';

/** 剧本化传输:按序返回预设回复,记录每次收到的消息数组 */
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

class ThrowingTransport implements AgentLoopTransport {
  async send(): Promise<string> {
    throw new Error('gateway dead');
  }
}

const toolCall = (tool: string, args: Record<string, unknown>, thought = '查证') =>
  JSON.stringify({ thought, action: 'tool_call', tool, args });

const finish = (coverage: Record<string, unknown>) =>
  JSON.stringify({ thought: '信息充分', action: 'finish', coverage });

function makeState(): StoryState {
  return {
    chapter: 313,
    entities: {
      hero: {
        id: 'hero',
        kind: 'character',
        name: '林夜',
        aliases: [],
        attributes: { status: 'alive' },
        knownBy: [],
        sourceTrace: [],
      },
      zhoumao: {
        id: 'zhoumao',
        kind: 'character',
        name: '周茂',
        aliases: ['茂公'],
        attributes: { status: 'dead', location: '皇陵' },
        knownBy: [],
        sourceTrace: [],
      },
    },
    events: [
      {
        id: 'evt-death',
        chapter: 312,
        sceneId: 'scene-312',
        type: 'death',
        summary: '周茂在皇陵被鸩杀',
        participants: ['zhoumao'],
        causes: [],
        effects: [],
        evidence: [],
      },
    ],
    inventory: {},
    knowledge: {},
    timeline: ['第312章 周茂身死'],
    openForeshadows: ['fs-ghost'],
    fulfilledNodes: [],
  };
}

function makeSceneChunks(): SceneChunk[] {
  return [
    {
      id: 'scene-312',
      chapterId: 'ch-312',
      chapterIndex: 312,
      order: 1,
      title: '鸩杀',
      text: '周茂饮下毒酒,倒在皇陵的石阶上。',
      participants: ['zhoumao'],
      locations: [],
      sourceTrace: [],
    },
  ];
}

function makeContracts(): ContractPack {
  const meta = {
    schemaVersion: 'story-runtime/v1' as const,
    projectId: 'project-1',
    sourceTrace: [],
  };
  return {
    master: {
      meta: { ...meta, kind: 'master', id: 'master' },
      premise: '林夜追查遗诏',
      genres: [],
      immutableRules: [],
      characterTruths: {},
      style: [],
      forbidden: [],
    },
    volume: {
      meta: { ...meta, kind: 'volume', id: 'volume-1' },
      volumeNumber: 1,
      title: '皇陵',
      objective: '找到遗诏',
      conflict: '追杀',
      pacing: [],
      requiredPayoffs: [],
      forbidden: [],
    },
    chapter: {
      meta: { ...meta, kind: 'chapter', id: 'chapter-313' },
      chapterNumber: 313,
      title: '旧案',
      goal: '重启旧案',
      CBN: '林夜重返皇陵',
      CPNs: ['翻查遗诏'],
      CEN: '锁定真凶',
      mustCover: [],
      forbidden: [],
      allowedCharacterNames: ['林夜', '周茂'],
    },
    review: {
      meta: { ...meta, kind: 'review', id: 'review' },
      blockingDomains: [],
      requiredEvidence: true,
      maxWarnings: 0,
      mustCheck: [],
    },
  };
}

function makePlan(): ScenePlan {
  return {
    chapterNumber: 313,
    beats: [
      {
        id: 'beat-1',
        kind: 'CBN',
        order: 1,
        summary: '重返皇陵',
        dependsOn: [],
        candidateEvents: [
          {
            id: 'cand-1',
            summary: '林夜重访皇陵',
            participants: ['hero', 'zhoumao'],
            prerequisites: [],
            effects: [],
          },
        ],
      },
    ],
    prechecks: [],
  };
}

function makeRunnerInput() {
  return {
    chapterNumber: 313,
    contracts: makeContracts(),
    plan: makePlan(),
    state: makeState(),
    sceneChunks: makeSceneChunks(),
    recentScenes: makeSceneChunks(),
    foreshadowCatalog: [
      { id: 'fs-ghost', hint: '遗诏下落成谜', status: 'buried', payoffChapter: 313 },
    ],
  };
}

function makeRunner(transport: AgentLoopTransport, options?: ConstructorParameters<typeof AgentLoopRunner>[2]) {
  const input = makeRunnerInput();
  const toolkit = new BookToolkit({
    chapterNumber: input.chapterNumber,
    contracts: input.contracts,
    state: input.state,
    sceneChunks: input.sceneChunks,
    foreshadowCatalog: input.foreshadowCatalog,
  });
  return { runner: new AgentLoopRunner(transport, toolkit, options), input };
}

describe('AgentLoopRunner', () => {
  it('正常流:多轮工具 + finish,dossier 蒸馏 + coverage 交叉核对补 gaps', async () => {
    const transport = new ScriptedTransport([
      '```json\n' + toolCall('query_entity', { name: '茂公' }) + '\n```',
      toolCall('list_foreshadows', { filter: 'due' }),
      finish({
        castStatesConfirmed: ['林夜'],
        foreshadowsChecked: ['fs-ghost'],
        gaps: [{ topic: '遗诏下落', reason: '无直接证据' }],
      }),
    ]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);

    expect(result.finishReason).toBe('model-finish');
    expect(result.dossier.stats.rounds).toBe(3);
    expect(result.dossier.stats.toolCalls).toBe(2);
    expect(result.dossier.stats.byTool.query_entity).toBe(1);
    const zhoumao = result.dossier.entitySnapshots.find(item => item.name === '周茂');
    expect(zhoumao?.statusLine).toContain('status=dead');
    expect(result.dossier.foreshadowChecks[0]?.id).toBe('fs-ghost');
    // coverage 只确认了林夜 → 周茂被交叉核对并入 gaps(不阻断)
    expect(result.dossier.gaps.some(gap => gap.topic.includes('周茂'))).toBe(true);
    expect(result.dossier.gaps.some(gap => gap.topic === '遗诏下落')).toBe(true);
    // 消息序列:system + 起始 user + (assistant+user)*2 + finish 的 assistant
    const lastCall = transport.calls[transport.calls.length - 1];
    expect(lastCall?.[0]?.role).toBe('system');
    expect(lastCall?.[lastCall.length - 2]?.role).toBe('assistant');
    // 首轮回复带代码围栏也应被宽松解析(未触发 parse-error)
    expect(result.transcript.filter(item => item.action === 'parse-error')).toHaveLength(0);
    // 系统任务书含基底描述与协议说明
    expect(transport.calls[0]?.[0]?.content).toContain('禁止重查');
    expect(transport.calls[0]?.[0]?.content).toContain('query_entity');
  });

  it('全部出场角色已确认时不补交叉核对 gap', async () => {
    const transport = new ScriptedTransport([
      finish({ castStatesConfirmed: ['林夜', '周茂'] }),
    ]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);
    expect(result.finishReason).toBe('model-finish');
    expect(result.dossier.gaps.some(gap => gap.topic.includes('未在检索回合确认'))).toBe(false);
  });

  it('停滞检测:重复签名拒绝执行,注入收尾提示后 finish 正常收束', async () => {
    const duplicate = toolCall('query_entity', { name: '周茂' });
    const transport = new ScriptedTransport([
      duplicate,
      duplicate,
      duplicate,
      finish({ castStatesConfirmed: ['林夜', '周茂'] }),
    ]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);

    expect(result.finishReason).toBe('model-finish');
    expect(result.transcript.filter(item => item.action === 'rejected')).toHaveLength(2);
    // 收尾提示已注入
    const lastCall = transport.calls[transport.calls.length - 1];
    const joined = lastCall?.map(message => message.content).join('\n') ?? '';
    expect(joined).toContain('请立即收尾');
    // 重复查询未重复执行
    expect(result.dossier.stats.toolCalls).toBe(1);
  });

  it('停滞收束:收尾提示后仍发起新查询 → stall + 降级 gap', async () => {
    const duplicate = toolCall('query_entity', { name: '周茂' });
    const transport = new ScriptedTransport([duplicate, duplicate, duplicate, duplicate]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);

    expect(result.finishReason).toBe('stall');
    expect(result.dossier.gaps.some(gap => gap.topic.includes('提前收束'))).toBe(true);
  });

  it('资源安全网:token 预算触顶 → budget 优雅降级(不抛错,dossier 照常产出)', async () => {
    const transport = new ScriptedTransport([toolCall('query_entity', { name: '周茂' })]);
    const { runner, input } = makeRunner(transport, { tokenBudget: 1 });
    const result = await runner.research(input);

    expect(result.finishReason).toBe('budget');
    expect(result.dossier.stats.rounds).toBe(0);
    expect(result.dossier.gaps.some(gap => gap.reason.includes('保守处理'))).toBe(true);
    expect(transport.calls).toHaveLength(0);
  });

  it('协议容错:连续解析失败先纠偏,3 次后 protocol-error 降级', async () => {
    const transport = new ScriptedTransport([
      '这不是 JSON',
      '还是不是 {"action":"bogus"}',
      toolCall('unknown_tool', {}),
      toolCall('another_unknown', {}),
      finish({}),
    ]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);

    expect(result.finishReason).toBe('protocol-error');
    expect(result.dossier.stats.toolCalls).toBe(0);
    // 首次解析失败后有纠偏消息
    const secondCall = transport.calls[1] ?? [];
    expect(secondCall[secondCall.length - 1]?.content).toContain('只输出一个 JSON 对象');
  });

  it('传输硬失败:按 protocol-error 优雅降级,不吞用户取消', async () => {
    const { runner, input } = makeRunner(new ThrowingTransport());
    const result = await runner.research(input);
    expect(result.finishReason).toBe('protocol-error');
    expect(result.dossier.gaps.some(gap => gap.topic.includes('提前收束'))).toBe(true);
  });

  it('批量协议:一轮多个独立查询合并执行,结果合并在一条消息', async () => {
    const batched = JSON.stringify({
      thought: '并发查状态与伏笔',
      action: 'tool_call',
      calls: [
        { tool: 'query_entity', args: { name: '周茂' } },
        { tool: 'list_foreshadows', args: { filter: 'due' } },
      ],
    });
    const transport = new ScriptedTransport([
      batched,
      finish({ castStatesConfirmed: ['林夜', '周茂'] }),
    ]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);

    expect(result.finishReason).toBe('model-finish');
    // 2 个模型轮(批量查询轮 + finish 轮),一个查询轮执行了 2 个工具
    expect(result.dossier.stats.rounds).toBe(2);
    expect(result.dossier.stats.toolCalls).toBe(2);
    expect(result.dossier.stats.byTool).toEqual({ query_entity: 1, list_foreshadows: 1 });
    expect(result.dossier.entitySnapshots[0]?.name).toBe('周茂');
    // 两个结果合并在同一条 user 消息
    const resultMessage = [...(transport.calls[1] ?? [])].reverse()
      .find(message => message.role === 'user' && message.content.startsWith('{"results"'));
    const payload = JSON.parse(resultMessage?.content ?? '{}') as {
      results: Array<{ tool: string; ok: boolean }>;
    };
    expect(payload.results).toHaveLength(2);
    expect(payload.results.map(item => item.tool)).toEqual(['query_entity', 'list_foreshadows']);
  });

  it('批量混合:重复查询跳过并标注,新查询照常执行', async () => {
    const duplicate = toolCall('query_entity', { name: '周茂' });
    const mixed = JSON.stringify({
      thought: '一个重复一个新',
      action: 'tool_call',
      calls: [
        { tool: 'query_entity', args: { name: '周茂' } },
        { tool: 'search_scenes', args: { query: '鸩杀' } },
      ],
    });
    const transport = new ScriptedTransport([duplicate, mixed, finish({})]);
    const { runner, input } = makeRunner(transport);
    const result = await runner.research(input);

    expect(result.finishReason).toBe('model-finish');
    expect(result.dossier.stats.toolCalls).toBe(2);
    expect(result.dossier.stats.byTool).toEqual({ query_entity: 1, search_scenes: 1 });
    const resultMessage = transport.calls[2]?.find(
      message => message.role === 'user' && message.content.includes('skipped')
    );
    expect(resultMessage).toBeDefined();
    const payload = JSON.parse(resultMessage?.content ?? '{}') as {
      results: Array<{ tool?: string; skipped?: string[]; reason?: string }>;
    };
    expect(payload.results.some(item => item.tool === 'search_scenes')).toBe(true);
    expect(payload.results.find(item => item.skipped)?.skipped).toEqual(['query_entity']);
  });

  it('用户取消:signal 已中止直接抛 AbortError', async () => {
    const controller = new AbortController();
    controller.abort();
    const { runner, input } = makeRunner(new ScriptedTransport([]), {
      signal: controller.signal,
    });
    await expect(runner.research(input)).rejects.toThrow('Aborted');
  });
});
