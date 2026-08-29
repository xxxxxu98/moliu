import { describe, expect, it, vi } from 'vitest';

import type {
  FactExtractor,
  ResearchDossier,
  StructuredAI,
  StructuredAIRequest,
} from '@/types/story-runtime';

import { LongFormWritingEngine } from '../../LongFormWritingEngine';
import { makeContracts, makeState } from '../testFixtures';

/** 与 client-and-engine.test.ts 的 FakeAI 同口径:judge 全放行,draft 单次整章 */
class FakeAI implements StructuredAI {
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
      };
    }
    const payload = JSON.parse(request.prompt) as { primaryBeatId?: string };
    const beatId = payload.primaryBeatId ?? 'unknown';
    return {
      sceneId: `${beatId}:scene`,
      beatId,
      paragraphs: ['林夜经历了守卫盘查。'],
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
        sceneId: input.sceneDrafts[0]?.sceneId ?? 'scene-1',
        type: 'checkpoint',
        summary: '守卫盘查',
        participants: ['hero'],
        causes: [],
        effects: [],
        evidence: ['林夜经历了守卫盘查'],
      },
    ],
    deltas: [],
    evidence: ['林夜经历了守卫盘查'],
  }),
};

function makeDossier(): ResearchDossier {
  return {
    entitySnapshots: [
      {
        id: 'hero',
        name: '林夜',
        kind: 'character',
        statusLine: 'status=alive;location=北境',
        sourceRounds: [1],
      },
    ],
    foreshadowChecks: [],
    priorSceneRefs: [],
    timelineFacts: [],
    gaps: [{ topic: '守卫番号', reason: '无命中' }],
    stats: {
      rounds: 2,
      toolCalls: 1,
      byTool: { query_entity: 1 },
      ms: 800,
      finishReason: 'model-finish',
    },
  };
}

describe('LongFormWritingEngine 检索回合集成', () => {
  it('注入 research step 时:检索先于上下文打包,dossier 进 ContextPack,result 带摘要', async () => {
    const research = vi.fn(async () => makeDossier());
    const engine = new LongFormWritingEngine({
      ai: new FakeAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({
          commitId: 'commit-1',
          revision: 1,
          acceptedAt: '2026-01-02T00:00:00.000Z',
        }),
      },
      research: { research },
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

    expect(research).toHaveBeenCalledOnce();
    const dossierBlock = result.context.blocks.find(block => block.kind === 'research-dossier');
    expect(dossierBlock).toBeDefined();
    expect(dossierBlock?.critical).toBe(true);
    expect(dossierBlock?.content).toContain('林夜');
    expect(dossierBlock?.content).toContain('不得虚构');
    expect(result.research?.finishReason).toBe('model-finish');
    expect(result.research?.toolCalls).toBe(1);
    expect(result.commit.status).toBe('accepted');
  });

  it('research step 抛错时降级为纯基底打包,不阻塞写作主链(AbortError 除外)', async () => {
    const engine = new LongFormWritingEngine({
      ai: new FakeAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({
          commitId: 'commit-2',
          revision: 1,
          acceptedAt: '2026-01-02T00:00:00.000Z',
        }),
      },
      research: {
        research: async () => {
          throw new Error('检索通道不可用');
        },
      },
    });

    const result = await engine.write({
      projectId: 'project-1',
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: [],
      maxContextTokens: 10_000,
    });

    expect(result.context.blocks.some(block => block.kind === 'research-dossier')).toBe(false);
    expect(result.research).toBeUndefined();
    expect(result.commit.status).toBe('accepted');
  });

  it('research step 抛 AbortError 时冒泡(用户取消不降级)', async () => {
    const engine = new LongFormWritingEngine({
      ai: new FakeAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({
          commitId: 'commit-3',
          revision: 1,
          acceptedAt: '2026-01-02T00:00:00.000Z',
        }),
      },
      research: {
        research: async () => {
          throw new DOMException('Aborted', 'AbortError');
        },
      },
    });

    await expect(
      engine.write({
        projectId: 'project-1',
        contracts: makeContracts(),
        state: makeState(),
        recentScenes: [],
        retrievedScenes: [],
        styleGuidance: [],
        maxContextTokens: 10_000,
      })
    ).rejects.toThrow('Aborted');
  });

  it('未注入 research 时行为零变化:无 dossier block,result.research 为 undefined', async () => {
    const engine = new LongFormWritingEngine({
      ai: new FakeAI(),
      factExtractor: facts,
      commitPort: {
        commitChapter: async () => ({
          commitId: 'commit-4',
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
    });

    expect(result.context.blocks.some(block => block.kind === 'research-dossier')).toBe(false);
    expect(result.research).toBeUndefined();
    expect(result.commit.status).toBe('accepted');
  });
});
