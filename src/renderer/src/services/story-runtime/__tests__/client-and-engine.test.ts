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

  async generate<T>(request: StructuredAIRequest<T>): Promise<unknown> {
    this.callCount += 1;
    const payload = JSON.parse(request.prompt) as {
      beat: { id: string; summary: string };
      chapterBeats?: Array<{ kind: string; summary: string }>;
      allowedCandidateEvents: Array<{
        id: string;
        summary: string;
        participants: string[];
        prerequisites: string[];
        effects: string[];
      }>;
    };
    const arc =
      payload.chapterBeats?.map(beat => beat.summary).join('→') ?? payload.beat.summary;
    return {
      sceneId: `${payload.beat.id}:scene`,
      beatId: payload.beat.id,
      paragraphs: [`林夜经历了${arc}。`],
      candidateEvents: payload.allowedCandidateEvents,
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
    expect(ai.callCount).toBe(1);
    expect(result.report.accepted).toBe(true);
    expect(result.commit.status).toBe('accepted');
    expect(result.receipt).toEqual(receipt);
    expect(commitChapter).toHaveBeenCalledOnce();
  });
});
