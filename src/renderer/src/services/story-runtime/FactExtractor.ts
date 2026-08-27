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

/** 顶层 evidence 为空时，从 events/deltas 回填，避免结构化证据丢失 */
export function ensureTopLevelEvidence(facts: ExtractedFacts): ExtractedFacts {
  if (facts.evidence.length > 0) return facts;
  const collected = [
    ...facts.events.flatMap(event => event.evidence),
    ...facts.deltas.map(delta => delta.evidence),
  ]
    .map(item => item.trim())
    .filter(Boolean);
  const unique = [...new Set(collected)];
  if (unique.length === 0) return facts;
  return { ...facts, evidence: unique.slice(0, 24) };
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
        '1) participants 必须是字符串数组（实体 id 或人名），禁止写成 {id,name} 对象',
        '2) causes 只能填 eventCatalog / 本章新建事件的 id 字符串，禁止自然语言因果句，禁止对象',
        '3) 找不到合法 cause id 时，causes 填 []，不要编造',
        '4) 顶层 evidence 必须汇总本章关键正文原句，不得为空（可与 events[].evidence 重复）',
        '5) deltas.path 用点分路径写状态变更；inventory 变更必须形如 inventory.<角色实体id>.<物品名>，value 必须是纯数字（数量/件数），禁止写 {unit,note,quantity,描述} 等对象或带单位的字符串',
        '6) 顶层必须输出一个 JSON 对象 {...}，禁止输出裸数组 [...]；events/deltas/evidence 三个字段都要存在',
        '7) 生死与命运事件必检：处决/斩首/枭首/格杀/气绝/毙命/身亡/暴毙/驾崩/自尽/溺亡等情节性死亡，以及下狱/定罪等终局状态，本章正文出现即必须登记——每条产出 event(type="death"或"status_change") 并附带 deltas(path 用 characters.<实体id>.attributes.status，value 用「死亡/下狱/定罪/驾崩」)，evidence 引用正文原句。不得因场面血腥、群像处决或篇幅原因漏登；群像处决须逐个列出名单内的死者',
        'JSON 字段必须为：',
        '{"events":[{"id":"string","chapter":0,"sceneId":"string","type":"string","summary":"string","participants":["实体id或人名"],"causes":[],"effects":[],"evidence":["正文原句"]}],"deltas":[{"operation":"set|add|remove|increment","path":"inventory.char-1.银两","value":5,"evidence":"正文原句"}],"evidence":["正文原句"]}',
      ].join('\n'),
      prompt: JSON.stringify({
        projectId: input.projectId,
        chapterNumber: input.chapterNumber,
        sceneDrafts: input.sceneDrafts,
        entityCatalog,
        eventCatalog,
      }),
      parse: value =>
        ensureTopLevelEvidence(parseSchema(extractedFactsSchema, value, '事实提取结果')),
    });
    return ensureTopLevelEvidence(parseSchema(extractedFactsSchema, raw, '事实提取结果'));
  }
}
