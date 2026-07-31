import type {
  ContextBlock,
  ContextBlockKind,
  ContextPack,
  ContextPackInput,
  ContractPack,
  SceneChunk,
  StoryEntity,
  StoryEvent,
  StoryState,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';

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

/** 起草用合同：保留一份 style，压缩 characterTruths；不再另塞 style 块 */
export function compactContractsForDraft(contracts: ContractPack): unknown {
  const characterTruths: Record<string, string[]> = {};
  for (const [id, truths] of Object.entries(contracts.master.characterTruths)) {
    characterTruths[id] = truths.slice(0, 2).map(item =>
      item.length > 80 ? `${item.slice(0, 80)}…` : item
    );
  }
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
  const description =
    typeof entity.attributes.description === 'string' ? entity.attributes.description : '';
  const role = typeof entity.attributes.role === 'string' ? entity.attributes.role : undefined;
  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    aliases: entity.aliases.slice(0, 4),
    role,
    description: description.length > 120 ? `${description.slice(0, 120)}…` : description,
  };
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
    if (entity.attributes.role === 'protagonist') {
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
  };
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

    const candidates: ContextBlock[] = [
      makeBlock('locked-contracts', compactContractsForDraft(input.contracts), true),
      makeBlock('current-state', compactStateForDraft(state, input.contracts), true),
      makeBlock('recent-scenes', compactScenes(input.recentScenes), false),
      makeBlock('retrieval', compactScenes(input.retrievedScenes), false),
    ];
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
