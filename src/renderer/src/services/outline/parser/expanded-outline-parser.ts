import type {
  CharacterPlan,
  CharacterRelationshipPlan,
  ExecutableOutline,
  ForeshadowPlan,
  StartupChapterBlock,
  VolumePlan,
  StoryScalePlan,
} from '../types/executable-outline';
import {
  extractFieldValue,
  extractMultiValueField,
  normalizeGeneratedText,
  splitByHeading,
  splitNamedSections,
} from './utils';

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
    arcStart: extractFieldValue(block, '角色弧线起点') ?? '',
    arcMid: extractFieldValue(block, '角色弧线中段') ?? '',
    arcEnd: extractFieldValue(block, '角色弧线终点') ?? '',
    resources: extractMultiValueField(block, '角色资源'),
    relationshipChanges: parseRelationshipChanges(extractMultiValueField(block, '关系变化')),
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
    '故事规模规划',
    '核心驱动',
    '卷纲',
    '前30章启动包',
    '关键角色规划',
    '关键角色',
    '伏笔规划',
  ]);

  const positioningSection = sections['故事定位'];
  const scaleSection = sections['故事规模规划'];
  const storyEngineSection = sections['核心驱动'];
  const volumeSection = sections['卷纲'];
  const startupSection = sections['前30章启动包'];
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
    }];

  const keyCharacters = parseCharacterSection(characterSection, protagonistName);

  const dedupedKeyCharacters = keyCharacters.filter((character, index, array) => {
    return character.name && array.findIndex((item) => item.name === character.name) === index;
  });

  const foreshadowPlan = parseForeshadowSection(foreshadowSection);

  const dedupedForeshadowPlan = foreshadowPlan.filter((foreshadow, index, array) => {
    return foreshadow.hint && array.findIndex((item) => item.hint === foreshadow.hint) === index;
  });

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
    volumePlan,
    startupPack30: {
      openingHook: extractFieldValue(startupSection, '开篇钩子') ?? '',
      promiseToReader: extractFieldValue(startupSection, '对读者的承诺') ?? '',
      protagonistFirstImpression: extractFieldValue(startupSection, '主角第一印象') ?? '',
      firstMajorCoolPoint: extractFieldValue(startupSection, '第一次强记忆爽点') ?? '',
      firstConflictCycle: extractFieldValue(startupSection, '第一轮冲突闭环') ?? '',
      chapterBlocks,
    },
    keyCharacters: dedupedKeyCharacters,
    foreshadowPlan: dedupedForeshadowPlan,
  };

  return isValidExecutableOutline(outline) ? outline : null;
}
