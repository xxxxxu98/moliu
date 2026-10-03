import type {
  CharacterPlan,
  CharacterRelationshipPlan,
  ChapterBlueprint,
  CoolPointBeatPlan,
  EmotionBeatPlan,
  ExecutableOutline,
  ForeshadowPlan,
  GoldenFingerPlan,
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
  isLikelyCharacterName,
  normalizeGeneratedText,
  splitByHeading,
  splitNamedSections,
} from './utils';
import { OUTLINE_COMPLETENESS_POLICY } from '../validation/outlineCompleteness';

const STARTUP_CHAPTER_COUNT = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;

function extractAliasedFieldValue(block: string, fieldNames: string[]): string | null {
  for (const fieldName of fieldNames) {
    const value = extractFieldValue(block, fieldName);
    if (value?.trim()) return value;
  }
  return null;
}

function extractAliasedMultiValueField(block: string, fieldNames: string[]): string[] {
  for (const fieldName of fieldNames) {
    const values = extractMultiValueField(block, fieldName);
    if (values.length > 0) return values;
  }
  return [];
}
// 复用 story-runtime 的跨章目标检测：mustCover 含整卷/全书级目标（如「完成…逆转」）
// 会触发续写履约审核判未兑现 → 死循环。解析期剔除，从源头阻断。
// 注意：outline 模块与 story-runtime 模块的依赖方向——story-runtime 是更底层的运行时，
// outline 是上层策划产出，这里单向引用底层纯函数无循环依赖风险。
import { isCrossChapterGoal } from '@/services/story-runtime/chapterBlueprintNormalize';

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

/** 从「章节区间」字段值中解析 1-based 闭区间。容忍「第1-60章」「1~60」「第1章-第60章」等写法 */
export function parseVolumeChapterRange(raw: string | null): { start: number; end: number } | undefined {
  if (!raw) return undefined;
  const numbers = raw.match(/\d+/g);
  if (!numbers || numbers.length < 2) return undefined;
  const start = Number(numbers[0]);
  const end = Number(numbers[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return undefined;
  return { start, end };
}

/**
 * 卷区间合法化：AI 声明的各卷区间应拼成从 1 起的连续覆盖（允许重叠/缝隙 ≤1，
 * 对齐 startupBlocks 的容错口径）。
 *
 * 修复策略（2026-08-23 改造）：单卷缺失/非法时按相邻边界插值补算，不再
 * 「一卷非法全弃」。旧行为在 23 卷规模下任何一卷被模型写坏，全部 chapterRange
 * 被整体丢弃 → 下游按 estimatedChaptersPerVolume 估算 → 前几十章只命中前
 * 两卷（真实项目复盘）。仅当首卷起点远离 1 或修复后仍有 >1 缝隙（整体不可信）
 * 才整体丢弃回退估算。
 */
function sanitizeVolumeChapterRanges(volumes: VolumePlan[]): VolumePlan[] {
  if (volumes.length < 2) return volumes;

  // 首卷必须从 1 附近开始，否则整套区间不可信
  const firstRange = volumes[0].chapterRange;
  if (!firstRange || Math.abs(firstRange.start - 1) > 1) {
    return volumes.map(({ chapterRange: _ignored, ...rest }) => rest);
  }

  const repaired: VolumePlan[] = [volumes[0]];
  for (let index = 1; index < volumes.length; index += 1) {
    const volume = volumes[index];
    const previousEnd = repaired[index - 1].chapterRange?.end ?? 0;
    const nextRange = volumes[index + 1]?.chapterRange;

    if (
      volume.chapterRange &&
      volume.chapterRange.start >= previousEnd &&
      volume.chapterRange.start - previousEnd <= 2
    ) {
      // 合法：与前卷衔接（容忍 ≤2 缝隙，clamp 到紧接前卷）
      repaired.push({
        ...volume,
        chapterRange: {
          start: Math.max(volume.chapterRange.start, previousEnd + 1),
          end: volume.chapterRange.end,
        },
      });
      continue;
    }

    // 单卷缺失/非法：按前卷结束与下一卷起点插值。
    // 无下一卷边界（尾卷）且原区间只是「起点跳变」时，保留原区间的长度
    // 只平移起点——缩成单章卷会让分卷严重失真。
    const interpolatedStart = previousEnd + 1;
    const originalLength = volume.chapterRange
      ? volume.chapterRange.end - volume.chapterRange.start + 1
      : 0;
    const interpolatedEnd = nextRange
      ? Math.max(interpolatedStart, nextRange.start - 1)
      : originalLength > 0
        ? interpolatedStart + originalLength - 1
        : interpolatedStart;
    repaired.push({ ...volume, chapterRange: { start: interpolatedStart, end: interpolatedEnd } });
  }

  // 尾卷结束不应为 0（插值失败的兜底标记）；失败则整体回退估算
  if (repaired.some(volume => (volume.chapterRange?.end ?? 0) <= 0)) {
    return volumes.map(({ chapterRange: _ignored, ...rest }) => rest);
  }
  return repaired;
}

function parseVolumeBlock(block: string, index: number): VolumePlan | null {
  const volume = {
    volumeIndex: index + 1,
    title: extractFieldValue(block, '卷标题') ?? `第${index + 1}卷`,
    chapterRange: parseVolumeChapterRange(extractFieldValue(block, '章节区间')),
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

/**
 * 解析「## 单章蓝图」段：逐章产出 ChapterBlueprint（title/CBN/CPNs/CEN/mustCover/禁区/钩子/爽点）。
 *
 * 容错策略与其它 parse*Section 一致：AI 漏写或写残时返回空数组（调用方据此回退到 splitStartupBlocksToChapters）。
 * 标题来自 `### 第N章` 下的「标题」字段，而非 heading（heading 仅用于切块与 orderIndex 抽取）。
 */
export function parseChapterBlueprintSection(section: string): ChapterBlueprint[] {
  if (!section.trim()) return [];
  // heading 形如 `### 第1章` / `### 第12章` / `### 1章`。
  // 容错层级与空格：AI 偶用 `## 第1章`（2井号）/ `#### 第1章`（4井号）/ `###第1章`（无空格），
  // 旧正则 `^###\s+...`（恰好 3 井号 + 强制空格）会漏掉这些块；若累计漏到 <28 章，
  // unified-generator 会整体丢弃 chapterBlueprints 降级到算法派生。
  // 放宽为 `#{2,4}`（2~4 井号）+ `\s*`（零或多空格，兼容无空格写法）。
  const blocks = splitByHeading(section, /^#{2,4}\s*第?\s*\d+\s*章?/gm);
  return blocks
    .map((block, index): ChapterBlueprint | null => {
      // 从 heading 抽 orderIndex；抽不到则回退 index+1（保持稳定递增）
      const headingMatch = block.heading.match(/\d+/);
      const orderIndex = headingMatch ? Number(headingMatch[0]) : index + 1;
      const title = (extractFieldValue(block.body, '标题') ?? '').trim();
      const CBN = (
        extractAliasedFieldValue(block.body, ['CBN', '章首钩子', '章首动作钩子']) ?? ''
      ).trim();
      const CEN = (extractAliasedFieldValue(block.body, ['CEN', '章尾钩子']) ?? '').trim();
      // 标题与 CBN 至少有一个非空，否则视为 AI 写残的空块，丢弃
      if (!title && !CBN) return null;
      const CPNs = compactChapterNodes(
        extractAliasedMultiValueField(block.body, ['CPNs', '推进节点'])
      );
      const mustCover = compactChapterNodes(
        extractAliasedMultiValueField(block.body, ['mustCover', '必出事件'])
      );
      const forbiddenZones = extractAliasedMultiValueField(block.body, [
        '禁区',
        'forbiddenZones',
      ]);
      const hookTextRaw = extractFieldValue(block.body, '章尾钩子文案') ?? '';
      // 书审实测：字段错位时会把「- 爽点类型：收服」这类邻行当钩子文案吞进来，
      // 污染下游章尾工程。宁可空（适配层回退 CEN/hookType）也不收泄漏值。
      const hookText = sanitizeHookText(hookTextRaw);
      const hookType = (extractFieldValue(block.body, '爽点类型') ?? '').trim();
      const coolPointType = hookType || undefined;
      // 章纲描述：summary 会成为 plotOutline.description 与 chapter.outline 的正文段。
      // 只回退 CBN 时，章纲描述与结构化节点里的 CBN 逐字重复，等于整章章纲零信息增量。
      const summary = (
        extractAliasedFieldValue(block.body, ['概要', 'summary', '本章概要', '章节概要']) ?? ''
      ).trim();
      return {
        orderIndex,
        title: title || CBN.slice(0, 16),
        summary: summary || CBN || title,
        CBN,
        CPNs: CPNs.length > 0 ? CPNs : (CBN ? [CBN] : []),
        CEN,
        mustCover: mustCover.length > 0 ? mustCover : (CBN ? [CBN] : []),
        forbiddenZones,
        hookType: hookType || 'reveal',
        hookText: hookText || undefined,
        coolPointType,
      };
    })
    .filter((item): item is ChapterBlueprint => item !== null);
}

/**
 * 章尾钩子文案守卫：空值/连字符号开头的残行/字段名错位值（如「爽点类型：收服」）
 * 一律返回 undefined，让适配层走既定回退链，而不是把结构化垃圾当文案下发。
 */
export function sanitizeHookText(value: string | undefined | null): string | undefined {
  const v = (value ?? '').trim();
  if (!v) return undefined;
  if (/^[-•*·]/u.test(v)) return undefined;
  if (/^(?:爽点类型|CBN|CEN|CPNs|标题|概要|禁区|mustCover|章尾钩子)\s*[:：]/u.test(v)) return undefined;
  return v;
}

/**
 * 模型偶尔用逗号把一个连续场景链拆成 4-8 个碎片；规划器逐项消费会把单章挤爆。
 * 保留前两个节点，把其余碎片合并成第三个连续场景，既不丢信息也守住 1-3 个 CPN 的合同。
 */
function compactChapterNodes(values: string[], maxNodes: number = 3): string[] {
  if (values.length <= maxNodes) return values;
  return [
    ...values.slice(0, maxNodes - 1),
    values.slice(maxNodes - 1).join('，'),
  ];
}

/**
 * 清洗单章蓝图的 mustCover：剔除整卷/全书级目标（如「完成临水县从空壳穷县到模范县的逆转」）。
 *
 * 真实回归：smoke:storyflow:real 实测——AI 偶发把卷级 objective 写进单章 mustCover，
 * 下游 ContractPackBuilder 又把它透传给 chapter-judge 作为单章履约硬约束。
 * 模型无论如何写都兑现不了整卷目标 → 持续判未履约 → 持久错误重试耗尽 → 死循环。
 *
 * 这里在解析期（AI 产出后、建章前）做一次硬剔除，从源头阻断。判定复用
 * story-runtime 的 isCrossChapterGoal（已覆盖时限/威胁/流程式/弧线终态式跨章目标）。
 *
 * 注意：剔空 mustCover 时回退为 [CBN]，与 parseChapterBlueprintSection 的兜底口径一致，
 * 避免下游因空 mustCover 再次判「未履约」（无节点可履约也是一种失败）。
 */
function sanitizeChapterBlueprintMustCover(blueprints: ChapterBlueprint[]): ChapterBlueprint[] {
  if (blueprints.length === 0) return blueprints;
  return blueprints.map(blueprint => {
    if (!blueprint.mustCover || blueprint.mustCover.length === 0) return blueprint;
    const filtered = blueprint.mustCover.filter(node => !isCrossChapterGoal(node));
    if (filtered.length === blueprint.mustCover.length) return blueprint; // 无剔除，原样返回
    // 记录剔除事件（便于排障；不抛错，不阻断主流程）
    const dropped = blueprint.mustCover.filter(node => isCrossChapterGoal(node));
    const droppedPreview = dropped.slice(0, 2).map(s => `「${s.slice(0, 30)}」`).join('、');
    console.warn(
      `[outline-parser] 第${blueprint.orderIndex}章 mustCover 剔除 ${dropped.length} 条整卷/全书级跨章目标（注入单章会触发履约死循环）：${droppedPreview}${dropped.length > 2 ? ` 等${dropped.length}条` : ''}`
    );
    // 剔空则回退 [CBN]，避免空 mustCover 让 chapter-judge 无节点可判
    const safeMustCover = filtered.length > 0 ? filtered : (blueprint.CBN ? [blueprint.CBN] : []);
    return { ...blueprint, mustCover: safeMustCover };
  });
}

/**
 * 从「每卷预计章节数」的散文式值中提取每卷章数。
 * 实测模型两种写法都会让裸 `/\d+/` 抓错数字（首个数字是「第1卷」的卷号 1）：
 * - 「第一卷约60章，第二卷约60章」（骨架步）
 * - 「第1卷约60章对应第1至60章，第2卷约60章对应第61至120章」（审查重写步）
 * 提取优先级：约/为/是 + N章 > 卷…N章 > 任意 N章。
 */
function parseChaptersPerVolume(value: string | undefined): number {
  if (!value) return 0;
  const about = value.match(/(?:约|为|是)\s*(\d+)\s*章/u);
  if (about) return Number(about[1]);
  const afterVolume = value.match(/卷[^\d]*(?:约|共)?\s*(\d+)\s*章/u);
  if (afterVolume) return Number(afterVolume[1]);
  const plain = value.match(/(\d+)\s*章/u);
  if (plain) return Number(plain[1]);
  return 0;
}

function parseStoryScalePlan(section: string): StoryScalePlan {
  const estimatedChapterCount = Number(extractFieldValue(section, '预计总章节数')?.match(/\d+/)?.[0] ?? '0');
  const averageWordsPerChapter = Number(extractFieldValue(section, '章节平均字数')?.match(/\d+/)?.[0] ?? '2500');
  const suggestedVolumeCount = Number(extractFieldValue(section, '建议卷数')?.match(/\d+/)?.[0] ?? '3');
  let estimatedChaptersPerVolume = parseChaptersPerVolume(
    extractFieldValue(section, '每卷预计章节数') ?? undefined,
  );
  // 交叉校验兜底：字段噪声再抓错时，用「总章数 / 卷数」这两个更权威的锚点重算，
  // 避免 inconsistent-story-scale blocker 拦下语义正确的大纲（实测 2026-08-15：
  // 「第1卷约60章」被抓成 1，3卷×1章≠180章，整份大纲被判矛盾）。
  if (
    estimatedChapterCount > 0 &&
    suggestedVolumeCount > 0 &&
    Math.abs(estimatedChaptersPerVolume * suggestedVolumeCount - estimatedChapterCount)
      / estimatedChapterCount > 0.5
  ) {
    estimatedChaptersPerVolume = Math.round(estimatedChapterCount / suggestedVolumeCount);
  }

  return {
    targetWordCount: extractFieldValue(section, '目标字数') ?? '',
    estimatedChapterCount,
    averageWordsPerChapter,
    suggestedVolumeCount,
    estimatedChaptersPerVolume,
    startupPhaseRatio:
      extractFieldValue(section, `前${STARTUP_CHAPTER_COUNT}章占比`) ??
      extractFieldValue(section, '前30章占比') ??
      '',
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

/** 解析金手指设定模块（独立顶层，区别于八线的"金手指线"单行文案） */
function parseGoldenFingerSection(section: string): GoldenFingerPlan | undefined {
  if (!section.trim()) return undefined;
  const type = extractFieldValue(section, '金手指类型') ?? extractFieldValue(section, '类型') ?? '';
  if (!type) return undefined; // 类型为空视为未产出该模块

  const trigger = extractFieldValue(section, '触发场景') ?? '';
  const upgradePath = extractMultiValueField(section, '升级路径');
  const limitation = extractFieldValue(section, '使用限制') ?? '';
  const cost = extractFieldValue(section, '使用代价') ?? '';
  const firstRevealChapter = parseChapterNumber(extractFieldValue(section, '首次兑现章节'));

  return {
    type,
    trigger,
    upgradePath,
    limitation,
    cost,
    firstRevealChapter,
  };
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
    // 爽点闭环结构（P1-1，向后兼容：旧模板无这些字段时为 undefined）
    trigger: extractFieldValue(block.body, '触发场景') ?? undefined,
    buildup: extractFieldValue(block.body, '铺垫') ?? undefined,
    payoff: extractFieldValue(block.body, '兑现') ?? undefined,
    cost: extractFieldValue(block.body, '代价') ?? undefined,
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
    category: ((): SellingPointPlan['category'] => {
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
    // 姓名字段被描述污染的块直接拒收（2026-08-24 冒烟实测：模型把「关系变化」
    // 首句错填进姓名字段，产生「由初期的公事公办」这类假角色混进 keyCharacters，
    // 污染角色名单与出场白名单 prompt）。主角块豁免——主角名由 direction 传入，
    // 模型偶尔写带修饰的主角全称不该被丢。
    const plans: CharacterPlan[] = [];
    for (const block of characterBlocks) {
      const plan = parseCharacterBlock(block.body, protagonistName);
      if (
        plan.name !== protagonistName &&
        !isLikelyCharacterName(plan.name)
      ) {
        console.warn(
          `[outline-parser] 角色块姓名「${plan.name}」疑似描述污染，已拒收该角色块`
        );
        continue;
      }
      plans.push(plan);
    }
    return plans;
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

/**
 * 姓名字段归一：模型常写成「赵珝，康王」「萧景（三皇子）」这类「本名＋头衔」同位语，
 * 整串当姓名会让下游按名字做的文本匹配（出场白名单、角色真相挑选、改名检测）全部失效，
 * prompt 里也会出现「只能使用：赵珝，康王」这种病句。这里只取本名段。
 */
function normalizeCharacterName(raw: string): string {
  const primary = raw
    .split(/[，,、（(]/u)[0]
    .replace(/[）)]/gu, '')
    .trim();
  return primary || raw.trim();
}

function parseCharacterBlock(block: string, protagonistName?: string): CharacterPlan {
  const roleRaw = extractFieldValue(block, '角色定位') ?? '配角';
  const nameRaw = extractFieldValue(block, '姓名') ?? '未命名角色';
  const name = normalizeCharacterName(nameRaw);
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
    `前${STARTUP_CHAPTER_COUNT}章启动包`,
    '前30章启动包',
    '单章蓝图',
    '主要支线',
    '故事线规划',
    '情绪与爽点节奏',
    '金手指设定',
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
  const startupSection =
    sections[`前${STARTUP_CHAPTER_COUNT}章启动包`] || sections['前30章启动包'];
  const chapterBlueprintSection = sections['单章蓝图'];
  const subplotsSection = sections['主要支线'];
  const storyLinesSection = sections['故事线规划'];
  const emotionSection = sections['情绪与爽点节奏'];
  const goldenfingerSection = sections['金手指设定'];
  const characterSection = sections['关键角色规划'] || sections['关键角色'];
  const foreshadowSection = sections['伏笔规划'];

  const volumeBlocks = splitByHeading(volumeSection, /^###\s*第(?:[一二三四五六七八九十]+|\d+)卷/gm);
  const startupBlocks = splitByHeading(startupSection, /^###\s*\d+\s*-\s*\d+章/gm);
  const protagonistName = extractFieldValue(storyEngineSection, '主角姓名') ?? '';

  const rawVolumePlan = volumeBlocks.length > 0
    ? volumeBlocks
      .map((block, index) => parseVolumeBlock(block.body, index))
      .filter((item): item is VolumePlan => item !== null)
    : (() => {
      const fallback = parseVolumeBlock(volumeSection, 0);
      return fallback ? [fallback] : [];
    })();
  // 卷区间合法化：AI 区间不连续/缺失时整体丢弃，建章端回退估算分卷
  const volumePlan = sanitizeVolumeChapterRanges(rawVolumePlan);

  const chapterBlocks = startupBlocks.length > 0
    ? startupBlocks.map((block) => parseStartupBlock(block.body, block.heading.replace(/^###\s*/, '').trim()))
    : [{
      range: `1-${STARTUP_CHAPTER_COUNT}章`,
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
  const goldenfingerPlan = parseGoldenFingerSection(goldenfingerSection);

  // 单章蓝图（chapterBlueprints）：AI 逐章产出，非空时下游 toChapters 走 blueprint 分支，替代算法派生。
  // 解析为空（AI 未产或写残）则保持 undefined，toChapters 自动回退 splitStartupBlocksToChapters。
  const rawChapterBlueprints = parseChapterBlueprintSection(chapterBlueprintSection);
  // 解析期清洗：剔除 mustCover 中的整卷/全书级跨章目标（注入单章会触发续写履约死循环）。
  // 这是 #2a 防护层；reviewAndFixOutline 的 over-scoped-mustcover issue（#2b）是第二层。
  const parsedChapterBlueprints = sanitizeChapterBlueprintMustCover(rawChapterBlueprints);

  const outline: ExecutableOutline = {
    title: extractFieldValue(positioningSection, '标题') ?? '未命名方案',
    oneLiner: extractFieldValue(positioningSection, '一句话卖点') ?? '',
    premise: extractFieldValue(positioningSection, 'premise') ?? '',
    positioning: {
      genreTags: extractMultiValueField(positioningSection, '题材标签'),
      targetReaders: extractMultiValueField(positioningSection, '目标读者'),
      coreEmotions: extractMultiValueField(positioningSection, '核心情绪'),
      sellingPoints: extractMultiValueField(positioningSection, '卖点标签'),
      styleKeywords: extractMultiValueField(positioningSection, '风格关键词'),
      // 词汇档位：定位 AI 的显式单值输出；空值留给 normalizeVocabularyTier 从
      // styleKeywords 推导——解析层不做归一化，保持零语义
      vocabularyTier: extractFieldValue(positioningSection, '词汇档位') || undefined,
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
    goldenfingerPlan,
    keyCharacters: dedupedKeyCharacters,
    foreshadowPlan: dedupedForeshadowPlan,
    chapterBlueprints: parsedChapterBlueprints.length > 0 ? parsedChapterBlueprints : undefined,
  };

  return isValidExecutableOutline(outline) ? outline : null;
}
