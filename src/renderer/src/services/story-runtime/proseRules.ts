/**
 * 整章正文写作硬规则（SSOT）。
 *
 * 单次起草（SceneDraftEngine）与 agent 改稿回合（WriterAgent）共用同一份规则文本，
 * 保证两条路径对「什么是合格正文」的口径一致；改规则只改这里。
 * 规则来源：多轮百章冒烟归因（章界重演、台词复读、AI 腔高频词、段落均匀化等）。
 */
import type { VocabularyTier } from '@/types/story-runtime';

// 类型定义唯一源在 types/story-runtime.ts；此处再导出保证「规则文本 + 类型」同址获取
export type { VocabularyTier };

/* ============================================
 * 词汇档位（vocabulary tier）
 * ============================================ */

/**
 * 全书词汇可读性档位（类型定义见 types/story-runtime.ts）。大纲定位层产出
 * （styleKeywords/AI 显式字段），写作层执行：「大纲硬核 → 正文允许硬核；
 * 大纲小白 → 正文大白话」。档位只调节术语密度与处理方式，不放开可读性底线
 * ——任何档位下新术语都必须当场大白话落地。
 * 来源：2026-09-30《深海回声》书审——术语密度实测 19-35 个/千字，起草提示词
 * 词汇维度零规则，「通俗易懂口语化」只存在于章节标题要求，正文无对冲。
 */

/** 档位中文标签（提示词与 UI 展示共用） */
export const VOCABULARY_TIER_LABELS: Record<VocabularyTier, string> = {
  hardcore: '硬核技术流',
  balanced: '均衡',
  plain: '小白大白话',
};

/**
 * 档位关键词映射（配置标签 → 档位枚举）。这是对显式定位标签的确定性映射，
 * 不对正文内容做语义判定，语义终审仍归评审 agent——符合规范 §9.4 的例外口径。
 */
const HARDCORE_KEYWORDS = ['硬核', '技术流', '严密推理', '严密推演', '考据', '本格', '硬科幻'];
const PLAIN_KEYWORDS = ['小白', '爽文', '轻松', '搞笑', '幽默', '治愈', '日常', '下饭', '无脑'];

function toTierToken(value: unknown): VocabularyTier | null {
  if (typeof value !== 'string') return null;
  const token = value.trim().toLowerCase();
  if (!token) return null;
  if (token.includes('hardcore') || token.includes('硬核')) return 'hardcore';
  if (token.includes('plain') || token.includes('小白') || token.includes('大白话')) return 'plain';
  if (token.includes('balanced') || token.includes('均衡')) return 'balanced';
  return null;
}

/**
 * 归一化词汇档位。优先取显式档位（`tier` 或 `vocabularyTier` 键都认——调用侧
 * 经常把整个 outlinePositioning 对象直接传入）；缺失时从 styleKeywords/
 * targetReaders 标签推导；双信号冲突或无信号时回落 balanced，
 * 保证旧书（无档位字段）始终有确定档位。
 */
export function normalizeVocabularyTier(input: {
  tier?: unknown;
  vocabularyTier?: unknown;
  styleKeywords?: unknown;
  targetReaders?: unknown;
}): VocabularyTier {
  const explicit = toTierToken(input.tier) ?? toTierToken(input.vocabularyTier);
  if (explicit) return explicit;

  const hintLists = [input.styleKeywords, input.targetReaders];
  let hardcore = false;
  let plain = false;
  for (const list of hintLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item !== 'string') continue;
      if (HARDCORE_KEYWORDS.some(keyword => item.includes(keyword))) hardcore = true;
      if (PLAIN_KEYWORDS.some(keyword => item.includes(keyword))) plain = true;
    }
  }
  if (hardcore && !plain) return 'hardcore';
  if (plain && !hardcore) return 'plain';
  return 'balanced';
}

/**
 * 落库口径的档位：无任何信号（无显式档位且 styleKeywords/targetReaders 全空）时
 * 返回 undefined，不落 balanced 空壳——定位全空的书本就不该持久化定位字段，
 * 读取侧 normalizeVocabularyTier 自然回落 balanced，结果等价且落库零噪声。
 */
export function resolvePersistedVocabularyTier(input: {
  tier?: unknown;
  vocabularyTier?: unknown;
  styleKeywords?: unknown;
  targetReaders?: unknown;
}): VocabularyTier | undefined {
  const hasSignal =
    toTierToken(input.tier) !== null ||
    toTierToken(input.vocabularyTier) !== null ||
    (Array.isArray(input.styleKeywords) && input.styleKeywords.length > 0) ||
    (Array.isArray(input.targetReaders) && input.targetReaders.length > 0);
  if (!hasSignal) return undefined;
  return normalizeVocabularyTier(input);
}

/**
 * 按档位渲染正文词汇规则。SceneDraftEngine（起草）与 WriterAgent（改稿）在
 * CHAPTER_STYLE_RULES 之后注入；档位缺省 balanced——规则永远在场，只有宽严之分。
 */
export function renderVocabularyRules(tier: VocabularyTier = 'balanced'): string[] {
  const label = VOCABULARY_TIER_LABELS[tier];
  if (tier === 'hardcore') {
    return [
      `- 【词汇档位·${label}】专业术语是本书卖点的一部分，允许使用；密度参考：全章新出现+复用的专业词合计每千字不超过 10 个，超出即术语通胀`,
      '- 【术语落地底线·任何档位不放开】每个本章首次出现的专业术语，必须在同句或紧邻句用大白话落地——日常比喻、直接后果、动作演示任选其一（正例：「皮下毛细血管留下树枝状红斑，即法医学上的雷击纹」；反例：「金属晶格发生不可逆的氢脆，韧性跌破临界阈值」——三个概念零落地，读者必然卡住）',
      '- 专业能力的爽感优先用场面演示呈现：主角做了什么动作、看出了什么、结论让谁吃亏；连续两段纯术语叙述而没有动作或对话落地即违规',
    ];
  }
  if (tier === 'plain') {
    return [
      `- 【词汇档位·${label}】正文用日常口语词汇；禁止非日常专业术语（行业黑话/科技术语/文言书面语一律不出现）`,
      '- 专业概念必须当场转译成大白话或日常比喻（如「氢脆」→「这钢被海水泡酥了，一掰就碎」）；金手指与专业能力的爽感靠场面和结果呈现，不靠名词堆砌',
    ];
  }
  return [
    `- 【词汇档位·${label}】专业词只保留题材必需的核心概念，全章新出现的专业词控制在个位数；能用日常词讲清楚的概念一律不用专业词`,
    '- 每个专业词首次出现必须当场解释（同句或邻句大白话），解释借人物动作、对话或比喻承载，不写成百科注释腔',
  ];
}

/**
 * 按档位渲染蓝图节点语言规则（初版拆章/滚动续纲/蓝图再生的 system prompt 共用）。
 * 节点是给写手的场面合同不是术语索引：上游节点用什么词汇，下游正文就会放大什么词汇。
 */
export function renderBlueprintVocabularyRule(tier: VocabularyTier = 'balanced'): string {
  if (tier === 'hardcore') {
    return `- 【词汇档位·${VOCABULARY_TIER_LABELS[tier]}】蓝图节点（标题/概要/CBN/CPNs/CEN/mustCover）可使用题材专业词，但每个专业节点必须自带读者能懂的白话因果——写「利用断裂力学预判撬棍崩断」就不如写「他看出撬棍裂纹的走向，断定对方再压就会崩断反弹」；节点只给术语索引不给场面，正文只会加倍堆砌术语`;
  }
  if (tier === 'plain') {
    return `- 【词汇档位·${VOCABULARY_TIER_LABELS[tier]}】蓝图节点一律用日常语言写场面与因果，禁止出现非日常专业词；专业能力用「做了什么、看出了什么、结果如何」表达，让写手直接照着写成大白话正文`;
  }
  return `- 【词汇档位·${VOCABULARY_TIER_LABELS[tier]}】蓝图节点用白话写场面；题材核心概念可用，但每个专业词须在节点内自带大白话说明，不得堆砌术语`;
}


/** 结构与情节推进规则：章范围、节点展开、禁区、开章/章末约束 */
export const CHAPTER_STRUCTURE_RULES: readonly string[] = [
  '- 必须一次写完全章：按 chapterBeats 顺序覆盖 CBN→CPNs→CEN，情节只向前推进',
  '- 【本章范围】只兑现本章 CBN/CPNs/CEN；禁止提前写后续章高光（如后章才该发生的当堂对线、翻案完结、新实验高潮）',
  '- 【节点原句禁抄】CBN/CPNs/CEN 及 mustCover 是情节合同而非文本素材：严禁把任一节点的原句（≥10 字连续相同）照抄进正文，必须用自己的话把节点展开成有对话/动作/细节的场面。公文/政令/告示/行动命名类内容（如「签发全境锁定令」「完成首批军田实地丈量」）尤其不得照抄节点的长公文腔原句，必须转述：借人物之口口头下达、由下属复述执行、或以旁观视角描述现场动作与民众反应，改写措辞后再写进正文',
  '- 【禁区最高优先级】context 中 forbidden/forbiddenZones 里被要求“不出场”的角色，不得现身、说话、发声、传音、写信署名或被描述现场反应；死亡、尚未揭示、提前揭穿仍是硬禁区。已经写进本章节拍的动作，不得用临时道具、替身或误认当场取消',
  '- 【章末约束】最后一段必须落在 CEN 的后果/悬念上，停笔；不要再开新线或无因由再次入狱/失忆重来',
  '- 【状态衔接】开场必须承接上下文中的上章终态（在狱/在逃/证据清单），禁止无视终态重复穿越醒来',
  '- 【开章多样】禁止每章都用环境/天气/声音描写起手（如「深夜的XX内」「XX的寒风」）；开章可直接从人物动作、对话或冲突切入，与前一章的开章方式错开',
  '- 【禁止】中途重新开场、重复穿越/醒来、重写已发生剧情、把同一事件换措辞再写一遍',
  '- 【禁止】把章节拆成互不衔接的几段独立短文；段落之间必须文气连贯',
  '- 【禁止台词重复】同一句台词/同一句话在本章内不得重复出现（包括章末回扣开篇钩子句）；若需强调，必须变换措辞、场景或由不同人物说出',
  '- 【禁止章末复读】章末段落不得把本章或上文已写过的句子原样再写一遍作为收尾；章末应是新的悬念/后果，而非复读',
];

/** 文风与排版规则：引号、段落节奏、对话分段、指代、去模板、高频词配额 */
export const CHAPTER_STYLE_RULES: readonly string[] = [
  '- 【对话格式】人物说出的完整台词必须使用成对中文引号“”，开引号紧贴台词第一个字、收引号紧贴最后一个字；禁止使用半角引号"…"或『…』等其它包裹；禁止「说/喝/问道：」等提示语后不加引号直接裸接台词；禁止整章出现零对引号（只要有开口说话就必须有引号对）',
  '- 【一段一拍】段落是读者的注意力单元，不是信息打包单元：一段只装一个镜头——同一时刻、同一对象、一个动作或一个信息点。以下任一变化必须换段：镜头/视角转移、动作执行者更换、时间向前推进、感官通道切换、新信息落地、情绪转折；多人同场时逐人或分组引入，禁止把多人的外貌/状态/立场压进同一段',
  '- 【分段即节奏】段落长度是节奏工具。关键台词、关键动作、反转可以单独成段。一段连续动作、拆解或对白来回可以写成 80～180 字；超过约 220 字再拆开。禁止把一个连续动作切成等长的一句一段，也禁止连续多段长度几乎相同',
  '- 【一段一修辞】同一段内对同一对象只做一次修辞性呈现（比喻/通感/夸张择一）；再次提及必须携带新信息（动作或情节推进），禁止换一个比喻重新形容同一状态',
  '- 【关键拍独立】关键台词、关键动作、反转揭示独立成段（全章至少 3 处），让拍点从版面上凸显；全章段落长度应随节奏自然起伏，连续多段长度处在同一档说明有拍子被合并或注水——须拆段而不是扩段',
  '- 【对话分段】两人及以上对话时，每个说话人的台词（含伴随小动作）独立成段，一段只装一个说话人；禁止把多轮你问我答挤进同一段',
  '- 【指代节奏】同一段内“他/他们”不得连续充当多个句子的主语；关键动作的执行者优先点名（姓名或身份称呼），让读者始终知道谁在动',
  '- 【文风去模板】避免连续使用“不是A，而是B”“像是/仿佛”解释情绪；优先用人物动作、选择和具体感官呈现',
  '- 【套话轮换】“居高临下地”“小心翼翼地”“眼中闪过一丝”“嘴角勾起一抹”“深吸了一口气”这类高频修饰语全章至多各用一次；需要同类效果时改写为具体动作或直接删掉修饰语',
  '- 【高频词硬配额】「瞬间」「缓缓」「微微」「如同」「一丝」「一抹」六个词全章各至多出现 2 次，且不得在相邻两段重复使用同一词；百章实测它们是 AI 腔的最大来源（单书「瞬间」达 226 次），超配额时用具体时长/动作/比喻替换（如「瞬间」→「话音未落」「眨眼的工夫」「不等X反应」）',
];

/* ============================================
 * 黄金三章专用规则（开篇吸引力强化）
 * ============================================ */

/**
 * 黄金三章约束常量。前三章是读者决定是否追读的关键窗口,需要更高的
 * 爽点密度、更强的钩子、更快的节奏。来源：多轮百章冒烟书审 L1 层
 * 缺口归因 + 市场头部作品开篇实测（番茄/起点前三章段落密度/对话占比）。
 */
export const GOLDEN_CHAPTER_CONSTRAINTS = {
  /** 连续叙述段上限（超过则必须插入对话/动作） */
  maxContinuousNarration: 2,
  /** 对话占比下限（前三章要求更高互动密度） */
  minDialogueRatio: 0.35,
  /** 段落长度：关键拍可一句成段，连续动作允许写开，超过再拆 */
  targetParagraphLength: {
    median: 80,
    p75: 180,
    splitAt: 220,
  },
  /** 钩子强度要求（按章节映射） */
  hookStrength: {
    ch0: 'strong' as const,  // 第一章必须strong级
    ch1: 'medium' as const,  // 第二章至少medium
    ch2: 'strong' as const,  // 第三章必须strong级
  },
} as const;

/**
 * 渲染黄金三章专用规则。chapterNumber 是 0-based 索引（第一章=0）。
 * 在 SceneDraftEngine.draft 的 system prompt 中，插入在 CHAPTER_STRUCTURE_RULES
 * 之后、CHAPTER_STYLE_RULES 之前，确保开篇章节有针对性的吸引力强化约束。
 */
export function renderGoldenChapterRules(chapterNumber: number): readonly string[] {
  if (chapterNumber > 2) return [];

  const commonRules = [
    '- 【黄金开篇】前三章是读者决定是否追读的关键窗口，每章必须至少包含一个让读者"想知道接下来怎么样"的强钩子',
    '- 【节奏密度】开篇章节禁止大段环境/背景铺陈；世界观、人物背景、规则设定必须通过冲突、对话、动作场景自然带出，不要写成说明文',
    '- 【爽点前置】每章至少一个 micro-coolpoint（小胜/打脸/意外收获/能力展示），不要全是铺垫和压抑',
    '- 【开篇段落强制短促】前三章要有长短交错：关键台词和反转可以一句成段；一段连续动作可以写成 80～180 字，超过约 220 字再拆。连续叙述段≤2段就必须插入对话或动作。对话占比≥35%。禁止连续 3 段长度几乎相同，也禁止把开篇切成等长的一句一段',
  ];

  if (chapterNumber === 0) {
    return [
      ...commonRules,
      '- 【第一章·世界观窗口】时代、地点、主角身份和一条世界规则必须出现，但只能嵌在正在发生的动作和对白里。禁止用「在这个世界」开头的说明书段落，也禁止停下来讲解设定',
      '- 【第一章·主角人设】必须通过具体事件展现：①主角性格特质（至少一个鲜明标签：机智/果决/腹黑/热血） ②主角的核心欲望/目标（为什么要行动） ③主角与众不同的能力暗示（金手指露出，哪怕只是一个异常细节）',
      '- 【第一章·开场钩子】前 3 段内必须出现：悬念（未解之谜）/冲突（对抗场面）/意外（打破常规）三选一，且强度足够（生死/身份/巨额利益相关，不是鸡毛蒜皮的小摩擦）',
      '- 【第一章·金手指露出】本章结束前必须让读者看到主角拥有的特殊能力/知识/资源，哪怕只是暗示或小试牛刀（不要藏到第五章才露，会被弃读）',
    ];
  }

  if (chapterNumber === 1) {
    return [
      ...commonRules,
      '- 【第二章·主线目标】必须明确主角接下来要做什么（短期目标）以及为什么（动机）；目标要具体可感（不是"变强"，而是"三个月后通过宗门大比"；不是"复仇"，而是"扳倒王县令"）',
      '- 【第二章·首个爽点】必须有一个完整的"压制→反击→小胜"micro-loop，让读者第一次感受到主角的行动力和能力优势（可以是言语交锋胜、小规模战斗胜、智斗占上风）',
      '- 【第二章·对立建立】必须出现一个明确的阻碍者/对手/反派，且其动机/实力要交代清楚（让读者知道"主角要面对什么"）',
      '- 【第二章·期待感】章末必须埋下"更大的机会/危机/秘密"线索，承诺后续有更精彩的内容（如"三天后有一场生死比试"、"发现幕后还有更大的阴谋"）',
    ];
  }

  if (chapterNumber === 2) {
    return [
      ...commonRules,
      '- 【第三章·金手指展示】必须有一个完整场景展示主角的核心能力，且效果要超出常人预期（碾压对手/一招制敌/解开众人解不开的谜题/做到别人做不到的事），让读者看到主角的"开挂感"',
      '- 【第三章·拉仇恨】主角的成功/能力展示必须引起他人注意（羡慕/嫉妒/忌惮/不服），为后续冲突埋下火种（有人当场不服、有人暗中记恨、有人开始提防）',
      '- 【第三章·信息差】必须建立"主角知道但其他人不知道"的关键信息（这是后续装逼/打脸的基础）；可以是：主角看穿了某个阴谋、掌握了某个秘密、拥有某个独门知识',
      '- 【第三章·长线悬念】章末必须抛出一个贯穿全书或贯穿一卷的大悬念/大危机/大秘密，让读者想追着看下去（不是"明天有个小任务"，而是"一个月后有生死大劫"、"发现父亲失踪的真相"等长线钩子）',
      '- 【第三章·钩子强度】章末钩子必须是 strong 级（致命危机/重大抉择/核心秘密即将揭露），不能用 weak 级（"明天再说"、"回去休息了"）收尾——第三章是决定读者是否追读的最后一道门槛',
    ];
  }

  return [];
}
