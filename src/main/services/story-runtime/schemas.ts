import { z } from 'zod';
import { STORY_RUNTIME_TABLES } from './types';
import type { JsonValue } from './types';

export const projectIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(value => value !== '.' && value !== '..', 'projectId 不合法');

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const rowSchema = z.record(z.string().min(1), jsonValueSchema);
const tableSchema = z.enum(STORY_RUNTIME_TABLES);

export const bootstrapInputSchema = z.object({
  projectId: projectIdSchema,
  seed: z.partialRecord(tableSchema, z.array(rowSchema).max(10_000)).optional(),
});

export const upsertInputSchema = z.object({
  projectId: projectIdSchema,
  table: tableSchema,
  rows: z.array(rowSchema).min(1).max(10_000),
});

export const queryInputSchema = z.object({
  projectId: projectIdSchema,
  table: tableSchema,
  filters: z
    .record(z.string().min(1), z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
    .optional(),
  fullText: z.string().trim().min(1).max(500).optional(),
  beforeChapter: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const acceptedCommitInputSchema = z.object({
  projectId: projectIdSchema,
  commit: z.object({
    id: z.string().trim().min(1).max(200),
    chapter: z.number().int().nonnegative(),
    draftId: z.string().trim().min(1).max(200).optional(),
    idempotencyKey: z.string().trim().min(1).max(200),
    payload: jsonValueSchema,
  }),
  projections: z.partialRecord(tableSchema, z.array(rowSchema).max(10_000)).optional(),
  outbox: z
    .array(
      z.object({
        projectionType: z.string().trim().min(1).max(100),
        payload: jsonValueSchema,
      })
    )
    .min(1)
    .max(100),
});

export const readOutboxInputSchema = z.object({
  projectId: projectIdSchema,
  limit: z.number().int().min(1).max(100).default(20),
});

export const completeOutboxInputSchema = z.object({
  projectId: projectIdSchema,
  outboxId: z.number().int().positive(),
  success: z.boolean(),
  error: z.string().max(2_000).optional(),
});
