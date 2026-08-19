import { describe, expect, it, vi } from 'vitest';

import type { StructuredAI, StructuredAIRequest } from '@/types/story-runtime';
import { ReaderQualityJudge, READER_EVALUATION_VERSION } from '../readerQualityJudge';

function createFakeAI(): StructuredAI {
  return {
    generate: vi.fn(async <T>(request: StructuredAIRequest<T>): Promise<unknown> => {
      if (request.purpose === 'reader-outline-judge') {
        return request.parse({
          dimensions: {
            openingAttraction: 80,
            coreSellingPoint: 90,
            protagonistDrive: 70,
            conflictEscalation: 80,
            payoffPlanning: 70,
            characterRelations: 60,
            suspensePlanning: 80,
            audienceFit: 90,
          },
          wouldStartReading: true,
          confidence: 0.9,
          issues: [],
          summary: '开篇承诺清晰。',
        });
      }
      if (request.purpose === 'reader-chapter-judge') {
        return request.parse({
          dimensions: {
            readability: 80,
            openingHook: 60,
            conflictEffectiveness: 70,
            emotionalDrive: 50,
            characterVoice: 60,
            payoffValue: 70,
            pacing: 80,
            endingPull: 40,
          },
          continueReading: false,
          confidence: 0.8,
          issues: [
            {
              severity: 'critical',
              category: 'hook',
              location: '结尾',
              description: '明确承诺没有回应。',
              evidence: '他没有再提那封信。',
              suggestion: '回应上一章的信件。',
              confidence: 0.9,
            },
          ],
          summary: '章尾追读力不足。',
        });
      }
      return request.parse({
        dimensions: {
          mainlineProgress: 70,
          patternVariation: 60,
          suspensePayoff: 50,
          characterArc: 70,
          emotionalArc: 60,
          payoffEscalation: 50,
          genrePromise: 80,
          continuationDesire: 60,
        },
        continueReading: true,
        confidence: 0.75,
        issues: [],
        summary: '主线推进但回报偏弱。',
      });
    }),
  };
}

const context = {
  title: '测试书',
  genre: '玄幻升级',
  targetReader: '升级流读者',
};

describe('ReaderQualityJudge', () => {
  it('按本地固定权重计算大纲分数，不信任模型总分', async () => {
    const ai = createFakeAI();
    const result = await new ReaderQualityJudge(ai).evaluateOutline({
      context,
      outline: { title: '测试书' },
    });

    expect(result.version).toBe(READER_EVALUATION_VERSION);
    expect(result.score).toBe(78);
    expect(result.wouldStartReading).toBe(true);
    const request = vi.mocked(ai.generate).mock.calls[0][0];
    expect(request.system).toContain('不要输出 overallScore');
  });

  it('critical 问题确定性归一为 blocking 并保留证据', async () => {
    const result = await new ReaderQualityJudge(createFakeAI()).evaluateChapter({
      context,
      chapter: 2,
      title: '信件失踪',
      prose: '他没有再提那封信。',
    });

    expect(result.score).toBe(64.5);
    expect(result.continueReading).toBe(false);
    expect(result.issues[0]).toMatchObject({
      id: 'reader.hook-1',
      blocking: true,
      evidence: ['他没有再提那封信。'],
    });
  });

  it('跨章窗口保留起止章并计算趋势分', async () => {
    const result = await new ReaderQualityJudge(createFakeAI()).evaluateWindow({
      context,
      chapters: [
        { chapter: 6, title: '第六章', head: '开头', tail: '结尾' },
        { chapter: 10, title: '第十章', head: '开头', tail: '结尾' },
      ],
    });

    expect(result.fromChapter).toBe(6);
    expect(result.toChapter).toBe(10);
    expect(result.score).toBe(61.5);
  });
});
