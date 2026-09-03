/**
 * LongFormWritingEngine × WriterAgent 集成：初稿审查未通过时由 agent 回合改稿,
 * 落库物恒为最后一次通过审查的 revision；未注入 writerAgent 时不整章重写，带着初审结果提交。
 */
import { describe, expect, it, vi } from 'vitest';

import type {
  FactExtractor,
  StructuredAI,
  StructuredAIRequest,
} from '@/types/story-runtime';

import { LongFormWritingEngine } from '../../LongFormWritingEngine';
import {
  createWriterAgentStep,
  type WriterAgentStepInput,
} from '../../agent/WriterAgent';
import type { AgentLoopTransport, AgentMessage } from '../../agent/AgentLoopRunner';
import { makeContracts, makeState } from '../testFixtures';

/** 起草恒含禁区字面「御剑入城」;判官放行(禁区由 ContinuityValidator 字面路径判 blocking) */
class ForbiddenDraftAI implements StructuredAI {
  draftCalls = 0;
  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    if (request.purpose === 'chapter-judge' || request.purpose === 'fulfillment-check') {
      const payload = JSON.parse(request.prompt) as { mustCover?: string[]; forbiddenZones?: string[] };
      return {
        fulfillment: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
        forbidden: (payload.forbiddenZones ?? []).map(zone => ({
          zone,
          violated: false,
          evidence: [],
          reason: '字面路径已处理',
        })),
        issues: [],
      };
    }
    this.draftCalls += 1;
    const payload = JSON.parse(request.prompt) as { primaryBeatId?: string };
    const beatId = payload.primaryBeatId ?? 'unknown';
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      paragraphs: ['林夜来到城门。', '守卫盘查之后,林夜御剑入城。', '林夜通过城门。'],
      candidateEvents: [],
    };
  }
}

const facts: FactExtractor = {
  extract: async input => ({
    events: [
      {
        id: 'event-1',
        chapter: input.chapterNumber,
        sceneId: input.sceneDrafts[0].sceneId,
        type: 'checkpoint',
        summary: '守卫盘查',
        participants: ['hero'],
        causes: [],
        effects: ['守卫盘查'],
        evidence: input.sceneDrafts[0].paragraphs,
      },
    ],
    deltas: [],
    evidence: input.sceneDrafts[0].paragraphs,
  }),
};

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

const call = (tool: string, args: Record<string, unknown> = {}) =>
  JSON.stringify({ thought: 't', action: 'tool_call', tool, args });
const finish = JSON.stringify({ action: 'finish', summary: '改掉御剑' });

function baseInput() {
  return {
    projectId: 'project-1',
    contracts: makeContracts(),
    state: makeState(),
    recentScenes: [],
    retrievedScenes: [],
    styleGuidance: ['克制'],
    maxContextTokens: 10_000,
    maxRewriteRounds: 2,
  };
}

describe('LongFormWritingEngine × WriterAgent', () => {
  it('初稿触禁区 → agent 读稿/局部改稿/复检 → accepted;不再整章重起草', async () => {
    const transport = new ScriptedTransport([
      call('get_draft'),
      call('revise_paragraphs', { edits: [{ index: 1, text: '守卫盘查之后,林夜牵马步行入城。' }] }),
      call('run_checks'),
      finish,
    ]);
    const onSummary = vi.fn();
    const ai = new ForbiddenDraftAI();
    const commitChapter = vi.fn(async () => ({
      commitId: 'commit-agent',
      revision: 1,
      acceptedAt: '2026-01-02T00:00:00.000Z',
    }));
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: { commitChapter },
      writerAgent: createWriterAgentStep(transport, { onSummary }),
    });

    const result = await engine.write(baseInput());

    expect(ai.draftCalls).toBe(1);
    expect(result.commit.status).toBe('accepted');
    expect(commitChapter).toHaveBeenCalledOnce();
    expect(result.drafts[0].paragraphs.join('')).not.toContain('御剑入城');
    expect(result.drafts[0].paragraphs[1]).toContain('牵马步行');
    expect(result.rewriteRounds).toBe(1);
    expect(result.writer).toMatchObject({ checksUsed: 1, revertedUnchecked: false, finishReason: 'model-finish' });
    expect(onSummary).toHaveBeenCalledOnce();
    // 系统任务书含合同、正文硬规则与工具清单;首条 user 消息带初审问题清单
    const system = transport.calls[0]?.[0]?.content ?? '';
    expect(system).toContain('第2章《破局》');
    expect(system).toContain('【正文硬规则】');
    expect(system).toContain('revise_paragraphs');
    expect(system).toContain('query_entity');
    expect(transport.calls[0]?.[1]?.content).toContain('御剑入城');
  });

  it('初稿即通过时不触发 agent 回合(零额外开销)', async () => {
    const transport = new ScriptedTransport([]);
    const passingAI: StructuredAI = {
      async generate<T>(request: StructuredAIRequest<T>) {
        const forbidden = new ForbiddenDraftAI();
        const value = (await forbidden.generate(request)) as { paragraphs?: string[] };
        if (Array.isArray(value.paragraphs)) {
          value.paragraphs = ['林夜来到城门。', '守卫盘查之后,林夜步行入城。', '林夜通过城门。'];
        }
        return value;
      },
    };
    const engine = new LongFormWritingEngine({
      ai: passingAI,
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({ commitId: 'c', revision: 1, acceptedAt: '2026-01-02T00:00:00.000Z' }),
      },
      writerAgent: createWriterAgentStep(transport),
    });
    const result = await engine.write(baseInput());
    expect(result.commit.status).toBe('accepted');
    expect(result.writer).toBeUndefined();
    expect(transport.calls).toHaveLength(0);
  });

  it('agent 改稿后不复检就反复 finish → stall,回退到初审稿并 rejected', async () => {
    const transport = new ScriptedTransport([
      call('revise_paragraphs', { edits: [{ index: 1, text: '林夜步行入城。' }] }),
      finish,
      finish,
      finish,
    ]);
    const saveRejectedDraft = vi.fn(async () => undefined);
    const engine = new LongFormWritingEngine({
      ai: new ForbiddenDraftAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => {
          throw new Error('rejected 不应调用 commitChapter');
        },
        saveRejectedDraft,
      },
      writerAgent: createWriterAgentStep(transport),
    });

    const result = await engine.write(baseInput());

    expect(result.commit.status).toBe('rejected');
    expect(saveRejectedDraft).toHaveBeenCalledOnce();
    // 未复检的改动被丢弃,落库(拒收稿)与审查物一致
    expect(result.drafts[0].paragraphs[1]).toContain('御剑入城');
    expect(result.writer).toMatchObject({ checksUsed: 0, revertedUnchecked: true, finishReason: 'stall' });
    expect(result.rewriteRounds).toBe(0);
  });

  it('run_checks 期间审查链不可用 → [review-unavailable] 冒泡,不被当作工具错误回喂', async () => {
    const transport = new ScriptedTransport([
      call('revise_paragraphs', { edits: [{ index: 1, text: '林夜步行入城。' }] }),
      call('run_checks'),
      finish,
    ]);
    let validateCalls = 0;
    const engine = new LongFormWritingEngine({
      ai: new ForbiddenDraftAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({ commitId: 'c', revision: 1, acceptedAt: '2026-01-02T00:00:00.000Z' }),
      },
      validator: {
        validate: async () => {
          validateCalls += 1;
          if (validateCalls === 1) {
            return {
              accepted: false,
              issues: [
                { id: 'forbidden-1', domain: 'fulfillment', severity: 'blocking', message: '触发禁区', evidence: [] },
              ],
              checkedDomains: ['fulfillment'],
            };
          }
          throw new Error('判官网关 503');
        },
      },
      writerAgent: createWriterAgentStep(transport),
    });

    await expect(engine.write(baseInput())).rejects.toThrow('[review-unavailable]');
    expect(transport.calls).toHaveLength(2);
  });

  it('writerAgent 收到的输入携带审查端口与初审结果(端口口径 = 引擎主链)', async () => {
    const seen: WriterAgentStepInput[] = [];
    const engine = new LongFormWritingEngine({
      ai: new ForbiddenDraftAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => {
          throw new Error('rejected 不应调用 commitChapter');
        },
        saveRejectedDraft: async () => undefined,
      },
      writerAgent: {
        async revise(input) {
          seen.push(input);
          const reviewed = await input.reviewPort.review(input.initialDrafts);
          return {
            drafts: input.initialDrafts,
            facts: reviewed.facts,
            report: reviewed.report,
            checksUsed: 1,
            finishReason: 'model-finish',
            transcript: [],
            stats: { rounds: 1, toolCalls: 1, byTool: { run_checks: 1 }, ms: 1, finishReason: 'model-finish' },
            revertedUnchecked: false,
          };
        },
      },
    });
    const result = await engine.write(baseInput());
    expect(seen).toHaveLength(1);
    expect(seen[0].maxChecks).toBe(2);
    expect(seen[0].initialReview.report.accepted).toBe(false);
    expect(seen[0].knownCharacterNames).toContain('林夜');
    // 同一稿再审结果一致(禁区字面仍在)→ rejected
    expect(result.report.accepted).toBe(false);
    expect(result.commit.status).toBe('rejected');
  });
});
