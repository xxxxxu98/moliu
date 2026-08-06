import type {
  ExtractedFacts,
  JsonValue,
  ProvisionalStateOverlay,
  SceneDraft,
  StateDelta,
  StoryEntity,
  StoryEvent,
  StoryState,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';
import { extractInventoryNumeric } from './schemas';

/**
 * 通用主角称呼：模型在事实抽取时常用占位称呼指代主角
 * （hero / protagonist / 主角 / 男主 / 女主 等），归一化到项目主角实体。
 * 注意：成员必须已过 normalizeLabel（小写、去空格/标点），如 the hero → thehero。
 */
const PROTAGONIST_ALIASES = new Set([
  'hero',
  'protagonist',
  'thehero',
  'theprotagonist',
  'maincharacter',
  '主角',
  '男主',
  '女主',
]);

export interface FactCanonicalizeInput {
  facts: ExtractedFacts;
  state: StoryState;
  drafts: SceneDraft[];
  overlay?: ProvisionalStateOverlay;
}

export interface FactCanonicalizeResult {
  /** 规范化后的事实（participants/causes 等已对齐契约） */
  facts: ExtractedFacts;
  /** 合并了本章新引入实体后的校验用状态 */
  stateForValidation: StoryState;
  /** 写入 overlay 的实体引入 deltas */
  introductionDeltas: StateDelta[];
  /** 观测信息：被丢弃的非法因果边（自然语言误用 causes 字段） */
  droppedCauses: Array<{ eventId: string; cause: string }>;
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·・．.。，,；;：:！!？?“”"‘’']/gu, '');
}

function chapterText(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n');
}

function stableIntroId(name: string): string {
  // 渲染进程禁止 Node crypto；用稳定的非加密哈希即可
  let hash = 2166136261;
  const normalized = name.trim();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const digest = (hash >>> 0).toString(16).padStart(8, '0');
  const slug = normalized
    .replace(/[^\u4e00-\u9fffA-Za-z0-9_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 24);
  return `char:intro:${slug || 'unnamed'}-${digest}`;
}

function buildEntityLookup(entities: Record<string, StoryEntity>): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entity of Object.values(entities)) {
    lookup.set(normalizeLabel(entity.id), entity.id);
    lookup.set(normalizeLabel(entity.name), entity.id);
    for (const alias of entity.aliases) {
      lookup.set(normalizeLabel(alias), entity.id);
    }
  }
  return lookup;
}

function resolveCauseToEventId(cause: string, knownEvents: StoryEvent[]): string | undefined {
  const trimmed = cause.trim();
  if (!trimmed) return undefined;
  if (knownEvents.some(event => event.id === trimmed)) return trimmed;

  const normalized = normalizeLabel(trimmed);
  if (!normalized) return undefined;

  const bySummary = knownEvents.find(event => {
    const summary = normalizeLabel(event.summary);
    return (
      summary === normalized ||
      event.effects.some(effect => normalizeLabel(effect) === normalized) ||
      (summary.length >= 2 && (summary.includes(normalized) || normalized.includes(summary)))
    );
  });
  return bySummary?.id;
}

/**
 * 事实提取 → 校验 之间的契约对齐层。
 *
 * 契约：
 * - participants / knowledge knower / inventory owner 必须是实体 ID
 * - causes 必须是事件 ID；自然语言因果边视为提取噪声并丢弃（不是“缺前件”）
 * - 正文已出场但状态库没有的角色，可引入为 provisional 实体（第一章正常开书路径）
 */
export function canonicalizeExtractedFacts(input: FactCanonicalizeInput): FactCanonicalizeResult {
  const baseState = applyProvisionalOverlay(input.state, input.overlay);
  const text = chapterText(input.drafts);
  const lookup = buildEntityLookup(baseState.entities);
  const introduced = new Map<string, StoryEntity>();
  const droppedCauses: Array<{ eventId: string; cause: string }> = [];

  // 通用主角称呼兜底：模型常把主角写成 hero/protagonist/主角 等占位称呼，
  // 与项目角色表（attributes.role=protagonist）做归一化，避免“未知实体”误判
  const protagonist = Object.values(baseState.entities).find(
    entity => entity.attributes.role === 'protagonist',
  );

  const resolveParticipant = (ref: string): string => {
    const key = normalizeLabel(ref);
    const existing = lookup.get(key);
    if (existing) return existing;

    // 通用主角称呼 → 主角实体（hero/protagonist/主角/男主/女主）。
    // 优先于正文引入分支：模型最常用“主角”占位，正文几乎必然含该词，
    // 若不提前归一化会把“主角”当成新角色引入（char:intro:主角 僵尸实体）
    if (protagonist && PROTAGONIST_ALIASES.has(key)) {
      return protagonist.id;
    }

    // 仅当正文确实出现该称呼时，才允许引入新角色实体
    if (ref.trim() && text.includes(ref.trim())) {
      const introId = stableIntroId(ref.trim());
      if (!introduced.has(introId) && !baseState.entities[introId]) {
        const entity: StoryEntity = {
          id: introId,
          kind: 'character',
          name: ref.trim(),
          aliases: [],
          attributes: { introducedInChapter: true },
          knownBy: [introId],
          sourceTrace: [{ source: 'fact-canonicalize', sourceId: ref.trim() }],
        };
        introduced.set(introId, entity);
        lookup.set(normalizeLabel(ref), introId);
        lookup.set(normalizeLabel(introId), introId);
        lookup.set(normalizeLabel(entity.name), introId);
      }
      return lookup.get(key) ?? introId;
    }

    return ref;
  };

  const knownEvents: StoryEvent[] = [...baseState.events, ...input.facts.events];

  const events = input.facts.events.map(event => {
    const participants = event.participants.map(resolveParticipant);
    const causes: string[] = [];
    for (const cause of event.causes) {
      const resolved = resolveCauseToEventId(cause, knownEvents);
      if (resolved) {
        causes.push(resolved);
      } else {
        // 自然语言/未登记前件不是合法因果边，丢弃以免误报 blocking
        droppedCauses.push({ eventId: event.id, cause });
      }
    }

    const effects = event.effects.map(effect => {
      if (!effect.startsWith('knowledge:')) return effect;
      const [, knower, ...factParts] = effect.split(':');
      if (!knower) return effect;
      return `knowledge:${resolveParticipant(knower)}:${factParts.join(':')}`;
    });

    return {
      ...event,
      participants: [...new Set(participants)],
      causes: [...new Set(causes)],
      effects,
    };
  });

  const deltas = input.facts.deltas.flatMap<StateDelta>(delta => {
    // inventory.<owner>.<item>：三段路径，叶子必须是数字（数量）
    const itemMatch = delta.path.match(/^inventory\.([^.]+)\.(.+)$/u);
    if (itemMatch) {
      const owner = resolveParticipant(itemMatch[1]);
      // 防御（Bug 9 修复 + 增强）：inventory 契约要求 value 为数量（number），
      // 模型偶发把「证据」字符串或 {quantity,unit,note} 对象写入 → StoryRuntime schema 校验失败整章崩。
      // 用 extractInventoryNumeric 统一归一化：数字/纯数字字符串/带 quantity 字段的对象都救回，其余丢弃。
      const numeric = extractInventoryNumeric(delta.value);
      if (numeric === undefined) return [];
      return [
        {
          ...delta,
          path: `inventory.${owner}.${itemMatch[2]}`,
          value: numeric,
        },
      ];
    }
    // inventory.<owner>：两段路径，模型把整个物品表当成对象 set 进来
    // （如 {晶核:{unit:"颗",note:"灵力结晶"}, 银两:{quantity:5}}）。
    // 展开为逐 item 的三段 set delta，逐叶子归一化，无效 item 丢弃。
    const ownerMatch = delta.path.match(/^inventory\.([^.]+)$/u);
    if (ownerMatch) {
      const owner = resolveParticipant(ownerMatch[1]);
      if (!delta.value || typeof delta.value !== 'object' || Array.isArray(delta.value)) {
        return [];
      }
      const items = delta.value as Record<string, unknown>;
      const expanded: StateDelta[] = [];
      for (const itemKey of Object.keys(items)) {
        const numeric = extractInventoryNumeric(items[itemKey]);
        if (numeric === undefined) continue;
        expanded.push({
          ...delta,
          path: `inventory.${owner}.${itemKey}`,
          value: numeric,
        });
      }
      return expanded;
    }
    return [delta];
  });

  const introductionDeltas: StateDelta[] = [...introduced.values()].map(entity => ({
    operation: 'set' as const,
    path: `entities.${entity.id}`,
    value: entity as unknown as JsonValue,
    evidence: `正文引入角色：${entity.name}`,
  }));

  const stateForValidation: StoryState = {
    ...baseState,
    entities: {
      ...baseState.entities,
      ...Object.fromEntries(introduced),
    },
  };

  return {
    facts: {
      events,
      deltas: [...deltas, ...introductionDeltas],
      evidence: input.facts.evidence,
    },
    stateForValidation,
    introductionDeltas,
    droppedCauses,
  };
}
