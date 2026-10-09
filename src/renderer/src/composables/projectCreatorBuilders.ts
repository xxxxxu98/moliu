/**
 * 项目创建纯函数构建器（可单测）
 * 供 useProjectCreator 使用，覆盖百万开书落库关键字段。
 */
import type { GeneratedOutline } from '@/types/inspiration';
import { resolvePersistedVocabularyTier } from '@/services/story-runtime/proseRules';
import type {
  Character,
  ProjectStartupPack,
  ProjectStoryScale,
  RelationshipType,
  Volume,
} from '@/types/project';

export function normalizeRelationshipType(type?: string): RelationshipType {
  const value = (type || 'neutral').toLowerCase();
  const map: Record<string, RelationshipType> = {
    friend: 'friend',
    ally: 'alliance',
    alliance: 'alliance',
    enemy: 'enemy',
    family: 'family',
    lover: 'lover',
    rival: 'rival',
    mentor: 'mentor',
    student: 'student',
    use: 'neutral',
    unknown: 'neutral',
    neutral: 'neutral',
  };
  return map[value] || 'neutral';
}

/** 从大纲构建卷实体：优先 volumePlans，否则按规模占位 */
export function buildVolumesFromOutline(
  outline: GeneratedOutline,
  stamp: number = Date.now(),
): Volume[] {
  if (Array.isArray(outline.volumePlans) && outline.volumePlans.length > 0) {
    return outline.volumePlans.map((volume, index) => ({
      id: `vol-${stamp}-${index}`,
      name: volume.title?.trim() || `第${volume.volumeIndex || index + 1}卷`,
      orderIndex: index,
      summary: [
        volume.objective,
        volume.coreConflict,
        volume.climax,
        volume.reversal,
        volume.endingHook,
        volume.protagonistGrowth,
      ]
        .filter(Boolean)
        .join('；'),
    }));
  }

  const count = Math.max(
    1,
    outline.storyScale?.suggestedVolumeCount || outline.volumes || 1,
  );

  return Array.from({ length: count }, (_, index) => ({
    id: `vol-${stamp}-${index}`,
    name: `第${index + 1}卷`,
    orderIndex: index,
  }));
}

/** 启动包落库（含 forbiddenZones） */
export function buildStartupPackFromOutline(
  outline: GeneratedOutline,
): ProjectStartupPack | undefined {
  if (!outline.startupPack30) return undefined;

  return {
    openingHook: outline.startupPack30.openingHook || '',
    promiseToReader: outline.startupPack30.promiseToReader || '',
    protagonistFirstImpression: outline.startupPack30.protagonistFirstImpression || '',
    firstMajorCoolPoint: outline.startupPack30.firstMajorCoolPoint || '',
    firstMajorCoolPointChapter: outline.startupPack30.firstMajorCoolPointChapter ?? null,
    firstConflictCycle: outline.startupPack30.firstConflictCycle || '',
    firstConflictStartChapter: outline.startupPack30.firstConflictStartChapter ?? null,
    chapterBlocks: (outline.startupPack30.chapterBlocks || []).map((b) => ({
      range: b.range,
      objective: b.objective,
      mustEvents: b.mustEvents || [],
      coolPoints: b.coolPoints || [],
      hookRequirement: b.hookRequirement,
      pacing: b.pacing,
      readerExpectation: b.readerExpectation,
      ...(b.forbiddenZones?.length ? { forbiddenZones: b.forbiddenZones } : {}),
    })),
  };
}

/** 故事规模落库（含 targetWordCount / estimatedChapterCount） */
export function buildStoryScaleFromOutline(
  outline: GeneratedOutline,
): ProjectStoryScale | undefined {
  if (!outline.storyScale) return undefined;

  return {
    targetWordCount: outline.storyScale.targetWordCount,
    estimatedChapterCount: outline.storyScale.estimatedChapterCount,
    averageWordsPerChapter: outline.storyScale.averageWordsPerChapter,
    suggestedVolumeCount: outline.storyScale.suggestedVolumeCount,
    estimatedChaptersPerVolume: outline.storyScale.estimatedChaptersPerVolume,
    startupPhaseRatio: outline.storyScale.startupPhaseRatio,
    longformProgressionNote: outline.storyScale.longformProgressionNote,
  };
}

/** 结构化卷纲落库 */
export function buildVolumePlansMetadata(outline: GeneratedOutline) {
  if (!Array.isArray(outline.volumePlans) || outline.volumePlans.length === 0) {
    return undefined;
  }

  return outline.volumePlans.map((volume) => ({
    volumeIndex: volume.volumeIndex,
    ...(volume.chapterRange ? { chapterRange: volume.chapterRange } : {}),
    title: volume.title,
    objective: volume.objective,
    coreConflict: volume.coreConflict,
    climax: volume.climax,
    reversal: volume.reversal,
    endingHook: volume.endingHook,
    protagonistGrowth: volume.protagonistGrowth,
    keyCharacters: volume.keyCharacters || [],
    setupForeshadows: volume.setupForeshadows || [],
    payoffForeshadows: volume.payoffForeshadows || [],
    relationshipShifts: volume.relationshipShifts || [],
  }));
}

/** 角色落库（含结构化人设） */
export function buildCharactersFromOutline(
  outline: GeneratedOutline,
  stamp: number = Date.now(),
): Character[] {
  return (Array.isArray(outline.characters) ? outline.characters : []).map((c, i) => ({
    id: `char-${stamp}-${i}`,
    name: c.name,
    role: c.role,
    description: c.description,
    profile: {
      personality: Array.isArray(c.personality) ? c.personality : [],
      appearance: c.appearance || '',
      background: c.background || c.description || '',
      abilities: Array.isArray(c.abilities) ? c.abilities : [],
      relationships: Array.isArray(c.relationships)
        ? c.relationships.map((r) => ({
            characterId: '',
            targetName: r.targetName || '',
            type: normalizeRelationshipType(r.type),
            description: r.description || '',
          }))
        : [],
      keyNeed: c.keyNeed,
      publicGoal: c.publicGoal,
      hiddenNeed: c.hiddenNeed,
      fearOrWound: c.fearOrWound,
      secret: c.secret,
      turningPoint: c.turningPoint,
      arcStart: c.arcStart,
      arcMid: c.arcMid,
      arcEnd: c.arcEnd,
      revealTiming: c.revealTiming,
    },
    createdAt: new Date(stamp).toISOString(),
    updatedAt: new Date(stamp).toISOString(),
  }));
}

/**
 * 组装百万开书落库所需的 volumes + metadata 关键片段
 * （用于自测「应用」后字段是否齐全）
 */
export function buildLongformPersistPayload(outline: GeneratedOutline) {
  const startupPack = buildStartupPackFromOutline(outline);
  const storyScale = buildStoryScaleFromOutline(outline);
  const volumePlans = buildVolumePlansMetadata(outline);

  return {
    volumes: buildVolumesFromOutline(outline),
    characters: buildCharactersFromOutline(outline),
    targetWordCount: outline.estimatedWordCount,
    metadata: {
      outlinePositioning: {
        genres: [...(outline.genres ?? [])],
        styleKeywords: [...(outline.styleKeywords ?? [])],
        targetReaders: [...(outline.targetReaders ?? [])],
        coreEmotions: [...(outline.coreEmotions ?? [])],
        // 词汇档位：显式输出或关键词推导；定位全空时不落 balanced 空壳（零噪声落库）
        vocabularyTier: resolvePersistedVocabularyTier({
          tier: outline.vocabularyTier,
          styleKeywords: outline.styleKeywords,
          targetReaders: outline.targetReaders,
        }),
      },
      startupPack,
      storyScale,
      volumePlans,
      plannedChapterCount: outline.storyScale?.estimatedChapterCount
        ? Math.max(1, outline.storyScale.estimatedChapterCount)
        : undefined,
      plannedWordCount: outline.estimatedWordCount || undefined,
    },
  };
}
