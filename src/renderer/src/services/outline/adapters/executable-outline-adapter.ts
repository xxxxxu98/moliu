import type { ExecutableOutline } from '../types/executable-outline';
import type {
  GeneratedCharacter,
  GeneratedChapter,
  GeneratedConflictDesign,
  GeneratedCoolPointDesign,
  GeneratedCoreSellingPoint,
  GeneratedEmotionGoal,
  GeneratedForeshadow,
  GeneratedOutline,
  GeneratedStoryLines,
  GeneratedSubplot,
} from '@/types/inspiration';

function toSynopsis(outline: ExecutableOutline): string {
  const pieces = [
    outline.oneLiner,
    outline.premise,
    outline.storyEngine.coreConflict,
  ].filter(Boolean);

  return pieces.join(' ');
}

function toCharacters(outline: ExecutableOutline): GeneratedCharacter[] {
  return outline.keyCharacters.map((character) => ({
    name: character.name,
    role: character.role,
    description: character.functionInStory,
    personality: [],
    appearance: '',
    abilities: [],
    background: character.keyNeed,
    relationships: character.tensionWithProtagonist
      ? [{
        targetName: '主角',
        type: character.role === 'antagonist' ? 'enemy' : 'ally',
        description: character.tensionWithProtagonist,
      }]
      : [],
  }));
}

function toSubplots(outline: ExecutableOutline): GeneratedSubplot[] {
  return outline.volumePlan.map((volume) => ({
    title: volume.title,
    description: [volume.objective, volume.coreConflict, volume.climax, volume.reversal]
      .filter(Boolean)
      .join('；'),
    relatedCharacters: volume.keyCharacters,
    chapterRange: undefined,
    purpose: volume.endingHook || volume.protagonistGrowth,
  }));
}

function toChapters(outline: ExecutableOutline): GeneratedChapter[] {
  return outline.startupPack30.chapterBlocks.map((block, index) => ({
    title: `${block.range}推进计划`,
    summary: [block.objective, block.readerExpectation].filter(Boolean).join('；'),
    keyEvents: block.mustEvents,
    involvedCharacters: outline.keyCharacters.map((character) => character.name).slice(0, 3),
  }));
}

function toForeshadows(outline: ExecutableOutline): GeneratedForeshadow[] {
  return outline.volumePlan
    .filter((volume) => volume.endingHook)
    .map((volume, index) => ({
      hint: volume.endingHook,
      type: 'mystery',
      suggestedChapter: (index + 1) * 30,
    }));
}

function toEmotionGoal(outline: ExecutableOutline): GeneratedEmotionGoal | undefined {
  if (outline.positioning.coreEmotions.length === 0) {
    return undefined;
  }

  return {
    primary: outline.positioning.coreEmotions[0],
    secondary: outline.positioning.coreEmotions[1],
    arc: 'rising',
    density: 3000,
    highPoints: [5, 15, 30],
    lowPoints: [],
  };
}

function toCoolPointDesign(outline: ExecutableOutline): GeneratedCoolPointDesign | undefined {
  const patterns = Array.from(new Set(outline.startupPack30.chapterBlocks.flatMap((block) => block.coolPoints)));
  if (patterns.length === 0) {
    return undefined;
  }

  return {
    patterns,
    arranged: patterns.slice(0, 5).map((pattern, index) => ({
      type: pattern,
      description: pattern,
      suggestedChapter: (index + 1) * 5,
    })),
  };
}

function toCoreSellingPoints(outline: ExecutableOutline): GeneratedCoreSellingPoint[] {
  return outline.positioning.sellingPoints.map((point, index) => ({
    name: point,
    description: outline.oneLiner || outline.premise,
    priority: Math.max(1, 5 - index),
  }));
}

function toConflictDesign(outline: ExecutableOutline): GeneratedConflictDesign | undefined {
  if (!outline.storyEngine.coreConflict) {
    return undefined;
  }

  return {
    source: outline.storyEngine.coreConflict,
    escalation: outline.storyEngine.escalationPath,
    majorConflicts: outline.volumePlan.map((volume) => volume.coreConflict).filter(Boolean),
  };
}

function toStoryLines(outline: ExecutableOutline): GeneratedStoryLines {
  return {
    map: outline.volumePlan.map((volume) => volume.title).join(' → '),
    faction: outline.keyCharacters.filter((character) => character.role === 'antagonist').map((character) => character.name).join(' → '),
    character: outline.keyCharacters.map((character) => `${character.name}(${character.role})`).join(' → '),
    goldenfinger: outline.storyEngine.protagonistGoalShortTerm,
    worldRules: outline.positioning.styleKeywords.join(' → '),
    conflict: outline.storyEngine.escalationPath.join(' → '),
    collection: outline.positioning.sellingPoints.join(' → '),
    romance: outline.positioning.coreEmotions.join(' → '),
  };
}

export function mapExecutableOutlineToGeneratedOutline(outline: ExecutableOutline): GeneratedOutline {
  return {
    id: `executable-${Date.now()}`,
    title: outline.title,
    synopsis: toSynopsis(outline),
    genres: outline.positioning.styleKeywords,
    structure: {
      act1: outline.volumePlan[0]?.objective ?? outline.startupPack30.openingHook,
      act2a: outline.volumePlan[0]?.coreConflict ?? '',
      act2b: outline.volumePlan[1]?.coreConflict ?? outline.storyEngine.coreConflict,
      act3: outline.volumePlan[2]?.climax ?? outline.volumePlan.at(-1)?.climax ?? '',
    },
    subplots: toSubplots(outline),
    chapters: toChapters(outline),
    characters: toCharacters(outline),
    foreshadows: toForeshadows(outline),
    estimatedWordCount: 500000,
    emotionGoal: toEmotionGoal(outline),
    coolPointDesign: toCoolPointDesign(outline),
    coreSellingPoints: toCoreSellingPoints(outline),
    conflictDesign: toConflictDesign(outline),
    storyLines: toStoryLines(outline),
    volumes: outline.volumePlan.length,
  };
}
