import type {
  JsonValue,
  LegacyChapter,
  LegacyProjectInput,
  SceneChunk,
  StoryBootstrapData,
  StoryEntity,
  StoryState,
} from '@/types/story-runtime';

const SCENE_BREAK_PATTERN = /\n\s*(?:---+|={3,}|#{1,3}\s*场景[^\n]*|\*{3,})\s*\n|\n{3,}/u;

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item));
  }
  if (typeof value === 'object') {
    const converted: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) converted[key] = toJsonValue(item);
    }
    return converted;
  }
  return String(value);
}

function splitChapter(chapter: LegacyChapter): SceneChunk[] {
  const parts = chapter.content
    .split(SCENE_BREAK_PATTERN)
    .map(part => part.trim())
    .filter(part => part.length > 0);
  const texts = parts.length > 0 ? parts : [chapter.content.trim()].filter(Boolean);

  return texts.map((text, order) => ({
    id: `${chapter.id}:scene:${order + 1}`,
    chapterId: chapter.id,
    chapterIndex: chapter.orderIndex + 1,
    order,
    title: texts.length === 1 ? chapter.title : `${chapter.title} · 场景 ${order + 1}`,
    text,
    summary: order === 0 ? chapter.plotSummary : undefined,
    participants: [],
    locations: [],
    sourceTrace: [{ source: 'legacy-chapter', sourceId: chapter.id, chapter: chapter.orderIndex + 1 }],
  }));
}

export class LegacyProjectMigrator {
  migrate(project: LegacyProjectInput): StoryBootstrapData {
    const characters: StoryEntity[] = (project.characters ?? []).map(character => ({
      id: character.id,
      kind: 'character',
      name: character.name,
      aliases: [],
      attributes: {
        role: character.role ?? '',
        description: character.description ?? '',
        profile: toJsonValue(character.profile ?? {}),
      },
      knownBy: [character.id],
      sourceTrace: [{ source: 'legacy-character', sourceId: character.id }],
    }));

    const rules: StoryEntity[] = (project.worldSchema?.rules ?? []).map(rule => ({
      id: rule.id,
      kind: 'rule',
      name: rule.name,
      aliases: [],
      attributes: {
        description: rule.description,
        locked: rule.locked ?? false,
        category: rule.category ?? 'custom',
      },
      knownBy: [],
      sourceTrace: [{ source: 'legacy-rule', sourceId: rule.id }],
    }));
    const worldEntities: StoryEntity[] = [
      ...(project.worldSchema?.locations ?? []).map(location => ({
        id: location.id,
        kind: 'location' as const,
        name: location.name,
        aliases: [],
        attributes: {
          description: location.description ?? '',
          parentId: location.parentId ?? null,
          level: location.level ?? 'custom',
        },
        knownBy: [],
        sourceTrace: [{ source: 'legacy-location', sourceId: location.id }],
      })),
      ...(project.worldSchema?.factions ?? []).map(faction => ({
        id: faction.id,
        kind: 'faction' as const,
        name: faction.name,
        aliases: [],
        attributes: {
          description: faction.description ?? '',
          parentId: faction.parentId ?? null,
          relation: toJsonValue(faction.relation ?? null),
        },
        knownBy: [],
        sourceTrace: [{ source: 'legacy-faction', sourceId: faction.id }],
      })),
    ];

    const foreshadows: StoryEntity[] = (project.foreshadows ?? []).map(foreshadow => ({
      id: foreshadow.id,
      kind: 'foreshadow',
      name: foreshadow.hint,
      aliases: [],
      attributes: {
        hint: foreshadow.hint,
        type: foreshadow.type ?? 'event',
        status: foreshadow.status,
        createdChapter: foreshadow.createdChapter ?? 0,
        suggestedResolutionChapter: foreshadow.suggestedResolutionChapter ?? null,
      },
      knownBy: [],
      sourceTrace: [
        {
          source: 'legacy-foreshadow',
          sourceId: foreshadow.id,
          chapter: foreshadow.createdChapter,
        },
      ],
    }));

    const sceneChunks = [...(project.chapters ?? [])]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .flatMap(chapter => splitChapter(chapter));
    const initialState: StoryState = {
      chapter: Math.max(
        0,
        ...(project.chapters ?? [])
          .filter(chapter => chapter.content.trim().length > 0)
          .map(chapter => chapter.orderIndex + 1)
      ),
      entities: Object.fromEntries(
        [...characters, ...worldEntities, ...rules, ...foreshadows].map(entity => [entity.id, entity])
      ),
      events: [],
      inventory: {},
      knowledge: {},
      timeline: (project.chapterMemories ?? [])
        .map(memory => memory.timelineMark)
        .filter((mark): mark is string => Boolean(mark)),
      openForeshadows: foreshadows
        .filter(entity => entity.attributes.status !== 'resolved')
        .map(entity => entity.id),
      fulfilledNodes: [],
    };

    return {
      schemaVersion: 'story-runtime/v1',
      project: {
        id: project.id,
        title: project.name,
        description: project.description ?? '',
        genres: (project.genre ?? []).map(genre => genre.name),
      },
      entities: [...characters, ...worldEntities],
      rules,
      foreshadows,
      outlineNodes: project.plotOutline ?? [],
      chapterMemories: project.chapterMemories ?? [],
      sceneChunks,
      initialState,
    };
  }
}
