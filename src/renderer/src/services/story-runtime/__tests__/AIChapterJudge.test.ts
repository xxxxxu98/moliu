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

  it('提示词声明未来揭示护的是核心信息本身，换载体同样算提前揭示', async () => {
    // 实测缺陷：伏笔约定「死者密纸上有绩效二字」，第 2 章照写被拦下，
    // 第 1 章改成主角自己包袱里的纸写同样两字却放行——判官把载体当成了事实边界。
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return { fulfillment: [], forbidden: [], issues: [] };
      }),
    };

    await new AIChapterJudge(ai).judge({
      mustCover: [],
      forbiddenZones: [],
      chapterText: '正文',
      checkDeepSemantic: true,
      chapterNumber: 1,
      futureReveals: [{ description: '死者官员的密纸上有绩效二字', notBeforeChapter: 4 }],
    });

    expect(capturedSystem).toContain('保护的是该事实的核心信息本身，不是它的载体');
    expect(capturedSystem).toContain('换了承载物');
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

  it('模型漏写或多写句末标点时仍能匹配原始合同节点', async () => {
    const ai: StructuredAI = {
      generate: vi.fn(async () => ({
        fulfillment: [
          {
            node: '埋下户部侍郎的线索',
            fulfilled: true,
            evidence: ['私账签押指向户部侍郎'],
            reason: '已埋线索',
          },
        ],
        forbidden: [
          {
            zone: '不得公开户部侍郎姓名。',
            violated: false,
            evidence: [],
            reason: '未公开',
          },
        ],
        issues: [],
      })),
    };
    const judge = new AIChapterJudge(ai);

    const result = await judge.judge({
      mustCover: ['埋下户部侍郎的线索。'],
      forbiddenZones: ['不得公开户部侍郎姓名'],
      chapterText: '私账签押指向户部侍郎，但没有姓名。',
      checkDeepSemantic: true,
    });

    expect(result.fulfillment[0]).toMatchObject({
      node: '埋下户部侍郎的线索。',
      fulfilled: true,
    });
    expect(result.forbidden[0]).toMatchObject({
      zone: '不得公开户部侍郎姓名',
      violated: false,
    });
  });

  it('不得把未具名职位脑补成 mustCover 点名的具体角色', async () => {
    let capturedSystem = '';
    const ai: StructuredAI = {
      generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
        capturedSystem = request.system ?? '';
        return {
          fulfillment: [{
            node: '郑伯昭当堂扣下账册并威胁沈砚',
            fulfilled: true,
            evidence: ['主事把账册扣在袖中，冷声威胁沈砚。'],
            reason: '主事即郑伯昭',
          }],
          forbidden: [],
          issues: [],
        };
      }),
    };

    const result = await new AIChapterJudge(ai).judge({
      mustCover: ['郑伯昭当堂扣下账册并威胁沈砚'],
      forbiddenZones: [],
      chapterText: '主事把账册扣在袖中，冷声威胁沈砚。',
      allowedCharacterNames: ['沈砚', '郑伯昭'],
      checkDeepSemantic: true,
    });

    expect(capturedSystem).toContain('禁止身份脑补');
    expect(result.fulfillment[0]).toMatchObject({
      fulfilled: false,
      evidence: [],
    });
    expect(result.fulfillment[0].reason).toContain('郑伯昭');
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
