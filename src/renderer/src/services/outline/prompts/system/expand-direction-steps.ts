/**
 * 大纲主方案分步生成 prompt builder。
 *
 * 一次性 expandDirection 主请求要求模型单次产出 14 个二级段（定位/驱动/金手指/规模/四幕/
 * 卷纲/世界/启动包/支线/故事线/情绪/卖点/角色10个/伏笔10条），体量约 8000-15000 字，
 * 推理型模型极易在 reasoning_content 上烧光输出预算后被网关 finish_reason=length 截断。
 *
 * 这里把主请求拆成 5 个聚焦小请求，逐步拼装 rawText，单步最大输出降到 ~3000-4500 字。
 * 段模板复用 expand-direction-prompt.ts 导出的 SECTION_* 常量，保证字段名与解析器期望一致。
 * 解析器 parseExpandedOutline 是段级增量解析，缺段返回空/undefined 不报错，
 * 所以分步拼装出的 rawText 能被正常解析。
 */
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { BuiltPrompt } from './shared';
import { extractOutlineSectionBody } from '@/services/outline/generators/outline-completer';
import { buildWordCountBreakdown, AVG_WORDS_PER_CHAPTER } from '@/services/outline/utils';
import { OUTLINE_COMPLETENESS_POLICY } from '@/services/outline/validation/outlineCompleteness';
import {
  SHARED_PREAMBLE,
  SHARED_FORMAT_RULES,
  SECTION_STORY_POSITIONING,
  SECTION_STORY_ENGINE,
  SECTION_GOLDFINGER,
  SECTION_STORY_SCALE,
  SECTION_ACTS,
  SECTION_VOLUME_PLAN,
  SECTION_WORLD,
  SECTION_STARTUP,
  SECTION_SUBPLOTS,
  SECTION_STORY_LINES,
  SECTION_EMOTION,
  SECTION_SELLING,
  SECTION_CHARACTERS,
  SECTION_FORESHADOW,
  buildVolumePlanSection,
  buildStartupBlockSection,
} from './expand-direction-prompt';

const STARTUP_CHAPTER_COUNT = OUTLINE_COMPLETENESS_POLICY.startupChapterCount;

/** 单个段的规范名 + 匹配别名（与 parser 的 splitNamedSections 期望一致） */
export interface StepSectionDef {
  /** 写入 rawText 的规范 `## 段名` */
  canonical: string;
  /** 匹配旧段的所有别名（含 canonical，用于 extractOutlineSectionBody / replaceOutlineSection） */
  aliases: string[];
  /** 该段的模板正文（不含 `## 段名` 行的也可以，这里统一含段名行，便于拼到 system 指令里） */
  template: string;
}

/** 段定义集中表：所有分步都从这里取，保证段名/别名单一来源 */
const SEC = {
  storyPositioning: {
    canonical: '故事定位',
    aliases: ['故事定位'],
    template: SECTION_STORY_POSITIONING,
  },
  storyEngine: {
    canonical: '核心驱动',
    aliases: ['核心驱动'],
    template: SECTION_STORY_ENGINE,
  },
  goldfinger: {
    canonical: '金手指设定',
    aliases: ['金手指设定'],
    template: SECTION_GOLDFINGER,
  },
  storyScale: {
    canonical: '故事规模规划',
    aliases: ['故事规模规划'],
    template: SECTION_STORY_SCALE,
  },
  acts: {
    canonical: '四幕结构',
    aliases: ['四幕结构'],
    template: SECTION_ACTS,
  },
  volumePlan: {
    canonical: '卷纲',
    aliases: ['卷纲'],
    template: SECTION_VOLUME_PLAN,
  },
  world: {
    canonical: '世界与势力规划',
    aliases: ['世界与势力规划'],
    template: SECTION_WORLD,
  },
  startup: {
    canonical: `前${STARTUP_CHAPTER_COUNT}章启动包`,
    aliases: [`前${STARTUP_CHAPTER_COUNT}章启动包`, '前30章启动包'],
    template: SECTION_STARTUP,
  },
  characters: {
    canonical: '关键角色规划',
    aliases: ['关键角色规划', '关键角色'],
    template: SECTION_CHARACTERS,
  },
  foreshadow: {
    canonical: '伏笔规划',
    aliases: ['伏笔规划'],
    template: SECTION_FORESHADOW,
  },
  subplots: {
    canonical: '主要支线',
    aliases: ['主要支线'],
    template: SECTION_SUBPLOTS,
  },
  storyLines: {
    canonical: '故事线规划',
    aliases: ['故事线规划'],
    template: SECTION_STORY_LINES,
  },
  emotion: {
    canonical: '情绪与爽点节奏',
    aliases: ['情绪与爽点节奏'],
    template: SECTION_EMOTION,
  },
  selling: {
    canonical: '卖点承载规划',
    aliases: ['卖点承载规划'],
    template: SECTION_SELLING,
  },
} satisfies Record<string, StepSectionDef>;

/** 把指定段的正文从累计 rawText 中提取出来，拼成【已确定方案】上下文块 */
function buildContextBlock(rawText: string, sections: StepSectionDef[]): string {
  const blocks: string[] = [];
  for (const section of sections) {
    const body = extractOutlineSectionBody(rawText, section.aliases);
    if (body.trim()) {
      blocks.push(`## ${section.canonical}\n${body}`);
    }
  }
  return blocks.join('\n\n');
}

/** 本步输出范围指令：限定只输出指定段，禁止输出其它段（尤其单章蓝图） */
function buildFocusInstruction(sectionNames: string[]): string {
  return `【本次输出范围】
本次只需输出以下 ${sectionNames.length} 个二级标题段，禁止输出其它任何二级标题，尤其禁止输出「## 单章蓝图」「## 逐章蓝图」等逐章小节：
${sectionNames.map(name => `- 「## ${name}」`).join('\n')}

每段必须以规范的「## 段名」开头（段名与下方模板完全一致），段内字段保持模板给出的顺序与名称。`;
}

/** 组装单步 system：共享前导 + 聚焦指令 + 段模板 + 格式规则 */
function buildStepSystem(
  sections: StepSectionDef[],
  extraGuidance: string,
): string {
  const templates = sections.map(section => section.template).join('\n\n');
  const focus = buildFocusInstruction(sections.map(section => section.canonical));
  return `${SHARED_PREAMBLE}

${focus}

${extraGuidance}

请严格使用以下固定结构输出本步段落，字段名保持一致：

${templates}

${SHARED_FORMAT_RULES}`;
}

function formatDirection(direction: OutlineDirection): string {
  return `标题：${direction.title}
一句话卖点：${direction.oneLiner}
premise：${direction.premise}
主角成长路径：${direction.protagonistArc}
核心冲突：${direction.coreConflict}
爽点风格：${direction.coolPointStyle.join('；')}
目标情绪：${direction.targetEmotions.join('；')}
风险提示：${direction.riskNotes.join('；')}
长篇承载力：${direction.longformCapacityNote || '未提供'}
推荐理由：${direction.recommendedReason}`;
}

function formatScaleGuidance(wordCountRange: string): string {
  const breakdown = buildWordCountBreakdown(wordCountRange);
  const startupRatio = Number(
    (STARTUP_CHAPTER_COUNT / breakdown.estimatedChapterCount).toFixed(3),
  );
  return `【目标字数区间】
${wordCountRange}

【规模换算参考】
- 按平均每章约${AVG_WORDS_PER_CHAPTER}字估算
- 目标总字数约${breakdown.targetWordCount}字
- 预计总章节数约${breakdown.estimatedChapterCount}章
- 建议卷数约${breakdown.suggestedVolumeCount}卷
- 每卷预计约${breakdown.estimatedChaptersPerVolume}章
- 前${STARTUP_CHAPTER_COUNT}章约占全书${Math.round(startupRatio * 100)}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5 个分步 builder
// ─────────────────────────────────────────────────────────────────────────────

export interface StepBuildContext {
  seed: string;
  direction: OutlineDirection;
  wordCountRange: string;
  enhancementBrief?: string;
  creativeExpansionMode?: 'preserve-genre' | 'allow-cross-genre';
  /** 前序步骤已拼装的累计方案文本，供提取上下文段 */
  accumulatedRawText: string;
}

const SKELETON_SECTIONS: StepSectionDef[] = [
  SEC.storyPositioning,
  SEC.storyEngine,
  SEC.goldfinger,
  SEC.storyScale,
  SEC.acts,
  SEC.world,
];

/** 步1 设定层：定位/驱动/金手指/规模/四幕/世界。主方案起点，无上下文依赖。 */
export function buildSkeletonStepPrompt(ctx: StepBuildContext): BuiltPrompt {
  const genreBoundary = ctx.creativeExpansionMode === 'allow-cross-genre'
    ? '用户已允许跨题材扩展，可新增超自然机制，但必须服务原始故事核。'
    : '保持原始题材边界：种子未明确包含超自然/系统/异能/修仙/魔法时，禁止擅自添加；金手指可写成现代知识、职业能力、信息差或制度工具。';
  const extraGuidance = `本步是方案骨架，请先定下来：题材定位、主角与核心冲突、金手指、故事规模、四幕骨架、世界与势力。
- 主角姓名必须明确（禁止用「主角」「少年」等泛称），后续步骤会沿用此姓名。
- 「故事规模规划」的「建议卷数」必须与目标字数区间匹配，后续卷纲步骤会按此卷数生成。
- 「四幕结构」必须完整输出四幕，每幕给出幕目标、关键转折、幕结束状态。
- 「世界与势力规划」至少 3 个核心地点、3 个关键势力、3 条世界规则，不要用卷标题充当地点名。
- 【题材边界】${genreBoundary}`;

  const system = buildStepSystem(SKELETON_SECTIONS, extraGuidance);
  const user = `请将下面这个已选中的创作方向，展开为方案骨架（仅本步要求的段落）。

${formatScaleGuidance(ctx.wordCountRange)}

【原始创意种子】
${ctx.seed}

【已选方向】
${formatDirection(ctx.direction)}

${ctx.enhancementBrief ? `【本次增强目标】
${ctx.enhancementBrief}

` : ''}要求：
1. 优先增强长篇承载力和网文追读动力
2. 尽量具体，不要空泛设定
3. 输出必须严格遵守指定结构，只输出本步指定段落
4. 主角姓名、建议卷数必须明确，后续步骤会沿用
5. 如果提供了“本次增强目标”，优先落实增强项，但不偏离核心卖点`;

  return { system, user };
}

/** 步2 卷纲：按建议卷数生成卷级递进结构。依赖步1的规模规划。 */
export function buildVolumePlanStepPrompt(ctx: StepBuildContext): BuiltPrompt {
  const breakdown = buildWordCountBreakdown(ctx.wordCountRange);
  // 卷纲模板需要注入动态卷数；这里直接用 buildVolumePlanSection 渲染好段正文
  const volumeTemplate = SECTION_VOLUME_PLAN.replace(
    '{{VOLUME_PLAN_SECTION}}',
    buildVolumePlanSection(breakdown.suggestedVolumeCount),
  );
  const volumeSection: StepSectionDef = { ...SEC.volumePlan, template: volumeTemplate };

  const contextSections = [SEC.storyPositioning, SEC.storyEngine, SEC.storyScale];
  const contextBlock = buildContextBlock(ctx.accumulatedRawText, contextSections);

  const extraGuidance = `本步只生成卷纲。卷数必须与【已确定方案】中「故事规模规划」的「建议卷数」一致。
- 各卷必须彼此递进，不能重复同一冲突模式。
- 每卷的「章节区间」必须填写：按「每卷预计章数」把预计总章节数切分成首尾衔接的区间（第1卷从第1章开始，末卷止于预计总章节数），区间不重叠、不留缝隙。
- 每卷字段（卷标题/章节区间/卷目标/卷冲突/卷高潮/卷反转/卷尾钩子/主角成长/关键角色/埋设伏笔/回收伏笔/关系变化）都要填写。`;

  const system = buildStepSystem([volumeSection], extraGuidance);
  const user = `请基于已确定的方案骨架，生成卷纲。

【已确定方案】
${contextBlock || '（暂无，请按已选方向自行推演）'}

【已选方向】
${formatDirection(ctx.direction)}

要求：
1. 卷数严格等于规模规划中的「建议卷数」（约 ${breakdown.suggestedVolumeCount} 卷）
2. 各卷递进，禁止重复
3. 只输出「## 卷纲」段，禁止输出其它段`;

  return { system, user };
}

/** 步3 启动包：前 X 章启动包（10 个 5 章块）。依赖步1骨架 + 步2卷纲。 */
export function buildStartupStepPrompt(ctx: StepBuildContext): BuiltPrompt {
  const startupTemplate = SECTION_STARTUP.replace(
    '{{STARTUP_BLOCK_SECTION}}',
    buildStartupBlockSection(),
  );
  const startupSection: StepSectionDef = { ...SEC.startup, template: startupTemplate };

  const contextSections = [SEC.storyPositioning, SEC.storyEngine, SEC.volumePlan];
  const contextBlock = buildContextBlock(ctx.accumulatedRawText, contextSections);

  const extraGuidance = `本步只生成「## 前${STARTUP_CHAPTER_COUNT}章启动包」。
- 开篇钩子 30 字以内、单场景动作钩子。
- 必出事件：单章可兑现、同一场景链合并为一条、禁止括号、每条 8-30 字。
- 区块高潮密度：每 5 章区块最多 2 个核心转折。
- 必须给满 ${Math.ceil(STARTUP_CHAPTER_COUNT / 5)} 个 5 章区块（1-5 / 6-10 / …）。
- 前${STARTUP_CHAPTER_COUNT}章只完成“开局承诺 + 第一轮冲突闭环 + 更大主线入口”，不能耗尽全书核心悬念。`;

  const system = buildStepSystem([startupSection], extraGuidance);
  const user = `请基于已确定方案，生成前${STARTUP_CHAPTER_COUNT}章启动包。

【已确定方案】
${contextBlock || '（暂无，请按已选方向自行推演）'}

【已选方向】
${formatDirection(ctx.direction)}

要求：
1. 把前${STARTUP_CHAPTER_COUNT}章设计成明确可执行的启动包，按 5 章一块给满 ${Math.ceil(STARTUP_CHAPTER_COUNT / 5)} 块
2. 开篇钩子、必出事件、区块密度严格遵守硬约束
3. 只输出「## 前${STARTUP_CHAPTER_COUNT}章启动包」段，禁止输出单章蓝图或其它段`;

  return { system, user };
}

/** 步4 角色 + 伏笔：关键角色规划 + 伏笔规划。依赖步1（主角姓名/金手指）。失败可兜底。 */
export function buildCastStepPrompt(ctx: StepBuildContext): BuiltPrompt {
  const sections = [SEC.characters, SEC.foreshadow];
  // 卷纲（步2）与启动包（步3）已先行产出姓名，角色规划必须把它们逐一登记，
  // 否则完整性门禁会以「未登记角色」拦下整份大纲（实测分步生成的常态缺口）。
  const contextSections = [SEC.storyPositioning, SEC.storyEngine, SEC.goldfinger, SEC.volumePlan];
  const contextBlock = buildContextBlock(ctx.accumulatedRawText, contextSections);

  const extraGuidance = `本步生成关键角色规划与伏笔规划。
- 角色主角姓名必须与【已确定方案】「核心驱动」中的主角姓名一致。
- 【已确定方案】卷纲各卷「关键角色」中出现的每个具体姓名都必须逐一建档，不得另造同功能角色替换，不得遗漏任何一个；「主角/九品书吏/司天监监正」等职位或身份标签不是姓名，不得单独建档。
- 关键角色至少 10 个，覆盖：常驻核心 4 + 中前期 2 + 中后期 2 + 势力代表 2；按分层模板完整输出，不得跳层。
- 反派梯队：每卷一个阶段性小 boss + 贯穿中期反派 + 终极反派。
- 至少 3 组非主角之间的关系链或利益冲突链。
- 伏笔至少 10 条（短 3 + 中 3 + 长 2 + 终局 2），覆盖身份/关系/规则/能力/事件/物件/角色/对话八类中至少五类。
- 伏笔载体角色必须使用关键角色规划中已登记的姓名。
- 角色弧线必须可推进至少两卷。`;

  const system = buildStepSystem(sections, extraGuidance);
  const user = `请基于已确定方案，生成关键角色规划与伏笔规划。

【已确定方案】
${contextBlock || '（暂无，请按已选方向自行推演）'}

【已选方向】
${formatDirection(ctx.direction)}

要求：
1. 角色主角姓名须与已确定方案一致
2. 角色层级、伏笔分级必须完整，数量不足时补足新的独立角色/伏笔
3. 只输出「## 关键角色规划」与「## 伏笔规划」两段，禁止输出其它段`;

  return { system, user };
}

/** 步5 节奏包装：支线/故事线/情绪爽点/卖点。依赖步1骨架 + 步2卷纲。软字段，缺失不影响应用。 */
export function buildRhythmStepPrompt(ctx: StepBuildContext): BuiltPrompt {
  const sections = [SEC.subplots, SEC.storyLines, SEC.emotion, SEC.selling];
  const contextSections = [SEC.storyPositioning, SEC.storyEngine, SEC.volumePlan];
  const contextBlock = buildContextBlock(ctx.accumulatedRawText, contextSections);

  const extraGuidance = `本步生成主要支线、故事线规划、情绪与爽点节奏、卖点承载规划。
- 主要支线至少 3 条，给出起始/收束章节。
- 支线「关联角色」只能使用【已确定方案】中已出现的姓名，禁止自创新姓名。
- 故事线规划逐项填写地图线/阵营线/人物线/金手指线/世界规则线/矛盾线/收集线/感情线。
- 情绪与爽点节奏：给出情绪弧线、高点/低点章节，至少 3 个明确爽点（每个是完整兑现闭环）。
- 卖点承载规划至少 3 条，分类限定为：设定/角色/冲突/情绪/钩子/爽点。`;

  const system = buildStepSystem(sections, extraGuidance);
  const user = `请基于已确定方案，生成支线、故事线、情绪爽点节奏与卖点承载规划。

【已确定方案】
${contextBlock || '（暂无，请按已选方向自行推演）'}

【已选方向】
${formatDirection(ctx.direction)}

要求：
1. 各段字段完整，情绪弧线/卖点分类等枚举值严格遵守限定
2. 只输出本步指定的四个段，禁止输出其它段`;

  return { system, user };
}

// ─────────────────────────────────────────────────────────────────────────────
// 步骤配置：数据驱动，便于增删/合并/拆分
// ─────────────────────────────────────────────────────────────────────────────

export interface OutlineGenerationStep {
  /** 步骤标识 */
  id: 'skeleton' | 'volumePlan' | 'startup' | 'cast' | 'rhythm';
  /** 进度文案 */
  progressMessage: string;
  /** 本步产出的段定义（stepper 据此从模型响应中提取并拼装到 rawText） */
  sections: StepSectionDef[];
  /**
   * 是否硬必需。true：重试耗尽后抛错（触发外层整体重试）。
   * false：重试耗尽后跳过，记录 warning，由下游 completeIncompleteOutline 兜底或接受缺失。
   */
  required: boolean;
  /** prompt builder */
  build: (ctx: StepBuildContext) => BuiltPrompt;
}

/**
 * 5 步分步生成配置。
 *
 * 步1-3 是可应用门槛的硬依赖（定位/驱动/卷纲/启动包），失败必须抛错；
 * 步4（角色/伏笔）虽是完整性门禁项，但 completeIncompleteOutline 已有补全通道，失败可降级；
 * 步5（支线/故事线/情绪/卖点）全是可选字段，缺失不影响 canApply。
 */
export const OUTLINE_GENERATION_STEPS: OutlineGenerationStep[] = [
  {
    id: 'skeleton',
    progressMessage: '正在生成方案骨架（定位/驱动/金手指/规模/四幕/世界）...',
    sections: SKELETON_SECTIONS,
    required: true,
    build: buildSkeletonStepPrompt,
  },
  {
    id: 'volumePlan',
    progressMessage: '正在生成卷纲...',
    sections: [SEC.volumePlan],
    required: true,
    build: buildVolumePlanStepPrompt,
  },
  {
    id: 'startup',
    progressMessage: `正在生成前${STARTUP_CHAPTER_COUNT}章启动包...`,
    sections: [SEC.startup],
    required: true,
    build: buildStartupStepPrompt,
  },
  {
    id: 'cast',
    progressMessage: '正在生成关键角色与伏笔...',
    sections: [SEC.characters, SEC.foreshadow],
    required: false,
    build: buildCastStepPrompt,
  },
  {
    id: 'rhythm',
    progressMessage: '正在生成支线/故事线/节奏/卖点...',
    sections: [SEC.subplots, SEC.storyLines, SEC.emotion, SEC.selling],
    required: false,
    build: buildRhythmStepPrompt,
  },
];
