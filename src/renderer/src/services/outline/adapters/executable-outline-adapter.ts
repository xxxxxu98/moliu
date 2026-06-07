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
  GeneratedWorldSetting,
} from '@/types/inspiration';

function toEstimatedWordCount(outline: ExecutableOutline): number {
  const chapterBlockCount = Math.max(outline.startupPack30.chapterBlocks.length, 1);
  const volumeCount = Math.max(outline.volumePlan.length, 1);

  return Math.max(150000, chapterBlockCount * 50000, volumeCount * 180000);
}

function toSynopsis(outline: ExecutableOutline): string {
  const pieces = [
    outline.oneLiner,
    outline.premise,
    outline.storyEngine.coreConflict,
  ].filter(Boolean);

  return pieces.join(' ');
}

function toWorldSetting(outline: ExecutableOutline): GeneratedWorldSetting | undefined {
  const locations = outline.volumePlan.map((volume, index) => ({
    name: volume.title,
    description: [volume.objective, volume.coreConflict, volume.climax].filter(Boolean).join('；'),
    level: index === 0 ? 'world' : 'region',
    parentName: index === 0 ? undefined : outline.volumePlan[index - 1]?.title,
  }));

  const factions = outline.keyCharacters.map((character) => ({
    name: character.name,
    description: [character.functionInStory, character.keyNeed].filter(Boolean).join('；'),
    parentName: character.role === 'support' ? '主角阵营' : undefined,
    allies: character.role === 'antagonist' ? [] : ['主角阵营'],
    enemies: character.role === 'antagonist' ? ['主角阵营'] : [],
  }));

  const rules = [
    {
      name: '核心驱动',
      description: outline.storyEngine.coreConflict,
      category: 'custom',
      relatedRuleNames: ['成长目标'],
    },
    {
      name: '成长目标',
      description: outline.storyEngine.protagonistGoalLongTerm || outline.storyEngine.protagonistGoalShortTerm,
      category: 'custom',
      relatedRuleNames: ['核心驱动'],
    },
    ...outline.positioning.styleKeywords.map((keyword) => ({
      name: keyword,
      description: `${keyword}风格下的故事规则与读者预期`,
      category: 'custom',
      relatedRuleNames: ['核心驱动'],
    })),
  ].filter((rule) => rule.description);

  if (locations.length === 0 && factions.length === 0 && rules.length === 0) {
    return undefined;
  }

  return {
    locations,
    factions,
    rules,
  };
}

function toCharacters(outline: ExecutableOutline): GeneratedCharacter[] {
  const characters = outline.keyCharacters.map((character) => ({
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

  const hasProtagonist = characters.some((character) => character.role === 'protagonist');
  if (hasProtagonist) {
    return characters;
  }

  // 没有明确的主角时，尝试从各字段提取真实名字
  const extractedName = extractProtagonistName(outline);

  return [{
    name: extractedName,
    role: 'protagonist',
    description: outline.storyEngine.protagonistStart || outline.oneLiner,
    personality: [],
    appearance: '',
    abilities: [],
    background: outline.storyEngine.protagonistGoalShortTerm,
    relationships: [],
  }, ...characters];
}

function extractProtagonistName(outline: ExecutableOutline): string {
  if (outline.storyEngine.protagonistName?.trim()) {
    return outline.storyEngine.protagonistName.trim();
  }

  // 1. 尝试从 startupPack30 的开篇钩子里提取名字（最常见格式：主角名叫xxx）
  const openingHook = outline.startupPack30.openingHook;
  const openingPatterns = [
    /主角(?:名叫|叫|是|为)?([\u4e00-\u9fa5]{2,4})/,
    /(?:少年|少女|青年|女孩|男孩)?([\u4e00-\u9fa5]{2,4})(?:原本是|出身于|生于|本是|是)/,
    /^"?([\u4e00-\u9fa5]{2,4})"?[是为叫称当]/,
  ];
  for (const pattern of openingPatterns) {
    const match = openingHook?.match(pattern);
    if (match?.[1] && match[1].length >= 2) {
      return match[1];
    }
  }

  // 2. 尝试从主角初始状态里提取
  const protagonistStart = outline.storyEngine.protagonistStart;
  const startPatterns = [
    /主角(?:名叫|叫|是|为)?([\u4e00-\u9fa5]{2,4})/,
    /(?:少年|少女|青年|女孩|男孩)?([\u4e00-\u9fa5]{2,4})(?:原本是|出身于|生于|本是|是)/,
    /^"?([\u4e00-\u9fa5]{2,4})"?[是为叫]/,
  ];
  for (const pattern of startPatterns) {
    const match = protagonistStart?.match(pattern);
    if (match?.[1] && match[1].length >= 2) {
      return match[1];
    }
  }

  // 3. 尝试从角色列表中找已标记为主角的角色
  const protagonistCharacter = outline.keyCharacters.find((character) => character.role === 'protagonist');
  if (protagonistCharacter?.name && protagonistCharacter.name !== '未命名角色') {
    return protagonistCharacter.name;
  }

  // 4. 尝试从角色列表第一个人的名字
  const firstChar = outline.keyCharacters[0];
  if (firstChar?.name && firstChar.name.length >= 2 && firstChar.name.length <= 6) {
    return firstChar.name;
  }

  // 兜底：默认叫"主角"
  return '主角';
}

function toSubplots(outline: ExecutableOutline): GeneratedSubplot[] {
  const approxVolumeSpan = Math.max(Math.round(toEstimatedWordCount(outline) / Math.max(outline.volumePlan.length, 1) / 2000), 1);

  return outline.volumePlan.map((volume, index) => {
    const startChapter = index * approxVolumeSpan + 1;
    const endChapter = startChapter + approxVolumeSpan - 1;

    return {
      title: volume.title,
      description: [volume.objective, volume.coreConflict, volume.climax, volume.reversal]
        .filter(Boolean)
        .join('；'),
      relatedCharacters: volume.keyCharacters,
      chapterRange: [startChapter, endChapter],
      purpose: volume.endingHook || volume.protagonistGrowth,
    };
  });
}

function toChapters(outline: ExecutableOutline): GeneratedChapter[] {
  if (outline.chapterBlueprints?.length) {
    return outline.chapterBlueprints.map((chapter) => ({
      title: chapter.title,
      number: chapter.orderIndex,
      summary: chapter.summary,
      keyEvents: chapter.mustCover,
      involvedCharacters: chapter.involvedCharacters ?? [],
      coreEvent: chapter.CEN,
      coolPoints: chapter.coolPointType ? [chapter.coolPointType] : [],
      hook: chapter.hookType,
    }));
  }

  return outline.startupPack30.chapterBlocks.map((block, index) => ({
    title: `${block.range}推进计划`,
    number: index + 1,
    summary: [block.objective, block.readerExpectation].filter(Boolean).join('；'),
    keyEvents: block.mustEvents,
    involvedCharacters: outline.keyCharacters.map((character) => character.name).slice(0, 3),
    coolPoints: block.coolPoints,
    hook: block.hookRequirement,
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

  // 从冲突升级链推导弧线类型：上升链 → rising，下降链 → falling，波浪 → wave
  const escalationPath = outline.storyEngine.escalationPath || [];
  let arc: GeneratedEmotionGoal['arc'] = 'rising';
  if (escalationPath.length >= 2) {
    const first = escalationPath[0];
    const last = escalationPath[escalationPath.length - 1];
    if (first.includes('低谷') || first.includes('困境') || first.includes('灭') || first.includes('败')) {
      arc = 'rising';
    } else if (last.includes('低谷') || last.includes('困境') || last.includes('灭') || last.includes('败')) {
      arc = 'falling';
    } else if (
      escalationPath.some(e => e.includes('起伏')) ||
      escalationPath.some(e => e.includes('波动')) ||
      (escalationPath.filter(e => e.includes('高潮')).length >= 2)
    ) {
      arc = 'wave';
    } else {
      arc = 'mixed';
    }
  }

  return {
    primary: outline.positioning.coreEmotions[0],
    secondary: outline.positioning.coreEmotions[1],
    arc,
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
    genres: Array.from(new Set([
      ...outline.positioning.styleKeywords,
      ...outline.positioning.targetReaders,
      ...outline.positioning.coreEmotions,
    ].filter(Boolean))),
    worldSetting: toWorldSetting(outline),
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
    estimatedWordCount: toEstimatedWordCount(outline),
    emotionGoal: toEmotionGoal(outline),
    coolPointDesign: toCoolPointDesign(outline),
    coreSellingPoints: toCoreSellingPoints(outline),
    conflictDesign: toConflictDesign(outline),
    storyLines: toStoryLines(outline),
    volumes: outline.volumePlan.length,
  };
}
