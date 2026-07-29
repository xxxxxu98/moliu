import type {
  ChapterContract,
  ContinuityDomain,
  ContinuityIssue,
  ContinuityReport,
  ContractPack,
  ExtractedFacts,
  ProvisionalStateOverlay,
  SceneDraft,
  StoryState,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';

export interface ContinuityValidationInput {
  contracts: ContractPack;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  drafts: SceneDraft[];
  facts: ExtractedFacts;
}

function chapterText(drafts: SceneDraft[]): string {
  return drafts.flatMap(draft => draft.paragraphs).join('\n');
}

function fulfilled(node: string, text: string, facts: ExtractedFacts): boolean {
  if (text.includes(node)) return true;
  return facts.events.some(
    event =>
      event.summary.includes(node) ||
      event.effects.some(effect => effect.includes(node)) ||
      event.evidence.some(evidence => evidence.includes(node))
  );
}

function parseInventoryPath(path: string): { owner: string; item: string } | undefined {
  const [root, owner, item] = path.split('.');
  return root === 'inventory' && owner && item ? { owner, item } : undefined;
}

export class ContinuityValidator {
  validate(input: ContinuityValidationInput): ContinuityReport {
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const issues: ContinuityIssue[] = [];
    const checkedDomains: ContinuityDomain[] = [
      'entity',
      'knowledge',
      'inventory',
      'timeline',
      'causality',
      'fulfillment',
      'evidence',
    ];
    let issueIndex = 0;
    const addIssue = (
      domain: ContinuityDomain,
      message: string,
      evidence: string[] = [],
      sceneId?: string
    ): void => {
      issueIndex += 1;
      issues.push({
        id: `${domain}-${issueIndex}`,
        domain,
        severity: input.contracts.review.blockingDomains.includes(domain) ? 'blocking' : 'warning',
        message,
        evidence,
        sceneId,
      });
    };

    const eventIds = new Set([...state.events, ...input.facts.events].map(event => event.id));
    for (const event of input.facts.events) {
      for (const participant of event.participants) {
        if (!state.entities[participant]) {
          addIssue('entity', `事件 ${event.id} 引用了未知实体 ${participant}`, event.evidence, event.sceneId);
        }
      }
      for (const cause of event.causes) {
        if (!eventIds.has(cause)) {
          addIssue('causality', `事件 ${event.id} 缺少因果前件 ${cause}`, event.evidence, event.sceneId);
        }
      }
      for (const effect of event.effects.filter(value => value.startsWith('knowledge:'))) {
        const [, knower, ...factParts] = effect.split(':');
        const fact = factParts.join(':');
        const isPresent = event.participants.includes(knower);
        const wasKnown = (state.knowledge[knower] ?? []).includes(fact);
        if (!isPresent && !wasKnown) {
          addIssue(
            'knowledge',
            `${knower} 无在场或既有知识证据却获得“${fact}”`,
            event.evidence,
            event.sceneId
          );
        }
      }
      if (input.contracts.review.requiredEvidence && event.evidence.length === 0) {
        addIssue('evidence', `事件 ${event.id} 缺少正文证据`, [], event.sceneId);
      }
    }

    const inventory = structuredClone(state.inventory);
    for (const delta of input.facts.deltas) {
      const path = parseInventoryPath(delta.path);
      if (path && delta.operation === 'increment') {
        inventory[path.owner] ??= {};
        const amount = typeof delta.value === 'number' ? delta.value : 1;
        inventory[path.owner][path.item] = (inventory[path.owner][path.item] ?? 0) + amount;
        if (inventory[path.owner][path.item] < 0) {
          addIssue('inventory', `${path.owner} 的物品 ${path.item} 数量不能为负`, [delta.evidence]);
        }
      }
      if (input.contracts.review.requiredEvidence && delta.evidence.trim().length === 0) {
        addIssue('evidence', `状态变化 ${delta.path} 缺少证据`);
      }
    }

    let previousTime = Number.NEGATIVE_INFINITY;
    for (const event of input.facts.events) {
      if (!event.timestamp) continue;
      const currentTime = Date.parse(event.timestamp);
      if (!Number.isNaN(currentTime)) {
        if (currentTime < previousTime) {
          addIssue('timeline', `事件 ${event.id} 的时间早于前序事件`, event.evidence, event.sceneId);
        }
        previousTime = currentTime;
      }
    }

    this.validateFulfillment(
      input.contracts.chapter,
      chapterText(input.drafts),
      input.facts,
      addIssue
    );

    const blockingCount = issues.filter(issue => issue.severity === 'blocking').length;
    const warningCount = issues.filter(issue => issue.severity === 'warning').length;
    return {
      accepted:
        blockingCount === 0 && warningCount <= input.contracts.review.maxWarnings,
      issues,
      checkedDomains,
    };
  }

  private validateFulfillment(
    contract: ChapterContract,
    text: string,
    facts: ExtractedFacts,
    addIssue: (
      domain: ContinuityDomain,
      message: string,
      evidence?: string[],
      sceneId?: string
    ) => void
  ): void {
    for (const node of contract.mustCover) {
      if (!fulfilled(node, text, facts)) {
        addIssue('fulfillment', `未履约节点：${node}`);
      }
    }
    for (const forbidden of contract.forbidden) {
      if (forbidden && text.includes(forbidden)) {
        addIssue('fulfillment', `触发本章禁区：${forbidden}`, [forbidden]);
      }
    }
  }
}
