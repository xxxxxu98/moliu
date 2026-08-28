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
        '7) 生死与命运事件必检：正文出现死亡/下狱/定罪的【已完成事实】时必须登记——每条产出 event(type="death"或"status_change") 并附带 deltas(path 用 characters.<实体id>.attributes.status，value 用「死亡/下狱/定罪/驾崩」)，evidence 必须引用【结果性】原文原句（如倒地气绝/头颅滚落/当场毙命/收殓下葬）。注意区分：判决宣布（"判斩立决"）、威胁命令（"给我杀了他"）、预谋计划（"要除掉X"）都不是事实，禁止据其写死亡 status；拿不准是否已完成时只产 event 不写 status delta。群像处决须逐个列出名单内的死者。死者以结果词紧邻的实体为准：发现者/转述者/报信人不是死者（「X发现Y已气绝身亡」只登记Y），不得给同句出现的活人登记死亡',
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
        ensureTopLevelEvidence(
          sanitizeUnconfirmedDeathDeltas(
            parseSchema(extractedFactsSchema, value, '事实提取结果'),
            state.entities
          )
        ),
    });
    return ensureTopLevelEvidence(
      sanitizeUnconfirmedDeathDeltas(parseSchema(extractedFactsSchema, raw, '事实提取结果'), state.entities)
    );
  }
}

/** 死亡结果的不可逆完成体信号。判决词/威胁句均不具备，用于二次拒登 */
const DEATH_RESULT_CUE_RE =
  /人头落地|(?:头颅|首级)[^。"」』]{0,10}(?:滚落|落地)|气绝|毙命|身亡|丧命|殒命|咽气|断气|尸[体首]|收殓|下葬|暴毙|溺亡/;

/** 假设/盘算语气：结果词出现在权衡句里不是事实（与 extract-plot-memory 侧同源）
 *  「杀了陆承安不过是交差抵罪……自己照样人头落地」2026-08-28 第五轮回归实证
 *  「只要统领手腕稍一用力，顾衡的头颅便会当场落地」2026-08-28 百章双开r1 ch13 实证：
 *  只要/便会型条件句漏挡 → 主角被登记死亡 → 下章状态摘要判死，裁判 fact_conflict
 *  连拒 5 次触发 stalled 硬停止，全书中止于 14/100 */
const HYPOTHETICAL_SENTENCE_RE =
  /不过是|无非是|大不了|照样[要会]|便[是要]|便会|就得|要是|若是|如果|倘若|万一|与其|只当|等于|无非|想想|盘算|权衡|只要/u;

/**
 * 死亡 status delta 的确定性防误报闸口（2026-08-27 双轮回归实证）：
 * 「替死鬼被判斩立决」「给我杀了主角」这类判词/威胁会被 flash 模型当事实登记，
 * 主角下一章即被自己的状态摘要判死、评审 fact_conflict 连拒至管线中止。
 * 规则：value 含「死亡」的 attributes.status 变更，其 evidence（或该角色名
 * 邻近 ±30 字的顶层 evidence）必须含完成体结果信号，否则整条丢弃。
 * 下狱/定罪等可逆终态不经此闸，由既有解除机制管理。
 */
export function sanitizeUnconfirmedDeathDeltas(
  facts: ExtractedFacts,
  entities?: Record<string, { id: string; name: string; aliases?: string[] }>
): ExtractedFacts {
  const idToName = new Map<string, string>();
  const idToAliases = new Map<string, string[]>();
  if (entities) {
    for (const entity of Object.values(entities)) {
      idToName.set(entity.id, entity.name);
      const aliases = (entity.aliases ?? []).filter(a => a.trim());
      if (aliases.length) idToAliases.set(entity.id, aliases);
    }
  }
  const topLevel = facts.evidence ?? [];
  const hasConfirmedResult = (rawEvidence: unknown, entityId: string): boolean => {
    const own = Array.isArray(rawEvidence)
      ? String(rawEvidence.join('\n'))
      : String(rawEvidence ?? '');
    if (HYPOTHETICAL_SENTENCE_RE.test(own)) return false;
    if (DEATH_RESULT_CUE_RE.test(own)) return true;
    // 角色在证据里可能以任一别名出现（证据用「严运使」而登记名是「严世宽」）
    const nameVariants = [
      ...(idToName.get(entityId) ? [idToName.get(entityId)!] : []),
      ...(idToAliases.get(entityId) ?? []),
    ];
    for (const name of nameVariants) {
      for (const line of topLevel) {
        if (HYPOTHETICAL_SENTENCE_RE.test(line)) continue;
        let idx = line.indexOf(name);
        while (idx >= 0) {
          if (
            DEATH_RESULT_CUE_RE.test(line.slice(Math.max(0, idx - 30), idx + name.length + 30))
          ) {
            return true;
          }
          idx = line.indexOf(name, idx + name.length);
        }
      }
    }
    return false;
  };
  const kept = facts.deltas.filter(delta => {
    const isDeathStatus =
      /attributes\.status$/u.test(String(delta.path || '')) &&
      String((delta as unknown as { value?: unknown }).value ?? '').includes('死亡');
    if (!isDeathStatus) return true;
    const entityId = String(delta.path || '').split('.')[1] ?? '';
    return hasConfirmedResult(
      (delta as unknown as { evidence?: string | string[] }).evidence,
      entityId
    );
  });
  if (kept.length === facts.deltas.length) return facts;
  return { ...facts, deltas: kept };
}
