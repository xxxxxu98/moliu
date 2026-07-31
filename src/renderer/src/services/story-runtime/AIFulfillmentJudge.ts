import type {
  ExtractedFacts,
  FulfillmentCheckResult,
  FulfillmentJudge,
  StructuredAI,
} from '@/types/story-runtime';

import { AIChapterJudge } from './AIChapterJudge';

export type { FulfillmentJudge } from '@/types/story-runtime';

/**
 * 兼容旧履约接口：内部转调 AIChapterJudge（仍只发一次 chapter-judge 请求）。
 * @deprecated 新代码请直接使用 AIChapterJudge
 */
export class AIFulfillmentJudge implements FulfillmentJudge {
  private readonly chapterJudge: AIChapterJudge;

  constructor(ai: StructuredAI) {
    this.chapterJudge = new AIChapterJudge(ai);
  }

  async judge(input: {
    mustCover: string[];
    chapterText: string;
    facts: ExtractedFacts;
  }): Promise<FulfillmentCheckResult> {
    if (input.mustCover.length === 0) {
      return { results: [] };
    }
    const result = await this.chapterJudge.judge({
      mustCover: input.mustCover,
      forbiddenZones: [],
      chapterText: input.chapterText,
      facts: input.facts,
      checkDeepSemantic: false,
    });
    return { results: result.fulfillment };
  }
}
