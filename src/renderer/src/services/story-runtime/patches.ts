import { z } from 'zod';

import type { StoryPatch } from '@/types/story-runtime';

import { parseSchema, sceneDraftSchema } from './schemas';

const patchBase = {
  projectId: z.string().min(1),
  chapterNumber: z.number().int().positive(),
  sceneId: z.string().min(1),
  expectedRevision: z.number().int().nonnegative(),
  reason: z.string().min(1),
};

export const scenePatchSchema = z.object({
  kind: z.literal('scene'),
  ...patchBase,
  replacement: sceneDraftSchema,
});

export const paragraphPatchSchema = z.object({
  kind: z.literal('paragraph'),
  ...patchBase,
  paragraphIndex: z.number().int().nonnegative(),
  replacement: z.string().min(1),
});

export const storyPatchSchema = z.discriminatedUnion('kind', [
  scenePatchSchema,
  paragraphPatchSchema,
]);

export function parseStoryPatch(value: unknown): StoryPatch {
  return parseSchema(storyPatchSchema, value, 'Story patch');
}
