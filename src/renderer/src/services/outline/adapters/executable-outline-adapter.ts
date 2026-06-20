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

/**
 * 解析章节区间为起止章号
 * 支持 "1-5"、"1~5"、"1至5" 等；失败时回退到序号推导
 */
function parseChapterRange(range: string, fallbackStart: number): { start: number; count: number } {
  const normalized = range.replace(/[,，\s]/g, '');
  const match = normalized.match(/(\d+)[\-~至到](\d+)/);
  if (match) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return { start, count: end - start + 1 };
    }
  }
  // 单章号（如 "第3章"）
  const single = normalized.match(/(\d+)/);
  if (single) {
    return { start: Number(single[1]), count: 1 };
  }
  return { start: fallbackStart, count: 5 };
}

/**
 * 从钩子描述里推断 hookType
 */
const HOOK_TYPE_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: 'sudden_reveal', keywords: ['揭示', '揭晓', '真相', '曝光', '揭示'] },
  { type: 'urgent_crisis', keywords: ['危机', '危险', '紧迫', '逼近', '威胁', '倒计时'] },
  { type: 'unfinished_action', keywords: ['未完', '中断', '被打断', '未结束', '戛然'] },
  { type: 'identity_reveal', keywords: ['身份', '原来', '其实', '不是', '真正'] },
  { type: 'tough_choice', keywords: ['抉择', '两难', '选择', '取舍'] },
  { type: 'mysterious_item', keywords: ['神秘', '物件', '出现', '物品'] },
  { type: 'countdown', keywords: ['倒计时', '时间不多', '限时'] },
  { type: 'promise_threat', keywords: ['承诺', '威胁', '宣告', '放话'] },
  { type: 'strange_disappear', keywords: ['消失', '失踪', '不见'] },
  { type: 'hidden_meaning', keywords: ['暗藏', '隐含', '另有深意', '意味深长'] },
  { type: 'echo', keywords: ['呼应', '回响', '首尾'] },
  { type: 'blank', keywords: ['悬念', '留白', '疑问', '谜', '留待'] },
  { type: 'imagery', keywords: ['意象', '画面', '光影'] },
];

function inferHookType(hook?: string): string | undefined {
  if (!hook) return undefined;
  for (const { type, keywords } of HOOK_TYPE_KEYWORDS) {
    if (keywords.some((kw) => hook.includes(kw))) return type;
  }
  return undefined;
}

/**
 * 推断章节类型
 */
function inferChapterType(
  chapterNo: number,
  totalChapters: number,
  isLastBlock: boolean,
  coolPoints: string[],
): string {
  // 整体最后 1 章倾向收束
  if (isLastBlock && chapterNo === totalChapters) {
    const coolText = coolPoints.join('');
    if (coolText.includes('结局') || coolText.includes('收尾') || coolText.includes('落幕')) {
      return 'ending';
    }
  }
  // 高潮类
  const coolText = coolPoints.join('');
  if (coolText.includes('高潮') || coolText.includes('决战') || coolText.includes('巅峰')) {
    return 'climax';
  }
  // 第 1 章
  if (chapterNo === 1) return 'world_intro';
  // 第 2 章
  if (chapterNo === 2) return 'character_intro';
  // 第 3 章
  if (chapterNo === 3) return 'plot_setup';
  // 区间末章
  if (chapterNo === totalChapters && (coolText.includes('解决') || coolText.includes('收'))) {
    return 'resolution';
  }
  return 'normal';
}

/**
 * 把 startupPack30 的"5 章一组"区间块拆成单章 GeneratedChapter
 *
 * 由于 AI 当前不生成 chapterBlueprints（受 prompt 约束），单章结构化节点（CBN/CPNs/CEN 等）
 * 由这里的拆分算法保守派生，让续写端的字段消费不至于全部失效。
 */
function splitStartupBlocksToChapters(outline: ExecutableOutline): GeneratedChapter[] {
  const blocks = outline.startupPack30.chapterBlocks;
  const involvedCharacters = outline.keyCharacters.map((character) => character.name).slice(0, 3);
  const chapters: GeneratedChapter[] = [];

  let globalChapterNo = 0;

  blocks.forEach((block, blockIndex) => {
    const isLastBlock = blockIndex === blocks.length - 1;
    const { start, count } = parseChapterRange(block.range, globalChapterNo + 1);
    const blockSize = Math.max(1, count);

    // 在区间内均分 mustEvents（每章 1-2 个，按顺序循环）
    const mustEvents = block.mustEvents.length > 0 ? block.mustEvents : ['推进本区间主线'];
    const coolPoints = block.coolPoints;
    const pacingStrategy = block.pacing === 'fast' ? 'release' : 'confront';

    for (let i = 0; i < blockSize; i++) {
      globalChapterNo += 1;
      const chapterNo = start + i;

      // 均分关键事件
      const eventStart = Math.floor((i * mustEvents.length) / blockSize);
      const eventEnd = Math.floor(((i + 1) * mustEvents.length) / blockSize);
      const keyEvents = mustEvents.slice(eventStart, Math.max(eventEnd, eventStart + 1));

      // CBN：首章用开篇钩子；否则用前章 CEN 的简化版（区间内承接）
      const isFirstChapterOverall = globalChapterNo === 1;
      const isBlockFirstChapter = i === 0;
      const CBN = isFirstChapterOverall
        ? outline.startupPack30.openingHook || block.objective
        : isBlockFirstChapter
          ? `承接前段：${block.objective}`
          : `承接上章，继续推进${block.objective ? `：${block.objective}` : ''}`;

      // CEN：用本区间必留钩子
      const CEN = block.hookRequirement || `完成本区间第 ${i + 1}/${blockSize} 段推进`;

      // CPNs：派生 1-3 个推进节点
      const CPNs = keyEvents.length > 0
        ? keyEvents.slice(0, 3)
        : [`推进 ${block.objective || '主线'}`];

      // mustCover：本章承接的关键事件
      const mustCover = keyEvents.length > 0 ? keyEvents : undefined;

      // chapterType
      const chapterType = inferChapterType(chapterNo, blockSize, isLastBlock, coolPoints);

      // hookType
      const hookType = inferHookType(block.hookRequirement);

      // isClimax
      const isClimax = chapterType === 'climax' || chapterType === 'ending';

      // expectedCoolPoints
      const expectedCoolPoints = Math.max(1, Math.round((coolPoints.length || 1) / blockSize));

      const title = `第${chapterNo}章`;
      const summary = [block.objective, block.readerExpectation ? `读者期待：${block.readerExpectation}` : '']
        .filter(Boolean).join('；');
      const description = summary || block.objective;

      chapters.push({
        number: chapterNo,
        title,
        summary: description,
        status: 'outline',
        keyEvents,
        involvedCharacters,
        coreEvent: CEN,
        coolPoints: coolPoints.slice(0, 2),
        hook: block.hookRequirement,
        // 结构化节点
        CBN,
        CPNs,
        CEN,
        mustCover,
        // 写作策略
        chapterType,
        hookType,
        pacingStrategy,
        isClimax,
        expectedCoolPoints,
      });
    }
  });

  return chapters;
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
      // 结构化节点
      CBN: chapter.CBN,
      CPNs: chapter.CPNs,
      CEN: chapter.CEN,
      mustCover: chapter.mustCover,
      forbiddenZones: chapter.forbiddenZones,
      chapterType: undefined,
      hookType: chapter.hookType,
    }));
  }

  // 当前 AI 不生成 chapterBlueprints，走拆分 startupPack30 的路径
  return splitStartupBlocksToChapters(outline);
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
    // 透传前 30 章启动包，供 useProjectCreator 落库到 metadata
    startupPack30: outline.startupPack30,
    emotionGoal: toEmotionGoal(outline),
    coolPointDesign: toCoolPointDesign(outline),
    coreSellingPoints: toCoreSellingPoints(outline),
    conflictDesign: toConflictDesign(outline),
    storyLines: toStoryLines(outline),
    volumes: outline.volumePlan.length,
  };
}
