import type {
  CandidateEvent,
  ContextPack,
  SceneBeat,
  SceneDraft,
  ScenePlan,
  StructuredAI,
} from '@/types/story-runtime';

import { CHAPTER_TITLE_PROMPT_RULES, normalizeGeneratedChapterTitle } from '@/services/writing/chapterTitle';
import { MAX_WORD_THRESHOLD, MIN_WORD_THRESHOLD } from '@/services/writing/supplement';

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
    const id =
      typeof item === 'string'
        ? item
        : isRecord(item) && typeof item.id === 'string'
          ? item.id
          : '';
    const matched = allowedById.get(id);
    if (matched) {
      selected.push(matched);
    }
  }
  return selected.length > 0 ? selected : allowed;
}

function extractChapterTitle(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const raw =
    payload.chapterTitle ??
    payload.title ??
    payload['章节标题'] ??
    payload['标题'];
  return normalizeGeneratedChapterTitle(raw) ?? undefined;
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
    // 文案含「AI 未返回可解析的结构化 JSON」以匹配 ai-error-classify 的 TRUNCATED_RE，
    // 归类为 truncated（瞬态、可重试）——空段落多半是流式响应中途断开/模型只返回标题的连带症状，
    // 不应被误判为 unknown（持久、不可重试）而浪费整章重试预算。
    throw new Error(
      `场景 ${beat.id} 未返回可用正文段落（AI 未返回可解析的结构化 JSON）`
    );
  }

  const chapterTitle = extractChapterTitle(payload);
  return {
    sceneId: `${beat.id}:scene`,
    beatId: beat.id,
    paragraphs,
    candidateEvents: pickCandidateEvents(payload, allowedCandidateEvents),
    ...(chapterTitle ? { chapterTitle } : {}),
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
export interface SceneDraftOptions {
  targetWordCount?: number;
  /** 上一稿审核失败原因；存在时按重写任务整章重写 */
  revisionHints?: string[];
  /** 当前重写轮次（1 起）；仅用于 prompt 标注 */
  rewriteRound?: number;
  /**
   * 本章合法角色名白名单（来自完整 state.entities，未被 context 压缩筛选）。
   * 注入 prompt 约束模型只用已登记角色名，从源头杜绝跨章名字漂移
   * （如「陈砚」被写成「沈砚」→ fact_conflict → 连环重试）。
   */
  allowedCharacterNames?: string[];
}

export class SceneDraftEngine {
  constructor(private readonly ai: StructuredAI) {}

  async draft(
    plan: ScenePlan,
    context: ContextPack,
    options?: SceneDraftOptions
  ): Promise<SceneDraft[]> {
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
    const targetWordCount = options?.targetWordCount;
    const revisionHints = (options?.revisionHints ?? [])
      .map(hint => hint.trim())
      .filter(Boolean)
      .slice(0, 8);
    const hasWordTarget = typeof targetWordCount === 'number' && targetWordCount > 0;
    const minWordCount = hasWordTarget
      ? Math.floor(targetWordCount * MIN_WORD_THRESHOLD)
      : null;
    const maxWordCount = hasWordTarget
      ? Math.ceil(targetWordCount * MAX_WORD_THRESHOLD)
      : null;
    const minPct = Math.round(MIN_WORD_THRESHOLD * 100);
    const maxPct = Math.round(MAX_WORD_THRESHOLD * 100);
    const wordCountRules =
      hasWordTarget && minWordCount !== null && maxWordCount !== null
        ? [
            `- 本章目标 ${targetWordCount} 字（与编辑器一致：全文长度口径）；paragraphs 合计硬性区间 ${minWordCount}–${maxWordCount} 字（${minPct}%–${maxPct}%）`,
            `- 低于 ${minWordCount} 或高于 ${maxWordCount} 都视为不合格草稿`,
            `- 【字数硬要求】这是整章 single-shot 起草，不会有后续补字机会，必须一次写够 ${minWordCount} 字。请充分展开对话、动作、感官细节与场景转换，把 ${targetWordCount} 字的篇幅写满`,
            `- 禁止无意义注水、重复开场、把同一事件换措辞再写一遍；也禁止把一章写成远超目标的长文`,
            `- 分段适中：每段约 3～5 句；忌超长大段堆砌`,
          ]
        : [];
    // 角色名白名单：从完整角色库提取（未被 context 压缩筛选），约束模型只用已登记角色名，
    // 从源头杜绝跨章名字漂移（如「陈砚」写成「沈砚」→ fact_conflict → 连环重试）。
    // 仅当白名单有 2 个以上角色时注入（单角色无约束意义）。
    const allowedCharacterNames = (options?.allowedCharacterNames ?? [])
      .map(name => name.trim())
      .filter(Boolean);
    const characterNameRules =
      allowedCharacterNames.length >= 2
        ? [
            `- 【角色名白名单】本章只能使用以下已登记角色名：${allowedCharacterNames.join('、')}`,
            '- 禁止使用白名单外的角色名；如需新角色，用身份称呼（如「狱卒」「书吏」）与白名单内角色互动，不要另起具体姓名',
            '- 特别注意：不要把已登记角色的名字写成形近字或近义字（如「陈默」不要写成「沈默」、「陈砚」不要写成「沈砚」）',
          ]
        : [];
    const revisionRules =
      revisionHints.length > 0
        ? [
            '【重写任务】上一稿未通过审核，必须整章重写并修复下列问题，禁止重复同样错误：',
            ...revisionHints.map((hint, index) => `${index + 1}. ${hint}`),
            '- 内心观察与公开结论、证物细节必须前后一致；禁区内容不得出现或等价泄露（本章 mustCover 履约所需的指认/证据展示除外）',
          ]
        : [];
    const candidateIds = candidates.map(item => item.id);

    const raw = await this.ai.generate<SceneDraft>({
      purpose: 'scene-draft',
      schemaName: 'SceneDraft',
      system: [
        '你是长篇小说整章写作引擎。严格服从合同、状态和章节大纲节点，不得采用预检失败的候选事件。',
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        'JSON 字段必须为：',
        `{"sceneId":"${expectedSceneId}","beatId":"${primaryBeat.id}","chapterTitle":"短标题","paragraphs":["段落1","段落2"],"candidateEvents":[{"id":"..."}]}`,
        `- sceneId 必须等于 "${expectedSceneId}"`,
        `- beatId 必须等于 "${primaryBeat.id}"`,
        ...CHAPTER_TITLE_PROMPT_RULES,
        '- paragraphs 至少 1 段，写可直接入库的小说正文（中文）',
        '- 必须一次写完全章：按 chapterBeats 顺序覆盖 CBN→CPNs→CEN，情节只向前推进',
        '- 【本章范围】只兑现本章 CBN/CPNs/CEN；禁止提前写后续章高光（如后章才该发生的当堂对线、翻案完结、新实验高潮）',
        '- 【章末约束】最后一段必须落在 CEN 的后果/悬念上，停笔；不要再开新线或无因由再次入狱/失忆重来',
        '- 【状态衔接】开场必须承接上下文中的上章终态（在狱/在逃/证据清单），禁止无视终态重复穿越醒来',
        '- 【禁止】中途重新开场、重复穿越/醒来、重写已发生剧情、把同一事件换措辞再写一遍',
        '- 【禁止】把章节拆成互不衔接的几段独立短文；段落之间必须文气连贯',
        '- 【禁止台词重复】同一句台词/同一句话在本章内不得重复出现（包括章末回扣开篇钩子句）；若需强调，必须变换措辞、场景或由不同人物说出',
        '- 【禁止章末复读】章末段落不得把本章或上文已写过的句子原样再写一遍作为收尾；章末应是新的悬念/后果，而非复读',
        '- paragraphs 数组元素只能是小说正文，禁止写入 sceneId/beatId/candidateEvents 等字段名，禁止写入 ] } : 等 JSON 骨架',
        '- candidateEvents 只填 id 列表（从 allowedCandidateEventIds 中选），禁止重复粘贴 summary',
        ...wordCountRules,
        ...characterNameRules,
        ...revisionRules,
      ].join('\n'),
      prompt: JSON.stringify({
        chapterNumber: plan.chapterNumber,
        chapterBeats,
        primaryBeatId: primaryBeat.id,
        allowedCandidateEventIds: candidateIds,
        // 候选事件只给 id→一句 summary，避免与 beats/合同重复灌长文
        candidateSummaries: Object.fromEntries(
          candidates.map(item => [item.id, item.summary])
        ),
        context,
        targetWordCount: targetWordCount ?? null,
        writingRules: {
          mode: 'single-shot-chapter',
          forbidPlotRestart: true,
          scopeThisChapterOnly: true,
          endOnCEN: true,
          forbidFutureChapterPayoffs: true,
          targetWordCount: targetWordCount ?? null,
          minWordCount,
          maxWordCount,
        },
        titleHints: {
          vibe: '口语网文目录风，信息量够、别公文/案情通报',
          length: {
            min: 2,
            max: 22,
            prefer: '6-16字，宁可稍长也不要四字电报',
          },
          prefer: [
            '打脸',
            '翻车',
            '反转',
            '第一次',
            '秘密',
            '麻烦',
            '悬念半截话',
            '人物+事件',
            '反差钩子',
          ],
          avoid: ['四字成语堆砌', '公文味短句', '过于严肃的案情概括', '连续章节同款硬四字'],
          examples: [
            '这尸体怎么验都不对劲',
            '刚穿越就被诬下狱',
            '县令公子当场翻车',
            '今晚睡不着了',
          ],
        },
        revisionFeedback:
          revisionHints.length > 0
            ? {
                rewriteRound: options?.rewriteRound ?? 1,
                mustFix: revisionHints,
              }
            : null,
        requiredOutput: {
          sceneId: expectedSceneId,
          beatId: primaryBeat.id,
          chapterTitle: '口语标题（6-16字优先，如：这尸体怎么验都不对劲）',
          paragraphs: ['正文段落...'],
          candidateEvents: candidateIds.map(id => ({ id })),
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
