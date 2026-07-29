import type {
  ExtractedFacts,
  FactExtractor,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
  StructuredAI,
} from '@/types/story-runtime';

import { extractedFactsSchema, parseSchema } from './schemas';

export type { FactExtractor } from '@/types/story-runtime';

export interface FactExtractionInput {
  projectId: string;
  chapterNumber: number;
  sceneDrafts: SceneDraft[];
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
}

export class AIFactExtractor implements FactExtractor {
  constructor(private readonly ai: StructuredAI) {}

  async extract(input: FactExtractionInput): Promise<ExtractedFacts> {
    const raw = await this.ai.generate<ExtractedFacts>({
      purpose: 'fact-extraction',
      schemaName: 'ExtractedFacts',
      system:
        '仅提取正文中有直接证据的事实、事件和状态变化。不得把推测写成事实，每条变化必须携带证据。',
      prompt: JSON.stringify(input),
      parse: value => parseSchema(extractedFactsSchema, value, '事实提取结果'),
    });
    return parseSchema(extractedFactsSchema, raw, '事实提取结果');
  }
}
