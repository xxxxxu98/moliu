/**
 * 灵感种子 / 题材雷达 提示词
 */

import type {
  RefreshGenreInsightsOptions,
  RefreshStorySeedsOptions,
  SeedPlayStyle,
  TopicAudience,
} from '@/types/topic-discovery';

const AUDIENCE_LABEL: Record<TopicAudience, string> = {
  general: '大众向',
  male: '男生向',
  female: '女生向',
};

const PLAY_STYLE_GUIDE: Record<SeedPlayStyle, string> = {
  standard:
    '风格：标准开题。冲突清晰、爽点明确、可立即开写，适合主流连载节奏。',
  twist:
    '风格：反套路开题。刻意打破常见网文套路（退婚打脸、无脑金手指、无代价系统等），用合理反转制造新鲜感，但仍要有强钩子与可持续爽点。',
  dice:
    '风格：命运骰子开题。必须把用户掷出的题材、开篇手法、意外设定三要素全部吃进故事核，组合要大胆但自洽。',
  mix: '风格：元素混搭开题。必须融合用户选定的题材与设定元素，强调碰撞感与化学反应，避免只贴标签不写冲突。',
};

export function buildStorySeedsSystemPrompt(playStyle: SeedPlayStyle = 'standard'): string {
  return `你是资深网文开题顾问。根据约束生成互不相同、可立即开写的「灵感种子」。
只输出 JSON，不要 markdown 代码块，不要解释。

JSON 格式：
{"seeds":[{"title":"书名感标题","oneLiner":"一句话故事核（含人物+冲突+钩子）","genre":"题材","hook":"开篇钩子","coolPoint":"核心爽点","audience":"general|male|female","riskNote":"可选风险提示"}]}

要求：
- 每条 oneLiner 40-80 字，具体可写，避免空泛鸡汤
- 同批种子题材或冲突角度必须明显不同
- 不要抄袭知名作品书名与核心设定
- audience 只能是 general / male / female
- ${PLAY_STYLE_GUIDE[playStyle]}`;
}

export function buildStorySeedsUserPrompt(options: RefreshStorySeedsOptions): string {
  const count = options.count ?? 4;
  const playStyle = options.playStyle ?? 'standard';
  const genre = options.lockedSlots?.genre || options.genre;
  const audience = options.lockedSlots?.audience || options.audience;
  const exclude = options.excludeTitles?.filter(Boolean) ?? [];
  const mixTags = options.mixTags?.filter(Boolean) ?? [];
  const mixElements = options.mixElements?.filter(Boolean) ?? [];
  const dice = options.diceRoll;

  const lines: string[] = [
    `请生成 ${count} 个网文灵感种子。`,
    `当前日期：${new Date().toISOString().slice(0, 10)}`,
    `玩法：${playStyle}`,
    PLAY_STYLE_GUIDE[playStyle],
  ];

  if (genre) {
    lines.push(`锁定题材：${genre}`);
  }
  if (audience) {
    lines.push(`目标受众：${AUDIENCE_LABEL[audience]}（audience 字段填 ${audience}）`);
  }
  if (mixTags.length > 0) {
    lines.push(`混搭题材标签：${mixTags.join('、')}`);
  }
  if (mixElements.length > 0) {
    lines.push(`混搭设定元素：${mixElements.join('、')}`);
  }
  if (dice) {
    lines.push(
      `命运骰子结果 —— 题材面：${dice.genre}；开篇手法面：${dice.hook}；意外设定面：${dice.twist}`,
    );
    lines.push('三面结果都必须在 oneLiner / hook / coolPoint 中有所体现。');
  }
  if (exclude.length > 0) {
    lines.push(`禁止重复或近似以下已出现过的标题/点子：${exclude.join('、')}`);
  }

  if (playStyle === 'twist') {
    lines.push('每条种子请显式写出「破的是什么套路」与「新的期待点」。');
  }

  lines.push('请给出新的、有市场辨识度的开题点子。');
  return lines.join('\n');
}

export function buildGenreInsightsSystemPrompt(): string {
  return `你是网文市场风向顾问。结合中文网文常见平台（起点/番茄/晋江/七猫等）经验，生成互不相同的「题材洞察卡」。
只输出 JSON，不要 markdown 代码块，不要解释。

JSON 格式：
{"insights":[{"name":"题材名","lifecycle":"emerging|rising|peak|declining|saturated","audience":"general|male|female","reason":"为何值得关注","opportunity":"开题切入建议","hotTags":["标签1","标签2"],"riskLevel":"low|medium|high","riskNote":"可选风险"}]}

要求：
- reason / opportunity 各 30-60 字，务实可执行
- hotTags 2-4 个
- 同批题材不要重复
- 可包含蓝海与红海题材，但须说清风险`;
}

export function buildGenreInsightsUserPrompt(options: RefreshGenreInsightsOptions): string {
  const count = options.count ?? 4;
  const audience = options.audience;
  const exclude = options.excludeNames?.filter(Boolean) ?? [];

  const lines: string[] = [
    `请生成 ${count} 个题材洞察卡。`,
    `当前日期：${new Date().toISOString().slice(0, 10)}`,
  ];

  if (audience) {
    lines.push(`优先关注受众：${AUDIENCE_LABEL[audience]}`);
  }
  if (exclude.length > 0) {
    lines.push(`不要重复以下题材名：${exclude.join('、')}`);
  }

  lines.push('覆盖上升期、高峰期与蓝海机会，给出可开题的切入点。');
  return lines.join('\n');
}
