import type { GenerateOptions } from './unified-generator';
import type { OutlineDirection } from '../types/direction';
import type {
  ChapterBlueprint,
  ExecutableOutline,
} from '../types/executable-outline';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import { isLikelyCharacterName } from '../parser/utils';
import {
  dropForeshadowConflictingItems,
  type ForeshadowTimingHint,
} from '../rolling/foreshadowTiming';
import { isAbortedError, isTransientError, retryBackoffDelayMs } from '@/utils/ai-error-classify';
import { readPositiveIntEnv } from '@/utils/env';
import {
  inspectOutlineCompleteness,
  OUTLINE_COMPLETENESS_POLICY,
} from '../validation/outlineCompleteness';
import type { OutlineCompletenessBlocker } from '../validation/outlineCompleteness';

type StructuredTextCaller = (
  system: string,
  user: string,
  options: GenerateOptions,
) => Promise<string>;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 「API 未返回内容」的 message 特征（unified-generator.callStructuredTextMode 抛出） */
const EMPTY_RESPONSE_RE = /api\s*未返回内容/iu;

function isEmptyResponse(value: string): boolean {
  return !value.trim();
}

/**
 * 带空响应退避重试的结构化文本调用。空响应两种形态统一处理：
 * 请求层抛「API 未返回内容」（网关 200 但 0 字，请求层视为错误）与调用器
 * 正常返回空串。其余错误原样上抛。重试耗尽仍空时返回 ''，由调用方决定
 * 是跳过替换（防护已有内容被洗掉）还是记 warning。
 */
async function callTextWithEmptyRetry(
  params: {
    system: string;
    user: string;
    options: GenerateOptions;
    callStructuredTextMode: StructuredTextCaller;
  },
): Promise<string> {
  const MAX_EMPTY_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_EMPTY_ATTEMPTS; attempt += 1) {
    try {
      const generated = await params.callStructuredTextMode(
        params.system,
        params.user,
        params.options,
      );
      if (!isEmptyResponse(generated)) return generated;
    } catch (error) {
      if (!EMPTY_RESPONSE_RE.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
    }
    if (attempt < MAX_EMPTY_ATTEMPTS) {
      await sleep(retryBackoffDelayMs('network', attempt, 2000, 10_000));
    }
  }
  return '';
}

const PLACEHOLDER_TITLE_RE =
  /^第[一二三四五六七八九十百千零\d]+章(?:\s*[（(]?未命名[)）]?)?$/u;

/** 启动包小节标题：首项为当前规范写法，其余为历史稿件兼容别名 */
const STARTUP_PACK_SECTION_ALIASES = [
  `前${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}章启动包`,
  '前30章启动包',
];

/** 蓝图是否可用：章号在启动包范围内、标题非占位、CBN/CEN 非空（agent 写工具与补全共用口径） */
export function isUsableBlueprint(blueprint: ChapterBlueprint | undefined): blueprint is ChapterBlueprint {
  return Boolean(
    blueprint &&
    blueprint.orderIndex >= 1 &&
    blueprint.orderIndex <= OUTLINE_COMPLETENESS_POLICY.startupChapterCount &&
    blueprint.title.trim() &&
    !PLACEHOLDER_TITLE_RE.test(blueprint.title.trim()) &&
    blueprint.CBN.trim() &&
    blueprint.CPNs.length > 0 &&
    blueprint.CEN.trim() &&
    blueprint.mustCover.length > 0,
  );
}

export function findIncompleteChapterNumbers(outline: ExecutableOutline): number[] {
  const usableChapterNumbers = new Set(
    (outline.chapterBlueprints ?? [])
      .filter(isUsableBlueprint)
      .map(blueprint => blueprint.orderIndex),
  );
  return Array.from(
    { length: OUTLINE_COMPLETENESS_POLICY.startupChapterCount },
    (_, index) => index + 1,
  ).filter(chapterNumber => !usableChapterNumbers.has(chapterNumber));
}

function listField(values: string[]): string {
  return values.filter(Boolean).join('；');
}

/** 把蓝图序列化回「### 第N章」Markdown 块（与 parser 期望的字段名一致） */
export function serializeBlueprint(blueprint: ChapterBlueprint): string {
  return `### 第${blueprint.orderIndex}章
- 标题：${blueprint.title}
- CBN：${blueprint.CBN}
- CPNs：${listField(blueprint.CPNs)}
- CEN：${blueprint.CEN}
- mustCover：${listField(blueprint.mustCover)}
- 禁区：${listField(blueprint.forbiddenZones)}
- 章尾钩子文案：${blueprint.hookText ?? ''}
- 爽点类型：${blueprint.coolPointType ?? blueprint.hookType ?? '反转'}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** 用完整的新 section 替换旧 section；旧文缺少该节时追加到文末。 */
export function replaceOutlineSection(
  raw: string,
  aliases: string[],
  canonicalHeading: string,
  body: string,
): string {
  const headerPattern = new RegExp(
    `^##\\s*(?:${aliases.map(escapeRegExp).join('|')})(?:\\s*[（(].*)?\\s*$`,
    'mu',
  );
  const match = headerPattern.exec(raw);
  const replacement = `## ${canonicalHeading}\n${body.trim()}\n`;
  if (!match || match.index === undefined) {
    return `${raw.trim()}\n\n${replacement}`;
  }

  const sectionStart = match.index;
  const searchFrom = sectionStart + match[0].length;
  const tail = raw.slice(searchFrom);
  const nextHeader = /^##\s+.+$/gmu.exec(tail);
  const sectionEnd = nextHeader?.index === undefined
    ? raw.length
    : searchFrom + nextHeader.index;
  return `${raw.slice(0, sectionStart)}${replacement}\n${raw.slice(sectionEnd).trimStart()}`;
}

/** 从模型响应中取出指定二级 section 的正文；没有 section 头时直接使用全文。 */
export function extractOutlineSectionBody(raw: string, aliases: string[]): string {
  const headerPattern = new RegExp(
    `^##\\s*(?:${aliases.map(escapeRegExp).join('|')})(?:\\s*[（(].*)?\\s*$`,
    'mu',
  );
  const match = headerPattern.exec(raw);
  if (!match || match.index === undefined) return raw.trim();
  const bodyStart = match.index + match[0].length;
  const tail = raw.slice(bodyStart);
  const nextHeader = /^##\s+.+$/gmu.exec(tail);
  return tail.slice(0, nextHeader?.index ?? tail.length).trim();
}

function replaceSectionField(
  raw: string,
  aliases: string[],
  canonicalHeading: string,
  fieldName: string,
  value: string,
): string {
  const body = extractOutlineSectionBody(raw, aliases);
  const fieldPattern = new RegExp(`^-\\s*${escapeRegExp(fieldName)}\\s*[：:].*$`, 'mu');
  const nextBody = fieldPattern.test(body)
    ? body.replace(fieldPattern, `- ${fieldName}：${value}`)
    : `- ${fieldName}：${value}\n${body}`;
  return replaceOutlineSection(raw, aliases, canonicalHeading, nextBody);
}

/** 只接纳本批要求章号的 H2-H4 章节块，避免模型重复输出污染合并结果。 */
export function extractRequestedChapterBlocks(raw: string, requested: number[]): Map<number, string> {
  const allowed = new Set(requested);
  const result = new Map<number, string>();
  const headingPattern = /^#{2,4}\s*第?\s*(\d+)\s*章[^\r\n]*$/gmu;
  const headings = [...raw.matchAll(headingPattern)];
  headings.forEach((heading, index) => {
    const chapterNumber = Number(heading[1]);
    if (!allowed.has(chapterNumber) || heading.index === undefined) return;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? raw.length;
    const body = raw.slice(start, end).replace(/^##\s+.+$/gmu, '').trim();
    result.set(chapterNumber, `### 第${chapterNumber}章\n${body}`.trim());
  });
  return result;
}

/**
 * 邻接窗口：本批章号前后各多少章给完整 canon。
 * 窗口外的章只留「章号 + 标题 + CEN」——足够模型判断「这事已经写过了」，
 * 但不会让 canon 随批次线性膨胀（50 章分 5 批时，末批本会背上前 40 章的全字段）。
 */
const CANON_DETAIL_WINDOW = 5;

export function compactContext(
  outline: ExecutableOutline,
  direction: OutlineDirection,
  excludeChapterNumbers: number[] = [],
): string {
  const excluded = new Set(excludeChapterNumbers);
  const detailFrom = excludeChapterNumbers.length > 0
    ? Math.min(...excludeChapterNumbers) - CANON_DETAIL_WINDOW
    : Number.NEGATIVE_INFINITY;
  const detailTo = excludeChapterNumbers.length > 0
    ? Math.max(...excludeChapterNumbers) + CANON_DETAIL_WINDOW
    : Number.POSITIVE_INFINITY;

  return JSON.stringify({
    direction,
    title: outline.title,
    oneLiner: outline.oneLiner,
    premise: outline.premise,
    storyEngine: outline.storyEngine,
    // 角色规划是续写合同的真源。定点拆章若看不到它，会继续沿用卷纲里的漏登姓名，
    // 最终形成“卷纲一套人、角色表另一套人”的不可写状态。
    canonicalCharacterNames: (outline.keyCharacters ?? []).map(character => character.name),
    keyCharacters: outline.keyCharacters ?? [],
    // 已登记地点表（地名真源）：拆章蓝图只能用这里的地点名，防跨层地名漂移
    registeredLocations: (outline.worldBuilding?.locations ?? []).map(
      location => location.name
    ),
    foreshadowPlan: outline.foreshadowPlan ?? [],
    volumePlan: outline.volumePlan,
    startupPack30: outline.startupPack30,
    existingChapterCanon: (outline.chapterBlueprints ?? [])
      .filter(blueprint => isUsableBlueprint(blueprint) && !excluded.has(blueprint.orderIndex))
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(blueprint => {
        const digest = {
          chapter: blueprint.orderIndex,
          title: blueprint.title,
          CEN: blueprint.CEN,
        };
        const isNearBatch =
          blueprint.orderIndex >= detailFrom && blueprint.orderIndex <= detailTo;
        return isNearBatch
          ? {
              ...digest,
              CBN: blueprint.CBN,
              CPNs: blueprint.CPNs,
              mustCover: blueprint.mustCover,
              forbiddenZones: blueprint.forbiddenZones,
            }
          : digest;
      }),
  }, null, 2);
}

const {
  titleMinChars,
  titleMaxChars,
  hookMinChars,
  hookMaxChars,
  minimumCpns,
  maximumCpns,
} = OUTLINE_COMPLETENESS_POLICY;

/**
 * 单章蓝图是续写的「合同」，节点质量直接决定正文质量。字数区间必须与
 * OUTLINE_COMPLETENESS_POLICY 保持一致，否则批量生成的蓝图会被硬门禁挡在应用之外。
 */
function buildChapterCompletionPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
  chapterNumbers: number[],
  issues: string[] = [],
): { system: string; user: string } {
  // 只说"区间是多少"不足以让模型改掉超长几个字的钩子，必须点名本次要修的具体违规
  const issueSection = issues.length > 0
    ? `\n\n【本次必须修掉的格式违规】\n${issues.map(issue => `- ${issue}`).join('\n')}\n改写时优先压缩到区间内，宁可删修饰语也不得超字数。`
    : '';
  // 伏笔时序禁令：埋设时点晚于本批任意章号的伏笔，其核心信息不得进入本批蓝图
  // （2026-09-10 glm 200 章实证：初版第 20 章蓝图要求「笔迹比对定性补账出自行家
  // 手笔」，伏笔台账却锁 22 章揭示——蓝图生成时 foreshadowPlan 只是惰性 JSON，
  // 无时序约束，写作端被夹死三连拒成洞）
  const batchMin = Math.min(...chapterNumbers);
  const embargoed = (outline.foreshadowPlan ?? []).filter(
    plan => plan.hint && plan.setupChapter !== null && plan.setupChapter > batchMin,
  );
  const foreshadowEmbargoSection = embargoed.length > 0
    ? `\n\n【本批伏笔时序禁令】以下伏笔的埋设时点晚于本批章号，其核心信息（hint 词面及同义表述）禁止出现在第${chapterNumbers[0]}-${chapterNumbers[chapterNumbers.length - 1]}章任何蓝图的 mustCover/CPNs/CEN 中；确需铺垫只可用不触及核心词面的暗痕，不得给出定性结论：\n${embargoed.map(plan => `- 「${plan.hint}」（埋设第${plan.setupChapter}章）`).join('\n')}`
    : '';
  return {
    system: `你是中文长篇网文大纲拆章器。只输出指定章号的单章蓝图，不复述已有章节，不输出解释。
每章必须严格使用以下结构：
### 第N章
- 标题：${titleMinChars}-${titleMaxChars}字的网文口语标题，要有画面/情绪/钩子，抓住本章最刺激的一点（打脸/翻车/反转/期限/秘密/意外）；禁止只写“第N章”。【超 ${titleMaxChars} 字即为格式错误：先砍修饰语和副词，再砍次要信息，宁可短不可超】
- 概要：40-80字，用一段话交代本章从哪儿起、中间怎么推、落到什么后果，写给作者看的章纲；必须比 CBN 多出信息量，禁止照抄 CBN/标题
- CBN：${hookMinChars}-${hookMaxChars}字的章首动作钩子，写开篇 10 秒抓人的瞬间画面或冲突，禁止整章剧情概括；必须以句号/叹号等终止符收尾
- CPNs：${minimumCpns}-${maximumCpns}个本章必须兑现的推进节点，每条独立可写成一个场面，用中文分号分隔
- CEN：${hookMinChars}-${hookMaxChars}字章尾悬念，要让读者必须点下一章；必须以终止符收尾
- mustCover：1-3个本章能完成的具体事件，用中文分号分隔，禁止整卷或全书级目标（如“完成…逆转”“实现…复兴”）
- 禁区：1-3条本章不得提前泄露的事项
- 章尾钩子文案：给读者看的一句钩子话术，区别于 CEN 的事件描述
- 爽点类型：打脸/碾压/反转/装逼/解谜/逆袭/立威/收服等
硬约束：
1. 标题、CBN、CEN 的字数必须落在上面给出的区间内，超出即为格式错误；
2. 一章只能承载一个核心转折（一次对决/一次破局/一次身份反转/一次关键抉择），禁止把两个独立高潮压进同一章；
3. 第 N 章必须承接第 N-1 章的 CEN 状态并推动到新状态，不得无视上章终态；
4. 逐章节奏必须落在“startupPack30.chapterBlocks”对应 5 章区块的目标、必出事件、必留钩子与本块禁区之内，不得提前兑现后续区块的爽点；
5. 所有字段都不得留空，禁止使用括号补充说明；
6. 地点必须使用“registeredLocations”里已登记的地点名，禁止自创新地名或同义变体（如已登记「江城市」就不得写「南江市」）；需要新场景时写成已登记地点的下属区域（如「江城市·南郊冷库」）；
7. 【伏笔时序锁】「本批伏笔时序禁令」清单列出的伏笔，其核心信息禁止出现在本批蓝图的 mustCover/CPNs/CEN 中——蓝图要求本章揭示而伏笔规定后章才许揭示时，写作端会被迫两头违约（拒稿成洞）。确需铺垫只可用不触及核心词面的暗痕（物件出现/旁人欲言又止），不得给出定性结论。
“existingChapterCanon”是不可改写的既有事实：新章不得重置期限、重复破案/入狱/升职等已完成事件，不得让已倒台或被羁押的反派无解释恢复原职。`,
    user: `【故事上下文】\n${compactContext(outline, direction, chapterNumbers)}${foreshadowEmbargoSection}\n\n【只需补写的章号】\n${chapterNumbers.join('、')}${issueSection}\n\n直接从“### 第${chapterNumbers[0]}章”开始输出。`,
  };
}

function buildCharacterCompletionPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
): { system: string; user: string } {
  return {
    system: `你是中文长篇网文角色架构师。输出“## 关键角色规划”完整替换节，至少 10 个互不重名的角色：主角1、核心盟友2、阶段反派3、贯穿反派1、终局反派1、功能型配角2。
卷纲 keyCharacters 中出现的每个具体姓名都必须逐一建档，不得另造同功能角色替换；“主角/九品书吏/司天监监正”等职位或身份标签不是姓名，不得单独建档。
每个角色严格使用：
#### 角色名或功能标签
- 姓名：
- 角色定位：主角/盟友/反派/导师/配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：起点 → 中段 → 终点
- 角色资源：用中文分号分隔
- 关系变化：用中文分号分隔
全部字段必须具体且非空，不输出任何解释。`,
    user: `【故事上下文】\n${compactContext(outline, direction)}\n\n请输出完整的“## 关键角色规划”替换节。`,
  };
}

function buildAdditionalCharacterPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
  count: number,
): { system: string; user: string } {
  return {
    system: `你是中文长篇网文角色架构师。现有角色数量不足，只输出恰好 ${count} 个新增角色块，不要重复现有姓名，不要输出二级标题或解释。
每个新增角色严格使用：
#### 新增角色功能标签
- 姓名：
- 角色定位：盟友/反派/导师/配角
- 剧情功能：
- 核心需求：
- 与主角张力：
- 最佳登场时机：
- 外显目标：
- 隐性需求：
- 核心创伤：
- 角色秘密：
- 角色转折点：
- 角色弧线：起点 → 中段 → 终点
- 角色资源：用中文分号分隔
- 关系变化：用中文分号分隔
所有字段必须具体且非空。`,
    user: `【故事上下文】\n${compactContext(outline, direction)}\n\n【禁止重复的现有姓名】\n${outline.keyCharacters.map(character => character.name).join('、')}\n\n请只补 ${count} 个新增角色块。`,
  };
}

function buildForeshadowCompletionPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
): { system: string; user: string } {
  return {
    system: `你是中文长篇网文伏笔架构师。输出“## 伏笔规划”完整替换节，共 10 条互不重复的伏笔：短伏笔3、中伏笔3、长伏笔2、终局伏笔2。
每条严格使用：
#### 短伏笔1/中伏笔1/长伏笔1/终局伏笔1
- 伏笔内容：
- 伏笔类型：物品/对话/事件/谜团/角色/能力/身份/关系/世界规则
- 重要级别：主线/支线/情感
- 埋设阶段：
- 埋设章节：第N章
- 回收阶段：
- 回收章节：第N章
- 载体角色：
- 关联冲突：
- 回收收益：
时间顺序必须合法，内容必须能在正文中用具体证据埋设和回收，全部字段非空，不输出解释。`,
    user: `【故事上下文】\n${compactContext(outline, direction)}\n\n请输出完整的“## 伏笔规划”替换节。`,
  };
}

function buildAdditionalForeshadowPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
  count: number,
): { system: string; user: string } {
  return {
    system: `你是中文长篇网文伏笔架构师。现有伏笔数量不足，只输出恰好 ${count} 个新增伏笔块，不要重复已有内容，不要输出二级标题或解释。
每条严格使用：
#### 补充伏笔N
- 伏笔内容：
- 伏笔类型：物品/对话/事件/谜团/角色/能力/身份/关系/世界规则
- 重要级别：主线/支线/情感
- 埋设阶段：
- 埋设章节：第N章
- 回收阶段：
- 回收章节：第N章
- 载体角色：
- 关联冲突：
- 回收收益：
时间顺序合法，所有字段必须具体且非空。`,
    user: `【故事上下文】\n${compactContext(outline, direction)}\n\n【已有伏笔，禁止重复】\n${outline.foreshadowPlan.map(item => item.hint).join('；')}\n\n请只补 ${count} 个新增伏笔块。`,
  };
}

const CHARACTER_REFERENCE_BLOCKER_RE = /引用了未登记角色「([^」]+)」/u;
const PROTAGONIST_MISMATCH_RE = /主角「([^」]+)」未进入关键角色规划/u;

/**
 * 中文姓名合理性判定已移至 parser/utils（大纲解析层与补登记清单共用同一口径）：
 * 解析层拒收「姓名」字段被描述污染的角色块（2026-08-24 冒烟：模型把「关系变化」
 * 首句「由初期的公事公办」错填进姓名字段），这里 re-export 保持补登记链路兼容。
 */
export { isLikelyCharacterName };

/**
 * 从门禁 blockers 中提取所有未登记角色名（unknown-character-reference 的
 * 「引用了未登记角色「X」」与 protagonist-name-mismatch 的「主角「X」未进入」
 * 两种文案），按出现顺序去重。提取失败（文案变化等）返回空数组，调用方按
 * 「无修复目标」处理。
 */
export function findUnregisteredCharacterNames(
  blockers: OutlineCompletenessBlocker[],
): string[] {
  const names: string[] = [];
  const collect = (raw: string | undefined): void => {
    if (!raw) return;
    const name = raw.trim();
    if (!isLikelyCharacterName(name)) return;
    if (!names.includes(name)) names.push(name);
  };
  for (const blocker of blockers) {
    collect(CHARACTER_REFERENCE_BLOCKER_RE.exec(blocker.message)?.[1]);
    collect(PROTAGONIST_MISMATCH_RE.exec(blocker.message)?.[1]);
  }
  return names;
}

export interface CompleteOutlineResult {
  rawText: string;
  outline: ExecutableOutline;
  warnings: string[];
}

/** 从门禁 blockers 提取未登记地点名（unknown-location-reference 文案），按出现顺序去重 */
export function findUnregisteredLocationNames(
  blockers: OutlineCompletenessBlocker[],
): string[] {
  const locations: string[] = [];
  const pattern = /引用了未登记地点「([^」]+)」/u;
  for (const blocker of blockers) {
    if (blocker.kind !== 'unknown-location-reference') continue;
    const matched = pattern.exec(blocker.message)?.[1]?.trim();
    if (matched && !locations.includes(matched)) locations.push(matched);
  }
  return locations;
}

/**
 * 未登记地点定向补登记：把卷纲/蓝图引用了但不在「世界与势力规划」地点表里的
 * 地名，确定性追加到「### 核心地点」子段（无需 AI：地点条目是结构化字段，
 * 模型原文已经在用它，只需登记入表）。与 repairUnregisteredCharacters 对称——
 * 没有修复通道时该门禁会把整份大纲 fail-closed 只能整体重试。
 */
export function repairUnregisteredLocations(params: {
  rawText: string;
  outline: ExecutableOutline;
  locationNames: string[];
}): CompleteOutlineResult {
  const { locationNames } = params;
  let rawText = params.rawText;
  let outline = params.outline;
  const warnings: string[] = [];
  if (locationNames.length === 0) return { rawText, outline, warnings };

  // 地点条目必须落在「### 核心地点」子段内（parser 按该子段切 #### 块），
  // 且带 名称/层级/剧情功能 字段（functionInStory 为空的条目会被过滤）。
  const locationSectionPattern = /(^#{2,}\s*核心地点[^\n]*$)/mu;
  if (!locationSectionPattern.test(rawText)) {
    warnings.push(`世界规划缺「核心地点」子段，${locationNames.length} 个地点无法补登记`);
    return { rawText, outline, warnings };
  }
  const appended = locationNames
    .map(
      name =>
        `#### ${name}\n- 名称：${name}\n- 层级：city\n- 剧情功能：卷纲与章节蓝图引用的地点，补登记入表。`
    )
    .join('\n\n');
  // 追加到核心地点子段末尾 = 下一个同级/更高级标题之前。锚定下一个标题行插入。
  rawText = rawText.replace(
    locationSectionPattern,
    (_match, heading: string) => `${heading}\n${appended}\n`
  );
  const nextOutline = parseExpandedOutline(rawText);
  if (nextOutline) outline = nextOutline;

  // 地点命中已降级为 warnings（不 fail-closed），补登记通道合并读取两个数组
  const recheck = inspectOutlineCompleteness(outline);
  const stillMissing = findUnregisteredLocationNames([
    ...recheck.blockers,
    ...(recheck.warnings ?? []),
  ]);
  const fixedCount = locationNames.filter(name => !stillMissing.includes(name)).length;
  if (fixedCount > 0) {
    warnings.push(`未登记地点已补登记 ${fixedCount}/${locationNames.length} 个`);
  }
  if (stillMissing.length > 0) {
    warnings.push(`仍有 ${stillMissing.length} 个未登记地点：${stillMissing.join('、')}`);
  }
  return { rawText, outline, warnings };
}

/**
 * 截断到 maxChars 个字符（按 Unicode code point，中文一字一计），保证不切在代理对中间。
 */
function truncateByChars(value: string, maxChars: number): string {
  const chars = [...value];
  if (chars.length <= maxChars) return value;
  return chars.slice(0, maxChars).join('').trim();
}

/**
 * 钩子句（CBN/CEN）超长时的本地收缩：优先按标点/连接符切到包含 maxChars 的最近分句，
 * 找不到分句再按子句边界反向收口（见 truncateAtClauseBoundary）。AI 产出超 1-16 字
 * 是常态小偏差（2026-08-15 冒烟 22/50 章超长，整章重写每批 1-10 分钟还不收敛），
 * 本地收口语义损失极小且零请求成本。
 */
/**
 * 硬截断兜底：按字数切会产出「…的隐」「…众人眼」这类残句（《绝症当虫治》2026-08-26
 * 审查实测 31/50 章）。回退策略改为反向扫描：从 maxChars 位置向左找最近的分句边界，
 * 在那里收口；找不到分句再找结构助词后沿；仍找不到（极端无标点长串）才按字数切。
 */
function truncateAtClauseBoundary(value: string, maxChars: number): string {
  const chars = [...value];
  if (chars.length <= maxChars) return value;

  const separators = /[，。；;、….!！?？：:——]/u;
  for (let i = maxChars; i >= Math.floor(maxChars / 2); i -= 1) {
    if (separators.test(chars[i - 1])) {
      return chars.slice(0, i).join('').replace(/[，。；;、….!！?？]+$/u, '').trim();
    }
  }
  // 次选：结构助词/连接词后收口（「…的」「…了」），语义完整度远高于切在词中间。
  const tailWords = /^(?:的|了|着|地|过|与|和|在|向|往|到|被|把|将)/u;
  for (let i = maxChars; i >= Math.floor(maxChars / 2); i -= 1) {
    if (tailWords.test(chars[i])) {
      return chars.slice(0, i).join('').trim();
    }
  }
  return truncateByChars(value.trimEnd(), maxChars);
}

/** 钩子文案必须以终止符收尾（书审预检红线）：无句读结尾的 CBN/CEN 会让
 *  「上一章刚发生什么」读起来像半截话，也是跨章衔接质量问题的信号源 */
const HOOK_TERMINATOR_RE = /[。！？…”』」]$/u;

function ensureHookTerminator(value: string, maxChars: number): string {
  const trimmed = value.replace(/[，、；;]+$/u, '').trim();
  if (HOOK_TERMINATOR_RE.test(trimmed)) return trimmed;
  // 补终止符预算不足时先按字数回退一位再补，保证不超上限
  if ([...trimmed].length + 1 > maxChars) {
    const shrunkContent = [...trimmed].slice(0, maxChars - 1).join('');
    return `${shrunkContent}。`;
  }
  return `${trimmed}。`;
}

export function shrinkHookText(hook: string, maxChars: number): string {
  const source = hook.trim();
  const trimmedHook = source.replace(/[。；;.!！?？,，、]+$/u, '');
  if (trimmedHook.length <= maxChars) {
    const keepOriginal = source.trimEnd();
    if (
      keepOriginal !== trimmedHook &&
      HOOK_TERMINATOR_RE.test(keepOriginal) &&
      [...keepOriginal].length <= maxChars
    ) {
      return keepOriginal;
    }
    // 入参可能恰在上限（无预算补终止符）或带终止符即超限时，
    // 交给 ensureHookTerminator 按内容预算截断后统一补终止符
    return ensureHookTerminator(truncateAtClauseBoundary(trimmedHook, Math.max(1, maxChars - 1)), maxChars);
  }
  const separators = /[，。；;、——….!！?？]/u;
  const chars = [...trimmedHook];
  const contentBudget = Math.max(1, maxChars - 1);
  // 收集不超过内容预算的分句边界，取最后一个（预留 1 字给终止符）
  let cutIndex = -1;
  let acc = 0;
  for (let i = 0; i < chars.length && acc <= contentBudget; i += 1) {
    acc += 1;
    if (separators.test(chars[i])) cutIndex = i;
  }
  if (cutIndex >= Math.floor(contentBudget / 2)) {
    return ensureHookTerminator(chars.slice(0, cutIndex).join('').replace(/[，、]+$/u, ''), maxChars);
  }
  return ensureHookTerminator(truncateAtClauseBoundary(trimmedHook, contentBudget), maxChars);
}

/**
 * 门禁章级字段超长的本地 sanitize：标题、CBN、CEN 超上限时按规则收缩到区间内，
 * 不足下限的（信息量太少，本地造不出）仍留给 AI 定点修复。
 * 返回 null 表示无需修改。
 */
export function sanitizeBlueprintLengths(
  blueprint: ChapterBlueprint,
  policy: {
    titleMinChars: number;
    titleMaxChars: number;
    hookMinChars: number;
    hookMaxChars: number;
  },
): ChapterBlueprint | null {
  const changes: string[] = [];
  let title = blueprint.title.trim();
  if (title.length > policy.titleMaxChars) {
    title = truncateByChars(title, policy.titleMaxChars);
    if (title.length >= policy.titleMinChars) {
      changes.push(`标题超长已截断`);
    } else {
      title = blueprint.title.trim();
    }
  }
  let CBN = blueprint.CBN;
  let CEN = blueprint.CEN;
  if (CBN.trim().length > policy.hookMaxChars) {
    const shrunk = shrinkHookText(CBN, policy.hookMaxChars);
    if (shrunk.length >= policy.hookMinChars) {
      CBN = shrunk;
      changes.push('CBN 超长已收缩');
    }
  }
  if (CEN.trim().length > policy.hookMaxChars) {
    const shrunk = shrinkHookText(CEN, policy.hookMaxChars);
    if (shrunk.length >= policy.hookMinChars) {
      CEN = shrunk;
      changes.push('CEN 超长已收缩');
    }
  }
  if (changes.length === 0) return null;
  return { ...blueprint, title, CBN, CEN };
}

/**
 * 门禁章级超长缺陷的批量本地 sanitize：对所有蓝图应用 sanitizeBlueprintLengths，
 * 有任一章被修改时重写「单章蓝图」段并重新解析。零 AI 请求成本。
 * 返回 null 表示全部蓝图都在区间内、无需修改。
 */
export function sanitizeOutlineHookLengths(
  rawText: string,
  outline: ExecutableOutline,
): { rawText: string; outline: ExecutableOutline; warnings: string[] } | null {
  const blueprints = outline.chapterBlueprints ?? [];
  if (blueprints.length === 0) return null;
  const sanitizedByOrder = new Map<number, ChapterBlueprint>();
  const touched: number[] = [];
  for (const blueprint of blueprints) {
    const sanitized = sanitizeBlueprintLengths(blueprint, {
      titleMinChars: OUTLINE_COMPLETENESS_POLICY.titleMinChars,
      titleMaxChars: OUTLINE_COMPLETENESS_POLICY.titleMaxChars,
      hookMinChars: OUTLINE_COMPLETENESS_POLICY.hookMinChars,
      hookMaxChars: OUTLINE_COMPLETENESS_POLICY.hookMaxChars,
    });
    if (sanitized) {
      sanitizedByOrder.set(blueprint.orderIndex, sanitized);
      touched.push(blueprint.orderIndex);
    }
  }
  if (touched.length === 0) return null;

  const nextRawText = replaceOutlineSection(
    rawText,
    BLUEPRINT_SECTION_ALIASES,
    BLUEPRINT_SECTION_ALIASES[0],
    blueprints
      .map(blueprint => sanitizedByOrder.get(blueprint.orderIndex) ?? blueprint)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(serializeBlueprint)
      .join('\n\n'),
  );
  const nextOutline = parseExpandedOutline(nextRawText);
  return {
    rawText: nextRawText,
    outline: nextOutline ?? outline,
    warnings: [
      `本地收缩超长标题/CBN/CEN 共 ${touched.length} 章（第 ${touched.join('、')} 章），未发 AI 请求`,
    ],
  };
}

/** 单章蓝图每批最大章数：批越大越容易踩网关的非流式输出上限 */
export const CHAPTER_BLUEPRINT_BATCH_SIZE = 10;

export const BLUEPRINT_SECTION_ALIASES = ['单章蓝图', '逐章蓝图'];

/**
 * 分批生成/重写指定章号的单章蓝图。
 *
 * 每批独立请求，批内逐章拼回「## 单章蓝图」再解析，只有解析出可用蓝图才覆盖旧值，
 * 因此模型漏答或答坏时保留原有内容，不会把已有好章洗掉。
 */
export async function repairChapterBlueprints(params: {
  rawText: string;
  outline: ExecutableOutline;
  direction: OutlineDirection;
  options: GenerateOptions;
  callStructuredTextMode: StructuredTextCaller;
  chapterNumbers: number[];
  phase: '补全' | '定点修复';
  onProgress?: (message: string) => void;
  /** 章号 → 该章需要修掉的具体违规描述 */
  issuesByChapter?: Map<number, string[]>;
}): Promise<CompleteOutlineResult> {
  const { chapterNumbers, phase, onProgress, issuesByChapter } = params;
  let rawText = params.rawText;
  let outline = params.outline;
  const warnings: string[] = [];
  if (chapterNumbers.length === 0) return { rawText, outline, warnings };

  const usableBlueprints = new Map<number, ChapterBlueprint>();
  for (const blueprint of outline.chapterBlueprints ?? []) {
    if (isUsableBlueprint(blueprint)) usableBlueprints.set(blueprint.orderIndex, blueprint);
  }

  const batches: number[][] = [];
  for (let index = 0; index < chapterNumbers.length; index += CHAPTER_BLUEPRINT_BATCH_SIZE) {
    batches.push(chapterNumbers.slice(index, index + CHAPTER_BLUEPRINT_BATCH_SIZE));
  }

  /**
   * 单批请求（含空响应退避重试）。prompt 基于传入的 outline 快照构建；
   * 并发模式下所有批次共用进入时的快照——canon 只带邻接窗口（±5 章），
   * 跨批新鲜度差异可忽略，换来的是 5 批 10 章从串行 5 次往返折叠为 ~2 次。
   */
  const requestBatch = async (batch: number[], outlineForPrompt: ExecutableOutline): Promise<string> => {
    const batchIssues = batch.flatMap(no => issuesByChapter?.get(no) ?? []);
    const prompt = buildChapterCompletionPrompt(outlineForPrompt, params.direction, batch, batchIssues);

    // 批次级瞬态重试：空响应（「成功」返回 0 字）与瞬态异常（网关断流/429/5xx）都退避重试。
    // 空响应有两种形态：请求层抛「API 未返回内容」，或调用器正常返回空串（mock/部分网关）。
    // 断流等瞬态异常此前直接上抛——并发池里一个批次挂掉整轮作废（2026-08-16 矩阵实测），
    // 这里吞掉退避重试；重试后仍失败才上抛给外层。用户取消（signal 已 abort）不重试。
    const MAX_EMPTY_BATCH_ATTEMPTS = 3;
    let generated = '';
    for (let attempt = 1; attempt <= MAX_EMPTY_BATCH_ATTEMPTS; attempt += 1) {
      try {
        generated = await params.callStructuredTextMode(
          prompt.system,
          prompt.user,
          { ...params.options, temperature: phase === '定点修复' ? 0.2 : 0.35 },
        );
      } catch (error) {
        if (isAbortedError(error, params.options.signal)) throw error;
        const message = error instanceof Error ? error.message : String(error);
        if (!EMPTY_RESPONSE_RE.test(message) && !isTransientError(error)) {
          throw error;
        }
        generated = '';
        if (attempt < MAX_EMPTY_BATCH_ATTEMPTS) {
          const delayMs = retryBackoffDelayMs('network', attempt, 2000, 10_000);
          warnings.push(
            `单章蓝图${phase}批次 ${batch[0]}-${batch.at(-1)} 瞬态失败（第 ${attempt} 次，${message.slice(0, 60)}），${delayMs}ms 后重试`,
          );
          onProgress?.(`单章蓝图批次瞬态失败，重试 ${attempt}/${MAX_EMPTY_BATCH_ATTEMPTS - 1}...`);
          await sleep(delayMs);
          continue;
        }
        throw error;
      }
      if (generated.trim()) break;
      if (attempt < MAX_EMPTY_BATCH_ATTEMPTS) {
        const delayMs = retryBackoffDelayMs('network', attempt, 2000, 10_000);
        warnings.push(
          `单章蓝图${phase}批次 ${batch[0]}-${batch.at(-1)} 返回空响应（第 ${attempt} 次），${delayMs}ms 后重试`,
        );
        onProgress?.(`单章蓝图批次返回空响应，重试 ${attempt}/${MAX_EMPTY_BATCH_ATTEMPTS - 1}...`);
        await sleep(delayMs);
      }
    }
    return generated;
  };

  /** 把一批响应里的章块合入 usableBlueprints 并重写蓝图段；疑似截断时小批补发 */
  const mergeBatch = async (batch: number[], generated: string): Promise<void> => {
    // 伏笔时序消毒基底：初版蓝图此前只被 outline-reviewer 事后报 issue、无修复链，
    // 与伏笔埋设时点冲突的节点会把写作端夹进「履约即提前揭示」死锁
    // （2026-09-10 glm 200 章实证 ch20 三连拒成洞）。剥掉的条目由 heal/修复轮兜底。
    const timingHints: ForeshadowTimingHint[] = (outline.foreshadowPlan ?? [])
      .filter(plan => plan.hint && (plan.setupChapter ?? 0) > 0)
      .map(plan => ({
        hint: plan.hint,
        createdChapter: plan.setupChapter ?? 0,
        setupChapter: plan.setupChapter ?? 0,
        payoffChapter: plan.payoffChapter ?? 0,
      }));
    const stitchBlock = (chapterNumber: number, block: string): void => {
      const stitchRaw = (bpBlock: string): void => {
        const stitched = replaceOutlineSection(
          rawText,
          BLUEPRINT_SECTION_ALIASES,
          BLUEPRINT_SECTION_ALIASES[0],
          [
            ...[...usableBlueprints.values()]
              .filter(blueprint => blueprint.orderIndex !== chapterNumber)
              .map(serializeBlueprint),
            bpBlock,
          ].join('\n\n'),
        );
        const parsed = parseExpandedOutline(stitched);
        const parsedBlueprint = parsed?.chapterBlueprints?.find(
          item => item.orderIndex === chapterNumber,
        );
        if (parsed && isUsableBlueprint(parsedBlueprint)) {
          usableBlueprints.set(chapterNumber, parsedBlueprint);
        }
      };
      stitchRaw(block);
      const parsed = usableBlueprints.get(chapterNumber);
      if (parsed) {
        const { blueprint: clean, dropped } = dropForeshadowConflictingItems(parsed, timingHints);
        if (dropped.length > 0) {
          warnings.push(
            `单章蓝图${phase}第 ${chapterNumber} 章伏笔时序消毒：删除 ${JSON.stringify(dropped)}`,
          );
          stitchRaw(serializeBlueprint(clean));
        }
      }
    };
    const rebuildSection = (): void => {
      rawText = replaceOutlineSection(
        rawText,
        BLUEPRINT_SECTION_ALIASES,
        BLUEPRINT_SECTION_ALIASES[0],
        [...usableBlueprints.values()]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map(serializeBlueprint)
          .join('\n\n'),
      );
      outline = parseExpandedOutline(rawText) ?? outline;
    };

    const blocks = extractRequestedChapterBlocks(generated, batch);
    for (const [chapterNumber, block] of blocks) {
      stitchBlock(chapterNumber, block);
      if (!usableBlueprints.has(chapterNumber)) {
        warnings.push(
          `单章蓝图${phase}批次第 ${chapterNumber} 章响应不可用（解析失败或字段缺失），本章保留原稿`,
        );
      }
    }
    rebuildSection();

    // 批次响应明显偏短（<120 字/章，正常每章 250-400 字）视为网关吐了半截：
    // 只记 warning 放过的话，这批章在定点修复轮全部原样漏掉，门禁原样复现，
    // 外层只能整体重试（2026-08-15 冒烟：修复批次 328 字符/10 章 → 两轮全损）。
    // 这里按章号拆小批（每批 3 章）立即补一次，再不齐就留给外层重试。
    const missing = batch.filter(no => !usableBlueprints.has(no));
    if (
      missing.length > 0
      && phase === '定点修复'
      && (blocks.size === 0 || generated.length < missing.length * 120)
      && missing.length <= CHAPTER_BLUEPRINT_BATCH_SIZE
    ) {
      onProgress?.(
        `定点修复批次 ${batch[0]}-${batch.at(-1)} 响应疑似截断（${generated.length} 字符），按 3 章小批补发...`,
      );
      const smallBatches: number[][] = [];
      for (let mi = 0; mi < missing.length; mi += 3) {
        smallBatches.push(missing.slice(mi, mi + 3));
      }
      for (const smallBatch of smallBatches) {
        let smallGenerated = '';
        try {
          smallGenerated = await requestBatch(smallBatch, outline);
        } catch (error) {
          // 只上抛用户取消（signal 已 abort）；网关断流的 AbortError 记 warning 走小批继续
          if (isAbortedError(error, params.options.signal)) throw error;
          warnings.push(
            `定点修复小批 ${smallBatch.join('、')} 请求失败：${error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120)}`,
          );
          continue;
        }
        const smallBlocks = extractRequestedChapterBlocks(smallGenerated, smallBatch);
        for (const [chapterNumber, block] of smallBlocks) {
          stitchBlock(chapterNumber, block);
        }
        rebuildSection();
        warnings.push(
          `定点修复小批补发 ${smallBatch.join('、')} 章：解出 ${smallBlocks.size}/${smallBatch.length} 章`,
        );
      }
    }
    const missingAfterRetry = batch.filter(no => !usableBlueprints.has(no));
    if (missingAfterRetry.length > 0) {
      warnings.push(
        `单章蓝图${phase}批次 ${batch[0]}-${batch.at(-1)} 仍有 ${missingAfterRetry.length}/${batch.length} 章未解出（第 ${missingAfterRetry.join('、')} 章）`,
      );
    }
  };

  /** 简单并发池：最多 limit 个批次请求在途 */
  const runWithConcurrency = async (
    tasks: Array<() => Promise<void>>,
    limit: number,
  ): Promise<void> => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= tasks.length) return;
        await tasks[index]();
      }
    });
    await Promise.all(workers);
  };

  const batchConcurrency = readPositiveIntEnv('MOLIU_OUTLINE_BATCH_CONCURRENCY') ?? 3;
  if (batchConcurrency > 1 && batches.length > 1) {
    onProgress?.(
      `并发${phase}单章蓝图 ${batches.length} 批（每批 ${CHAPTER_BLUEPRINT_BATCH_SIZE} 章，并发 ${Math.min(batchConcurrency, batches.length)}）...`,
    );
    const results = new Map<number[], string>();
    let lastPoolError: unknown;
    await runWithConcurrency(
      batches.map(batch => async () => {
        try {
          const generated = await requestBatch(batch, outline);
          results.set(batch, generated);
        } catch (error) {
          // 用户取消必须立刻终止整轮。其余批次重试耗尽后只记账不扩散：
          // Promise.all 一拒全弃会丢掉已成功批次（2026-08-18 opencode 矩阵实测：
          // 批1 成功 227s，批2/3 耗尽重试后整轮作废，expandDirection 返回 null），
          // 缺章交给「定点修复」轮按批补发。
          if (isAbortedError(error, params.options.signal)) throw error;
          lastPoolError = error;
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(
            `单章蓝图${phase}批次 ${batch[0]}-${batch.at(-1)} 重试耗尽仍失败：${message.slice(0, 120)}`,
          );
        }
      }),
      batchConcurrency,
    );
    if (results.size === 0 && lastPoolError !== undefined) {
      // 一批都没成：无成果可保，上抛触发外层整体重试（降温）
      throw lastPoolError instanceof Error ? lastPoolError : new Error(String(lastPoolError));
    }
    for (const batch of batches) {
      await mergeBatch(batch, results.get(batch) ?? '');
    }
  } else {
    const batchCount = batches.length;
    let succeededBatches = 0;
    let lastSerialError: unknown;
    for (const [batchIndex, batch] of batches.entries()) {
      onProgress?.(
        `正在${phase}单章蓝图 第${batch[0]}-${batch.at(-1)}章（${batchIndex + 1}/${batchCount}）...`,
      );
      let generated: string;
      try {
        generated = await requestBatch(batch, outline);
      } catch (error) {
        if (isAbortedError(error, params.options.signal)) throw error;
        lastSerialError = error;
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(
          `单章蓝图${phase}批次 ${batch[0]}-${batch.at(-1)} 重试耗尽仍失败：${message.slice(0, 120)}`,
        );
        continue;
      }
      succeededBatches += 1;
      await mergeBatch(batch, generated);
    }
    if (succeededBatches === 0 && lastSerialError !== undefined) {
      throw lastSerialError instanceof Error ? lastSerialError : new Error(String(lastSerialError));
    }
  }

  return { rawText, outline, warnings };
}

/**
 * 大纲文本的零宽/控制类不可见字符清洗。
 * 模型产出实测会在字段末尾混入 U+200B 等零宽字符：门禁长度判定、
 * 续写合同的 mustCover 匹配全部被它干扰（normalizeContractKey 侧已做兜底，
 * 但落库文本本身干净才是治本）。只清零宽/格式控制类，不动正文标点。
 */
export function stripInvisibleOutlineChars(rawText: string): string {
  if (!/[\u200b-\u200f\u2060\ufeff]/u.test(rawText)) return rawText;
  return rawText.replace(/[\u200b-\u200f\u2060\ufeff]/gu, '');
}

/**
 * 单章蓝图常规就走这里分批生成：主请求只产出启动包与卷纲，逐章拆解每批最多 10 章，
 * 角色与伏笔独立请求，避免把 50 章 + 10 角色 + 10 伏笔塞进一次输出触发网关超时或截断。
 */
export async function completeIncompleteOutline(params: {
  rawText: string;
  outline: ExecutableOutline;
  direction: OutlineDirection;
  options: GenerateOptions;
  callStructuredTextMode: StructuredTextCaller;
  onProgress?: (message: string) => void;
}): Promise<CompleteOutlineResult> {
  let rawText = params.rawText;
  let outline = params.outline;
  const warnings: string[] = [];

  const runBlueprintRepair = async (
    chapterNumbers: number[],
    phase: '补全' | '定点修复',
  ): Promise<void> => {
    const repaired = await repairChapterBlueprints({
      rawText,
      outline,
      direction: params.direction,
      options: params.options,
      callStructuredTextMode: params.callStructuredTextMode,
      chapterNumbers,
      phase,
      onProgress: params.onProgress,
    });
    rawText = repaired.rawText;
    outline = repaired.outline;
    warnings.push(...repaired.warnings);
  };

  await runBlueprintRepair(findIncompleteChapterNumbers(outline), '补全');

  if (!outline.startupPack30.openingHook.trim()) {
    const firstChapterHook = outline.chapterBlueprints
      ?.find(blueprint => blueprint.orderIndex === 1)
      ?.CBN.trim();
    if (firstChapterHook) {
      rawText = replaceSectionField(
        rawText,
        STARTUP_PACK_SECTION_ALIASES,
        STARTUP_PACK_SECTION_ALIASES[0],
        '开篇钩子',
        firstChapterHook.slice(0, 35),
      );
      outline = parseExpandedOutline(rawText) ?? outline;
      warnings.push('主方案缺少开篇钩子，已用首章 CBN 回填');
    }
  }

  if (outline.keyCharacters.length < OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters) {
    const prompt = buildCharacterCompletionPrompt(outline, params.direction);
    const generated = await callTextWithEmptyRetry(
      { ...prompt, options: { ...params.options, temperature: 0.35 }, callStructuredTextMode: params.callStructuredTextMode },
    );
    if (isEmptyResponse(generated)) {
      warnings.push('关键角色规划补全返回空响应，已跳过替换（保留原节内容）');
    } else {
      rawText = replaceOutlineSection(
        rawText,
        ['关键角色规划', '关键角色'],
        '关键角色规划',
        extractOutlineSectionBody(generated, ['关键角色规划', '关键角色']),
      );
      outline = parseExpandedOutline(rawText) ?? outline;
    }
    for (
      let round = 0;
      round < 2 && outline.keyCharacters.length < OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters;
      round += 1
    ) {
      const missing = OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters - outline.keyCharacters.length;
      const supplementPrompt = buildAdditionalCharacterPrompt(outline, params.direction, missing);
      const supplement = await callTextWithEmptyRetry(
        { ...supplementPrompt, options: { ...params.options, temperature: 0.3 }, callStructuredTextMode: params.callStructuredTextMode },
      );
      if (isEmptyResponse(supplement)) {
        warnings.push('关键角色规划补量返回空响应，已跳过合并');
        break;
      }
      const existingBody = extractOutlineSectionBody(rawText, ['关键角色规划', '关键角色']);
      rawText = replaceOutlineSection(
        rawText,
        ['关键角色规划', '关键角色'],
        '关键角色规划',
        `${existingBody}\n\n${extractOutlineSectionBody(supplement, ['关键角色规划', '关键角色'])}`,
      );
      outline = parseExpandedOutline(rawText) ?? outline;
    }
  }

  if (outline.foreshadowPlan.length < OUTLINE_COMPLETENESS_POLICY.minimumForeshadows) {
    const prompt = buildForeshadowCompletionPrompt(outline, params.direction);
    const generated = await callTextWithEmptyRetry(
      { ...prompt, options: { ...params.options, temperature: 0.3 }, callStructuredTextMode: params.callStructuredTextMode },
    );
    if (isEmptyResponse(generated)) {
      warnings.push('伏笔规划补全返回空响应，已跳过替换（保留原节内容）');
    } else {
      rawText = replaceOutlineSection(
        rawText,
        ['伏笔规划'],
        '伏笔规划',
        extractOutlineSectionBody(generated, ['伏笔规划']),
      );
      outline = parseExpandedOutline(rawText) ?? outline;
    }
    for (
      let round = 0;
      round < 2 && outline.foreshadowPlan.length < OUTLINE_COMPLETENESS_POLICY.minimumForeshadows;
      round += 1
    ) {
      const missing = OUTLINE_COMPLETENESS_POLICY.minimumForeshadows - outline.foreshadowPlan.length;
      const supplementPrompt = buildAdditionalForeshadowPrompt(outline, params.direction, missing);
      const supplement = await callTextWithEmptyRetry(
        { ...supplementPrompt, options: { ...params.options, temperature: 0.25 }, callStructuredTextMode: params.callStructuredTextMode },
      );
      if (isEmptyResponse(supplement)) {
        warnings.push('伏笔规划补量返回空响应，已跳过合并');
        break;
      }
      const existingBody = extractOutlineSectionBody(rawText, ['伏笔规划']);
      rawText = replaceOutlineSection(
        rawText,
        ['伏笔规划'],
        '伏笔规划',
        `${existingBody}\n\n${extractOutlineSectionBody(supplement, ['伏笔规划'])}`,
      );
      outline = parseExpandedOutline(rawText) ?? outline;
    }
  }

  for (let round = 0; round < 2; round += 1) {
    const incompleteChapters = findIncompleteChapterNumbers(outline);
    if (incompleteChapters.length === 0) break;
    warnings.push(
      `单章蓝图补全后仍有 ${incompleteChapters.length} 章不完整，执行第 ${round + 1} 轮定点修复：${incompleteChapters.join('、')}`,
    );
    await runBlueprintRepair(incompleteChapters, '定点修复');
  }

  // 未登记角色 / 章级门禁缺陷等语义修复不在这里做：补全只负责把结构补齐，
  // 修复交给 OutlineAgent（agent/OutlineAgent.ts）按工具多轮读写完成。

  // 出口清洗零宽字符：补全/修复各环节都可能从模型响应拼入 U+200B 之类不可见字符
  // （2026-08-16 冒烟：ch3 mustCover 尾部一个零宽空格导致续写履约匹配 3 轮全灭）。
  const cleanedRawText = stripInvisibleOutlineChars(rawText);
  if (cleanedRawText !== rawText) {
    rawText = cleanedRawText;
    outline = parseExpandedOutline(rawText) ?? outline;
    warnings.push('已清洗大纲文本中的零宽/不可见字符');
  }

  return { rawText, outline, warnings };
}
