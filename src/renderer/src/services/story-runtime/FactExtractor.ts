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
      system: [
        '仅提取正文中有直接证据的事实、事件和状态变化。不得把推测写成事实，每条变化必须携带证据。',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        'JSON 字段必须为：',
        '{"events":[{"id":"string","chapter":0,"sceneId":"string","type":"string","summary":"string","participants":[],"causes":[],"effects":[],"evidence":["正文原句"]}],"deltas":[{"operation":"set|add|remove|increment","path":"string","value":{},"evidence":"正文原句"}],"evidence":["正文原句"]}',
      ].join('\n'),
      prompt: JSON.stringify(input),
      parse: value => parseSchema(extractedFactsSchema, value, '事实提取结果'),
    });
    return parseSchema(extractedFactsSchema, raw, '事实提取结果');
  }
}
