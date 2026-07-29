import type {
  CandidateEvent,
  ContextPack,
  SceneBeat,
  SceneDraft,
  ScenePlan,
  StructuredAI,
} from '@/types/story-runtime';

import { parseSchema, sceneDraftSchema } from './schemas';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解开常见包装层：{ data } / { result } / { scene } / { draft } */
function unwrapPayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  for (const key of ['data', 'result', 'scene', 'draft', 'sceneDraft', 'output'] as const) {
    if (key in value) return value[key];
  }
  return value;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n{2,}/u)
      .map(part => part.trim())
      .filter(Boolean);
  }
  return [];
}

function extractParagraphs(payload: unknown): string[] {
  if (typeof payload === 'string' && payload.trim()) {
    return asStringArray(payload);
  }
  if (!isRecord(payload)) return [];

  const direct = asStringArray(
    payload.paragraphs ?? payload.paragraph ?? payload.content ?? payload.text ?? payload.prose
  );
  if (direct.length > 0) return direct;

  // 中文别名兜底
  return asStringArray(payload['段落'] ?? payload['正文'] ?? payload['内容']);
}

function pickCandidateEvents(
  payload: unknown,
  allowed: CandidateEvent[]
): CandidateEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.candidateEvents)) {
    return allowed;
  }

  const allowedById = new Map(allowed.map(item => [item.id, item]));
  const selected: CandidateEvent[] = [];
  for (const item of payload.candidateEvents) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const matched = allowedById.get(id);
    if (matched) {
      selected.push(matched);
    }
  }
  return selected.length > 0 ? selected : allowed;
}

/**
 * 用已知 beat / 候选事件补齐 AI 常漏的结构字段，再交给 zod 校验。
 * 模型经常只返回正文或中文字段名，导致 sceneId/beatId 等为 undefined。
 */
export function coerceSceneDraft(
  value: unknown,
  beat: SceneBeat,
  allowedCandidateEvents: CandidateEvent[]
): SceneDraft {
  const payload = unwrapPayload(value);
  const paragraphs = extractParagraphs(payload);

  if (paragraphs.length === 0) {
    throw new Error(`场景 ${beat.id} 未返回可用正文段落`);
  }

  return {
    sceneId: `${beat.id}:scene`,
    beatId: beat.id,
    paragraphs,
    candidateEvents: pickCandidateEvents(payload, allowedCandidateEvents),
  };
}

export class SceneDraftEngine {
  constructor(private readonly ai: StructuredAI) {}

  async draft(plan: ScenePlan, context: ContextPack): Promise<SceneDraft[]> {
    const blockedIds = new Set(
      plan.prechecks.filter(result => !result.accepted).map(result => result.candidateId)
    );
    const drafts: SceneDraft[] = [];
    for (const beat of plan.beats) {
      const candidates = beat.candidateEvents.filter(candidate => !blockedIds.has(candidate.id));
      const expectedSceneId = `${beat.id}:scene`;
      const raw = await this.ai.generate<SceneDraft>({
        purpose: 'scene-draft',
        schemaName: 'SceneDraft',
        system: [
          '你是长篇小说场景写作引擎。严格服从合同、状态和场景 DAG，不得采用预检失败的候选事件。',
          '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
          'JSON 字段必须为：',
          `{"sceneId":"${expectedSceneId}","beatId":"${beat.id}","paragraphs":["段落1","段落2"],"candidateEvents":[...]}`,
          `- sceneId 必须等于 "${expectedSceneId}"`,
          `- beatId 必须等于 "${beat.id}"`,
          '- paragraphs 至少 1 段，写可直接入库的小说正文（中文）',
          '- candidateEvents 只能从 allowedCandidateEvents 中原样挑选，禁止新增 id',
        ].join('\n'),
        prompt: JSON.stringify({
          beat,
          allowedCandidateEvents: candidates,
          context,
          requiredOutput: {
            sceneId: expectedSceneId,
            beatId: beat.id,
            paragraphs: ['正文段落...'],
            candidateEvents: candidates,
          },
        }),
        parse: value =>
          parseSchema(
            sceneDraftSchema,
            coerceSceneDraft(value, beat, candidates),
            `场景 ${beat.id}`
          ),
      });
      const draft = parseSchema(
        sceneDraftSchema,
        coerceSceneDraft(raw, beat, candidates),
        `场景 ${beat.id}`
      );
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
