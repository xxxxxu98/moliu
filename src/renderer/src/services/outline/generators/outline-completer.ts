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

export function compactContext(outline: ExecutableOutline, direction: OutlineDirection): string {
  return JSON.stringify({
    direction,
    title: outline.title,
    oneLiner: outline.oneLiner,
    premise: outline.premise,
    storyEngine: outline.storyEngine,
    volumePlan: outline.volumePlan,
    startupPack30: outline.startupPack30,
    existingChapterCanon: (outline.chapterBlueprints ?? [])
      .filter(isUsableBlueprint)
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

function buildChapterCompletionPrompt(
  outline: ExecutableOutline,
  direction: OutlineDirection,
  chapterNumbers: number[],
): { system: string; user: string } {
  return {
    system: `你是中文长篇网文大纲补全器。只补写指定章号的单章蓝图，不复述已有章节，不输出解释。
每章必须严格使用以下结构：
### 第N章
- 标题：6-16字、有具体画面或冲突，禁止只写“第N章”
- CBN：10-35字的章首动作钩子
- CPNs：1-3个单章可写场景，用中文分号分隔
- CEN：10-35字章尾悬念
- mustCover：1-3个本章能完成的具体事件，用中文分号分隔，禁止整卷目标
- 禁区：1-3条本章不得提前泄露的事项
- 章尾钩子文案：给读者看的短句
- 爽点类型：打脸/反转/解谜/立威/收服等
相邻章节必须承接上一章 CEN，所有字段都不得留空。
“existingChapterCanon”是不可改写的既有事实：新章不得重置期限、重复破案/入狱/升职等已完成事件，不得让已倒台或被羁押的反派无解释恢复原职。每章 CBN 必须承接上一章 CEN，并推动到新状态。`,
    user: `【故事上下文】\n${compactContext(outline, direction)}\n\n【只需补写的章号】\n${chapterNumbers.join('、')}\n\n直接从“### 第${chapterNumbers[0]}章”开始输出。`,
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

/**
 * 对长响应尾部的高频截断做定向补全。章节每批最多 10 个，角色与伏笔独立请求，
 * 避免再次把 30 章 + 10 角色 + 10 伏笔塞进一次输出。
 */
export async function completeIncompleteOutline(params: {
  rawText: string;
  outline: ExecutableOutline;
  direction: OutlineDirection;
  options: GenerateOptions;
  callStructuredTextMode: StructuredTextCaller;
}): Promise<CompleteOutlineResult> {
  let rawText = params.rawText;
  let outline = params.outline;
  const warnings: string[] = [];

  const repairChapterBlueprints = async (
    chapterNumbers: number[],
    phase: '补全' | '定点修复',
  ): Promise<void> => {
    const usableBlueprints = new Map<number, ChapterBlueprint>();
    for (const blueprint of outline.chapterBlueprints ?? []) {
      if (isUsableBlueprint(blueprint)) usableBlueprints.set(blueprint.orderIndex, blueprint);
    }

    for (let index = 0; index < chapterNumbers.length; index += 10) {
      const batch = chapterNumbers.slice(index, index + 10);
      const prompt = buildChapterCompletionPrompt(outline, params.direction, batch);
      const generated = await params.callStructuredTextMode(
        prompt.system,
        prompt.user,
        { ...params.options, temperature: phase === '定点修复' ? 0.2 : 0.35 },
      );
      const blocks = extractRequestedChapterBlocks(generated, batch);
      for (const [chapterNumber, block] of blocks) {
        const stitched = replaceOutlineSection(
          rawText,
          ['单章蓝图', '逐章蓝图'],
          '单章蓝图',
          [
            ...[...usableBlueprints.values()].map(serializeBlueprint),
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
        ['单章蓝图', '逐章蓝图'],
        '单章蓝图',
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
  };

  await repairChapterBlueprints(findIncompleteChapterNumbers(outline), '补全');

  if (!outline.startupPack30.openingHook.trim()) {
    const firstChapterHook = outline.chapterBlueprints
      ?.find(blueprint => blueprint.orderIndex === 1)
      ?.CBN.trim();
    if (firstChapterHook) {
      rawText = replaceSectionField(
        rawText,
        ['前30章启动包'],
        '前30章启动包',
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
    await repairChapterBlueprints(incompleteChapters, '定点修复');
  }

  return { rawText, outline, warnings };
}
