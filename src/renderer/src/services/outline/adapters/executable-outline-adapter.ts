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
  GeneratedStoryScale,
  GeneratedSubplot,
  GeneratedWorldSetting,
} from '@/types/inspiration';

function parseWordCountRange(rangeText?: string): number | null {
  if (!rangeText) return null;

  const normalized = rangeText.replace(/[,，\s]/g, '');
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)万?[-~至到](\d+(?:\.\d+)?)万?(?:字)?/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return Math.round(((min + max) / 2) * 10000);
    }
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)万(?:字)?/);
  if (singleMatch) {
    const value = Number(singleMatch[1]);
    if (Number.isFinite(value)) {
      return Math.round(value * 10000);
    }
  }

  const plainNumberMatch = normalized.match(/(\d{5,7})/);
  if (plainNumberMatch) {
    const value = Number(plainNumberMatch[1]);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function resolveTargetWordCount(
  outline: ExecutableOutline,
  preferredRange?: string,
): number | null {
  const preferred = parseWordCountRange(preferredRange);
  if (preferred) {
    return preferred;
  }

  const candidates = [
    outline.storyEngine.protagonistGoalLongTerm,
    outline.storyEngine.protagonistGoalShortTerm,
    outline.startupPack30.promiseToReader,
    outline.premise,
    outline.oneLiner,
    ...outline.positioning.targetReaders,
    ...outline.positioning.sellingPoints,
    ...outline.positioning.styleKeywords,
  ];

  for (const candidate of candidates) {
    const parsed = parseWordCountRange(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function toEstimatedWordCount(outline: ExecutableOutline, preferredRange?: string): number {
  const targetWordCount = resolveTargetWordCount(outline, preferredRange);
  if (targetWordCount) {
    return targetWordCount;
  }

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
  if (outline.worldBuilding) {
    const locations = outline.worldBuilding.locations.map((location) => ({
      name: location.name,
      description: [location.functionInStory, location.relatedConflict].filter(Boolean).join('；'),
      level: location.level,
      parentName: location.parentName,
    }));

    const factions = outline.worldBuilding.factions.map((faction) => ({
      name: faction.name,
      description: [faction.positioning, faction.objective, faction.relationToProtagonist].filter(Boolean).join('；'),
      parentName: faction.parentName,
      allies: faction.allies,
      enemies: faction.enemies,
    }));

    const rules = outline.worldBuilding.rules.map((rule) => ({
      name: rule.name,
      description: [rule.content, rule.limitation].filter(Boolean).join('；'),
      category: rule.category,
      relatedRuleNames: rule.relatedRules,
    }));

    if (locations.length > 0 || factions.length > 0 || rules.length > 0) {
      return { locations, factions, rules };
    }
  }

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
  const protagonistName = extractProtagonistName(outline);

  const characters = outline.keyCharacters.map((character) => {
    const relationships = [
      ...(character.tensionWithProtagonist
        ? [{
          targetName: protagonistName,
          type: character.role === 'antagonist' ? 'enemy' : 'ally',
          description: character.tensionWithProtagonist,
        }]
        : []),
      ...character.relationshipChanges.map((relationship) => ({
        targetName: relationship.targetName,
        type: relationship.relationType,
        description: relationship.dynamic,
        stage: relationship.dynamic,
      })),
    ].filter((relationship, index, array) => {
      return relationship.targetName
        && !(relationship.targetName === character.name)
        && array.findIndex((item) => item.targetName === relationship.targetName && item.type === relationship.type) === index;
    });

    return {
      name: character.name,
      role: character.role,
      description: [character.functionInStory, character.publicGoal, character.hiddenNeed].filter(Boolean).join('；'),
      personality: [character.arcStart, character.arcMid, character.arcEnd].filter(Boolean),
      appearance: '',
      abilities: character.resources,
      background: [character.keyNeed, character.fearOrWound, character.secret].filter(Boolean).join('；'),
      relationships,
    };
  });

  const hasProtagonist = characters.some((character) => character.role === 'protagonist');
  if (hasProtagonist) {
    return characters;
  }

  return [{
    name: protagonistName,
    role: 'protagonist',
    description: outline.storyEngine.protagonistStart || outline.oneLiner,
    personality: [],
    appearance: '',
    abilities: [],
    background: [outline.storyEngine.protagonistGoalShortTerm, outline.storyEngine.protagonistGoalLongTerm].filter(Boolean).join('；'),
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
  if (outline.subplots && outline.subplots.length > 0) {
    return outline.subplots.map((subplot) => ({
      title: subplot.title,
      description: [subplot.functionInStory, subplot.relationToMainPlot].filter(Boolean).join('；'),
      relatedCharacters: subplot.relatedCharacters,
      chapterRange: subplot.startChapter && subplot.endChapter
        ? [subplot.startChapter, subplot.endChapter]
        : undefined,
      purpose: subplot.relationToMainPlot || subplot.functionInStory,
    }));
  }

  const approxVolumeSpan = Math.max(Math.round(toEstimatedWordCount(outline) / Math.max(outline.volumePlan.length, 1) / 2000), 1);

  return outline.volumePlan.map((volume, index) => {
    const startChapter = index * approxVolumeSpan + 1;
    const endChapter = startChapter + approxVolumeSpan - 1;
    const foreshadowSummary = [
      ...volume.setupForeshadows.map((item) => `埋设：${item}`),
      ...volume.payoffForeshadows.map((item) => `回收：${item}`),
      ...volume.relationshipShifts.map((item) => `关系变化：${item}`),
    ].join('；');

    return {
      title: volume.title,
      description: [volume.objective, volume.coreConflict, volume.climax, volume.reversal, foreshadowSummary]
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
  if (outline.foreshadowPlan.length > 0) {
    return outline.foreshadowPlan.map((foreshadow) => ({
      hint: foreshadow.hint,
      type: foreshadow.type,
      suggestedChapter: foreshadow.payoffChapter ?? undefined,
      setupChapter: foreshadow.setupChapter ?? undefined,
      payoffChapter: foreshadow.payoffChapter ?? undefined,
      payoffValue: foreshadow.payoffValue,
      carrierCharacter: foreshadow.carrierCharacter || undefined,
      linkedConflict: foreshadow.linkedConflict || undefined,
      importance: foreshadow.importance,
    }));
  }

  return outline.volumePlan
    .filter((volume) => volume.endingHook)
    .map((volume, index) => ({
      hint: volume.endingHook,
      type: 'mystery' as const,
      suggestedChapter: (index + 1) * 30,
      setupChapter: Math.max(1, index * 30 + 10),
      payoffChapter: (index + 1) * 30,
      payoffValue: volume.reversal || volume.protagonistGrowth,
      linkedConflict: volume.coreConflict,
      importance: index === outline.volumePlan.length - 1 ? 'main' as const : 'subplot' as const,
    }));
}

function toEmotionGoal(outline: ExecutableOutline): GeneratedEmotionGoal | undefined {
  if (outline.emotionPlan?.primary) {
    return {
      primary: outline.emotionPlan.primary,
      secondary: outline.emotionPlan.secondary,
      arc: outline.emotionPlan.arc,
      density: outline.emotionPlan.density,
      highPoints: outline.emotionPlan.highPoints,
      lowPoints: outline.emotionPlan.lowPoints,
    };
  }

  if (outline.positioning.coreEmotions.length === 0) {
    return undefined;
  }

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
  if (outline.coolPointPlan && outline.coolPointPlan.length > 0) {
    return {
      patterns: Array.from(new Set(outline.coolPointPlan.map((item) => item.type).filter(Boolean))),
      arranged: outline.coolPointPlan.map((item, index) => ({
        type: item.type || `爽点${index + 1}`,
        description: [item.description, item.relatedBlock].filter(Boolean).join('｜') || item.type || `爽点${index + 1}`,
        suggestedChapter: item.suggestedChapter ?? undefined,
      })),
    };
  }

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
  if (outline.sellingPointPlan && outline.sellingPointPlan.length > 0) {
    return outline.sellingPointPlan.map((point, index) => ({
      name: point.name,
      description: [point.description, point.payoffStage].filter(Boolean).join('；') || point.name,
      priority: Number.isFinite(point.priority) ? point.priority : Math.max(1, 5 - index),
    }));
  }

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

function toStoryScale(outline: ExecutableOutline, preferredRange?: string): GeneratedStoryScale | undefined {
  const estimatedWordCount = toEstimatedWordCount(outline, preferredRange);
  const fallbackChapterCount = Math.max(1, Math.ceil(estimatedWordCount / 2500));
  const volumeCount = outline.storyScale.suggestedVolumeCount || outline.volumePlan.length || Math.max(1, Math.ceil(estimatedWordCount / 180000));
  const chaptersPerVolume = outline.storyScale.estimatedChaptersPerVolume || Math.max(1, Math.round(fallbackChapterCount / volumeCount));

  const targetWordCount = outline.storyScale.targetWordCount || preferredRange || `${Math.round(estimatedWordCount / 10000)}万字`;
  const startupRatio = outline.storyScale.startupPhaseRatio || `${Math.round((30 / fallbackChapterCount) * 100)}%`;

  return {
    targetWordCount,
    estimatedChapterCount: outline.storyScale.estimatedChapterCount || fallbackChapterCount,
    averageWordsPerChapter: outline.storyScale.averageWordsPerChapter || 2500,
    suggestedVolumeCount: volumeCount,
    estimatedChaptersPerVolume: chaptersPerVolume,
    startupPhaseRatio: startupRatio,
    longformProgressionNote: outline.storyScale.longformProgressionNote || '',
  };
}

function toStoryLines(outline: ExecutableOutline): GeneratedStoryLines {
  if (outline.storyLines) {
    return {
      map: outline.storyLines.map,
      faction: outline.storyLines.faction,
      character: outline.storyLines.character,
      goldenfinger: outline.storyLines.goldenfinger,
      worldRules: outline.storyLines.worldRules,
      conflict: outline.storyLines.conflict,
      collection: outline.storyLines.collection,
      romance: outline.storyLines.romance,
    };
  }

  return {
    map: outline.volumePlan.map((volume) => volume.title).join(' → '),
    faction: outline.keyCharacters.filter((character) => character.role === 'antagonist').map((character) => character.name).join(' → '),
    character: outline.keyCharacters.map((character) => {
      const relationTags = character.relationshipChanges.map((item) => `${item.targetName}:${item.relationType}`).join('/');
      return relationTags ? `${character.name}(${character.role}|${relationTags})` : `${character.name}(${character.role})`;
    }).join(' → '),
    goldenfinger: outline.storyEngine.protagonistGoalShortTerm,
    worldRules: outline.positioning.styleKeywords.join(' → '),
    conflict: outline.storyEngine.escalationPath.join(' → '),
    collection: outline.positioning.sellingPoints.join(' → '),
    romance: outline.positioning.coreEmotions.join(' → '),
  };
}

export function mapExecutableOutlineToGeneratedOutline(
  outline: ExecutableOutline,
  options?: { targetWordCountRange?: string },
): GeneratedOutline {
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
      act1: outline.acts?.find((act) => act.name === 'act1')
        ? [
          outline.acts.find((act) => act.name === 'act1')?.objective,
          outline.acts.find((act) => act.name === 'act1')?.keyTurn,
        ].filter(Boolean).join('；')
        : outline.volumePlan[0]?.objective ?? outline.startupPack30.openingHook,
      act2a: outline.acts?.find((act) => act.name === 'act2a')
        ? [
          outline.acts.find((act) => act.name === 'act2a')?.objective,
          outline.acts.find((act) => act.name === 'act2a')?.keyTurn,
        ].filter(Boolean).join('；')
        : outline.volumePlan[0]?.coreConflict ?? '',
      act2b: outline.acts?.find((act) => act.name === 'act2b')
        ? [
          outline.acts.find((act) => act.name === 'act2b')?.objective,
          outline.acts.find((act) => act.name === 'act2b')?.keyTurn,
        ].filter(Boolean).join('；')
        : outline.volumePlan[1]?.coreConflict ?? outline.storyEngine.coreConflict,
      act3: outline.acts?.find((act) => act.name === 'act3')
        ? [
          outline.acts.find((act) => act.name === 'act3')?.objective,
          outline.acts.find((act) => act.name === 'act3')?.endingState,
        ].filter(Boolean).join('；')
        : outline.volumePlan[2]?.climax ?? outline.volumePlan.at(-1)?.climax ?? '',
    },
    subplots: toSubplots(outline),
    chapters: toChapters(outline),
    characters: toCharacters(outline),
    foreshadows: toForeshadows(outline),
    estimatedWordCount: toEstimatedWordCount(outline, options?.targetWordCountRange),
    storyScale: toStoryScale(outline, options?.targetWordCountRange),
    emotionGoal: toEmotionGoal(outline),
    coolPointDesign: toCoolPointDesign(outline),
    coreSellingPoints: toCoreSellingPoints(outline),
    conflictDesign: toConflictDesign(outline),
    storyLines: toStoryLines(outline),
    volumes: outline.volumePlan.length,
  };
}
