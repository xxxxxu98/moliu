import { describe, expect, it, vi } from 'vitest';

import { AIFactExtractor, ensureTopLevelEvidence } from '../FactExtractor';
import type { ExtractedFacts, StructuredAI } from '@/types/story-runtime';

describe('ensureTopLevelEvidence', () => {
  it('顶层为空时从 events/deltas 回填', () => {
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'plot',
          summary: '穿越',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['主角睁开眼'],
        },
      ],
      deltas: [
        {
          operation: 'set',
          path: 'char.location',
          value: '死牢',
          evidence: '把他打入死牢',
        },
      ],
      evidence: [],
    };

    const filled = ensureTopLevelEvidence(facts);
    expect(filled.evidence).toEqual(['主角睁开眼', '把他打入死牢']);
  });

  it('顶层已有证据时不覆盖', () => {
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'plot',
          summary: '穿越',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['新证据'],
        },
      ],
      deltas: [],
      evidence: ['已有汇总'],
    };
    expect(ensureTopLevelEvidence(facts).evidence).toEqual(['已有汇总']);
  });
});

describe('AIFactExtractor 死亡候选仲裁', () => {
  it('候选进入 prompt，candidateVerdicts 随结果回传（2026-08-28 根治方案）', async () => {
    let capturedSystem = '';
    let capturedPrompt = '';
    const ai = {
      generate: vi.fn(async (request: {
        system: string;
        prompt: string;
        parse: (value: unknown) => unknown;
      }) => {
        capturedSystem = request.system;
        capturedPrompt = request.prompt;
        return request.parse({
          events: [],
          deltas: [],
          evidence: ['顾青舟睁眼'],
          candidateVerdicts: [{ id: 0, isDeath: false, reason: '假设句' }],
        });
      }),
    };

    const facts = await new AIFactExtractor(ai as unknown as StructuredAI).extract({
      projectId: 'p1',
      chapterNumber: 1,
      sceneDrafts: [
        { sceneId: 's1', paragraphs: ['只要一刀落下，顾青舟的头颅便会当场落地。'] },
      ] as never,
      state: { entities: {}, events: [], chapter: 1, openForeshadows: [] } as never,
      deathCandidates: [
        {
          id: 0,
          sentence: '只要一刀落下，顾青舟的头颅便会当场落地',
          name: '顾青舟',
          state: '死亡',
        },
      ],
    });

    expect(capturedSystem).toContain('死亡候选仲裁');
    expect(capturedPrompt).toContain('头颅便会当场落地');
    expect(facts.candidateVerdicts?.[0]).toMatchObject({
      id: 0,
      isDeath: false,
      reason: '假设句',
    });
  });

  it('无候选时不附加仲裁规则', async () => {
    let capturedSystem = '';
    const ai = {
      generate: vi.fn(async (request: {
        system: string;
        parse: (value: unknown) => unknown;
      }) => {
        capturedSystem = request.system;
        return request.parse({ events: [], deltas: [], evidence: ['x'] });
      }),
    };

    await new AIFactExtractor(ai as unknown as StructuredAI).extract({
      projectId: 'p1',
      chapterNumber: 1,
      sceneDrafts: [] as never,
      state: { entities: {}, events: [], chapter: 1 } as never,
    });

    expect(capturedSystem).not.toContain('死亡候选仲裁');
  });
});
