import type {
  ContextPack,
  SceneDraft,
  ScenePlan,
  StructuredAI,
} from '@/types/story-runtime';

import { parseSchema, sceneDraftSchema } from './schemas';

export class SceneDraftEngine {
  constructor(private readonly ai: StructuredAI) {}

  async draft(plan: ScenePlan, context: ContextPack): Promise<SceneDraft[]> {
    const blockedIds = new Set(
      plan.prechecks.filter(result => !result.accepted).map(result => result.candidateId)
    );
    const drafts: SceneDraft[] = [];
    for (const beat of plan.beats) {
      const candidates = beat.candidateEvents.filter(candidate => !blockedIds.has(candidate.id));
      const raw = await this.ai.generate<SceneDraft>({
        purpose: 'scene-draft',
        schemaName: 'SceneDraft',
        system:
          '你是长篇小说场景写作引擎。严格服从合同、状态和场景 DAG，不得采用预检失败的候选事件。',
        prompt: JSON.stringify({
          beat,
          allowedCandidateEvents: candidates,
          context,
        }),
        parse: value => parseSchema(sceneDraftSchema, value, `场景 ${beat.id}`),
      });
      const draft = parseSchema(sceneDraftSchema, raw, `场景 ${beat.id}`);
      if (draft.beatId !== beat.id) {
        throw new Error(`场景输出 beatId ${draft.beatId} 与计划 ${beat.id} 不一致`);
      }
      if (draft.candidateEvents.some(event => blockedIds.has(event.id))) {
        throw new Error(`场景 ${draft.sceneId} 使用了预检失败的候选事件`);
      }
      drafts.push(draft);
    }
    return drafts;
  }
}
