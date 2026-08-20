import type { ExecutableOutline } from '../types/executable-outline';
import type {
  GeneratedCharacter,
  GeneratedChapter,
  GeneratedConflictDesign,
  GeneratedCoolPointDesign,
  GeneratedCoreSellingPoint,
  GeneratedEmotionGoal,
  GeneratedForeshadow,
  GeneratedGoldenFinger,
  GeneratedOutline,
  GeneratedStoryLines,
  GeneratedStoryScale,
  GeneratedSubplot,
  GeneratedVolumePlan,
  GeneratedWorldSetting,
} from '@/types/inspiration';
import {
  buildMidChapterCen,
  enrichThinCpns,
  isMetaInstructionCen,
  isTemplateHookCen,
} from '@/services/story-runtime/chapterBlueprintNormalize';

const LEGACY_PURE_GENRE_TAGS = new Set([
  '玄幻', '东方玄幻', '奇幻', '仙侠', '武侠', '都市', '都市异能',
  '古言', '古代言情', '现言', '现代言情', '悬疑', '刑侦', '推理',
  '科幻', '末世', '历史', '军事', '游戏', '电竞', '校园', '职场',
  '现实', '种田', '宫斗', '宅斗', '穿越', '重生', '系统', '无限流',
]);

function resolveGenreTags(outline: ExecutableOutline): string[] {
  const explicit = (outline.positioning.genreTags ?? [])
    .map(tag => tag.trim())
    .filter(Boolean);
  if (explicit.length > 0) return Array.from(new Set(explicit)).slice(0, 3);

  // 兼容旧版大纲：只从文风字段中回收“精确命中”的题材词，
  // 不再把读者、情绪或“快节奏”之类文风混入 genre。
  return Array.from(new Set(
    outline.positioning.styleKeywords
      .map(tag => tag.trim())
      .filter(tag => LEGACY_PURE_GENRE_TAGS.has(tag)),
  )).slice(0, 3);
}

function parseWordCountRange(rangeText?: string): number | null {
  if (!rangeText) return null;

  const normalized = rangeText.replace(/[,，\s]/g, '');
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)万?[-~至到](\d+(?:\.\d+)?)万?(?:字)?/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1]);
    const max = Number(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      const multiplier = normalized.includes('万') ? 10_000 : 1;
      return Math.round(((min + max) / 2) * multiplier);
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

  // storyScale 是大纲规模的结构化真源。旧实现跳过它，导致“45 万字 / 180 章”
  // 在应用时按 3 卷兜底重算成 54 万字，metadata 出现两套互相矛盾的计划。
  const structuredTarget = parseWordCountRange(outline.storyScale?.targetWordCount);
  if (structuredTarget) {
    return structuredTarget;
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
      keyNeed: character.keyNeed || undefined,
      publicGoal: character.publicGoal || undefined,
      hiddenNeed: character.hiddenNeed || undefined,
      fearOrWound: character.fearOrWound || undefined,
      secret: character.secret || undefined,
      turningPoint: character.turningPoint || undefined,
      arcStart: character.arcStart || undefined,
      arcMid: character.arcMid || undefined,
      arcEnd: character.arcEnd || undefined,
      revealTiming: character.revealTiming || undefined,
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
    publicGoal: outline.storyEngine.protagonistGoalShortTerm || undefined,
    keyNeed: outline.storyEngine.protagonistGoalLongTerm || undefined,
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
  { type: 'sudden_reveal', keywords: ['揭示', '揭晓', '真相', '曝光'] },
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
 *
 * 说明（Bug 2 修复）：原实现把“区块大小”当作 totalChapters 传入，
 * 但 chapterNo 是绝对章号（如最后一块的 26），`chapterNo === totalChapters`(=5)
 * 永远不成立，导致 ending / resolution 判定对所有非首块失效。
 * 这里把“是否全书最后一章 / 是否所在区间块最后 1 章”拆成两个显式布尔，
 * 避免章号与区间大小混在一起比较。
 *
 * @param chapterNo           绝对章号（1-based），仅用于前 3 章建置类型
 * @param isLastChapter       是否全书最后一章
 * @param isBlockLastChapter  是否所在启动块的最后 1 章
 * @param coolPoints          本块爽点文案，用于关键词识别
 */
function inferChapterType(
  chapterNo: number,
  isLastChapter: boolean,
  isBlockLastChapter: boolean,
  coolPoints: string[],
): string {
  const coolText = coolPoints.join('');

  // 全书最后一章 → 收束
  if (isLastChapter) {
    if (coolText.includes('结局') || coolText.includes('收尾') || coolText.includes('落幕')) {
      return 'ending';
    }
  }
  // 高潮类
  if (coolText.includes('高潮') || coolText.includes('决战') || coolText.includes('巅峰')) {
    return 'climax';
  }
  // 第 1-3 章：开篇建置（网文惯例）
  if (chapterNo === 1) return 'world_intro';
  if (chapterNo === 2) return 'character_intro';
  if (chapterNo === 3) return 'plot_setup';
  // 区间末章且为解决类
  if (isBlockLastChapter && (coolText.includes('解决') || coolText.includes('收'))) {
    return 'resolution';
  }
  return 'normal';
}

/**
 * 空事件章的差异化推进句（Bug 6 修复）
 *
 * 无独立事件分配到本章时，生成带块内序号 + 轮换爽点的推进句，
 * 保证同块各章文案互不相同（此前回退 block.objective 导致块内多章同款 CBN）。
 * coolPoint 从第 i-1 个开始轮换，避免与首章开篇钩子抢戏。
 */
/**
 * 清掉块级字段里被 AI 误带进来的「第N章」章号前缀。
 *
 * AI 在 5 章块的 objective/coolPoints/mustEvents 里有时会写「第2章用锚定效应...」，
 * splitStartupBlocksToChapters 把它分给块内其它章当 CBN 时会带上错误的章号
 * （实测 ch3 的 CBN 出现「第2章用锚定效应让上司王主簿考核失误」）。
 * 这里统一清洗，保证单章 CBN 不携带他章章号。
 */
function stripChapterNumberPrefix(text: string): string {
  return (text ?? '').replace(/^第\s*\d+\s*章[：:、\s]*/u, '').trim();
}

function buildAdvanceCbn(
  block: ExecutableOutline['startupPack30']['chapterBlocks'][number],
  i: number,
  blockSize: number,
): string {
  const step = i + 1;
  const coolPoints = block.coolPoints ?? [];
  const cool =
    coolPoints.length > 0 ? stripChapterNumberPrefix(coolPoints[(i - 1 + coolPoints.length) % coolPoints.length]) : '';
  const objectiveBrief = stripChapterNumberPrefix(block.objective || '主线').trim().slice(0, 24);
  if (cool && cool.trim().length >= 4) {
    return `${cool.trim()}（本区间第 ${step}/${blockSize} 段推进）`;
  }
  return `本区间第 ${step}/${blockSize} 段推进：${objectiveBrief}`;
}

/**
 * 把 startupPack30 的"5 章一组"区间块拆成单章 GeneratedChapter
 *
 * 仅在 chapterBlueprints 缺失（分批拆章全部失败）时兜底：单章结构化节点（CBN/CPNs/CEN 等）
 * 由这里的拆分算法保守派生，让续写端的字段消费不至于全部失效。
 */
function splitStartupBlocksToChapters(outline: ExecutableOutline): GeneratedChapter[] {
  const blocks = outline.startupPack30.chapterBlocks;
  const involvedCharacters = outline.keyCharacters.map((character) => character.name).slice(0, 3);
  const chapters: GeneratedChapter[] = [];

  let globalChapterNo = 0;

  blocks.forEach((block, blockIndex) => {
    const isLastBlock = blockIndex === blocks.length - 1;
    // 解析区间只为拿到块内章节数（count），章号一律用 globalChapterNo 累加。
    // start 在 AI 输出不连续区间时会跳号，不能作为绝对章号使用。
    const { count } = parseChapterRange(block.range, globalChapterNo + 1);
    const blockSize = Math.max(1, count);

    // 在区间内均分 mustEvents（每章 1-2 个，按顺序循环）。
    // 修复（Bug 6）：分配前剔除模板句/元指令句（如「X后对手反手施压，倒计时与证据链同时收紧」），
    // 避免模板文本被当作事件分给各章、污染 CBN/CEN/mustCover；
    // 全部被剔除时回退原始首条（仍由 isTemplateHookCen 类判定在续写端兜底）。
    // 修复：清洗 AI 误带的「第N章」章号前缀，避免块内它章章号串入单章 CBN/事件。
    const rawEvents = (block.mustEvents.length > 0 ? block.mustEvents : ['推进本区间主线'])
      .map(stripChapterNumberPrefix);
    const usableEvents = rawEvents.filter(
      event =>
        !isTemplateHookCen(event) &&
        !isMetaInstructionCen(event) &&
        event.trim().length >= 4
    );
    const mustEvents = usableEvents.length > 0 ? usableEvents : rawEvents.slice(0, 1);
    const coolPoints = block.coolPoints.map(stripChapterNumberPrefix);
    const blockObjective = stripChapterNumberPrefix(block.objective);
    const pacingStrategy = block.pacing === 'fast' ? 'release' : 'confront';

    for (let i = 0; i < blockSize; i++) {
      globalChapterNo += 1;
      // 章号必须用 globalChapterNo（按生成顺序累加的绝对章号）。
      // 此前用 `start + i`（start 来自 parseChapterRange(block.range)）：
      // 当 AI 输出的区间不连续（如 1-5 / 11-15）时，第二块的第一章 chapterNo
      // 会从 11 起跳，标题变成"第 11 章"但它其实是全书第 6 章；
      // 更糟的是 inferChapterType 用 chapterNo 判定前 3 章建置类型，
      // 跳号会让 world_intro/character_intro/plot_setup 全部错位。
      const chapterNo = globalChapterNo;
      const isBlockLastChapter = i === blockSize - 1;
      const isLastChapter = isLastBlock && isBlockLastChapter;

      // 事件分配（Bug 6 修复）：按均分边界切分，但【不强制每章至少 1 个】——
      // 事件数少于章数时，允许空章出现，由差异化推进句兜底。
      // 此前 `Math.max(eventEnd, eventStart + 1)` 会强制每章至少 1 个事件，
      // 当块内事件数 < 章数时同一事件被 slice 进多章，导致：
      //   - 相邻多章 CBN/CPNs/mustCover 完全重复（实测 ch2/ch3 同 CBN）
      //   - 本属后章的节点提前压入前章 mustCover，前章反复被履约审核驳回重写
      //   - 后章真正需要该节点时，合同已被标记「上章已兑现」而跳过（去重误伤）
      const eventStart = Math.floor((i * mustEvents.length) / blockSize);
      const eventEnd = Math.floor(((i + 1) * mustEvents.length) / blockSize);
      const keyEvents = mustEvents.slice(eventStart, eventEnd);

      const isFirstChapterOverall = globalChapterNo === 1;

      // 空章兜底：差异化推进句（带块内序号 + 轮换爽点），保证同块各章文案互不相同，
      // 不再回退到全块同款 block.objective（此前无事件章 CBN=block.objective，块内重复）
      const fallbackCbn = buildAdvanceCbn(block, i, blockSize);

      // CBN：首章用开篇钩子；非首章用本章关键事件（推进句），
      // 不再承接上一章 CEN——原「CBN→CEN→CBN 连锁」会把上章章末复述
      // 当成下章履约目标，形成「承接上章结尾：{上章CEN截尾}」模板循环污染，
      // 且 CBN/CPNs/mustCover 全被上章内容占位、本章新事件无处落地。
      const CBN = isFirstChapterOverall
        ? outline.startupPack30.openingHook || fallbackCbn
        : keyEvents.length > 0
          ? keyEvents.join('，')
          : fallbackCbn;

      // CPNs：派生 1-3 个推进节点；空章从推进句拆分，单薄 keyEvent 时从 CBN 子句补齐
      const CPNs = enrichThinCpns(
        keyEvents.length > 0 ? keyEvents.slice(0, 3) : [fallbackCbn],
        CBN
      );

      // CEN（Bug 1 修复）：块末章用本块必留钩子；非末章用本章关键事件的具体后果
      const CEN = isBlockLastChapter
        ? block.hookRequirement || `完成本区间第 ${i + 1}/${blockSize} 段推进，转向下一区间`
        : buildMidChapterCen(keyEvents.length > 0 ? keyEvents : CPNs, CBN);

      // mustCover：仅本章分到的事件（互斥分配后不含后章节点）；空章不设硬性履约，
      // 由续写端从 CBN/CPNs 组装履约目标（ContextAgent 会补 mustCover）
      const mustCover = keyEvents.length > 0 ? keyEvents : undefined;

      // chapterType（Bug 2 修复：改用显式布尔而非 chapterNo===totalChapters）
      const chapterType = inferChapterType(chapterNo, isLastChapter, isBlockLastChapter, coolPoints);

      // hookType
      const hookType = inferHookType(block.hookRequirement);

      // isClimax
      const isClimax = chapterType === 'climax' || chapterType === 'ending';

      // expectedCoolPoints
      const expectedCoolPoints = Math.max(1, Math.round((coolPoints.length || 1) / blockSize));

      const title = `第${chapterNo}章`;
      const summary = [blockObjective, block.readerExpectation ? `读者期待：${block.readerExpectation}` : '']
        .filter(Boolean).join('；');
      const description = summary || blockObjective;

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
        // 禁区（Bug 5 修复）：块级禁区全块共用，透传到 plotOutline 供续写消费
        forbiddenZones: block.forbiddenZones,
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
    const blueprints = outline.chapterBlueprints;
    return blueprints.map((chapter, index) => {
      const coolPoints = chapter.coolPointType ? [chapter.coolPointType] : [];
      // ChapterBlueprint 当前不带 chapterType 字段，这里像 splitStartupBlocksToChapters 一样
      // 用 inferChapterType 派生，避免该分支产出后所有章节 chapterType 丢失、续写端退回关键词猜测。
      const isLastChapter = index === blueprints.length - 1;
      const chapterType = inferChapterType(
        chapter.orderIndex,
        isLastChapter,
        isLastChapter, // blueprints 为逐章蓝图，无块概念，区间末章等同全书末章
        coolPoints,
      );
      const isClimax = chapterType === 'climax' || chapterType === 'ending';
      return {
        title: chapter.title,
        number: chapter.orderIndex,
        status: 'outline' as const,
        summary: chapter.summary,
        keyEvents: chapter.mustCover,
        involvedCharacters: chapter.involvedCharacters ?? [],
        coreEvent: chapter.CEN,
        coolPoints,
        // 章尾钩子文案优先 hookText；缺省时才退到 hookType 枚举（避免把枚举当文案）
        hook: chapter.hookText ?? chapter.hookType,
        // 结构化节点
        CBN: chapter.CBN,
        CPNs: chapter.CPNs,
        CEN: chapter.CEN,
        mustCover: chapter.mustCover,
        forbiddenZones: chapter.forbiddenZones,
        // 写作策略
        chapterType,
        hookType: chapter.hookType,
        pacingStrategy: chapter.pacingStrategy ?? 'confront',
        isClimax,
        expectedCoolPoints: chapter.coolPointType ? 1 : undefined,
      };
    });
  }

  // 分批拆章全部失败时才会走到这里：退化为拆分 startupPack30 区间块
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
        // 爽点闭环结构透传（P1-1，向后兼容：缺失字段不输出）
        trigger: item.trigger || undefined,
        buildup: item.buildup || undefined,
        payoff: item.payoff || undefined,
        cost: item.cost || undefined,
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

/**
 * 金手指设定映射：优先透传结构化 goldenfingerPlan；
 * 缺省时从八线 goldenfinger 文案 + storyEngine 兜底推导一个最小可用结构，
 * 保证玄幻/系统品类即便模型没产出独立模块也有金手指信息进入续写。
 */
function toGoldenFinger(outline: ExecutableOutline): GeneratedGoldenFinger | undefined {
  if (outline.goldenfingerPlan?.type) {
    return {
      type: outline.goldenfingerPlan.type,
      trigger: outline.goldenfingerPlan.trigger,
      upgradePath: outline.goldenfingerPlan.upgradePath,
      limitation: outline.goldenfingerPlan.limitation,
      cost: outline.goldenfingerPlan.cost,
      firstRevealChapter: outline.goldenfingerPlan.firstRevealChapter ?? undefined,
    };
  }

  // 兜底：八线 goldenfinger 文案 / 短期目标
  const type = outline.storyLines?.goldenfinger?.trim() || outline.storyEngine.protagonistGoalShortTerm?.trim();
  if (!type) return undefined;
  return {
    type,
    trigger: outline.storyEngine.protagonistStart || '',
    upgradePath: [],
    limitation: '',
    cost: outline.storyEngine.failureCost || '',
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

function toVolumePlans(outline: ExecutableOutline): GeneratedVolumePlan[] {
  return outline.volumePlan.map((volume, index) => ({
    volumeIndex: volume.volumeIndex || index + 1,
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

export function mapExecutableOutlineToGeneratedOutline(
  outline: ExecutableOutline,
  options?: { targetWordCountRange?: string },
): GeneratedOutline {
  return {
    id: `executable-${Date.now()}`,
    title: outline.title,
    synopsis: toSynopsis(outline),
    genres: resolveGenreTags(outline),
    styleKeywords: [...outline.positioning.styleKeywords],
    targetReaders: [...outline.positioning.targetReaders],
    coreEmotions: [...outline.positioning.coreEmotions],
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
    // 透传启动包，供 useProjectCreator 落库到 metadata
    startupPack30: outline.startupPack30,
    emotionGoal: toEmotionGoal(outline),
    coolPointDesign: toCoolPointDesign(outline),
    coreSellingPoints: toCoreSellingPoints(outline),
    conflictDesign: toConflictDesign(outline),
    storyLines: toStoryLines(outline),
    goldenfingerDesign: toGoldenFinger(outline),
    volumes: outline.volumePlan.length,
    volumePlans: toVolumePlans(outline),
  };
}
