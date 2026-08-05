import { describe, expect, it, vi } from 'vitest';

import type {
  ChapterCommitReceipt,
  FactExtractor,
  JsonValue,
  StoryPatch,
  StructuredAI,
  StructuredAIRequest,
} from '@/types/story-runtime';

import { LongFormWritingEngine } from '../LongFormWritingEngine';
import { parseStoryPatch } from '../patches';
import { StoryRuntimeClient } from '../StoryRuntimeClient';
import { makeBootstrap, makeContracts, makeState } from './testFixtures';

type StoryRuntimeAPI = Window['electronAPI']['storyRuntime'];

function makeIPC(overrides: Partial<StoryRuntimeAPI> = {}): StoryRuntimeAPI {
  return {
    bootstrap: async input => ({
      projectId: input.projectId,
      databasePath: 'test.db',
      schemaVersion: 1,
      seededRows: 0,
    }),
    upsert: async () => ({ changedRows: 1 }),
    query: async input => ({
      rows:
        input.table === 'snapshots'
          ? [
              {
                id: 'snapshot-1',
                snapshot_type: 'canonical',
                payload_json: makeState() as unknown as JsonValue,
              },
            ]
          : [],
      total: input.table === 'snapshots' ? 1 : 0,
    }),
    commitAccepted: async input => ({
      commitId: input.commit.id,
      created: true,
      outboxIds: [1],
    }),
    readOutbox: async () => [],
    completeOutbox: async () => ({ changed: true }),
    health: async projectId => ({
      ok: true,
      projectId,
      databasePath: 'test.db',
      schemaVersion: 1,
      journalMode: 'wal',
      foreignKeys: true,
      integrity: 'ok',
      pendingOutbox: 0,
    }),
    ...overrides,
  };
}

describe('StoryRuntimeClient', () => {
  it('对 IPC 输入输出做类型化 Zod 校验', async () => {
    const bootstrap = vi.fn(makeIPC().bootstrap);
    const client = new StoryRuntimeClient(makeIPC({ bootstrap }));

    await client.bootstrap(makeBootstrap());
    await expect(client.loadState('project-1')).resolves.toEqual(makeState());
    expect(bootstrap).toHaveBeenCalledOnce();
  });

  it('拒绝无效 IPC 状态和 rejected commit', async () => {
    const commitAccepted = vi.fn(makeIPC().commitAccepted);
    const client = new StoryRuntimeClient(
      makeIPC({
        query: async () => ({
          rows: [{ payload_json: { chapter: 'bad' } }],
          total: 1,
        }),
        commitAccepted,
      })
    );

    await expect(client.loadState('project-1')).rejects.toThrow('结构校验失败');
    await expect(
      client.commitChapter({
        id: 'rejected',
        projectId: 'project-1',
        chapterNumber: 2,
        status: 'rejected',
        baseState: makeState(),
        contractPack: makeContracts(),
        sceneDrafts: [],
        extractedFacts: { events: [], deltas: [], evidence: [] },
        validation: { accepted: false, issues: [], checkedDomains: [] },
        overlay: { baseChapter: 1, deltas: [], events: [] },
        reasons: ['failed'],
      })
    ).rejects.toThrow('禁止发送到 IPC');
    expect(commitAccepted).not.toHaveBeenCalled();
  });

  it('accepted commit 会投影 entities（含 intro 角色），避免 events.subject_id 外键失败', async () => {
    const commitAccepted = vi.fn(makeIPC().commitAccepted);
    const client = new StoryRuntimeClient(makeIPC({ commitAccepted }));
    const introId = 'char:intro:陈渡-abcd1234';
    const baseState = makeState();

    await client.commitChapter({
      id: 'project-1:chapter:1:commit:test',
      projectId: 'project-1',
      chapterNumber: 1,
      status: 'accepted',
      baseState,
      contractPack: makeContracts(),
      sceneDrafts: [
        {
          sceneId: 'scene-1',
          beatId: 'chapter-1:CBN',
          paragraphs: ['陈渡看见标注。'],
          candidateEvents: [],
        },
      ],
      extractedFacts: {
        events: [
          {
            id: 'evt-1',
            chapter: 1,
            sceneId: 'scene-1',
            type: 'reveal',
            summary: '陈渡看见标注',
            participants: [introId],
            causes: [],
            effects: [],
            evidence: ['陈渡看见标注'],
          },
        ],
        deltas: [
          {
            operation: 'set',
            path: `entities.${introId}`,
            value: {
              id: introId,
              kind: 'character',
              name: '陈渡',
              aliases: [],
              attributes: { introducedInChapter: true },
              knownBy: [introId],
              sourceTrace: [],
            },
            evidence: '正文引入角色：陈渡',
          },
        ],
        evidence: ['陈渡看见标注'],
      },
      validation: { accepted: true, issues: [], checkedDomains: [] },
      overlay: {
        baseChapter: 1,
        deltas: [
          {
            operation: 'set',
            path: `entities.${introId}`,
            value: {
              id: introId,
              kind: 'character',
              name: '陈渡',
              aliases: [],
              attributes: { introducedInChapter: true },
              knownBy: [introId],
              sourceTrace: [],
            },
            evidence: '正文引入角色：陈渡',
          },
        ],
        events: [],
      },
      reasons: [],
    });

    expect(commitAccepted).toHaveBeenCalledOnce();
    const input = commitAccepted.mock.calls[0][0] as {
      projections: {
        entities: Array<{ id: string; canonical_name: string }>;
        events: Array<{ subject_id: string | null }>;
      };
    };
    expect(input.projections.entities.some(entity => entity.id === introId)).toBe(true);
    expect(input.projections.entities.some(entity => entity.id === 'hero')).toBe(true);
    expect(input.projections.events[0]?.subject_id).toBe(introId);
  });
});

describe('patch 模型', () => {
  it('区分 scene patch 与 paragraph patch 并校验 revision', () => {
    const patch: StoryPatch = parseStoryPatch({
      kind: 'paragraph',
      projectId: 'project-1',
      chapterNumber: 2,
      sceneId: 'scene-1',
      paragraphIndex: 0,
      expectedRevision: 3,
      replacement: '替换后的段落',
      reason: '修复时间矛盾',
    });

    expect(patch.kind).toBe('paragraph');
    expect(() =>
      parseStoryPatch({
        ...patch,
        expectedRevision: -1,
      })
    ).toThrow('结构校验失败');
  });
});

class FakeAI implements StructuredAI {
  callCount = 0;
  chapterJudgeCalls = 0;

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    this.callCount += 1;
    if (request.purpose === 'chapter-judge' || request.purpose === 'fulfillment-check') {
      this.chapterJudgeCalls += 1;
      const payload = JSON.parse(request.prompt) as {
        mustCover?: string[];
        forbiddenZones?: string[];
      };
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
          reason: '未触发',
        })),
        issues: [],
        // 兼容旧 fulfillment-check
        results: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
      };
    }
    const payload = JSON.parse(request.prompt) as {
      primaryBeatId?: string;
      beat?: { id: string; summary: string };
      chapterBeats?: Array<{ kind: string; summary: string }>;
      allowedCandidateEventIds?: string[];
      candidateSummaries?: Record<string, string>;
      allowedCandidateEvents?: Array<{
        id: string;
        summary: string;
        participants: string[];
        prerequisites: string[];
        effects: string[];
      }>;
    };
    const beatId = payload.primaryBeatId ?? payload.beat?.id ?? 'unknown';
    const arc =
      payload.chapterBeats?.map(beat => beat.summary).join('→') ??
      payload.beat?.summary ??
      '推进';
    const candidateEvents =
      payload.allowedCandidateEvents ??
      (payload.allowedCandidateEventIds ?? []).map(id => ({
        id,
        summary: payload.candidateSummaries?.[id] ?? id,
        participants: [] as string[],
        prerequisites: [] as string[],
        effects: [] as string[],
      }));
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      paragraphs: [`林夜经历了${arc}。`],
      candidateEvents,
    };
  }
}

describe('LongFormWritingEngine', () => {
  it('使用可注入 AI/FactExtractor 完成规划、写作、校验和严格提交', async () => {
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
            evidence: ['林夜经历了守卫盘查'],
          },
        ],
        deltas: [],
        evidence: ['林夜经历了守卫盘查'],
      }),
    };
    const receipt: ChapterCommitReceipt = {
      commitId: 'commit-1',
      revision: 1,
      acceptedAt: '2026-01-02T00:00:00.000Z',
    };
    const commitChapter = vi.fn(async () => receipt);
    const ai = new FakeAI();
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: { commitChapter },
    });

    const result = await engine.write({
      projectId: 'project-1',
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: ['克制'],
      maxContextTokens: 10_000,
    });

    expect(result.plan.beats).toHaveLength(3);
    // 规划仍保留多 beat；正文改为单次整章起草
    expect(result.drafts).toHaveLength(1);
    // 起草 1 次 + 默认深度语义 chapter-judge 1 次
    expect(ai.callCount).toBe(2);
    expect(ai.chapterJudgeCalls).toBe(1);
    expect(result.rewriteRounds).toBe(0);
    expect(result.report.accepted).toBe(true);
    expect(result.commit.status).toBe('accepted');
    expect(result.receipt).toEqual(receipt);
    expect(commitChapter).toHaveBeenCalledOnce();
  });

  it('审核失败后带 revision hints 重写，修复后 accepted', async () => {
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
    const ai = new RewriteAwareAI();
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({
          commitId: 'commit-rewrite',
          revision: 1,
          acceptedAt: '2026-01-02T00:00:00.000Z',
        }),
      },
    });

    const result = await engine.write({
      projectId: 'project-1',
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: ['克制'],
      maxContextTokens: 10_000,
      maxRewriteRounds: 2,
    });

    expect(ai.draftCalls).toBe(2);
    expect(ai.sawRevisionHints).toBe(true);
    expect(result.rewriteRounds).toBe(1);
    expect(result.commit.status).toBe('accepted');
    expect(result.drafts[0].paragraphs.join('')).not.toContain('御剑入城');
  });

  it('重写次数用尽后仍失败则 rejected 且不再继续', async () => {
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
    const ai = new AlwaysForbiddenAI();
    const saveRejectedDraft = vi.fn(async () => undefined);
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => {
          throw new Error('rejected 不应调用 commitChapter');
        },
        saveRejectedDraft,
      },
    });

    const result = await engine.write({
      projectId: 'project-1',
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: ['克制'],
      maxContextTokens: 10_000,
      maxRewriteRounds: 2,
    });

    // 初稿 + 2 次重写
    expect(ai.draftCalls).toBe(3);
    expect(result.rewriteRounds).toBe(2);
    expect(result.commit.status).toBe('rejected');
    expect(saveRejectedDraft).toHaveBeenCalledOnce();
  });

  it('补充轮输出异常膨胀（混入 JSON 骨架）时丢弃该轮，正文不包含垃圾（Bug 7 护栏）', async () => {
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
    const ai = new BloatSupplementAI();
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({
          commitId: 'commit-bloat',
          revision: 1,
          acceptedAt: '2026-01-02T00:00:00.000Z',
        }),
      },
    });

    const result = await engine.write({
      projectId: 'project-1',
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: ['克制'],
      maxContextTokens: 10_000,
      maxRewriteRounds: 2,
      targetWordCount: 3000,
    });

    const finalProse = result.drafts[0].paragraphs.join('');
    // 补充垃圾（JSON 骨架）被护栏丢弃：最终正文不含垃圾且未膨胀
    expect(finalProse).not.toContain('paragraphs');
    expect(finalProse.length).toBeLessThan(20_000);
    expect(ai.bloatedSupplementRounds).toBeGreaterThan(0);
  });

  it('事实提取瞬态失败时步骤级重试，draft 不重新生成', async () => {
    // factExtractor 第 1 次抛网络错误（瞬态）、第 2 次成功
    let extractCalls = 0;
    const facts: FactExtractor = {
      extract: async input => {
        extractCalls += 1;
        if (extractCalls === 1) {
          throw new TypeError('fetch failed');
        }
        return {
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
              evidence: ['林夜经历了守卫盘查'],
            },
          ],
          deltas: [],
          evidence: ['林夜经历了守卫盘查'],
        };
      },
    };
    const receipt: ChapterCommitReceipt = {
      commitId: 'commit-retry',
      revision: 1,
      acceptedAt: '2026-01-02T00:00:00.000Z',
    };
    const ai = new FakeAI();
    const draftCallsBefore = ai.callCount; // 应为 0
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: { commitChapter: async () => receipt },
    });

    const result = await engine.write({
      projectId: 'project-1',
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: ['克制'],
      maxContextTokens: 10_000,
    });

    // 事实提取重试了 2 次（第 1 次失败 + 第 2 次成功）
    expect(extractCalls).toBe(2);
    // 最终成功提交
    expect(result.commit.status).toBe('accepted');
    expect(result.receipt).toEqual(receipt);
    // draft 步骤的 AI 调用没有因 extract 失败而翻倍：
    // ai.callCount = draft(1) + chapter-judge(1) = 2，而非重试后变成 4
    expect(ai.callCount).toBe(draftCallsBefore + 2);
  });

  it('事实提取持久错误不重试，直接抛出', async () => {
    // schema 校验失败（持久）→ 不应触发步骤级重试
    let extractCalls = 0;
    const facts: FactExtractor = {
      extract: async () => {
        extractCalls += 1;
        throw new Error('事实提取结果 结构校验失败: expected array, received undefined');
      },
    };
    const ai = new FakeAI();
    const engine = new LongFormWritingEngine({
      ai,
      factExtractor: facts,
      commitPort: { commitChapter: async () => ({ commitId: 'x', revision: 1, acceptedAt: '' }) },
    });

    await expect(
      engine.write({
        projectId: 'project-1',
        contracts: makeContracts(),
        state: makeState(),
        recentScenes: [],
        retrievedScenes: [],
        styleGuidance: ['克制'],
        maxContextTokens: 10_000,
      })
    ).rejects.toThrow('结构校验失败');
    // 持久错误只调用 1 次，不重试
    expect(extractCalls).toBe(1);
  });
});

/** 补充轮返回超大垃圾文本（JSON 骨架），用于验证 Bug 7 输出护栏 */
class BloatSupplementAI implements StructuredAI {
  draftCalls = 0;
  bloatedSupplementRounds = 0;

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    if (request.purpose === 'chapter-judge' || request.purpose === 'fulfillment-check') {
      const payload = JSON.parse(request.prompt) as {
        mustCover?: string[];
        forbiddenZones?: string[];
      };
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
          reason: '未触发',
        })),
        issues: [],
        results: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
      };
    }
    if (request.schemaName === 'SupplementParagraphs') {
      this.bloatedSupplementRounds += 1;
      // 混入 JSON 骨架的巨型输出（模拟实测 32 万字符异常）
      return {
        paragraphs: Array.from({ length: 20 }, () =>
          '{paragraphs}```json{垃圾文本'.repeat(500)
        ),
      };
    }
    this.draftCalls += 1;
    // 第 1 次 draft 极短（触发补字），重写轮给足字数
    const short = this.draftCalls === 1;
    return {
      sceneId: 'chapter-1:CBN:scene',
      beatId: 'chapter-1:CBN',
      chapterTitle: '测试章',
      paragraphs: short
        ? ['这是第一版草稿。']
        : Array.from({ length: 120 }, () => '这是完整版正文段落，内容充实，情节推进正常。'),
      candidateEvents: [],
    };
  }
}

/** 首稿触发禁区字面命中，带 revision 后改写为合规正文 */
class RewriteAwareAI implements StructuredAI {  draftCalls = 0;
  sawRevisionHints = false;

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    if (request.purpose === 'chapter-judge' || request.purpose === 'fulfillment-check') {
      const payload = JSON.parse(request.prompt) as {
        mustCover?: string[];
        forbiddenZones?: string[];
      };
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
          reason: '未触发',
        })),
        issues: [],
        results: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
      };
    }

    this.draftCalls += 1;
    const payload = JSON.parse(request.prompt) as {
      primaryBeatId?: string;
      revisionFeedback?: { mustFix?: string[] } | null;
      allowedCandidateEventIds?: string[];
      candidateSummaries?: Record<string, string>;
      chapterBeats?: Array<{ summary: string }>;
    };
    if (payload.revisionFeedback?.mustFix?.length) {
      this.sawRevisionHints = true;
    }
    const beatId = payload.primaryBeatId ?? 'unknown';
    const arc = payload.chapterBeats?.map(beat => beat.summary).join('→') ?? '推进';
    const candidateEvents = (payload.allowedCandidateEventIds ?? []).map(id => ({
      id,
      summary: payload.candidateSummaries?.[id] ?? id,
      participants: [] as string[],
      prerequisites: [] as string[],
      effects: [] as string[],
    }));
    const violates = !payload.revisionFeedback?.mustFix?.length;
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      paragraphs: [
        violates
          ? `林夜经历了${arc}，竟敢御剑入城闯关。`
          : `林夜经历了${arc}，步行通过城门。`,
      ],
      candidateEvents,
    };
  }
}

/** 始终输出禁区字面，用于验证重写上限 */
class AlwaysForbiddenAI implements StructuredAI {
  draftCalls = 0;

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    if (request.purpose === 'chapter-judge' || request.purpose === 'fulfillment-check') {
      const payload = JSON.parse(request.prompt) as {
        mustCover?: string[];
        forbiddenZones?: string[];
      };
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
        results: (payload.mustCover ?? []).map(node => ({
          node,
          fulfilled: true,
          evidence: ['语义履约'],
          reason: '测试放行',
        })),
      };
    }

    this.draftCalls += 1;
    const payload = JSON.parse(request.prompt) as {
      primaryBeatId?: string;
      allowedCandidateEventIds?: string[];
      candidateSummaries?: Record<string, string>;
      chapterBeats?: Array<{ summary: string }>;
    };
    const beatId = payload.primaryBeatId ?? 'unknown';
    const arc = payload.chapterBeats?.map(beat => beat.summary).join('→') ?? '推进';
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      paragraphs: [`林夜经历了${arc}，仍然御剑入城。`],
      candidateEvents: (payload.allowedCandidateEventIds ?? []).map(id => ({
        id,
        summary: payload.candidateSummaries?.[id] ?? id,
        participants: [],
        prerequisites: [],
        effects: [],
      })),
    };
  }
}
