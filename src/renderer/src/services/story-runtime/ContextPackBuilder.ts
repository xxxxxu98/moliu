import type {
  ContextBlock,
  ContextBlockKind,
  ContextPack,
  ContextPackInput,
  SceneChunk,
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

function compactScenes(scenes: SceneChunk[]): Array<Pick<SceneChunk, 'id' | 'title' | 'text' | 'summary'>> {
  return scenes.map(scene => ({
    id: scene.id,
    title: scene.title,
    text: scene.text,
    summary: scene.summary,
  }));
}

export class ContextPackBuilder {
  build(input: ContextPackInput): ContextPack {
    if (input.maxTokens < 1) {
      throw new ContextBudgetError('上下文预算必须大于 0', 1, input.maxTokens);
    }
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const candidates: ContextBlock[] = [
      makeBlock('locked-contracts', input.contracts, true),
      makeBlock('current-state', state, true),
      makeBlock('recent-scenes', compactScenes(input.recentScenes), false),
      makeBlock('retrieval', compactScenes(input.retrievedScenes), false),
      makeBlock('style', input.styleGuidance, false),
    ];
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
