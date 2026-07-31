import { describe, expect, it, vi } from 'vitest';

import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';

import { AIChapterJudge } from '../AIChapterJudge';
import { AIFulfillmentJudge } from '../AIFulfillmentJudge';

describe('AIChapterJudge', () => {
  it('一次请求覆盖履约/禁区/深度语义，并归一化漏回节点', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        expect(request.purpose).toBe('chapter-judge');
        return {
          fulfillment: [
            {
              node: '节点A',
              fulfilled: true,
              evidence: ['……'],
              reason: '已写到',
            },
          ],
          forbidden: [
            {
              zone: '禁区1',
              violated: false,
              evidence: [],
              reason: '未触发',
            },
          ],
          issues: [
            {
              type: 'logic_gap',
              severity: 'medium',
              location: '中段',
              description: '前后口径不一致',
              evidence: ['……'],
            },
          ],
        };
      }),
    };

    const judge = new AIChapterJudge(ai);
    const result = await judge.judge({
      mustCover: ['节点A', '节点B'],
      forbiddenZones: ['禁区1'],
      chapterText: '正文',
      checkDeepSemantic: true,
    });

    expect(ai.generate).toHaveBeenCalledOnce();
    expect(result.fulfillment).toHaveLength(2);
    expect(result.fulfillment[0]).toMatchObject({ node: '节点A', fulfilled: true });
    expect(result.fulfillment[1]).toMatchObject({
      node: '节点B',
      fulfilled: false,
      reason: '模型未返回该节点的履约判定',
    });
    expect(result.forbidden[0]).toMatchObject({ zone: '禁区1', violated: false });
    expect(result.issues).toHaveLength(1);
  });

  it('无待审项且关闭深度语义时不调用 AI', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => emptyJudgePayload()),
    };
    const judge = new AIChapterJudge(ai);
    const result = await judge.judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: false,
    });
    expect(ai.generate).not.toHaveBeenCalled();
    expect(result).toEqual({ fulfillment: [], forbidden: [], issues: [] });
  });
});

describe('AIFulfillmentJudge 兼容封装', () => {
  it('转调 chapter-judge 且关闭深度语义', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        expect(request.purpose).toBe('chapter-judge');
        const prompt = JSON.parse(request.prompt) as { checkDeepSemantic: boolean };
        expect(prompt.checkDeepSemantic).toBe(false);
        return {
          fulfillment: [
            { node: '节点A', fulfilled: true, evidence: [], reason: 'ok' },
          ],
          forbidden: [],
          issues: [],
        };
      }),
    };
    const judge = new AIFulfillmentJudge(ai);
    const result = await judge.judge({
      mustCover: ['节点A'],
      chapterText: '正文',
      facts: { events: [], deltas: [], evidence: [] },
    });
    expect(ai.generate).toHaveBeenCalledOnce();
    expect(result.results[0]?.fulfilled).toBe(true);
  });
});

function emptyJudgePayload() {
  return { fulfillment: [], forbidden: [], issues: [] };
}
