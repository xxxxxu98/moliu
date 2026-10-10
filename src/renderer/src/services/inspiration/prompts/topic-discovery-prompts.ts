/**
 * 灵感种子 / 题材雷达 提示词
 */

import type { RankChannel, RankEntry, RankScanResult } from '@/types/rank-scan';
import type {
  InsightSeedContext,
  RefreshGenreInsightsOptions,
  RefreshStorySeedsOptions,
  SeedPlayStyle,
  TopicAudience,
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';
import { formatGenreSeedHint, formatMixGenreHints } from '../genre-seed-context';
import { formatTitlePatterns } from './title-craft';

export const AUDIENCE_LABEL: Record<TopicAudience, string> = {
  general: '大众向',
  male: '男生向',
  female: '女生向',
};

export const PLATFORM_LABEL: Record<TopicPlatform, string> = {
  general: '不限平台',
  qidian: '起点中文网',
  fanqie: '番茄小说',
  jinjiang: '晋江文学城',
  qimao: '七猫',
  zhihu: '知乎盐言',
};

export const LENGTH_LABEL: Record<TopicLength, string> = {
  long: '长篇连载',
  short: '短篇完结',
};

export const ENTRY_DIFFICULTY_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '易上手',
  medium: '中等门槛',
  high: '高门槛',
};

/** 平台调性：对齐 oh-story 扫榜「平台特性」思路 */
export const PLATFORM_GUIDE: Record<TopicPlatform, string> = {
  general: '不限定单一平台，兼顾主流网文可读性与差异化卖点。',
  qidian:
    '起点调性：付费追读强，重视长线升级、世界观厚度与章末钩子；适合可持续连载的冲突引擎。',
  fanqie:
    '番茄调性：前三章定生死，节奏快、爽点密、设定直观；开篇立刻抛冲突与第一次小兑现。',
  jinjiang:
    '晋江调性：情感质感与人物关系优先，人设要立得住；甜虐节奏清晰，忌空洞堆设定。',
  qimao: '七猫调性：强情节、强反转、结局导向明确；语言直白好读，下沉市场共鸣优先。',
  zhihu: '盐言调性：短篇情绪过山车，反转与共鸣并重；适合 15–30 分钟完读的强情绪核。',
};

export const LENGTH_GUIDE: Record<TopicLength, string> = {
  long: '篇幅：长篇连载。要有可持续升级/卷结构、追读钩子与中长期冲突；避免写死成一次性短篇。',
  short:
    '篇幅：短篇完结。聚焦 15–30 分钟完读的情绪弧与反转，冲突密度高，尽快兑现核心期待。',
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

function resolvePlatform(options: {
  platform?: TopicPlatform;
  lockedSlots?: { platform?: TopicPlatform };
}): TopicPlatform {
  return options.lockedSlots?.platform || options.platform || 'general';
}

function resolveLength(options: {
  length?: TopicLength;
  lockedSlots?: { length?: TopicLength };
}): TopicLength {
  return options.lockedSlots?.length || options.length || 'long';
}

function formatInsightContext(ctx: InsightSeedContext): string[] {
  const lines = [
    `雷达洞察约束 —— 题材：${ctx.name}`,
    `为何关注：${ctx.reason}`,
    `开题切入：${ctx.opportunity}`,
    `生命周期：${ctx.lifecycle}；风险：${ctx.riskLevel}`,
  ];
  if (ctx.entryDifficulty) {
    lines.push(`上手难度：${ENTRY_DIFFICULTY_LABEL[ctx.entryDifficulty]}`);
  }
  if (ctx.hotTags.length > 0) {
    lines.push(`热标签（须尽量吃进故事核）：${ctx.hotTags.join('、')}`);
  }
  if (ctx.namePatterns && ctx.namePatterns.length > 0) {
    lines.push(`书名/卖点模式参考：${ctx.namePatterns.join('；')}`);
  }
  if (ctx.riskNote) {
    lines.push(`风险提示：${ctx.riskNote}`);
  }
  lines.push('种子的 oneLiner / hook / coolPoint 必须体现上述切入建议与热标签，勿只贴题材名。');
  return lines;
}

export function buildStorySeedsSystemPrompt(playStyle: SeedPlayStyle = 'standard'): string {
  const twistField =
    playStyle === 'twist'
      ? ',"brokenTrope":"破的是什么套路"'
      : '';

  return `你是资深网文开题顾问。根据约束生成互不相同、可立即开写的「灵感种子」。
只输出 JSON，不要 markdown 代码块，不要解释。

JSON 格式：
{"seeds":[{"title":"书名感标题","oneLiner":"一句话故事核（含人物+冲突+钩子）","genre":"题材","hook":"开篇钩子","coolPoint":"核心爽点","sellPoint":"读者核心期待一句话","mechanism":"金手指或核心机制一句话","audience":"general|male|female","platform":"qidian|fanqie|jinjiang|qimao|zhihu|general","length":"long|short","riskNote":"可选风险提示"${twistField}}]}

要求：
- 每条 oneLiner 40-80 字，具体可写，避免空泛鸡汤
- sellPoint / mechanism 各 10-30 字，务实可执行
- 同批种子题材或冲突角度必须明显不同
- 不要抄袭知名作品书名与核心设定
- audience 只能是 general / male / female
- platform / length 必须与用户约束一致（若用户已锁定）
- 若提供了题材 Profile 约束，hook / coolPoint 须贴合其偏好钩子与爽点
- 高概念硬要求：每条种子的 oneLiner 必须包含至少一个「反常识设定」或「新鲜元素组合」；禁止输出近五年已写烂的经典开局套路（废柴逆袭、退婚打脸、无代价系统流、龙傲天横扫、赘婿装逼等）
- 书名要求：title 必须采用以下「脑洞书名句式」之一（也可自创同级别冲击力的句式），禁止「题材名·逆袭/觉醒/重生」式命名：
${formatTitlePatterns()}
- 书名风格多样性：同批种子里「主标：副标」冒号格式与不带冒号的短句式都要出现，禁止整批清一色冒号格式（也不必全不用）
- oneLiner 自带画面感：人物处境 + 具体冲突 + 一个意外转折
- ${PLAY_STYLE_GUIDE[playStyle]}`;
}

export function buildStorySeedsUserPrompt(options: RefreshStorySeedsOptions): string {
  const count = options.count ?? 4;
  const playStyle = options.playStyle ?? 'standard';
  const genre = options.lockedSlots?.genre || options.genre;
  const audience = options.lockedSlots?.audience || options.audience;
  const platform = resolvePlatform(options);
  const length = resolveLength(options);
  const exclude = options.excludeTitles?.filter(Boolean) ?? [];
  const mixTags = options.mixTags?.filter(Boolean) ?? [];
  const mixElements = options.mixElements?.filter(Boolean) ?? [];
  const dice = options.diceRoll;
  const insight = options.insightContext;
  const genreHint = options.genreSeedHint;

  const lines: string[] = [
    `请生成 ${count} 个网文灵感种子。`,
    `当前日期：${new Date().toISOString().slice(0, 10)}`,
    `玩法：${playStyle}`,
    PLAY_STYLE_GUIDE[playStyle],
    `目标平台：${PLATFORM_LABEL[platform]}（platform 字段填 ${platform}）`,
    PLATFORM_GUIDE[platform],
    LENGTH_GUIDE[length],
    `篇幅字段 length 填 ${length}`,
  ];

  if (genre) {
    lines.push(`锁定题材：${genre}`);
  }
  if (genreHint) {
    lines.push(...formatGenreSeedHint(genreHint));
  }
  if (audience) {
    lines.push(`目标受众：${AUDIENCE_LABEL[audience]}（audience 字段填 ${audience}）`);
  }
  if (insight) {
    lines.push(...formatInsightContext(insight));
  }
  if (mixTags.length > 0) {
    lines.push(`混搭题材标签：${mixTags.join('、')}（首个为主题材）`);
    lines.push(...formatMixGenreHints(options.mixGenreHints ?? []));
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
    lines.push(
      '每条种子必须填写 brokenTrope（破的是什么套路），并在 sellPoint 写清新的期待点。',
    );
  }

  lines.push('请给出新的、有市场辨识度的开题点子。');
  return lines.join('\n');
}

const INSIGHT_JSON_SHAPE = `JSON 格式：
{"insights":[{"name":"题材名","lifecycle":"emerging|rising|peak|declining|saturated","audience":"general|male|female","platform":"qidian|fanqie|jinjiang|qimao|zhihu|general","platformBias":["qidian","fanqie"],"length":"long|short","entryDifficulty":"low|medium|high","reason":"为何值得关注（热度/模式）","opportunity":"开题切入建议","hotTags":["标签1","标签2"],"namePatterns":["书名或卖点模式"],"riskLevel":"low|medium|high","riskNote":"可选风险"}]}

要求（对齐扫榜五维）：
1. 题材热度与生命周期：lifecycle 必须准确，reason 说明热度依据（模式反复出现，勿编造具体排名）
2. 新信号 vs 经典动态：同批需覆盖上升/萌芽与高峰/饱和中的至少两类
3. 开题切入：opportunity 30-60 字，务实可执行
4. 平台适配与上手难度：platformBias 1-3 个；entryDifficulty 综合「好不好写 + 红海程度」
5. 风险与红海：riskLevel / riskNote 说清同质化或政策/审美风险
- hotTags 2-4 个；namePatterns 1-2 条（命名或卖点句式）
- 同批题材不要重复
- platform / length 尽量贴合用户筛选`;

const RANK_BOARD_LABEL: Record<string, string> = {
  'qidian-yuepiao': '起点月票榜',
  'qidian-newbook': '起点新书榜',
  'qimao-hot-male': '七猫男生大热榜',
  'qimao-hot-female': '七猫女生大热榜',
  'qimao-new-male': '七猫男生新书榜',
  'qimao-new-female': '七猫女生新书榜',
  'jinjiang-income': '晋江收入金榜',
};

const RANK_CHANNEL_LABEL: Record<RankChannel, string> = {
  male: '男频',
  female: '女频',
  mixed: '综合',
  unknown: '未标注频道',
};

function formatRankEntry(entry: RankEntry): string {
  const parts = [`${entry.rank}. 《${entry.title}》`];
  if (entry.author) parts.push(entry.author);
  if (entry.genre) parts.push(entry.genre);
  if (entry.tags.length > 0) parts.push(entry.tags.join('·'));
  if (entry.wordCount) parts.push(entry.wordCount);
  if (entry.blurb) parts.push(entry.blurb);
  return parts.join(' / ');
}

/** 把榜单样本收成提示词段落。只转写字段，不在这里归纳风口 */
export function formatRankScanPrompt(scan: RankScanResult): string {
  const blocks = scan.boards
    .filter(board => board.entries.length > 0)
    .map(board => {
      const label = RANK_BOARD_LABEL[board.boardId] ?? board.boardId;
      const lines = board.entries.map(entry => formatRankEntry(entry));
      return [`[${label} / ${RANK_CHANNEL_LABEL[board.channel]}]`, ...lines].join('\n');
    });
  return [
    `实时榜单样本（采集时间 ${scan.fetchedAt}）。只根据这些样本里反复出现的题材、标签和书名模式归纳。`,
    '单本上榜只是线索。禁止编造样本里没有的名次、月票、在读或热度数字。样本没覆盖的平台不要写成已扫榜。',
    ...blocks,
  ].join('\n');
}

export function buildGenreInsightsSystemPrompt(options?: { useLiveRanks?: boolean }): string {
  if (options?.useLiveRanks) {
    return `你是网文市场风向顾问。用户消息里附有刚刚采集的公开榜单样本，按「扫榜报告」结构输出题材洞察。
只输出 JSON，不要 markdown 代码块，不要解释。
重要：结论必须能在样本中找到重复出现的模式。禁止把模型记忆里的旧榜单写成这次的采集结果。

${INSIGHT_JSON_SHAPE}`;
  }
  return `你是网文市场风向顾问，按「扫榜报告」结构输出题材洞察（参考起点/番茄/晋江等平台经验）。
只输出 JSON，不要 markdown 代码块，不要解释。
重要：分析基于行业经验与内置趋势方法论，非实时榜单抓取；请给出可开题的模式判断，而非虚构具体排行名次。

${INSIGHT_JSON_SHAPE}`;
}

export function buildGenreInsightsUserPrompt(options: RefreshGenreInsightsOptions): string {
  const count = options.count ?? 4;
  const audience = options.audience;
  const platform = options.platform || 'general';
  const length = options.length || 'long';
  const exclude = options.excludeNames?.filter(Boolean) ?? [];

  const lines: string[] = [
    `请生成 ${count} 个题材洞察卡（扫榜报告式）。`,
    `当前日期：${new Date().toISOString().slice(0, 10)}`,
    `目标平台：${PLATFORM_LABEL[platform]}（${PLATFORM_GUIDE[platform]}）`,
    LENGTH_GUIDE[length],
    '输出时覆盖：热度与生命周期、新题材信号或经典题材动态、切入建议、平台适配与上手难度、风险说明。',
  ];

  if (audience) {
    lines.push(`优先关注受众：${AUDIENCE_LABEL[audience]}`);
  }
  if (exclude.length > 0) {
    lines.push(`不要重复以下题材名：${exclude.join('、')}`);
  }

  lines.push('覆盖上升期、高峰期与蓝海机会；可行性优先于盲目追热。');
  if (options.rankScan?.availability === 'live' && options.rankScan.sampleCount > 0) {
    lines.push(formatRankScanPrompt(options.rankScan));
    lines.push('再次提醒：上面是本次采集的公开榜单，不要改写成未采集平台的实时排名。');
  } else {
    lines.push('再次提醒：非实时榜单，请基于模式与经验判断。');
  }
  return lines.join('\n');
}
