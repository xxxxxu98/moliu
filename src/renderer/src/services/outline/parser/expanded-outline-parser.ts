import type {
  CharacterPlan,
  ExecutableOutline,
  StartupChapterBlock,
  VolumePlan,
} from '../types/executable-outline';
import {
  extractFieldValue,
  extractMultiValueField,
  normalizeGeneratedText,
  splitByHeading,
  splitNamedSections,
} from './utils';

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

function mapRole(value: string): CharacterPlan['role'] {
  if (value.includes('主角')) return 'protagonist';
  if (value.includes('盟友')) return 'ally';
  if (value.includes('反派') || value.includes('宿敌')) return 'antagonist';
  if (value.includes('导师') || value.includes('师父')) return 'mentor';
  return 'support';
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
    '核心驱动',
    '卷纲',
    '前30章启动包',
    '关键角色',
  ]);

  const positioningSection = sections['故事定位'];
  const storyEngineSection = sections['核心驱动'];
  const volumeSection = sections['卷纲'];
  const startupSection = sections['前30章启动包'];
  const characterSection = sections['关键角色'];

  const volumeBlocks = splitByHeading(volumeSection, /^###\s*第(?:[一二三四五六七八九十]+|\d+)卷/gm);
  const startupBlocks = splitByHeading(startupSection, /^###\s*\d+\s*-\s*\d+章/gm);
  const characterBlocks = splitByHeading(characterSection, /^###\s*角色\s*\d+/gm);
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

  const keyCharacters = characterBlocks.length > 0
    ? characterBlocks.map((block) => parseCharacterBlock(block.body, protagonistName))
    : (() => {
      const name = extractFieldValue(characterSection, '姓名');
      return name ? [parseCharacterBlock(characterSection, protagonistName)] : [];
    })();

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
    keyCharacters,
  };

  return isValidExecutableOutline(outline) ? outline : null;
}
