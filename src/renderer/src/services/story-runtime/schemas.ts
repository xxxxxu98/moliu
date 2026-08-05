import { z } from 'zod';

import type {
  ChapterCommitReceipt,
  ChapterJudgeResult,
  ExtractedFacts,
  FulfillmentCheckResult,
  JsonValue,
  SceneDraft,
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

const idStringArraySchema = z.preprocess((value: unknown) => {
  if (!Array.isArray(value)) return value;
  return value
    .map(item => coerceIdString(item))
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
}, z.array(z.string()));

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
  effects: z.array(z.string()),
  evidence: z.array(z.string()),
  timestamp: z.string().optional(),
  provisional: z.boolean().optional(),
});

export const stateDeltaSchema = z.object({
  operation: z.enum(['set', 'add', 'remove', 'increment']),
  path: z.string().min(1),
  value: jsonValueSchema.optional(),
  evidence: z.string().min(1),
});

export const storyStateSchema: z.ZodType<StoryState> = z.object({
  chapter: z.number().int().nonnegative(),
  entities: z.record(z.string(), storyEntitySchema),
  events: z.array(storyEventSchema),
  inventory: z.record(z.string(), z.record(z.string(), z.number())),
  knowledge: z.record(z.string(), z.array(z.string())),
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
 * 事实提取软校验：模型常少返回顶层 events/deltas/evidence 数组字段，
 * 旧逻辑会因 `expected array, received undefined` 整章崩。
 * 这里用 z.preprocess 把缺失/非数组的字段回填 []，照搬现有 idStringArraySchema 的兜底模式。
 * 内层元素（storyEventSchema / stateDeltaSchema）仍严格校验，不掩盖真实结构问题。
 */
export function coerceExtractedFacts(value: unknown): unknown {
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
  evidence: z.array(z.string()),
  reason: z.string(),
});

export const fulfillmentCheckResultSchema: z.ZodType<FulfillmentCheckResult> = z.object({
  results: z.array(fulfillmentNodeJudgmentSchema),
});

export const chapterJudgeResultSchema: z.ZodType<ChapterJudgeResult> = z.object({
  fulfillment: z.array(fulfillmentNodeJudgmentSchema),
  forbidden: z.array(
    z.object({
      zone: z.string().min(1),
      violated: z.boolean(),
      evidence: z.array(z.string()),
      reason: z.string(),
    })
  ),
  issues: z.array(
    z.object({
      type: z.enum([
        'fact_conflict',
        'logic_gap',
        'ooc',
        'timeline',
        'power',
        'foreshadow',
      ]),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      location: z.string(),
      description: z.string(),
      evidence: z.array(z.string()),
    })
  ),
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
});

export function parseSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} 结构校验失败: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
