import type {
  ExtractedFacts,
  FactExtractor,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
  StructuredAI,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';
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
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const entityCatalog = Object.values(state.entities).map(entity => ({
      id: entity.id,
      name: entity.name,
      aliases: entity.aliases,
      kind: entity.kind,
    }));
    const eventCatalog = state.events.map(event => ({
      id: event.id,
      summary: event.summary,
    }));

    const raw = await this.ai.generate<ExtractedFacts>({
      purpose: 'fact-extraction',
      schemaName: 'ExtractedFacts',
      system: [
        '仅提取正文中有直接证据的事实、事件和状态变化。不得把推测写成事实，每条变化必须携带证据。',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        '契约约束：',
        '1) participants 优先使用 entityCatalog 中的 id；若只能给人名，也必须与正文一致',
        '2) causes 只能填 eventCatalog / 本章新建事件的 id，禁止写自然语言因果句',
        '3) 找不到合法 cause id 时，causes 填 []，不要编造',
        'JSON 字段必须为：',
        '{"events":[{"id":"string","chapter":0,"sceneId":"string","type":"string","summary":"string","participants":[],"causes":[],"effects":[],"evidence":["正文原句"]}],"deltas":[{"operation":"set|add|remove|increment","path":"string","value":{},"evidence":"正文原句"}],"evidence":["正文原句"]}',
      ].join('\n'),
      prompt: JSON.stringify({
        projectId: input.projectId,
        chapterNumber: input.chapterNumber,
        sceneDrafts: input.sceneDrafts,
        entityCatalog,
        eventCatalog,
      }),
      parse: value => parseSchema(extractedFactsSchema, value, '事实提取结果'),
    });
    return parseSchema(extractedFactsSchema, raw, '事实提取结果');
  }
}
