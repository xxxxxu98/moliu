import type {
  CandidateEvent,
  ContextPack,
  SceneBeat,
  SceneDraft,
  ScenePlan,
  StructuredAI,
} from '@/types/story-runtime';

import { parseSchema, sceneDraftSchema } from './schemas';
import { sanitizeSceneDraftParagraphs } from './stripDraftLeakage';

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
  // 根治点：只在结构化边界剥离 schema 残留，不改写小说叙述正文
  const paragraphs = sanitizeSceneDraftParagraphs(extractParagraphs(payload));

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

function collectAllowedCandidates(plan: ScenePlan, blockedIds: Set<string>): CandidateEvent[] {
  const byId = new Map<string, CandidateEvent>();
  for (const beat of plan.beats) {
    for (const candidate of beat.candidateEvents) {
      if (blockedIds.has(candidate.id)) continue;
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()];
}

/**
 * 单次整章起草：把 CBN/CPNs/CEN 作为大纲节点一次写完，避免多 beat 拼接导致重复开场与文气断裂。
 * 规划层仍保留多 beat（门禁/履约用）；落库只产出一份连贯正文。
 */
export class SceneDraftEngine {
  constructor(private readonly ai: StructuredAI) {}

  async draft(plan: ScenePlan, context: ContextPack): Promise<SceneDraft[]> {
    if (plan.beats.length === 0) {
      throw new Error(`章节 ${plan.chapterNumber} 缺少可写场景 beat`);
    }

    const blockedIds = new Set(
      plan.prechecks.filter(result => !result.accepted).map(result => result.candidateId)
    );
    const primaryBeat = plan.beats[0];
    const candidates = collectAllowedCandidates(plan, blockedIds);
    const expectedSceneId = `${primaryBeat.id}:scene`;
    const chapterBeats = plan.beats.map(beat => ({
      id: beat.id,
      kind: beat.kind,
      order: beat.order,
      summary: beat.summary,
    }));

    const raw = await this.ai.generate<SceneDraft>({
      purpose: 'scene-draft',
      schemaName: 'SceneDraft',
      system: [
        '你是长篇小说整章写作引擎。严格服从合同、状态和章节大纲节点，不得采用预检失败的候选事件。',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        'JSON 字段必须为：',
        `{"sceneId":"${expectedSceneId}","beatId":"${primaryBeat.id}","paragraphs":["段落1","段落2"],"candidateEvents":[...]}`,
        `- sceneId 必须等于 "${expectedSceneId}"`,
        `- beatId 必须等于 "${primaryBeat.id}"`,
        '- paragraphs 至少 1 段，写可直接入库的小说正文（中文）',
        '- 必须一次写完全章：按 chapterBeats 顺序覆盖 CBN→CPNs→CEN，情节只向前推进',
        '- 【禁止】中途重新开场、重复穿越/醒来、重写已发生剧情、把同一事件换措辞再写一遍',
        '- 【禁止】把章节拆成互不衔接的几段独立短文；段落之间必须文气连贯',
        '- paragraphs 数组元素只能是小说正文，禁止写入 sceneId/beatId/candidateEvents 等字段名，禁止写入 ] } : 等 JSON 骨架',
        '- candidateEvents 只能从 allowedCandidateEvents 中原样挑选，禁止新增 id',
      ].join('\n'),
      prompt: JSON.stringify({
        chapterNumber: plan.chapterNumber,
        chapterBeats,
        primaryBeat,
        // 兼容旧 FakeAI / 调试：保留 beat 指向主 beat
        beat: primaryBeat,
        allowedCandidateEvents: candidates,
        context,
        writingRules: {
          mode: 'single-shot-chapter',
          mustCoverInOrder: chapterBeats.map(beat => `${beat.kind}: ${beat.summary}`),
          forbidPlotRestart: true,
        },
        requiredOutput: {
          sceneId: expectedSceneId,
          beatId: primaryBeat.id,
          paragraphs: ['正文段落...'],
          candidateEvents: candidates,
        },
      }),
      parse: value =>
        parseSchema(
          sceneDraftSchema,
          coerceSceneDraft(value, primaryBeat, candidates),
          `章节 ${plan.chapterNumber} 整章正文`
        ),
    });

    const draft = parseSchema(
      sceneDraftSchema,
      coerceSceneDraft(raw, primaryBeat, candidates),
      `章节 ${plan.chapterNumber} 整章正文`
    );
    if (draft.beatId !== primaryBeat.id) {
      throw new Error(`整章输出 beatId ${draft.beatId} 与主 beat ${primaryBeat.id} 不一致`);
    }
    if (draft.candidateEvents.some(event => blockedIds.has(event.id))) {
      throw new Error(`场景 ${draft.sceneId} 使用了预检失败的候选事件`);
    }
    return [draft];
  }
}
