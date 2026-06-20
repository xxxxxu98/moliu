import type {
  CharacterPlan,
  CharacterRelationshipPlan,
  CoolPointBeatPlan,
  EmotionBeatPlan,
  ExecutableOutline,
  ForeshadowPlan,
  SellingPointPlan,
  StartupChapterBlock,
  StoryActPlan,
  StoryLinePlan,
  StoryScalePlan,
  SubplotPlan,
  VolumePlan,
  WorldFactionPlan,
  WorldLocationPlan,
  WorldRulePlan,
} from '../types/executable-outline';
import {
  extractFieldValue,
  extractMultiValueField,
  normalizeGeneratedText,
  splitByHeading,
  splitNamedSections,
} from './utils';

const ACT_HEADING_TO_NAME: Record<string, StoryActPlan['name']> = {
  '第一幕（建置）': 'act1',
  '第二幕A（对抗）': 'act2a',
  '第二幕B（至暗）': 'act2b',
  '第三幕（结局）': 'act3',
};

const LOCATION_LEVELS: WorldLocationPlan['level'][] = ['world', 'continent', 'country', 'city', 'district', 'special'];
const RULE_CATEGORIES: WorldRulePlan['category'][] = ['cultivation', 'magic', 'social', 'physics', 'custom'];
const EMOTION_ARCS: EmotionBeatPlan['arc'][] = ['rising', 'falling', 'wave', 'mixed'];

interface HeadingBlock {
  heading: string;
  body: string;
}

function parseVolumeBlock(block: string, index: number): VolumePlan | null {
  const volume = {
    volumeIndex: index + 1,
    title: extractFieldValue(block, '卷标题') ?? `第${index + 1}卷`,
    objective: extractFieldValue(block, '卷目标') ?? '',
    coreConflict: extractFieldValue(block, '卷冲突') ?? '',
    climax: extractFieldValue(block, '卷高潮') ?? '',
    reversal: extractFieldValue(block, '卷反转') ?? '',
    endingHook: extractFieldValue(block, '卷尾钩子') ?? '',
    protagonistGrowth: extractFieldValue(block, '主角成长') ?? '',
    keyCharacters: extractMultiValueField(block, '关键角色'),
    setupForeshadows: extractMultiValueField(block, '埋设伏笔'),
    payoffForeshadows: extractMultiValueField(block, '回收伏笔'),
    relationshipShifts: extractMultiValueField(block, '关系变化'),
  } satisfies VolumePlan;

  const meaningfulFieldCount = [volume.title, volume.objective, volume.coreConflict].filter(Boolean).length;
  return meaningfulFieldCount >= 2 ? volume : null;
}

function parseStartupBlock(block: string, range: string): StartupChapterBlock {
  const pacingRaw = extractFieldValue(block, '节奏要求') ?? '中快';

  return {
    range,
    objective: extractFieldValue(block, '目标') ?? '',
    mustEvents: extractMultiValueField(block, '必出事件'),
    coolPoints: extractMultiValueField(block, '必出爽点'),
    hookRequirement: extractFieldValue(block, '必留钩子') ?? '',
    pacing: pacingRaw.includes('快') && !pacingRaw.includes('中') ? 'fast' : 'medium',
    readerExpectation: extractFieldValue(block, '读者期待') ?? '',
    forbiddenZones: extractMultiValueField(block, '本块禁区'),
  };
}

function parseStoryScalePlan(section: string): StoryScalePlan {
  const estimatedChapterCount = Number(extractFieldValue(section, '预计总章节数')?.match(/\d+/)?.[0] ?? '0');
  const averageWordsPerChapter = Number(extractFieldValue(section, '章节平均字数')?.match(/\d+/)?.[0] ?? '2500');
  const suggestedVolumeCount = Number(extractFieldValue(section, '建议卷数')?.match(/\d+/)?.[0] ?? '3');
  const estimatedChaptersPerVolume = Number(extractFieldValue(section, '每卷预计章节数')?.match(/\d+/)?.[0] ?? '0');

  return {
    targetWordCount: extractFieldValue(section, '目标字数') ?? '',
    estimatedChapterCount,
    averageWordsPerChapter,
    suggestedVolumeCount,
    estimatedChaptersPerVolume,
    startupPhaseRatio: extractFieldValue(section, '前30章占比') ?? '',
    longformProgressionNote: extractFieldValue(section, '长线推进说明') ?? '',
  };
}

function mapRole(value: string): CharacterPlan['role'] {
  if (value.includes('主角')) return 'protagonist';
  if (value.includes('盟友')) return 'ally';
  if (value.includes('反派') || value.includes('宿敌')) return 'antagonist';
  if (value.includes('导师') || value.includes('师父')) return 'mentor';
  return 'support';
}

function mapRelationshipType(value: string): CharacterRelationshipPlan['relationType'] {
  if (value.includes('盟友') || value.includes('伙伴') || value.includes('朋友')) return 'ally';
  if (value.includes('敌') || value.includes('对立') || value.includes('仇')) return 'enemy';
  if (value.includes('导师') || value.includes('师徒')) return 'mentor';
  if (value.includes('家人') || value.includes('亲属') || value.includes('血亲')) return 'family';
  if (value.includes('爱') || value.includes('暧昧') || value.includes('情感')) return 'lover';
  if (value.includes('竞争') || value.includes(' rival') || value.includes('对手')) return 'rival';
  if (value.includes('利用') || value.includes('操控')) return 'use';
  return 'unknown';
}

function parseRelationshipChanges(rawValues: string[]): CharacterRelationshipPlan[] {
  return rawValues.map((item) => {
    const [targetNamePart, detailPart = ''] = item.split(/[：:]/, 2);
    const targetName = targetNamePart.trim() || '未命名关系';
    const dynamic = detailPart.trim() || item.trim();
    return {
      targetName,
      relationType: mapRelationshipType(dynamic || targetName),
      dynamic,
    };
  });
}

function parseForeshadowType(value: string): ForeshadowPlan['type'] {
  if (value.includes('身份')) return 'identity';
  if (value.includes('关系')) return 'relationship';
  if (value.includes('规则') || value.includes('世界')) return 'world-rule';
  if (value.includes('能力') || value.includes('血脉') || value.includes('金手指')) return 'ability';
  if (value.includes('角色')) return 'character';
  if (value.includes('事件')) return 'event';
  if (value.includes('物') || value.includes('道具')) return 'item';
  if (value.includes('对话') || value.includes('台词')) return 'dialogue';
  return 'mystery';
}

function parseForeshadowImportance(value: string): ForeshadowPlan['importance'] {
  if (value.includes('情感')) return 'emotion';
  if (value.includes('支线')) return 'subplot';
  return 'main';
}

function parseChapterNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseForeshadowBlock(block: string, index: number): ForeshadowPlan {
  return {
    id: `foreshadow-${index + 1}`,
    hint: extractFieldValue(block, '伏笔内容') ?? `伏笔${index + 1}`,
    type: parseForeshadowType(extractFieldValue(block, '伏笔类型') ?? ''),
    importance: parseForeshadowImportance(extractFieldValue(block, '重要级别') ?? ''),
    setupPhase: extractFieldValue(block, '埋设阶段') ?? '',
    payoffPhase: extractFieldValue(block, '回收阶段') ?? '',
    setupChapter: parseChapterNumber(extractFieldValue(block, '埋设章节')),
    payoffChapter: parseChapterNumber(extractFieldValue(block, '回收章节')),
    carrierCharacter: extractFieldValue(block, '载体角色') ?? '',
    linkedConflict: extractFieldValue(block, '关联冲突') ?? '',
    payoffValue: extractFieldValue(block, '回收收益') ?? '',
  };
}

function parseActsSection(section: string): StoryActPlan[] {
  const blocks = splitByHeading(section, /^###\s+.+$/gm);

  return blocks
    .map((block) => {
      const label = block.heading.replace(/^###\s*/, '').trim();
      const name = ACT_HEADING_TO_NAME[label];
      if (!name) return null;

      const act = {
        name,
        label,
        objective: extractFieldValue(block.body, '幕目标') ?? '',
        keyTurn: extractFieldValue(block.body, '关键转折') ?? '',
        endingState: extractFieldValue(block.body, '幕结束状态') ?? '',
      } satisfies StoryActPlan;

      return act.objective || act.keyTurn || act.endingState ? act : null;
    })
    .filter((item): item is StoryActPlan => item !== null);
}

function normalizeLocationLevel(value: string): WorldLocationPlan['level'] {
  const normalized = value.trim().toLowerCase();
  return LOCATION_LEVELS.find((level) => level === normalized) ?? 'special';
}

function normalizeRuleCategory(value: string): WorldRulePlan['category'] {
  const normalized = value.trim().toLowerCase();
  return RULE_CATEGORIES.find((category) => category === normalized) ?? 'custom';
}

function parseWorldBuildingSection(section: string): ExecutableOutline['worldBuilding'] | undefined {
  if (!section.trim()) return undefined;

  const segments = splitNamedSections(section, ['核心地点', '关键势力', '世界规则']);

  const locationBlocks = splitByHeading(segments['核心地点'], /^####\s+.+$/gm);
  const locations = locationBlocks
    .map((block) => ({
      name: extractFieldValue(block.body, '名称') ?? block.heading.replace(/^####\s*/, '').trim(),
      level: normalizeLocationLevel(extractFieldValue(block.body, '层级') ?? ''),
      functionInStory: extractFieldValue(block.body, '剧情功能') ?? '',
      parentName: extractFieldValue(block.body, '上级地点') ?? undefined,
      relatedConflict: extractFieldValue(block.body, '关联冲突') ?? undefined,
    }))
    .filter((item) => item.name && item.functionInStory);

  const factionBlocks = splitByHeading(segments['关键势力'], /^####\s+.+$/gm);
  const factions = factionBlocks
    .map((block) => ({
      name: extractFieldValue(block.body, '名称') ?? block.heading.replace(/^####\s*/, '').trim(),
      positioning: extractFieldValue(block.body, '势力定位') ?? '',
      objective: extractFieldValue(block.body, '核心目标') ?? '',
      allies: extractMultiValueField(block.body, '盟友'),
      enemies: extractMultiValueField(block.body, '敌对'),
      relationToProtagonist: extractFieldValue(block.body, '与主角关系') ?? '',
      parentName: extractFieldValue(block.body, '上级势力') ?? undefined,
    }))
    .filter((item) => item.name && (item.positioning || item.objective || item.relationToProtagonist));

  const ruleBlocks = splitByHeading(segments['世界规则'], /^####\s+.+$/gm);
  const rules = ruleBlocks
    .map((block) => ({
      name: extractFieldValue(block.body, '名称') ?? block.heading.replace(/^####\s*/, '').trim(),
      category: normalizeRuleCategory(extractFieldValue(block.body, '类别') ?? ''),
      content: extractFieldValue(block.body, '规则内容') ?? '',
      limitation: extractFieldValue(block.body, '限制/代价') ?? undefined,
      relatedRules: extractMultiValueField(block.body, '关联规则'),
    }))
    .filter((item) => item.name && item.content);

  if (locations.length === 0 && factions.length === 0 && rules.length === 0) {
    return undefined;
  }

  return { locations, factions, rules };
}

function parseSubplotsSection(section: string): SubplotPlan[] {
  const blocks = splitByHeading(section, /^###\s+支线\d+/gm);
  return blocks.map((block) => ({
    title: extractFieldValue(block.body, '标题') ?? block.heading.replace(/^###\s*/, '').trim(),
    functionInStory: extractFieldValue(block.body, '功能') ?? '',
    relatedCharacters: extractMultiValueField(block.body, '关联角色'),
    startChapter: parseChapterNumber(extractFieldValue(block.body, '起始章节')),
    endChapter: parseChapterNumber(extractFieldValue(block.body, '收束章节')),
    relationToMainPlot: extractFieldValue(block.body, '与主线关系') ?? '',
  })).filter((item) => item.title && (item.functionInStory || item.relationToMainPlot));
}

function parseStoryLinesSection(section: string): StoryLinePlan | undefined {
  if (!section.trim()) return undefined;

  const storyLines = {
    map: extractFieldValue(section, '地图线') ?? '',
    faction: extractFieldValue(section, '阵营线') ?? '',
    character: extractFieldValue(section, '人物线') ?? '',
    goldenfinger: extractFieldValue(section, '金手指线') ?? '',
    worldRules: extractFieldValue(section, '世界规则线') ?? '',
    conflict: extractFieldValue(section, '矛盾线') ?? '',
    collection: extractFieldValue(section, '收集线') ?? '',
    romance: extractFieldValue(section, '感情线') ?? '',
  } satisfies StoryLinePlan;

  return Object.values(storyLines).some(Boolean) ? storyLines : undefined;
}

function parseEmotionArc(value: string): EmotionBeatPlan['arc'] {
  const normalized = value.trim().toLowerCase();
  return EMOTION_ARCS.find((arc) => arc === normalized) ?? 'mixed';
}

function parseNumberList(value: string | null): number[] {
  if (!value) return [];
  return Array.from(new Set((value.match(/\d+/g) ?? []).map(Number))).filter((num) => Number.isFinite(num));
}

function parseEmotionAndCoolPointSection(section: string): Pick<ExecutableOutline, 'emotionPlan' | 'coolPointPlan'> {
  const emotionPlan = section.trim() ? {
    primary: extractFieldValue(section, '核心情绪') ?? '',
    secondary: extractFieldValue(section, '次级情绪') ?? undefined,
    arc: parseEmotionArc(extractFieldValue(section, '情绪弧线') ?? ''),
    highPoints: parseNumberList(extractFieldValue(section, '情绪高点章节')),
    lowPoints: parseNumberList(extractFieldValue(section, '情绪低点章节')),
    density: parseChapterNumber(extractFieldValue(section, '情绪密度建议')) ?? undefined,
  } satisfies EmotionBeatPlan : undefined;

  const coolPointSection = splitNamedSections(section, ['爽点安排'])['爽点安排'] || section;
  const coolPointBlocks = splitByHeading(coolPointSection, /^####\s+爽点\d+/gm);
  const coolPointPlan = coolPointBlocks.map((block) => ({
    type: extractFieldValue(block.body, '类型') ?? '',
    description: extractFieldValue(block.body, '描述') ?? '',
    suggestedChapter: parseChapterNumber(extractFieldValue(block.body, '建议章节')),
    relatedBlock: extractFieldValue(block.body, '所属区间') ?? undefined,
  })).filter((item) => item.type || item.description) as CoolPointBeatPlan[];

  return {
    emotionPlan: emotionPlan && emotionPlan.primary ? emotionPlan : undefined,
    coolPointPlan: coolPointPlan.length > 0 ? coolPointPlan : undefined,
  };
}

function parseSellingPointSection(section: string): SellingPointPlan[] {
  const blocks = splitByHeading(section, /^###\s+卖点\d+/gm);
  return blocks.map((block, index) => ({
    name: extractFieldValue(block.body, '名称') ?? `卖点${index + 1}`,
    description: extractFieldValue(block.body, '描述') ?? '',
    category: (() => {
      const raw = extractFieldValue(block.body, '分类') ?? '';
      if (raw.includes('设定')) return 'setting';
      if (raw.includes('角色')) return 'character';
      if (raw.includes('冲突')) return 'conflict';
      if (raw.includes('情绪')) return 'emotion';
      if (raw.includes('钩子')) return 'hook';
      return 'coolpoint';
    })(),
    priority: Number(extractFieldValue(block.body, '优先级')?.match(/\d+/)?.[0] ?? Math.max(1, 5 - index)),
    payoffStage: extractFieldValue(block.body, '主要兑现阶段') ?? undefined,
  })).filter((item) => item.name && item.description);
}

function splitLevel4Blocks(section: string): HeadingBlock[] {
  return splitByHeading(section, /^####\s+.+$/gm);
}

function parseTieredCharacterBlocks(section: string): HeadingBlock[] {
  const level4Blocks = splitLevel4Blocks(section).filter((block) => /姓名\s*：/.test(block.body));
  if (level4Blocks.length > 0) {
    return level4Blocks;
  }

  return splitByHeading(section, /^###\s*角色\s*\d+/gm);
}

function parseTieredForeshadowBlocks(section: string): HeadingBlock[] {
  const level4Blocks = splitLevel4Blocks(section).filter((block) => /伏笔内容\s*：/.test(block.body));
  if (level4Blocks.length > 0) {
    return level4Blocks;
  }

  return splitByHeading(section, /^###\s*伏笔\s*\d+/gm);
}

function parseCharacterSection(section: string, protagonistName?: string): CharacterPlan[] {
  const characterBlocks = parseTieredCharacterBlocks(section);
  if (characterBlocks.length > 0) {
    return characterBlocks.map((block) => parseCharacterBlock(block.body, protagonistName));
  }

  const name = extractFieldValue(section, '姓名');
  return name ? [parseCharacterBlock(section, protagonistName)] : [];
}

function parseForeshadowSection(section: string): ForeshadowPlan[] {
  const foreshadowBlocks = parseTieredForeshadowBlocks(section);
  if (foreshadowBlocks.length > 0) {
    return foreshadowBlocks.map((block, index) => parseForeshadowBlock(block.body, index));
  }

  return [];
}

function parseCharacterBlock(block: string, protagonistName?: string): CharacterPlan {
  const roleRaw = extractFieldValue(block, '角色定位') ?? '配角';
  const name = extractFieldValue(block, '姓名') ?? '未命名角色';
  const normalizedRole = protagonistName && name === protagonistName
    ? 'protagonist'
    : mapRole(roleRaw);

  return {
    name,
    role: normalizedRole,
    functionInStory: extractFieldValue(block, '剧情功能') ?? '',
    keyNeed: extractFieldValue(block, '核心需求') ?? '',
    tensionWithProtagonist: extractFieldValue(block, '与主角张力') ?? '',
    revealTiming: extractFieldValue(block, '最佳登场时机') ?? '',
    publicGoal: extractFieldValue(block, '外显目标') ?? '',
    hiddenNeed: extractFieldValue(block, '隐性需求') ?? '',
    fearOrWound: extractFieldValue(block, '核心创伤') ?? '',
    secret: extractFieldValue(block, '角色秘密') ?? '',
    turningPoint: extractFieldValue(block, '角色转折点') ?? '',
    // 角色弧线支持两种写法：合并的单行 "起→中→终"（推荐，节省输出长度），
    // 或旧的三段式（角色弧线起点/中段/终点）。
    ...parseArcFields(block),
    resources: extractMultiValueField(block, '角色资源'),
    relationshipChanges: parseRelationshipChanges(extractMultiValueField(block, '关系变化')),
  };
}

/**
 * 角色弧线解析：优先读合并的"角色弧线"字段（按 → / -> / ; 分三段），
 * 回退到旧的三段式字段，保持向后兼容。
 */
function parseArcFields(block: string): Pick<CharacterPlan, 'arcStart' | 'arcMid' | 'arcEnd'> {
  const merged = extractFieldValue(block, '角色弧线');
  if (merged) {
    const parts = merged.split(/→|->|；|;|，/).map((s) => s.trim()).filter(Boolean);
    return {
      arcStart: parts[0] ?? '',
      arcMid: parts[1] ?? '',
      arcEnd: parts[2] ?? '',
    };
  }
  return {
    arcStart: extractFieldValue(block, '角色弧线起点') ?? '',
    arcMid: extractFieldValue(block, '角色弧线中段') ?? '',
    arcEnd: extractFieldValue(block, '角色弧线终点') ?? '',
  };
}


function isValidExecutableOutline(outline: ExecutableOutline): boolean {
  return Boolean(outline.title || outline.oneLiner)
    && outline.volumePlan.length >= 1
    && outline.startupPack30.chapterBlocks.length >= 1;
}

export function parseExpandedOutline(raw: string): ExecutableOutline | null {
  const text = normalizeGeneratedText(raw);
  const sections = splitNamedSections(text, [
    '故事定位',
    '卖点承载规划',
    '故事规模规划',
    '核心驱动',
    '四幕结构',
    '卷纲',
    '世界与势力规划',
    '前30章启动包',
    '主要支线',
    '故事线规划',
    '情绪与爽点节奏',
    '关键角色规划',
    '关键角色',
    '伏笔规划',
  ]);

  const positioningSection = sections['故事定位'];
  const sellingPointSection = sections['卖点承载规划'];
  const scaleSection = sections['故事规模规划'];
  const storyEngineSection = sections['核心驱动'];
  const actsSection = sections['四幕结构'];
  const volumeSection = sections['卷纲'];
  const worldBuildingSection = sections['世界与势力规划'];
  const startupSection = sections['前30章启动包'];
  const subplotsSection = sections['主要支线'];
  const storyLinesSection = sections['故事线规划'];
  const emotionSection = sections['情绪与爽点节奏'];
  const characterSection = sections['关键角色规划'] || sections['关键角色'];
  const foreshadowSection = sections['伏笔规划'];

  const volumeBlocks = splitByHeading(volumeSection, /^###\s*第(?:[一二三四五六七八九十]+|\d+)卷/gm);
  const startupBlocks = splitByHeading(startupSection, /^###\s*\d+\s*-\s*\d+章/gm);
  const protagonistName = extractFieldValue(storyEngineSection, '主角姓名') ?? '';

  const volumePlan = volumeBlocks.length > 0
    ? volumeBlocks
      .map((block, index) => parseVolumeBlock(block.body, index))
      .filter((item): item is VolumePlan => item !== null)
    : (() => {
      const fallback = parseVolumeBlock(volumeSection, 0);
      return fallback ? [fallback] : [];
    })();

  const chapterBlocks = startupBlocks.length > 0
    ? startupBlocks.map((block) => parseStartupBlock(block.body, block.heading.replace(/^###\s*/, '').trim()))
    : [{
      range: '1-30章',
      objective: '',
      mustEvents: [],
      coolPoints: [],
      hookRequirement: '',
      pacing: 'medium' as const,
      readerExpectation: '',
      forbiddenZones: [],
    }];

  const keyCharacters = parseCharacterSection(characterSection, protagonistName);

  const dedupedKeyCharacters = keyCharacters.filter((character, index, array) => {
    return character.name && array.findIndex((item) => item.name === character.name) === index;
  });

  const foreshadowPlan = parseForeshadowSection(foreshadowSection);

  const dedupedForeshadowPlan = foreshadowPlan.filter((foreshadow, index, array) => {
    return foreshadow.hint && array.findIndex((item) => item.hint === foreshadow.hint) === index;
  });

  const acts = parseActsSection(actsSection);
  const worldBuilding = parseWorldBuildingSection(worldBuildingSection);
  const subplots = parseSubplotsSection(subplotsSection);
  const storyLines = parseStoryLinesSection(storyLinesSection);
  const { emotionPlan, coolPointPlan } = parseEmotionAndCoolPointSection(emotionSection);
  const sellingPointPlan = parseSellingPointSection(sellingPointSection);

  const outline: ExecutableOutline = {
    title: extractFieldValue(positioningSection, '标题') ?? '未命名方案',
    oneLiner: extractFieldValue(positioningSection, '一句话卖点') ?? '',
    premise: extractFieldValue(positioningSection, 'premise') ?? '',
    positioning: {
      targetReaders: extractMultiValueField(positioningSection, '目标读者'),
      coreEmotions: extractMultiValueField(positioningSection, '核心情绪'),
      sellingPoints: extractMultiValueField(positioningSection, '卖点标签'),
      styleKeywords: extractMultiValueField(positioningSection, '风格关键词'),
    },
    storyScale: parseStoryScalePlan(scaleSection),
    storyEngine: {
      protagonistName,
      protagonistStart: extractFieldValue(storyEngineSection, '主角初始状态') ?? '',
      protagonistGoalLongTerm: extractFieldValue(storyEngineSection, '主角长期目标') ?? '',
      protagonistGoalShortTerm: extractFieldValue(storyEngineSection, '主角短期目标') ?? '',
      coreConflict: extractFieldValue(storyEngineSection, '核心冲突') ?? '',
      escalationPath: extractMultiValueField(storyEngineSection, '冲突升级链'),
      failureCost: extractFieldValue(storyEngineSection, '失败代价') ?? '',
    },
    acts: acts.length > 0 ? acts : undefined,
    volumePlan,
    startupPack30: {
      openingHook: extractFieldValue(startupSection, '开篇钩子') ?? '',
      promiseToReader: extractFieldValue(startupSection, '对读者的承诺') ?? '',
      protagonistFirstImpression: extractFieldValue(startupSection, '主角第一印象') ?? '',
      firstMajorCoolPoint: extractFieldValue(startupSection, '第一次强记忆爽点') ?? '',
      firstConflictCycle: extractFieldValue(startupSection, '第一轮冲突闭环') ?? '',
      chapterBlocks,
    },
    worldBuilding,
    subplots: subplots.length > 0 ? subplots : undefined,
    storyLines,
    emotionPlan,
    coolPointPlan,
    sellingPointPlan: sellingPointPlan.length > 0 ? sellingPointPlan : undefined,
    keyCharacters: dedupedKeyCharacters,
    foreshadowPlan: dedupedForeshadowPlan,
  };

  return isValidExecutableOutline(outline) ? outline : null;
}
