import { describe, expect, it } from 'vitest';

import { ensureTopLevelEvidence } from '../FactExtractor';
import type { ExtractedFacts } from '@/types/story-runtime';

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
          evidence: ['宋辞睁开眼'],
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
    expect(filled.evidence).toEqual(['宋辞睁开眼', '把他打入死牢']);
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
