import { describe, expect, it } from 'vitest';

import type { CandidateEvent, SceneBeat } from '@/types/story-runtime';

import { coerceSceneDraft } from '../SceneDraftEngine';

const beat: SceneBeat = {
  id: 'chapter-1:CBN',
  kind: 'CBN',
  order: 0,
  summary: '开篇钩子',
  dependsOn: [],
  candidateEvents: [],
};

const allowed: CandidateEvent[] = [
  {
    id: 'chapter-1:CBN:event:1',
    summary: '开篇钩子',
    participants: [],
    prerequisites: [],
    effects: ['开篇钩子'],
  },
];

describe('coerceSceneDraft', () => {
  it('补齐 AI 漏掉的 sceneId/beatId/candidateEvents', () => {
    const draft = coerceSceneDraft(
      {
        paragraphs: ['夜色压城，林夜推开客栈木门。'],
      },
      beat,
      allowed
    );

    expect(draft).toEqual({
      sceneId: 'chapter-1:CBN:scene',
      beatId: 'chapter-1:CBN',
      paragraphs: ['夜色压城，林夜推开客栈木门。'],
      candidateEvents: allowed,
    });
  });

  it('支持 data 包装层与 content 字段', () => {
    const draft = coerceSceneDraft(
      {
        data: {
          content: '第一段。\n\n第二段。',
        },
      },
      beat,
      allowed
    );

    expect(draft.paragraphs).toEqual(['第一段。', '第二段。']);
    expect(draft.beatId).toBe('chapter-1:CBN');
  });

  it('只保留 allowed 内的 candidateEvents', () => {
    const draft = coerceSceneDraft(
      {
        paragraphs: ['正文'],
        candidateEvents: [
          allowed[0],
          {
            id: 'forged',
            summary: '伪造',
            participants: [],
            prerequisites: [],
            effects: [],
          },
        ],
      },
      beat,
      allowed
    );

    expect(draft.candidateEvents).toEqual(allowed);
  });

  it('无正文时抛错', () => {
    expect(() => coerceSceneDraft({ foo: 1 }, beat, allowed)).toThrow('未返回可用正文段落');
  });
});
