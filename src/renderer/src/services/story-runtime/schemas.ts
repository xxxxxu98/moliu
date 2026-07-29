import { z } from 'zod';

import type {
  ChapterCommitReceipt,
  ExtractedFacts,
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
  participants: z.array(z.string()),
  locationId: z.string().optional(),
  causes: z.array(z.string()),
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
  participants: z.array(z.string()),
  locationId: z.string().optional(),
  prerequisites: z.array(z.string()),
  effects: z.array(z.string()),
});

export const sceneDraftSchema: z.ZodType<SceneDraft> = z.object({
  sceneId: z.string().min(1),
  beatId: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  candidateEvents: z.array(candidateEventSchema),
});

export const extractedFactsSchema: z.ZodType<ExtractedFacts> = z.object({
  events: z.array(storyEventSchema),
  deltas: z.array(stateDeltaSchema),
  evidence: z.array(z.string()),
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
