import type { GenerateOptions } from './unified-generator';
import type { OutlineDirection } from '../types/direction';
import type {
  ChapterBlueprint,
  ExecutableOutline,
} from '../types/executable-outline';
import { parseExpandedOutline } from '../parser/expanded-outline-parser';
import { OUTLINE_COMPLETENESS_POLICY } from '../validation/outlineCompleteness';

type StructuredTextCaller = (
  system: string,
  user: string,
  options: GenerateOptions,
) => Promise<string>;

const PLACEHOLDER_TITLE_RE =
  /^第[一二三四五六七八九十百千零\d]+章(?:\s*[（(]?未命名[)）]?)?$/u;

/** 启动包小节标题：首项为当前规范写法，其余为历史稿件兼容别名 */
const STARTUP_PACK_SECTION_ALIASES = [
  `前${OUTLINE_COMPLETENESS_POLICY.startupChapterCount}章启动包`,
  '前30章启动包',
];

function isUsableBlueprint(blueprint: ChapterBlueprint | undefined): blueprint is ChapterBlueprint {
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

function serializeBlueprint(blueprint: ChapterBlueprint): string {
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

export function compactContext(
  outline: ExecutableOutline,
  direction: OutlineDirection,
  excludeChapterNumbers: number[] = [],
): string {
  const excluded = new Set(excludeChapterNumbers);
  return JSON.stringify({
    direction,
    title: outline.title,
    oneLiner: outline.oneLiner,
    premise: outline.premise,
    storyEngine: outline.storyEngine,
    volumePlan: outline.volumePlan,
    startupPack30: outline.startupPack30,
    existingChapterCanon: (outline.chapterBlueprints ?? [])
      .filter(blueprint => isUsableBlueprint(blueprint) && !excluded.has(blueprint.orderIndex))
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map(blueprint => ({
        chapter: blueprint.orderIndex,
        title: blueprint.title,
        CBN: blueprint.CBN,
        CPNs: blueprint.CPNs,
        CEN: blueprint.CEN,
        mustCover: blueprint.mustCover,
        forbiddenZones: blueprint.forbiddenZones,
      })),
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
  return {
    system: `你是中文长篇网文大纲拆章器。只输出指定章号的单章蓝图，不复述已有章节，不输出解释。
每章必须严格使用以下结构：
### 第N章
- 标题：${titleMinChars}-${titleMaxChars}字的网文口语标题，要有画面/情绪/钩子，抓住本章最刺激的一点（打脸/翻车/反转/期限/秘密/意外）；禁止只写“第N章”
- CBN：${hookMinChars}-${hookMaxChars}字的章首动作钩子，写开篇 10 秒抓人的瞬间画面或冲突，禁止整章剧情概括
- CPNs：${minimumCpns}-${maximumCpns}个本章必须兑现的推进节点，每条独立可写成一个场面，用中文分号分隔
- CEN：${hookMinChars}-${hookMaxChars}字章尾悬念，要让读者必须点下一章
- mustCover：1-3个本章能完成的具体事件，用中文分号分隔，禁止整卷或全书级目标（如“完成…逆转”“实现…复兴”）
- 禁区：1-3条本章不得提前泄露的事项
- 章尾钩子文案：给读者看的一句钩子话术，区别于 CEN 的事件描述
- 爽点类型：打脸/碾压/反转/装逼/解谜/逆袭/立威/收服等
硬约束：
1. 标题、CBN、CEN 的字数必须落在上面给出的区间内，超出即为格式错误；
2. 一章只能承载一个核心转折（一次对决/一次破局/一次身份反转/一次关键抉择），禁止把两个独立高潮压进同一章；
3. 第 N 章必须承接第 N-1 章的 CEN 状态并推动到新状态，不得无视上章终态；
4. 逐章节奏必须落在“startupPack30.chapterBlocks”对应 5 章区块的目标、必出事件、必留钩子与本块禁区之内，不得提前兑现后续区块的爽点；
5. 所有字段都不得留空，禁止使用括号补充说明。
“existingChapterCanon”是不可改写的既有事实：新章不得重置期限、重复破案/入狱/升职等已完成事件，不得让已倒台或被羁押的反派无解释恢复原职。`,
    user: `【故事上下文】\n${compactContext(outline, direction, chapterNumbers)}\n\n【只需补写的章号】\n${chapterNumbers.join('、')}${issueSection}\n\n直接从“### 第${chapterNumbers[0]}章”开始输出。`,
  };
}

function buildCharacterCompletionPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
): { system: string; user: string } {
  return {
    system: `你是中文长篇网文角色架构师。输出“## 关键角色规划”完整替换节，共 10 个互不重名的角色：主角1、核心盟友2、阶段反派3、贯穿反派1、终局反派1、功能型配角2。
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

export interface CompleteOutlineResult {
  rawText: string;
  outline: ExecutableOutline;
  warnings: string[];
}

/** 单章蓝图每批最大章数：批越大越容易踩网关的非流式输出上限 */
export const CHAPTER_BLUEPRINT_BATCH_SIZE = 10;

const BLUEPRINT_SECTION_ALIASES = ['单章蓝图', '逐章蓝图'];

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

  const batchCount = Math.ceil(chapterNumbers.length / CHAPTER_BLUEPRINT_BATCH_SIZE);
  for (let index = 0; index < chapterNumbers.length; index += CHAPTER_BLUEPRINT_BATCH_SIZE) {
    const batch = chapterNumbers.slice(index, index + CHAPTER_BLUEPRINT_BATCH_SIZE);
    const batchIndex = Math.floor(index / CHAPTER_BLUEPRINT_BATCH_SIZE) + 1;
    onProgress?.(
      `正在${phase}单章蓝图 第${batch[0]}-${batch.at(-1)}章（${batchIndex}/${batchCount}）...`,
    );
    const batchIssues = batch.flatMap(no => issuesByChapter?.get(no) ?? []);
    const prompt = buildChapterCompletionPrompt(outline, params.direction, batch, batchIssues);
    const generated = await params.callStructuredTextMode(
      prompt.system,
      prompt.user,
      { ...params.options, temperature: phase === '定点修复' ? 0.2 : 0.35 },
    );
    const blocks = extractRequestedChapterBlocks(generated, batch);
    for (const [chapterNumber, block] of blocks) {
      const stitched = replaceOutlineSection(
        rawText,
        BLUEPRINT_SECTION_ALIASES,
        BLUEPRINT_SECTION_ALIASES[0],
        [
          ...[...usableBlueprints.values()]
            .filter(blueprint => blueprint.orderIndex !== chapterNumber)
            .map(serializeBlueprint),
          block,
        ].join('\n\n'),
      );
      const parsed = parseExpandedOutline(stitched);
      const parsedBlueprint = parsed?.chapterBlueprints?.find(
        item => item.orderIndex === chapterNumber,
      );
      if (parsed && isUsableBlueprint(parsedBlueprint)) {
        usableBlueprints.set(chapterNumber, parsedBlueprint);
      }
    }
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
    if (blocks.size < batch.length) {
      warnings.push(
        `单章蓝图${phase}批次 ${batch[0]}-${batch.at(-1)} 仅返回 ${blocks.size}/${batch.length} 章`,
      );
    }
  }

  return { rawText, outline, warnings };
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
    const generated = await params.callStructuredTextMode(
      prompt.system,
      prompt.user,
      { ...params.options, temperature: 0.35 },
    );
    rawText = replaceOutlineSection(
      rawText,
      ['关键角色规划', '关键角色'],
      '关键角色规划',
      extractOutlineSectionBody(generated, ['关键角色规划', '关键角色']),
    );
    outline = parseExpandedOutline(rawText) ?? outline;
    for (
      let round = 0;
      round < 2 && outline.keyCharacters.length < OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters;
      round += 1
    ) {
      const missing = OUTLINE_COMPLETENESS_POLICY.minimumKeyCharacters - outline.keyCharacters.length;
      const supplementPrompt = buildAdditionalCharacterPrompt(outline, params.direction, missing);
      const supplement = await params.callStructuredTextMode(
        supplementPrompt.system,
        supplementPrompt.user,
        { ...params.options, temperature: 0.3 },
      );
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
    const generated = await params.callStructuredTextMode(
      prompt.system,
      prompt.user,
      { ...params.options, temperature: 0.3 },
    );
    rawText = replaceOutlineSection(
      rawText,
      ['伏笔规划'],
      '伏笔规划',
      extractOutlineSectionBody(generated, ['伏笔规划']),
    );
    outline = parseExpandedOutline(rawText) ?? outline;
    for (
      let round = 0;
      round < 2 && outline.foreshadowPlan.length < OUTLINE_COMPLETENESS_POLICY.minimumForeshadows;
      round += 1
    ) {
      const missing = OUTLINE_COMPLETENESS_POLICY.minimumForeshadows - outline.foreshadowPlan.length;
      const supplementPrompt = buildAdditionalForeshadowPrompt(outline, params.direction, missing);
      const supplement = await params.callStructuredTextMode(
        supplementPrompt.system,
        supplementPrompt.user,
        { ...params.options, temperature: 0.25 },
      );
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

  return { rawText, outline, warnings };
}
