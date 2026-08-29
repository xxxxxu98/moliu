import type {
  ContextBlock,
  ContextBlockKind,
  ContextPack,
  ContextPackInput,
  ContractPack,
  JsonValue,
  SceneChunk,
  StoryEntity,
  StoryEvent,
  StoryState,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';
import { renderDossier } from './agent/DossierBuilder';

export class ContextBudgetError extends Error {
  constructor(
    message: string,
    public readonly requiredTokens: number,
    public readonly maxTokens: number
  ) {
    super(message);
    this.name = 'ContextBudgetError';
  }
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function makeBlock(kind: ContextBlockKind, value: unknown, critical: boolean): ContextBlock {
  const content = JSON.stringify(value);
  return { kind, content, critical, tokenEstimate: estimateTokens(content) };
}

function compactScenes(
  scenes: SceneChunk[]
): Array<Pick<SceneChunk, 'id' | 'title' | 'text' | 'summary'>> {
  return scenes.map(scene => ({
    id: scene.id,
    title: scene.title,
    text: scene.text,
    summary: scene.summary,
  }));
}

const MAX_DRAFT_CHARACTER_TRUTHS = 6;

export interface DraftCharacterRef {
  name: string;
  aliases: string[];
  role?: string;
}

/**
 * 起草用角色真相：主角兜底 + 本章合同文本命中姓名，避免整卷人设灌进 prompt。
 */
export function selectCharacterTruthsForDraft(
  contracts: ContractPack,
  entityRefs?: Record<string, DraftCharacterRef>,
  maxCharacters = MAX_DRAFT_CHARACTER_TRUTHS
): Record<string, string[]> {
  const focusText = [
    contracts.chapter.CBN,
    contracts.chapter.CEN,
    contracts.chapter.goal,
    ...contracts.chapter.CPNs,
    ...contracts.chapter.mustCover,
    contracts.volume.title,
    contracts.volume.objective,
    contracts.master.premise,
  ].join('\n');

  const scored = Object.entries(contracts.master.characterTruths).map(([id, truths]) => {
    const ref = entityRefs?.[id];
    const role =
      ref?.role ||
      truths.find(item =>
        ['protagonist', 'antagonist', 'ally', 'mentor', 'support'].includes(item)
      ) ||
      '';
    const isProtagonist =
      role === 'protagonist' || truths.some(item => /\bprotagonist\b/u.test(item));
    const shortLabels = truths.filter(item => item.length >= 2 && item.length <= 24);
    const nameHit = Boolean(
      (ref &&
        (focusText.includes(ref.name) ||
          ref.aliases.some(alias => alias.length > 0 && focusText.includes(alias)))) ||
        shortLabels.some(label => focusText.includes(label))
    );
    let score = 0;
    if (isProtagonist) score += 100;
    if (nameHit) score += 50;
    if (role === 'antagonist' && nameHit) score += 20;
    return { id, truths, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.filter(item => item.score >= 50).slice(0, maxCharacters);
  const finalList =
    picked.length > 0
      ? picked
      : scored.filter(item => item.score >= 100).slice(0, 1).length > 0
        ? scored.filter(item => item.score >= 100).slice(0, 1)
        : scored.slice(0, 1);

  const characterTruths: Record<string, string[]> = {};
  for (const item of finalList.slice(0, maxCharacters)) {
    characterTruths[item.id] = item.truths.slice(0, 2).map(truth =>
      truth.length > 80 ? `${truth.slice(0, 80)}…` : truth
    );
  }
  return characterTruths;
}

/** 起草用合同：保留一份 style，压缩 characterTruths；不再另塞 style 块 */
export function compactContractsForDraft(
  contracts: ContractPack,
  entityRefs?: Record<string, DraftCharacterRef>
): unknown {
  const characterTruths = selectCharacterTruthsForDraft(contracts, entityRefs);
  return {
    master: {
      premise:
        contracts.master.premise.length > 400
          ? `${contracts.master.premise.slice(0, 400)}…`
          : contracts.master.premise,
      genres: contracts.master.genres,
      // style 只留在合同里一份；ContextPackBuilder 不再单独塞 style 块
      style: contracts.master.style.filter(Boolean).slice(0, 12),
      immutableRules: contracts.master.immutableRules,
      characterTruths,
      forbidden: contracts.master.forbidden,
    },
    volume: {
      volumeNumber: contracts.volume.volumeNumber,
      title: contracts.volume.title,
      objective:
        contracts.volume.objective.length > 300
          ? `${contracts.volume.objective.slice(0, 300)}…`
          : contracts.volume.objective,
      conflict: contracts.volume.conflict,
      forbidden: contracts.volume.forbidden,
    },
    chapter: {
      chapterNumber: contracts.chapter.chapterNumber,
      title: contracts.chapter.title,
      goal: contracts.chapter.goal,
      CBN: contracts.chapter.CBN,
      CPNs: contracts.chapter.CPNs,
      CEN: contracts.chapter.CEN,
      mustCover: contracts.chapter.mustCover,
      forbidden: contracts.chapter.forbidden,
    },
    review: {
      mustCheck: contracts.review.mustCheck.slice(0, 8),
      requiredEvidence: contracts.review.requiredEvidence,
    },
  };
}

function compactEntity(entity: StoryEntity): Record<string, unknown> {
  // 防御：实体 attributes 可能缺失（如 delta 引入的实体仅含 id/name/kind）
  const attributes = entity.attributes ?? {};
  const description =
    typeof attributes.description === 'string' ? attributes.description : '';
  const role = typeof attributes.role === 'string' ? attributes.role : undefined;
  // 关键属性（生死/位置/状态等）原样带出，让起草模型对齐跨章状态，避免写出
  // 与历史事实矛盾的台词（如「金属板？他什么时候发现过金属板？」）。
  const extraAttrs = pickCompactAttributes(attributes, ['description', 'role']);
  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    aliases: (entity.aliases ?? []).slice(0, 4),
    role,
    description: description.length > 120 ? `${description.slice(0, 120)}…` : description,
    attributes: extraAttrs,
  };
}

/**
 * 从 attributes 里挑出排除指定 key 后的剩余属性（用于补全生死/位置/状态等关键信息）。
 * 字符串超长截断到 80 字，避免 prompt 膨胀；非字符串原样保留（如数值/布尔）。
 */
function pickCompactAttributes(
  attributes: Record<string, JsonValue>,
  exclude: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (exclude.includes(key)) {
      continue;
    }
    if (typeof value === 'string') {
      out[key] = value.length > 80 ? `${value.slice(0, 80)}…` : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function compactEvent(event: StoryEvent): Record<string, unknown> {
  return {
    id: event.id,
    chapter: event.chapter,
    type: event.type,
    summary: event.summary.length > 100 ? `${event.summary.slice(0, 100)}…` : event.summary,
    participants: event.participants,
  };
}

/**
 * 起草用状态：只保留与本章合同相关的实体摘要 + 近期事件，避免全量档案灌进 prompt。
 */
export function compactStateForDraft(state: StoryState, contracts: ContractPack): unknown {
  const chapter = contracts.chapter;
  const focusText = [
    chapter.CBN,
    chapter.CEN,
    chapter.goal,
    ...chapter.CPNs,
    ...chapter.mustCover,
  ].join('\n');

  const relatedIds = new Set<string>();
  for (const [id, entity] of Object.entries(state.entities)) {
    if (focusText.includes(entity.name) || entity.aliases.some(alias => focusText.includes(alias))) {
      relatedIds.add(id);
    }
    if (focusText.includes(id)) {
      relatedIds.add(id);
    }
  }
  // 主角兜底：role=protagonist
  for (const [id, entity] of Object.entries(state.entities)) {
    if ((entity.attributes ?? {}).role === 'protagonist') {
      relatedIds.add(id);
    }
  }
  // 近期事件参与者
  const recentEvents = state.events
    .filter(event => event.chapter < chapter.chapterNumber)
    .slice(-12);
  for (const event of recentEvents) {
    for (const participant of event.participants) {
      relatedIds.add(participant);
    }
  }

  const entities: Record<string, unknown> = {};
  for (const id of relatedIds) {
    const entity = state.entities[id];
    if (entity) {
      entities[id] = compactEntity(entity);
    }
  }

  return {
    chapter: state.chapter,
    entities,
    events: recentEvents.map(compactEvent),
    openForeshadows: state.openForeshadows.slice(0, 8),
    fulfilledNodes: state.fulfilledNodes.slice(-8),
    timeline: state.timeline.slice(-6),
    // 补全相关角色的已知事实与持有物：StoryState 无持久 facts 字段，历史事实载体即
    // knowledge/inventory/events（events 已注入）。让起草模型看到「谁掌握/持有什么」，
    // 避免写出与历史事实矛盾的台词。用 relatedIds 过滤，避免全量灌入。
    knowledge: pickRelatedKnowledge(state.knowledge, relatedIds),
    inventory: pickRelatedInventory(state.inventory, relatedIds),
  };
}

/**
 * 挑出与本章相关角色（relatedIds）的已知事实，每角色最多保留最近 8 条，避免全量灌入。
 */
function pickRelatedKnowledge(
  knowledge: Record<string, string[]>,
  relatedIds: Set<string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, facts] of Object.entries(knowledge)) {
    if (relatedIds.has(id) && facts.length > 0) {
      out[id] = facts.slice(-8);
    }
  }
  return out;
}

/**
 * 挑出与本章相关角色（relatedIds）的持有物，避免全量灌入。
 */
function pickRelatedInventory(
  inventory: Record<string, Record<string, number>>,
  relatedIds: Set<string>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [ownerId, items] of Object.entries(inventory)) {
    if (relatedIds.has(ownerId) && Object.keys(items).length > 0) {
      out[ownerId] = { ...items };
    }
  }
  return out;
}

/**
 * 空章重写：剥离本章及之后事件/intro 实体，避免旧 accepted 状态污染起草 prompt。
 */
export function stripStateForChapterRewrite(
  state: StoryState,
  chapterNumber: number
): StoryState {
  const keptEvents = state.events.filter(event => event.chapter < chapterNumber);
  const introIdsFromStripped = new Set(
    state.events
      .filter(event => event.chapter >= chapterNumber)
      .flatMap(event => event.participants.filter(id => id.startsWith('char:intro:')))
  );
  const entities = Object.fromEntries(
    Object.entries(state.entities).filter(([id]) => !introIdsFromStripped.has(id))
  );
  const maxKeptChapter = keptEvents.reduce((max, event) => Math.max(max, event.chapter), 0);
  return {
    ...state,
    chapter: Math.min(state.chapter, Math.max(0, chapterNumber - 1), maxKeptChapter),
    entities,
    events: keptEvents,
  };
}

export class ContextPackBuilder {
  build(input: ContextPackInput): ContextPack {
    if (input.maxTokens < 1) {
      throw new ContextBudgetError('上下文预算必须大于 0', 1, input.maxTokens);
    }
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const styleGuidance = input.styleGuidance.filter(Boolean);
    // style 已在 contracts.master.style 时不再单独塞一块，避免排版规则/风格双份
    const contractStyles = new Set(input.contracts.master.style.map(item => item.trim()));
    const uniqueStyle = styleGuidance.filter(item => !contractStyles.has(item.trim()));

    const entityRefs: Record<string, DraftCharacterRef> = Object.fromEntries(
      Object.values(state.entities)
        .filter(entity => entity.kind === 'character')
        .map(entity => {
          // 防御：实体 attributes 可能缺失（如 delta 引入的实体仅含 id/name/kind）
          const attributes = entity.attributes ?? {};
          return [
            entity.id,
            {
              name: entity.name,
              aliases: entity.aliases ?? [],
              role: typeof attributes.role === 'string' ? attributes.role : undefined,
            },
          ];
        })
    );

    const candidates: ContextBlock[] = [
      makeBlock('locked-contracts', compactContractsForDraft(input.contracts, entityRefs), true),
      makeBlock('current-state', compactStateForDraft(state, input.contracts), true),
    ];
    // 检索回合档案:agent 循环与写作上下文的唯一桥(docs/agent-loop-refactor.md §6)。
    // critical=true(超预算优先于 recent-scenes 保留);renderDossier 分节限额
    // 保证 ≤1000 token,不会撑爆 criticalTokens 预算校验。
    if (input.dossier) {
      candidates.push(
        makeBlock(
          'research-dossier',
          { stats: input.dossier.stats, content: renderDossier(input.dossier) },
          true
        )
      );
    }
    candidates.push(
      makeBlock('recent-scenes', compactScenes(input.recentScenes), false),
      makeBlock('retrieval', compactScenes(input.retrievedScenes), false)
    );
    if (uniqueStyle.length > 0) {
      candidates.push(makeBlock('style', uniqueStyle, false));
    }

    const criticalTokens = candidates
      .filter(block => block.critical)
      .reduce((total, block) => total + block.tokenEstimate, 0);
    if (criticalTokens > input.maxTokens) {
      throw new ContextBudgetError(
        '上下文预算不足以容纳锁定合同和当前状态；关键块不会被截断',
        criticalTokens,
        input.maxTokens
      );
    }

    const blocks: ContextBlock[] = [];
    const omitted: ContextBlockKind[] = [];
    let totalTokenEstimate = 0;
    for (const block of candidates) {
      if (totalTokenEstimate + block.tokenEstimate <= input.maxTokens || block.critical) {
        blocks.push(block);
        totalTokenEstimate += block.tokenEstimate;
      } else {
        omitted.push(block.kind);
      }
    }
    return { blocks, totalTokenEstimate, omitted };
  }
}
