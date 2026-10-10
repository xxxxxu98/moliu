import { z } from 'zod';

import type {
  ChapterCommitReceipt,
  ChapterJudgeResult,
  EndingClosureResult,
  ExtractedFacts,
  FulfillmentCheckResult,
  JsonValue,
  SceneDraft,
  StateDelta,
  StoryBootstrapData,
  StoryState,
} from '@/types/story-runtime';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

/**
 * AI 常把 participants 写成 {id,name} 对象；统一压成非空字符串 id/名。
 */
export function coerceIdString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['id', 'name', 'entityId', 'characterId']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return undefined;
}

/**
 * 纯数字字符串校验：仅接受 ASCII 十进制（u 模式下 \d 会匹配 Unicode 数字如 ٠-٩，
 * Number() 不识别会得 NaN），空串/十六进制/科学计数/带单位一律不收。
 * 与 FactCanonicalizer 的 inventory 契约保持一致。
 */
const NUMERIC_STRING_RE = /^[+-]?[0-9]+(\.[0-9]+)?$/u;

/**
 * 把 inventory 叶子值归一化为有限数字；无法识别为数量时返回 undefined。
 *
 * 覆盖模型常见偏差：
 * - 数字 / 纯数字字符串 → 直接转 number
 * - 对象（如 {quantity:5,unit:"颗"} 或 {unit:"颗",note:"灵力结晶"}）
 *   → 按优先级查常见数量字段，取首个可转有限数字者；纯描述对象返回 undefined
 * - boolean / null / 数组 / 非数字字符串 → undefined（交给调用方丢弃）
 */
export function extractInventoryNumeric(leaf: unknown): number | undefined {
  if (typeof leaf === 'number') {
    return Number.isFinite(leaf) ? leaf : undefined;
  }
  if (typeof leaf === 'string') {
    const trimmed = leaf.trim();
    if (trimmed === '' || !NUMERIC_STRING_RE.test(trimmed)) return undefined;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (leaf && typeof leaf === 'object' && !Array.isArray(leaf)) {
    const record = leaf as Record<string, unknown>;
    for (const key of [
      'quantity',
      'count',
      'amount',
      'num',
      'value',
      'number',
      '数量',
      '数',
      '个数',
      '数目',
    ]) {
      const candidate = extractInventoryNumeric(record[key]);
      if (candidate !== undefined) return candidate;
    }
    return undefined;
  }
  return undefined;
}

/**
 * inventory Record 容错：模型偶发把物品写成 {unit,note} 对象或带单位字符串，
 * 导致 storyStateSchema 的 `Record<string, Record<string, number>>` 校验失败、
 * loadState 整章崩溃。这里在 schema 入口把每个叶子 coerce 为数字，无法识别则丢弃。
 * 整个 owner 被清空时一并删除，避免遗留空对象。
 */
export function coerceInventoryRecord(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const owners = value as Record<string, unknown>;
  const droppedItems: string[] = [];
  for (const ownerKey of Object.keys(owners)) {
    const ownerValue = owners[ownerKey];
    if (!ownerValue || typeof ownerValue !== 'object' || Array.isArray(ownerValue)) {
      // owner 不是对象（如 number/string）→ 不符合 inventory 契约，丢弃整个 owner
      droppedItems.push(`${ownerKey}:<non-object>`);
      delete owners[ownerKey];
      continue;
    }
    const items = ownerValue as Record<string, unknown>;
    for (const itemKey of Object.keys(items)) {
      const numeric = extractInventoryNumeric(items[itemKey]);
      if (numeric === undefined) {
        droppedItems.push(`${ownerKey}.${itemKey}`);
        delete items[itemKey];
      } else {
        items[itemKey] = numeric;
      }
    }
    if (Object.keys(items).length === 0) {
      delete owners[ownerKey];
    }
  }
  if (droppedItems.length > 0) {
    console.warn(
      `[schemas] inventory 叶子被软归一化/丢弃（模型返回了非数量值）：${droppedItems.slice(0, 8).join(', ')}${droppedItems.length > 8 ? ` 等 ${droppedItems.length} 项` : ''}`
    );
  }
  return owners;
}

const inventorySchema = z.preprocess(
  coerceInventoryRecord,
  z.record(z.string(), z.record(z.string(), z.number()))
);

/**
 * knowledge Record 容错：knowledge 契约是 Record<entityId, string[]>，但模型经
 * state delta 写入时偶发把叶子污染成布尔/对象（真实案例：delta value:true 写入
 * knowledge.char-x.火焰纹一致 → char-x 变成 {火焰纹一致: true}）。
 * 污染一旦落进 canonical snapshot，后续每章 loadState 都会整章崩溃且重试无解。
 * 这里在 schema 入口把每个 owner 软归一化回 string[]：
 * - string[] → 原样（过滤非字符串与空串）
 * - object → 所有 key 视为「知道了的事实」（{事实A: true} → ['事实A']）
 * - string → 单事实包装；其它 → 丢弃该 owner
 */
export function coerceKnowledgeRecord(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const knowledge = value as Record<string, unknown>;
  const droppedOwners: string[] = [];
  for (const knower of Object.keys(knowledge)) {
    const raw = knowledge[knower];
    let facts: string[] | undefined;
    if (Array.isArray(raw)) {
      const filtered = raw.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0
      );
      if (filtered.length > 0) facts = filtered;
    } else if (typeof raw === 'string') {
      if (raw.trim()) facts = [raw.trim()];
    } else if (raw && typeof raw === 'object') {
      const keys = Object.keys(raw as Record<string, unknown>).filter(key => key.trim());
      if (keys.length > 0) facts = keys;
    }
    if (facts) {
      knowledge[knower] = facts;
    } else {
      droppedOwners.push(knower);
      delete knowledge[knower];
    }
  }
  if (droppedOwners.length > 0) {
    console.warn(
      `[schemas] knowledge owner 被软归一化/丢弃（模型写入了非法形态）：${droppedOwners.slice(0, 8).join(', ')}${droppedOwners.length > 8 ? ` 等 ${droppedOwners.length} 项` : ''}`
    );
  }
  return knowledge;
}

const knowledgeSchema = z.preprocess(
  coerceKnowledgeRecord,
  z.record(z.string(), z.array(z.string()))
);

const idStringArraySchema = z.preprocess((value: unknown) => {
  if (!Array.isArray(value)) return value;
  return value
    .map(item => coerceIdString(item))
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
}, z.array(z.string()));

/**
 * 字符串数组容错：模型偶发把 evidence / effects 等字段写成嵌套数组
 * （如 events[4].evidence[4] 是 array 而非 string），导致 z.array(z.string()) 校验失败、
 * 整章 fact-extraction 崩溃。这里递归展平任意深度的嵌套，过滤空串与非字符串，
 * 供 evidence / effects 等纯字符串数组字段复用。
 *
 * 输入形态容忍：
 * - 字符串 → [string]
 * - 数组（元素可为 string | string[] | Array<string|string[]>）→ 递归展平
 * - 其它（number/boolean/null/undefined/对象）→ [] （对象不会被字符串化，避免污染）
 */
export function coerceStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    // 纯数字/布尔偶发出现，转字符串保留信息（与 coerceIdString 的数字处理一致）
    return [String(value)];
  }
  if (Array.isArray(value)) {
    const flattened: string[] = [];
    for (const item of value) {
      const sub = coerceStringArray(item);
      for (const s of sub) {
        if (s && !flattened.includes(s)) {
          flattened.push(s);
        }
      }
    }
    return flattened;
  }
  // 对象：不字符串化（[object Object] 无意义），直接丢弃
  return [];
}

const stringArraySchema = z.preprocess(
  (value: unknown) => coerceStringArray(value),
  z.array(z.string()),
);

const sourceTraceSchema = z.object({
  source: z.string().min(1),
  sourceId: z.string().optional(),
  chapter: z.number().int().nonnegative().optional(),
});

const storyEntitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['character', 'location', 'faction', 'item', 'rule', 'foreshadow']),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  attributes: z.record(z.string(), jsonValueSchema),
  knownBy: z.array(z.string()),
  sourceTrace: z.array(sourceTraceSchema),
});

export const storyEventSchema = z.object({
  id: z.string().min(1),
  chapter: z.number().int().nonnegative(),
  sceneId: z.string().min(1),
  type: z.string().min(1),
  summary: z.string().min(1),
  participants: idStringArraySchema,
  locationId: z.string().optional(),
  causes: idStringArraySchema,
  // effects / evidence 用容错 schema：模型偶发返回嵌套数组（如 evidence[4] 是 array），
  // 用 coerceStringArray 递归展平，避免整章 fact-extraction 崩溃。
  effects: stringArraySchema,
  evidence: stringArraySchema,
  timestamp: z.string().optional(),
  provisional: z.boolean().optional(),
  // 契约 15/17 结构化出账（2026-10-05）：数字/时间事实不再拍扁成句子走正则回抽，
  // AI 归一「对象+数值+单位」「承诺+期限+动作」，题材无关（单位是自由字符串）。
  // 形态闸走 preprocess：字段形态损坏时静默剥离该结构化字段（事件本体照常通过），
  // 与元素级软兜底同哲学——不让一个坏 numeric 拖死整章事实提取。
  numeric: z.preprocess(
    (v) => {
      if (v == null || typeof v !== 'object') return undefined;
      const rec = v as Record<string, unknown>;
      if (typeof rec.amount !== 'number' || !Number.isFinite(rec.amount)) return undefined;
      if (typeof rec.object !== 'string' || !rec.object.trim()) return undefined;
      if (typeof rec.unit !== 'string' || !rec.unit.trim()) return undefined;
      const revision = rec.revision === 'establish' || rec.revision === 'correct' ? rec.revision : undefined;
      return {
        object: rec.object,
        amount: rec.amount,
        unit: rec.unit,
        ...(typeof rec.nature === 'string' && rec.nature.trim() ? { nature: rec.nature } : {}),
        ...(revision ? { revision } : {}),
      };
    },
    z
      .object({
        object: z.string().min(1),
        amount: z.number(),
        unit: z.string().min(1),
        nature: z.string().optional(),
        revision: z.enum(['establish', 'correct']).optional(),
      })
      .optional()
  ),
  time: z.preprocess(
    (v) => {
      if (v == null || typeof v !== 'object') return undefined;
      const rec = v as Record<string, unknown>;
      if (typeof rec.promise !== 'string' || !rec.promise.trim()) return undefined;
      if (rec.action !== 'open' && rec.action !== 'fulfilled' && rec.action !== 'renegotiated') {
        return undefined;
      }
      return {
        promise: rec.promise,
        action: rec.action,
        ...(typeof rec.due === 'string' && rec.due.trim() ? { due: rec.due } : {}),
      };
    },
    z
      .object({
        promise: z.string().min(1),
        due: z.string().optional(),
        action: z.enum(['open', 'fulfilled', 'renegotiated']),
      })
      .optional()
  ),
  // 契约 19：年号+年份。形态损坏时剥离 era，事件本体照常通过。
  era: z.preprocess(
    (v) => {
      if (v == null || typeof v !== 'object') return undefined;
      const rec = v as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name || name.length > 8 || /[\r\n]/.test(name)) return undefined;
      if (typeof rec.year !== 'number' || !Number.isInteger(rec.year) || rec.year <= 0 || rec.year > 9999) {
        return undefined;
      }
      const revision = rec.revision === 'establish' || rec.revision === 'correct' ? rec.revision : undefined;
      return {
        name,
        year: rec.year,
        ...(revision ? { revision } : {}),
      };
    },
    z
      .object({
        name: z.string().min(1),
        year: z.number().int().positive(),
        revision: z.enum(['establish', 'correct']).optional(),
      })
      .optional()
  ),
});

/** 与 stateLedger.TransitionKind 保持同一组字面量；非法值预处理成缺省，不拒整条 delta。 */
const LEDGER_TRANSITION_LITERALS = [
  'death',
  'faked-death',
  'death-revealed-fake',
  'arrest',
  'release',
  'bail',
  'escape',
  'recapture',
  'transfer',
  'dismiss',
  'appoint',
  'restore',
  'reveal-identity',
] as const;

const ledgerTransitionSchema = z.preprocess(
  value =>
    typeof value === 'string' &&
    (LEDGER_TRANSITION_LITERALS as readonly string[]).includes(value)
      ? value
      : undefined,
  z.enum(LEDGER_TRANSITION_LITERALS).optional(),
);

export const stateDeltaSchema = z.object({
  operation: z.enum(['set', 'add', 'remove', 'increment']),
  path: z.string().min(1),
  value: jsonValueSchema.optional(),
  evidence: z.string().min(1),
  transition: ledgerTransitionSchema.optional(),
});

/** 命运漏登复检结果：只补 deltas，事件本身已由首轮提取产出 */
export const fateRecheckResultSchema: z.ZodType<{ deltas: StateDelta[] }> = z.object({
  deltas: z.array(stateDeltaSchema),
});

export const storyStateSchema: z.ZodType<StoryState> = z.object({
  chapter: z.number().int().nonnegative(),
  entities: z.record(z.string(), storyEntitySchema),
  events: z.array(storyEventSchema),
  inventory: inventorySchema,
  knowledge: knowledgeSchema,
  timeline: z.array(z.string()),
  openForeshadows: z.array(z.string()),
  fulfilledNodes: z.array(z.string()),
});

const candidateEventSchema = z.object({
  id: z.string().min(1),
  summary: z.string().min(1),
  participants: idStringArraySchema,
  locationId: z.string().optional(),
  prerequisites: idStringArraySchema,
  effects: z.array(z.string()),
});

export const sceneDraftSchema: z.ZodType<SceneDraft> = z.object({
  sceneId: z.string().min(1),
  beatId: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  candidateEvents: z.array(candidateEventSchema),
  /** 章节标题（口语钩子句，可至约 22 字）；可选，兼容旧稿未返回该字段 */
  chapterTitle: z.string().min(1).max(48).optional(),
});

/**
 * 单个 event 元素的软修复：缺 type/summary/participants 等字段时填默认值。
 * 2026-08-17 矩阵实测 gemini ch3 事实提取返回 events[0] 缺 type/summary/participants
 * 三字段，zod 硬拒后只能靠「持久错误立即重试」碰运气（模型输出随机，重试可能原样复现）。
 * 元素级缺陷应降级为丢/修该元素，而不是整章失败——与顶层软兜底同一防线下移一层。
 * 返回 null 表示该元素无法修复（缺 summary 的事件没有语义，直接丢弃）。
 */
function repairEventElement(item: unknown, index: number, chapterNumber: number): unknown | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  const hasSummary = typeof record.summary === 'string' && record.summary.trim();
  if (!hasSummary) return null; // 无摘要的事件无语义，丢弃
  const repaired = { ...record };
  let touched = false;
  if (typeof repaired.id !== 'string' || !(repaired.id as string).trim()) {
    repaired.id = `fact-extract:recovered:${chapterNumber}:${index}`;
    touched = true;
  }
  if (typeof repaired.type !== 'string' || !(repaired.type as string).trim()) {
    repaired.type = 'event';
    touched = true;
  }
  if (typeof repaired.sceneId !== 'string' || !(repaired.sceneId as string).trim()) {
    repaired.sceneId = `chapter-${chapterNumber}:unknown:scene`;
    touched = true;
  }
  if (typeof repaired.chapter !== 'number' || !Number.isFinite(repaired.chapter)) {
    repaired.chapter = chapterNumber;
    touched = true;
  }
  if (!Array.isArray(repaired.participants)) {
    repaired.participants = [];
    touched = true;
  }
  if (!Array.isArray(repaired.causes)) {
    repaired.causes = [];
    touched = true;
  }
  if (touched) {
    console.warn(
      `[schemas] 事实提取 events[${index}] 元素字段软修复（补默认值/丢无效字段），summary=${String(repaired.summary).slice(0, 30)}`
    );
  }
  return repaired;
}

/**
 * 单个 delta 元素的软修复：缺 operation/path/evidence 时填默认值或丢弃。
 * deltas 的 evidence 是必填 min(1)，缺失时用 summary 语义兜底；缺 path 无从应用，丢弃。
 */
function repairDeltaElement(item: unknown, index: number): unknown | null {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
  const record = item as Record<string, unknown>;
  if (typeof record.path !== 'string' || !record.path.trim()) return null;
  const repaired = { ...record };
  let touched = false;
  if (repaired.operation !== 'set' && repaired.operation !== 'add'
    && repaired.operation !== 'remove' && repaired.operation !== 'increment') {
    repaired.operation = 'set';
    touched = true;
  }
  if (typeof repaired.evidence !== 'string' || !(repaired.evidence as string).trim()) {
    repaired.evidence = `delta@${record.path}（模型未提供证据，软兜底）`;
    touched = true;
  }
  if (touched) {
    console.warn(
      `[schemas] 事实提取 deltas[${index}] 元素字段软修复（operation/evidence 补默认值）`
    );
  }
  return repaired;
}

/**
 * 事实提取软校验：模型常少返回顶层 events/deltas/evidence 数组字段，
 * 旧逻辑会因 `expected array, received undefined` 整章崩。
 * 这里用 z.preprocess 把缺失/非数组的字段回填 []，照搬现有 idStringArraySchema 的兜底模式。
 * 内层元素（storyEventSchema / stateDeltaSchema）仍严格校验，不掩盖真实结构问题。
 */
export function coerceExtractedFacts(value: unknown): unknown {
  // 模型偶发把整个事实提取结果输出成裸数组（[event, delta, ...] 或 [str, str]），
  // 数组的 typeof === 'object' 会绕过下方的 null 检查，但 z.object 仍拒绝数组 → 整章崩。
  // 这里按元素特征分类包装为 {events, deltas, evidence}。
  if (Array.isArray(value)) {
    const events: unknown[] = [];
    const deltas: unknown[] = [];
    const evidence: unknown[] = [];
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        if (typeof record.operation === 'string' || typeof record.path === 'string') {
          deltas.push(item);
        } else if (
          typeof record.summary === 'string' ||
          typeof record.id === 'string' ||
          typeof record.sceneId === 'string'
        ) {
          events.push(item);
        }
        // 其它对象（无事件/delta 特征）忽略，避免污染
      } else if (typeof item === 'string' && item.trim()) {
        evidence.push(item.trim());
      }
    }
    console.warn(
      `[schemas] 事实提取顶层收到裸数组（${value.length} 项），已分类包装为 events/${events.length} deltas/${deltas.length} evidence/${evidence.length}`
    );
    return { events, deltas, evidence };
  }
  if (typeof value !== 'object' || value === null) return value;
  const obj = value as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of ['events', 'deltas', 'evidence'] as const) {
    if (!Array.isArray(obj[key])) {
      if (obj[key] !== undefined) {
        missing.push(`${key}:${typeof obj[key]}`);
      }
      obj[key] = [];
    }
  }
  if (missing.length > 0) {
    console.warn(
      `[schemas] 事实提取顶层字段被软兜底为 []（模型返回退化）：${missing.join(', ')}`
    );
  }
  // 元素级软修复：单条 event/delta 缺字段不再整章崩（丢弃无语义元素、补默认值救回其余）。
  // 章号未知时用 0 占位（repairEventElement 的默认 id/sceneId 仍可保证 schema 通过）。
  const chapterHint = typeof obj.chapter === 'number'
    ? obj.chapter
    : Array.isArray(obj.events) && obj.events.length > 0
      && typeof (obj.events[0] as { chapter?: unknown })?.chapter === 'number'
      ? (obj.events[0] as { chapter: number }).chapter
      : 0;
  if (Array.isArray(obj.events)) {
    const repaired: unknown[] = [];
    let dropped = 0;
    obj.events.forEach((item, index) => {
      const fixed = repairEventElement(item, index, chapterHint);
      if (fixed === null) {
        dropped += 1;
      } else {
        repaired.push(fixed);
      }
    });
    if (dropped > 0) {
      console.warn(
        `[schemas] 事实提取 events 丢弃 ${dropped} 条无法修复的元素（缺 summary 等核心字段），保留 ${repaired.length} 条`
      );
    }
    obj.events = repaired;
  }
  if (Array.isArray(obj.deltas)) {
    const repaired: unknown[] = [];
    let dropped = 0;
    obj.deltas.forEach((item, index) => {
      const fixed = repairDeltaElement(item, index);
      if (fixed === null) {
        dropped += 1;
      } else {
        repaired.push(fixed);
      }
    });
    if (dropped > 0) {
      console.warn(
        `[schemas] 事实提取 deltas 丢弃 ${dropped} 条无法修复的元素（缺 path），保留 ${repaired.length} 条`
      );
    }
    obj.deltas = repaired;
  }
  return obj;
}

const extractedFactsStrictSchema = z.object({
  events: z.array(storyEventSchema),
  deltas: z.array(stateDeltaSchema),
  evidence: z.array(z.string()),
});

export const extractedFactsSchema: z.ZodType<ExtractedFacts> = z.preprocess(
  coerceExtractedFacts,
  extractedFactsStrictSchema
);

const fulfillmentNodeJudgmentSchema = z.object({
  node: z.string().min(1),
  fulfilled: z.boolean(),
  evidence: stringArraySchema,
  reason: z.string(),
});

export const fulfillmentCheckResultSchema: z.ZodType<FulfillmentCheckResult> = z.object({
  results: z.array(fulfillmentNodeJudgmentSchema),
});

const chapterJudgeIssueTypes = ['fact_conflict', 'logic_gap', 'ooc', 'timeline', 'power', 'foreshadow'] as const;
const chapterJudgeSeverities = ['critical', 'high', 'medium', 'low'] as const;

const chapterJudgeIssueSchema = z.object({
      type: z.enum(chapterJudgeIssueTypes),
      severity: z.enum(chapterJudgeSeverities),
      location: z.string(),
      description: z.string(),
      evidence: stringArraySchema,
    });

/**
 * chapter-judge 响应软兜底：模型偶发只返回部分字段（如只给 fulfillment，
 * issues/forbidden 为 undefined——2026-08-18 gemini-3.6 20 章矩阵 ch2 实测），
 * 旧口径 zod 硬拒 → classifyError 判 schema 非瞬态 → 包成 review-unavailable
 * 直接终止整批续写。缺的字段填「不阻断正文」的安全默认（issues=[]、forbidden=[]），
 * 履约判定由 AIChapterJudge.normalize 对缺失节点补「未返回判定」。
 * 空响应/非对象不在此兜底（仍走硬失败 → truncated 重试）。
 */
function coerceChapterJudgeResult(value: unknown): unknown {
  // 顶层数组解包：模型偶发把对象裹一层数组返回（[{fulfillment:…}]——
  // 2026-08-21 生产实测 proj-1787300146075 ch31，expected object, received array
  // 硬拒 → review-unavailable 终止整批）。单元素数组取元素本身；
  // 多元素/空数组不在此兜底（无法安全选定，仍走硬失败由上层处理）。
  if (Array.isArray(value)) {
    if (value.length === 1) {
      console.warn('[schemas] 章节审查结果顶层为数组，已解包取首元素');
      value = value[0];
    } else {
      return value;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const obj = { ...(value as Record<string, unknown>) };
  for (const key of ['fulfillment', 'forbidden', 'issues'] as const) {
    if (obj[key] === undefined || obj[key] === null) {
      obj[key] = [];
      console.warn(`[schemas] 章节审查结果缺 ${key} 字段，已软兜底为 []`);
    }
  }
  // 回收伏笔 id 列表（可选新字段）：非数组/缺省一律视为「无回收」，不阻断主流程
  if (!Array.isArray(obj.resolvedForeshadowIds)) {
    obj.resolvedForeshadowIds = [];
  } else {
    obj.resolvedForeshadowIds = (obj.resolvedForeshadowIds as unknown[]).filter(
      item => typeof item === 'string' && item.trim().length > 0,
    );
  }
  // 数组内缺核心字段的元素直接剔除（无法安全构造判定），保留可解析部分；
  // 辅助字段（reason/location）不参与门禁决策，缺失补安全默认而非硬拒——
  // 2026-08-21 生产实测 proj-1787300146075 ch38：fulfillment[1] 漏写 reason，
  // zod 硬拒 → review-unavailable 终止整批。evidence 由 stringArraySchema 兜底 []。
  // 剔除口径与 zod 约束对齐（枚举、min(1)），否则不合格元素穿透剔除后仍会硬拒。
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    typeof item === 'object' && item !== null;
  const issueTypeSet = new Set<string>(chapterJudgeIssueTypes);
  const severitySet = new Set<string>(chapterJudgeSeverities);
  obj.fulfillment = (obj.fulfillment as unknown[])
    .filter(
      item => isRecord(item)
        && typeof item.node === 'string' && item.node.trim().length > 0
        && typeof item.fulfilled === 'boolean',
    )
    .map(item => ({ ...item, reason: typeof item.reason === 'string' ? item.reason : '' }));
  obj.forbidden = (obj.forbidden as unknown[])
    .filter(
      item => isRecord(item)
        && typeof item.zone === 'string' && item.zone.trim().length > 0
        && typeof item.violated === 'boolean',
    )
    .map(item => ({ ...item, reason: typeof item.reason === 'string' ? item.reason : '' }));
  obj.issues = (obj.issues as unknown[])
    .filter(
      item => isRecord(item)
        && typeof item.type === 'string' && issueTypeSet.has(item.type)
        && typeof item.severity === 'string' && severitySet.has(item.severity)
        && typeof item.description === 'string',
    )
    .map(item => ({ ...item, location: typeof item.location === 'string' ? item.location : '' }));
  return obj;
}

export const chapterJudgeResultSchema: z.ZodType<ChapterJudgeResult> = z.preprocess(
  coerceChapterJudgeResult,
  z.object({
  fulfillment: z.array(fulfillmentNodeJudgmentSchema),
  forbidden: z.array(
    z.object({
      zone: z.string().min(1),
      violated: z.boolean(),
      evidence: stringArraySchema,
      reason: z.string(),
    })
  ),
  issues: z.array(chapterJudgeIssueSchema),
  resolvedForeshadowIds: z.array(z.string()).optional(),
  resolvedTimePromiseTexts: z.array(z.string()).optional(),
  }),
);

export const endingClosureResultSchema: z.ZodType<EndingClosureResult> = z.object({
  closed: z.boolean(),
  reason: z.string(),
});

const sceneChunkSchema = z.object({
  id: z.string().min(1),
  chapterId: z.string().min(1),
  chapterIndex: z.number().int().nonnegative(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  text: z.string().min(1),
  summary: z.string().optional(),
  participants: z.array(z.string()),
  locations: z.array(z.string()),
  sourceTrace: z.array(sourceTraceSchema),
});

export const sceneChunksSchema = z.array(sceneChunkSchema);

export const bootstrapSchema: z.ZodType<StoryBootstrapData> = z.object({
  schemaVersion: z.literal('story-runtime/v1'),
  project: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    genres: z.array(z.string()),
  }),
  entities: z.array(storyEntitySchema),
  rules: z.array(storyEntitySchema),
  foreshadows: z.array(storyEntitySchema),
  outlineNodes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      chapterRange: z.tuple([z.number(), z.number()]).optional(),
      chapterId: z.string().optional(),
      keyEvents: z.array(z.string()).optional(),
      CBN: z.string().optional(),
      CPNs: z.array(z.string()).optional(),
      CEN: z.string().optional(),
      mustCover: z.array(z.string()).optional(),
      forbiddenZones: z.array(z.string()).optional(),
    })
  ),
  chapterMemories: z.array(
    z.object({
      chapterId: z.string(),
      chapterTitle: z.string(),
      chapterIndex: z.number(),
      corePlot: z.string(),
      keyEvents: z.array(z.string()),
      locations: z.array(z.string()),
      timelineMark: z.string().optional(),
      revealedForeshadows: z.array(z.string()),
      newForeshadows: z.array(z.string()),
    })
  ),
  sceneChunks: sceneChunksSchema,
  initialState: storyStateSchema,
});

export const commitReceiptSchema: z.ZodType<ChapterCommitReceipt> = z.object({
  commitId: z.string().min(1),
  revision: z.number().int().positive(),
  acceptedAt: z.string().min(1),
  projectionOutbox: z
    .array(
      z.object({
        id: z.number().int().positive(),
        projectionType: z.enum(['summary', 'memory']),
      })
    )
    .optional(),
});

export function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} 结构校验失败: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
