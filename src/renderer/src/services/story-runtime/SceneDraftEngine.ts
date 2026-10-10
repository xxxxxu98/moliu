import type {
  CandidateEvent,
  ContextPack,
  SceneBeat,
  SceneDraft,
  ScenePlan,
  StructuredAI,
  RevisionPlan,
  FutureRevealConstraint,
} from '@/types/story-runtime';

import { CHAPTER_TITLE_PROMPT_RULES, normalizeGeneratedChapterTitle } from '@/services/writing/chapterTitle';
import { MAX_WORD_THRESHOLD, MIN_WORD_THRESHOLD } from '@/services/writing/supplement';
import { renderStatusRules } from '@/services/writing/stateLedger';

import { renderSceneBeatLines } from './creativeCompass';
import {
  CHAPTER_STRUCTURE_RULES,
  CHAPTER_STYLE_RULES,
  renderVocabularyRules,
  renderGoldenChapterRules,
  type VocabularyTier,
} from './proseRules';
import { parseSchema, sceneDraftSchema } from './schemas';
import { sanitizeSceneDraftParagraphs } from './stripDraftLeakage';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 解开常见包装层：{ data } / { result } / { scene } / { draft } */
function unwrapPayload(value: unknown): unknown {
  if (!isRecord(value)) return value;
  for (const key of ['data', 'result', 'scene', 'draft', 'sceneDraft', 'output'] as const) {
    if (key in value) return value[key];
  }
  return value;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n{2,}/u)
      .map(part => part.trim())
      .filter(Boolean);
  }
  return [];
}

function extractParagraphs(payload: unknown): string[] {
  if (typeof payload === 'string' && payload.trim()) {
    return asStringArray(payload);
  }
  if (!isRecord(payload)) return [];

  const direct = asStringArray(
    payload.paragraphs ?? payload.paragraph ?? payload.content ?? payload.text ?? payload.prose
  );
  if (direct.length > 0) return direct;

  // 中文别名兜底
  return asStringArray(payload['段落'] ?? payload['正文'] ?? payload['内容']);
}

function pickCandidateEvents(
  payload: unknown,
  allowed: CandidateEvent[]
): CandidateEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.candidateEvents)) {
    return allowed;
  }

  const allowedById = new Map(allowed.map(item => [item.id, item]));
  const selected: CandidateEvent[] = [];
  for (const item of payload.candidateEvents) {
    const id =
      typeof item === 'string'
        ? item
        : isRecord(item) && typeof item.id === 'string'
          ? item.id
          : '';
    const matched = allowedById.get(id);
    if (matched) {
      selected.push(matched);
    }
  }
  return selected.length > 0 ? selected : allowed;
}

function extractChapterTitle(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const raw =
    payload.chapterTitle ??
    payload.title ??
    payload['章节标题'] ??
    payload['标题'];
  return normalizeGeneratedChapterTitle(raw) ?? undefined;
}

/**
 * 用已知 beat / 候选事件补齐 AI 常漏的结构字段，再交给 zod 校验。
 * 模型经常只返回正文或中文字段名，导致 sceneId/beatId 等为 undefined。
 */
export function coerceSceneDraft(
  value: unknown,
  beat: SceneBeat,
  allowedCandidateEvents: CandidateEvent[]
): SceneDraft {
  const payload = unwrapPayload(value);
  // 根治点：只在结构化边界剥离 schema 残留，不改写小说叙述正文
  const paragraphs = sanitizeSceneDraftParagraphs(extractParagraphs(payload));

  if (paragraphs.length === 0) {
    // 文案含「AI 未返回可解析的结构化 JSON」以匹配 ai-error-classify 的 TRUNCATED_RE，
    // 归类为 truncated（瞬态、可重试）——空段落多半是流式响应中途断开/模型只返回标题的连带症状，
    // 不应被误判为 unknown（持久、不可重试）而浪费整章重试预算。
    throw new Error(
      `场景 ${beat.id} 未返回可用正文段落（AI 未返回可解析的结构化 JSON）`
    );
  }

  const chapterTitle = extractChapterTitle(payload);
  return {
    sceneId: `${beat.id}:scene`,
    beatId: beat.id,
    paragraphs,
    candidateEvents: pickCandidateEvents(payload, allowedCandidateEvents),
    ...(chapterTitle ? { chapterTitle } : {}),
  };
}

function collectAllowedCandidates(plan: ScenePlan, blockedIds: Set<string>): CandidateEvent[] {
  const byId = new Map<string, CandidateEvent>();
  for (const beat of plan.beats) {
    for (const candidate of beat.candidateEvents) {
      if (blockedIds.has(candidate.id)) continue;
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()];
}

/**
 * 单次整章起草：把 CBN/CPNs/CEN 作为大纲节点一次写完，避免多 beat 拼接导致重复开场与文气断裂。
 * 规划层仍保留多 beat（门禁/履约用）；落库只产出一份连贯正文。
 */
/** 群众反应拍子池（2026-10-05 同构治理）：旧书 10/15 章群众反应同为
 * 「嘲笑→死寂」组合；按章号确定性轮换主基调，跨章不复读同一拍子。 */
const CROWD_REACTION_PHASES = [
  '质疑哗然（不敢相信、反复确认、议论纷纷）',
  '冷眼旁观（事不关己、看戏心态、零投入的沉默）',
  '嫉妒怨毒（酸言冷语、见不得好、盼主角出丑）',
  '恐慌骚动（害怕受牵连、夺路避险、秩序失衡）',
  '狂热沸腾（押注起哄、声浪推高、集体亢奋）',
  '讥讽看戏（放话立赌、拿主角打趣、等着看笑话）',
] as const;

export interface SceneDraftOptions {
  targetWordCount?: number;
  /** 上一稿审核失败后的类型化重写计划 */
  revisionPlan?: RevisionPlan;
  /** 当前重写轮次（1 起）；仅用于 prompt 标注 */
  rewriteRound?: number;
  /**
   * 本章合法角色名白名单（来自完整 state.entities，未被 context 压缩筛选）。
   * 注入 prompt 约束模型只用已登记角色名，从源头杜绝跨章名字漂移
   * （如「陈砚」被写成「沈砚」→ fact_conflict → 连环重试）。
   */
  knownCharacterNames?: string[];
  /** 本章可以实际现身、说话和行动的已登记角色 */
  allowedAppearanceNames?: string[];
  /** 未来章节才允许说破的事实 */
  futureReveals?: FutureRevealConstraint[];
  /**
   * 章节已有正式标题（非「第N章」占位）。传入时不再让模型另拟标题：
   * 大纲链路的标题本就不是占位，生成的标题下游必然被丢弃（ChapterWritingPipeline
   * 只在占位时采纳），白占十余行 system 指令与模型注意力。
   */
  existingChapterTitle?: string;
  /**
   * 近几章的结尾句（跨章收尾去重用）。长动作段落里模型会连续多章复用同一句
   * 收尾句式（2026-08-21 实测 76/200 章同尾句），注入「最近写过的收尾」让模型
   * 换一种落笔方式。
   */
  recentEndingSnippets?: Array<{ chapterIndex: number; ending: string }>;
  /**
   * 上一章实际写出的结尾原文（批量续写链路由 useBatchWriter 构造传入）。
   * 大纲 CBN 是规划性语句，可能与上章实际收尾状态冲突（如上章已写花海怒放、
   * 本章 CBN 却写含苞待放）；把真实结尾摆到模型眼前并在指令中声明
   * 「正文事实优先于大纲字面」，仲裁权交给已成文的叙事状态，杜绝状态回退。
   */
  previousChapterEnding?: string;
  /**
   * 死亡族终态角色（状态=死亡/驾崩）。起草 prompt 显式禁止其以任何存活形态
   * 出场（含对话/急报声称其仍活着）。g38f-200chr2 ch184：写手自发发明
   * 「已驾崩皇帝病危急报」钩子，fact_conflict 五连拒整章死。
   */
  terminalFateCharacters?: Array<{ name: string; status: string }>;
  /**
   * 头衔锚（契约 14）：每角色最近一次入账的官职/头衔/品级。正文称谓必须
   * 与之一致——g38f r4 全文通读实证主角官职五重漂移+拜相爽点被 ch200 重复兑现。
   */
  characterTitleAnchors?: Array<{ name: string; title: string }>;
  /**
   * 纪年锚：近章既成纪年叙述（r5 实证纪年五套互斥）。正文纪年必须与之一致
   * 且单调推进，禁止引入新年号或真实历史年号。
   */
  eraAnchors?: string[];
  /**
   * 数字锚：项目数字台账格式化行（2026-10-05 台账化，契约 15 结构化出账）。
   * 正文引用同一对象数值必须与既成一致，改写须正文明示勘误过程。
   */
  numericFacts?: string[];
  /**
   * 期限承诺（契约 17，2026-10-05）：待兑现时间承诺清单。本章剧情时间到达或
   * 越过期限时必须兑现或写出显式改期/变故（实证：三次承诺「三天后开赛」
   * 次日开打零拦截）。
   */
  timePromises?: string[];
  /**
   * 时间轴（storyClock 轻量版，2026-10-05）：近章既成时间标记。本章时间流逝
   * 必须与之连续，给读者可感知的天/夜推进（实证：15 章正文零时间锚）。
   */
  timelineMarks?: string[];
  /**
   * 假死在册角色（r8 实证：假死被当死亡锁死主角 48 章）。注入【假死纪律】：
   * 隐匿形态活动合法，公开现身需揭晓场面。
   */
  fakedDeathCharacters?: Array<{ name: string; chapterIndex: number }>;
  /**
   * 命运状态正典（2026-09-24 g38f 500ch S1/S2：在押凭空自由出场/去职照常
   * 行使职权）。每角色最新命运状态，注入【命运状态正典】规则块。
   */
  fateStatusAnchors?: Array<{ name: string; status: string; chapterIndex: number }>;
  /**
   * 实体状态卡（unified-state-ledger 读侧接管，默认开启；MOLIU_STATE_CARD=0 退回旧通道）：
   * 从状态账本折叠的分组视图（在押含押地/已死/假死/去职/现任头衔）。在场时
   * 替换【命运状态正典】块——「最晚一条原始状态」视图读不到被押地/头衔行
   * 覆盖的终态（r8-S1-05 顾宪诚形态），状态卡是单一真相源。
   */
  stateCard?: string[];
  /**
   * 身份锚：本章出场角色的角色卡身份首句（r6 实证同一角色前后两身份）。
   * 正文中的身份/地位/职权必须与角色卡一致，禁止发明同名姻亲/替身。
   */
  characterIdentityAnchors?: Array<{ name: string; identity: string }>;
  /**
   * 近几章的章尾悬念(CEN 规划原文,如「第5章:窗外劲弩直射陆衡面门」)。
   * 2026-10-01 P1.1 悬念账本写作层注入:把「前面抛了什么」摆到写手眼前,
   * 要求本章自然承接至少一条(正面兑现或显式推进),杜绝悬念开而不接。
   */
  recentChapterCliffhangers?: string[];
  /**
   * 作者正典（worldSchema.rules 中 locked=true 的规则，2026-10-05）：
   * 人工锁定的世界观设定，优先级高于大纲节点与一切提取账——人机混写时
   * 作者是最终真相仲裁者。
   */
  authorCanon?: string[];
  /**
   * 词汇档位（大纲定位产出，全书唯一）：调节正文术语密度与落地口径。
   * 缺省 balanced；规则永远注入，只有宽严之分（详见 proseRules.renderVocabularyRules）。
   */
  vocabularyTier?: VocabularyTier;
  /** 章内节拍。缺省时仍按合同里的 CBN/CPN/CEN 写 */
  sceneBeats?: string[];
  /** 已渲染的创作罗盘。空串不注入 */
  creativeCompass?: string;
}

export class SceneDraftEngine {
  constructor(private readonly ai: StructuredAI) {}

  async draft(
    plan: ScenePlan,
    context: ContextPack,
    options?: SceneDraftOptions
  ): Promise<SceneDraft[]> {
    if (plan.beats.length === 0) {
      throw new Error(`章节 ${plan.chapterNumber} 缺少可写场景 beat`);
    }

    const blockedIds = new Set(
      plan.prechecks.filter(result => !result.accepted).map(result => result.candidateId)
    );
    const primaryBeat = plan.beats[0];
    const candidates = collectAllowedCandidates(plan, blockedIds);
    const expectedSceneId = `${primaryBeat.id}:scene`;
    const chapterBeats = plan.beats.map(beat => ({
      id: beat.id,
      kind: beat.kind,
      order: beat.order,
      summary: beat.summary,
    }));
    const targetWordCount = options?.targetWordCount;
    const revisionPlan = options?.revisionPlan;
    const revisionHints = (revisionPlan?.hints ?? [])
      .map(hint => hint.trim())
      .filter(Boolean)
      .slice(0, 8);
    const hasWordTarget = typeof targetWordCount === 'number' && targetWordCount > 0;
    const minWordCount = hasWordTarget
      ? Math.floor(targetWordCount * MIN_WORD_THRESHOLD)
      : null;
    const maxWordCount = hasWordTarget
      ? Math.ceil(targetWordCount * MAX_WORD_THRESHOLD)
      : null;
    const minPct = Math.round(MIN_WORD_THRESHOLD * 100);
    const maxPct = Math.round(MAX_WORD_THRESHOLD * 100);
    const wordCountRules =
      hasWordTarget && minWordCount !== null && maxWordCount !== null
        ? [
            `- 本章目标 ${targetWordCount} 字（与编辑器一致：全文长度口径）；paragraphs 合计硬性区间 ${minWordCount}–${maxWordCount} 字（${minPct}%–${maxPct}%）`,
            `- 低于 ${minWordCount} 或高于 ${maxWordCount} 都视为不合格草稿`,
            `- 【字数硬要求】这是整章 single-shot 起草，必须落在 ${minWordCount}–${maxWordCount} 字，理想落点 ${targetWordCount}±10%。写不够会触发补字（补出来的段落看不到全书上下文，极易与本章事实冲突并导致整章重写）；写超上限会触发压缩改写（浪费预算，且压缩稿质量低于一次成型——2026-09-29 reg20 实测：单边强调写够下限导致模型系统性超写 ~30%，三章压缩后仍 3600–4100/上限 3540）。按节拍预算控制篇幅：对话、动作、感官细节按需展开，注水与干瘪都不要`,
            `- 禁止无意义注水、重复开场、把同一事件换措辞再写一遍；也禁止把一章写成远超目标的长文`,
            '- 分段：关键台词、关键动作、反转可以单独成段；一段连续动作可以写成 80～180 字，超过约 220 字再拆。禁止把一个动作切成等长的一句一段',
          ]
        : [];
    // 角色名白名单：从完整角色库提取（未被 context 压缩筛选），约束模型只用已登记角色名，
    // 从源头杜绝跨章名字漂移（如「陈砚」写成「沈砚」→ fact_conflict → 连环重试）。
    // 仅当白名单有 2 个以上角色时注入（单角色无约束意义）。
    const knownCharacterNames = (options?.knownCharacterNames ?? [])
      .map(name => name.trim())
      .filter(Boolean);
    const characterNameRules =
      knownCharacterNames.length >= 2
        ? [
            `- 【已登记角色名】需要写出具体姓名时，只能使用：${knownCharacterNames.join('、')}`,
            '- 如需临时功能角色，用身份称呼（如「狱卒」「书吏」），不要另起具体姓名',
            '- 特别注意：不要把已登记角色的名字写成形近字或近义字（如「陈默」不要写成「沈默」、「陈砚」不要写成「沈砚」）',
          ]
        : [];
    const allowedAppearanceNames = (options?.allowedAppearanceNames ?? [])
      .map(name => name.trim())
      .filter(Boolean);
    // 角色类 embargo（上游 resolveAllowedChapterCharacters 以「角色"X"…」格式产出）单列
    // 硬禁令：r5 裴天禄/r7 过江龙两轮实证，混在事实揭示软规则里被 writer 无视提前点名。
    const characterEmbargoRules = (options?.futureReveals ?? [])
      .filter(item => item.description.startsWith('角色'))
      .map(item => `  - ${item.description}`)
      .slice(0, 8);
    const factEmbargoItems = (options?.futureReveals ?? [])
      .filter(item => !item.description.startsWith('角色'))
      .slice(0, 12);
    const appearanceRules = allowedAppearanceNames.length > 0
      ? [
          `- 【本章出场名单】只有以下已登记角色可以现身、说话或实施行动：${allowedAppearanceNames.join('、')}`,
          '- 其他已登记角色最多只能作为背景信息被提及，不得来到现场、发声、写信署名或被描述即时反应',
        ]
      : [];
    const hardEmbargoRules = characterEmbargoRules.length > 0
      ? [
          '- 【登场禁令】以下角色未到登场章，本章任何位置禁止现身、被点名、署名、被描述即时反应或在对话中被直接谈及（只能完全不出现）：',
          ...characterEmbargoRules,
        ]
      : [];
    const futureRevealRules = factEmbargoItems.length > 0
      ? [
          '- 【未来揭示禁区】下列事实尚未到揭示章节，只能留下模糊线索，禁止明确点名或下结论：',
          ...factEmbargoItems.map(item =>
            `  - 第${item.notBeforeChapter}章前不得揭示：${item.description}`
          ),
        ]
      : [];
    // 死亡族终态禁令：死者只能向后引用（回忆/遗物/丧仪/档案），不得以任何存活形态出场
    // 状态卡在场时，终态禁令、头衔锚、假死纪律已经写在卡里，再各出一块会把同一事实说两遍。
    const useStateCard = (options?.stateCard ?? []).some(row => row.trim().length > 0);
    const terminalFateCharacters = useStateCard
      ? []
      : (options?.terminalFateCharacters ?? []).filter(item => item.name && item.status);
    const terminalFateRules = terminalFateCharacters.length > 0
      ? [
          '- 【命运终态禁令】以下角色在既成事实中已死亡，禁止以任何「仍然存活」的形态出现——不得现身、行动、说话、下旨，也不得在对话/急报/密报/传闻中被描述为刚刚还在活动（如病危、晕厥、遇袭待救）：',
          ...terminalFateCharacters.map(item => `  - ${item.name}（已${item.status}）`),
          '- 他们只能以回忆、追述、遗物、档案、验尸、丧仪等向后引用形式存在；若剧情确需「有人谎称其还活着」，正文必须把这是谣言或误报写明',
        ]
      : [];
    // 头衔锚：正文称谓与最近入账头衔一致（契约 14）
    const characterTitleAnchors = useStateCard
      ? []
      : (options?.characterTitleAnchors ?? []).filter(item => item.name && item.title);
    const titleAnchorRules = characterTitleAnchors.length > 0
      ? [
          '- 【头衔锚】以下是各角色当前（最近一次既成任命）的官职/头衔/品级，正文与对话中的称谓、自称、品级、补服袍色必须与之一致；禁止使用旧头衔、凭空新头衔或品级跳变（升迁/降黜只能发生在正文写明任命之后）：',
          ...characterTitleAnchors.map(item => `  - ${item.name}：${item.title}`),
        ]
      : [];
    // 身份锚：出场角色的身份/地位与角色卡一致（r6 实证同一角色前后两身份）
    const characterIdentityAnchors = (options?.characterIdentityAnchors ?? []).filter(
      item => item.name && item.identity
    );
    const identityAnchorRules = characterIdentityAnchors.length > 0
      ? [
          '- 【身份锚】以下是本章出场角色的既定身份（角色卡为准）：正文与对话中该角色的身份、地位、职权、与皇室/朝堂的关系必须与之一致；章节大纲节点与此冲突时以角色卡为准，禁止把具名角色降格/升格，更禁止发明同名的姻亲、替身、门客来调和矛盾（2026-09-17 g38f r6 实证：角色表赵宣=当朝三皇子恭王，某章写手却把他写成「户部右侍郎的姻亲、刑部主事赵宣」，下一章又写回恭王本人——同一人前后两身份）：',
          ...characterIdentityAnchors.map(item => `  - ${item.name}：${item.identity}`),
        ]
      : [];
    // 假死纪律（r8 实证：假死被当死亡，主角 48 章无法活体登场）
    const fakedDeathCharacters = useStateCard
      ? []
      : (options?.fakedDeathCharacters ?? []).filter(item => item.name);
    const fakedDeathRules = fakedDeathCharacters.length > 0
      ? [
          '- 【假死纪律】以下角色处于假死状态（外界认为已死，实际活着）——这是活着的隐匿状态，不是死亡：',
          ...fakedDeathCharacters.map(item => `  - ${item.name}（第${item.chapterIndex}章起假死在册，未揭晓）`),
          '- 假死角色本章可以活体活动，但只能以隐匿形态出现（密室养伤/乔装改扮/暗线传信/借他人之手布局）；禁止未经揭晓就以原身份公开现身于朝堂、市井等公众场合；若剧情到假死揭晓时点，必须写当众现身/真相大白的具体场面（何人何地目睹、世人如何知晓），不得一笔带过；更禁止把假死角色当作真死人处理（衣冠道具代替本人、「生前」布局、遗策等表述均违规）（2026-09-20 g38f r8 实证：主角假死后被当真死 48 章，蓝图安排其现身全被写成空袍道具，滚纲写出「生前密信」）',
        ]
      : [];
    // 命运状态正典（2026-09-24 g38f 500ch S1/S2：在押凭空自由出场/去职照常行使
    // 职权——终态禁令只列死亡族，可逆终态此前无注入）。第 2 阶段：状态卡在场时
    // 整块替换（账本折叠视图是「最晚值」视图的超集，双块并存只会稀释注意力）。
    const fateStatusRules = renderStatusRules(options?.stateCard, options?.fateStatusAnchors);
    // 纪年锚：正文纪年与近章既成纪年连续（r6 实证：锚只拦真实年号不拦自创年号，
    // 后 50 章模型自创「建元/建昭/宣府元年」平行纪年 9 章——升格为全书唯一年号约束，
    // 并补空锚分支：锚为空时禁止发明任何年号）
    const eraAnchorsPresent = (options?.eraAnchors ?? []).length > 0;
    const eraAnchorRules = eraAnchorsPresent
      ? [
          '- 【纪年锚·全书唯一年号】以下纪年叙述是本书自始至终唯一一套年号的既成用法。全书正文（含对话、公文、账册、回忆、旁白）只能使用这些年号，且年数只能随剧情单调递进：',
          ...(options?.eraAnchors ?? []).map(item => `  - ${item}`),
          '- 禁止发明任何新年号：正文中任何位置出现锚外年号（含「X元年」「X＋数字＋年」的任何新组合、把地名/府名当年号）即属事实错误；引用前朝旧事也只能用既有的朝代名/先帝庙号相对表述，不得另造年号（2026-09-17 g38f r6 实证：后 50 章自创「建元」「建昭」「宣府元年」与全书「天兴」平行纪年同一时间窗）。皇帝称号不得衍生年号：在位皇帝的称号（如「永宁帝」的「永宁」二字是帝号称号不是年号）严禁与「N年」组合成纪年——「永宁三年」类由称号拼出的纪年即属锚外年号，纪年只能用上方锚定年号（2026-09-23 g38f 500ch 实证：ch68 三次被拒均因模型把帝号「永宁」自演绎为年号「永宁三年」，与全书年号「天武」冲突死锁）',
        ]
      : [
          '- 【纪年锚·未确立年号】本书正文尚未确立任何年号。本章禁止发明年号（不得出现「两字年号＋数字＋年/元年」组合，如「某元三年」）；需要纪年时用「当朝/今岁/去岁/前年/三年前」等相对表述，或以皇帝庙号/在位年数相对锚定',
        ];
    // 跨章收尾去重：把近几章实际写出的结尾句列出来，禁止本章再写同款收尾
    const recentEndingRules = (options?.recentEndingSnippets ?? []).length > 0
      ? [
          '- 【跨章收尾去重】以下是最近几章已经写过的结尾句，本章最后一段禁止重复这些句子或其同款句式（换几个词的变体也不行）：',
          ...(options?.recentEndingSnippets ?? []).map(item =>
            `  - 第${item.chapterIndex}章结尾：「…${item.ending}」`
          ),
          '- 本章收尾必须落在 CEN 的新后果/新悬念上，用与前章不同的动作、意象和句式落笔',
        ]
      : [];
    // 未闭合悬念承接(2026-10-01 P1.1 悬念账本写作层):近几章 CEN 是规划性
    // 悬念,本章必须接住至少一条——悬念开而不接是弃书点(读者裁判 r14 实证
    // 「悬念累积不闭合」)。与上章正文实际收尾冲突时正文优先(悬念本身仍要接)
    const recentCliffhangerRules = (options?.recentChapterCliffhangers ?? []).length > 0
      ? [
          '- 【未闭合悬念承接】以下是最近几章章尾抛出的悬念（规划原文），本章正文必须正面承接其中至少一条——当场兑现，或显式推进一步后抛出更强的新钩；禁止全部无视另起炉灶：',
          ...(options?.recentChapterCliffhangers ?? []).map(item => `  - ${item}`),
          '- 悬念与上章正文实际收尾描述有出入时，以上章正文事实为准；但悬念事件本身必须被接住，不得凭「没发生过」跳过',
        ]
      : [];
    // 上章结尾仲裁：CBN 是规划语句，正文事实优先；防止开场状态回退
    const previousEndingRules = (options?.previousChapterEnding ?? '').trim()
      ? [
          '- 【上章衔接】上一章正文结尾原文如下（这是已成文的既定事实）：',
          `  「…${(options?.previousChapterEnding ?? '').trim().slice(-400)}」`,
          '- 本章开场必须承接该结尾的场景状态继续推进；若本章 CBN 与该结尾描述的状态有出入（如已开花 vs 含苞、已昏迷 vs 站立），以上章正文事实为准向前推进，禁止把状态回退到 CBN 字面描述',
          '- 【章界动线】上章结尾时每个角色的所在地、在途状态与既定计划都是既定事实：上章末在途中（押运/行军/追赶/乘船乘车）的角色或队伍，本章开头必须交代其行止（抵达/中途变故/奉命折返），禁止无交代地瞬移到另一地点或凭空消失；在途的车辆/船队/箱笼数量禁止无解释增减；上章末已定下的路线、分工、行动方案，本章若要变更必须写出变更的原因或变故（2026-09-17 g38f r6 实证：ch30 末主角随车队押运入峡、ch31 却无折返交代直接出现在京师值房；ch69 末定「官船诱敌、三人走旱路」已出发、ch70 却折返登船走水路——两章读者评分破线）',
        ]
      : [];
    const modeRules: Record<RevisionPlan['mode'], string[]> = {
      expand: [
        '- 【扩写模式】保留原稿已经发生的情节与因果，在场景内部增加有效对话、动作、阻力和感官细节；不得用同义复述注水',
        `- 扩写后正文必须落入 ${minWordCount ?? '约定下限'}–${maxWordCount ?? '约定上限'} 字`,
      ],
      compress: [
        '- 【压缩模式】允许合并段落、删去重复解释并改写措辞；不得机械截断正文',
        '- 必须保留全部 CBN/CPNs/CEN、关键证据、因果转折和章末钩子，不得压成剧情梗概',
        `- 压缩后正文必须落入 ${minWordCount ?? '约定下限'}–${maxWordCount ?? '约定上限'} 字`,
      ],
      repair: [
        '- 【修复模式】只针对问题清单重写相关场景；未涉及的情节、证据与因果关系保持稳定',
        '- 可以替换或合并有问题的段落，但不得删除已履约的 CBN/CPNs/CEN',
        '- 语义问题（fact_conflict/存在性冲突）指向的场景是上一稿自行发明、与全书既有事实冲突的内容：允许整体删除或改写成符合事实的形态（回忆、误报被识破等），不受「保持稳定」保护',
      ],
    };
    // 已有正式标题时只要求原样回填，省掉整套拟标题规则与 titleHints
    const existingChapterTitle = options?.existingChapterTitle?.trim() ?? '';
    const titleRules = existingChapterTitle
      ? [`- chapterTitle 直接原样回填「${existingChapterTitle}」，本章不需要另拟标题`]
      : CHAPTER_TITLE_PROMPT_RULES;
    const revisionRules =
      revisionHints.length > 0 && revisionPlan
        ? [
            `【重写任务·${revisionPlan.mode}】上一稿未通过审核，必须修复下列问题，禁止重复同样错误：`,
            ...modeRules[revisionPlan.mode],
            ...revisionHints.map((hint, index) => `${index + 1}. ${hint}`),
            '- 内心观察与公开结论、证物细节必须前后一致；禁区内容不得出现或等价泄露（本章 mustCover 履约所需的指认/证据展示除外）',
          ]
        : [];
    const candidateIds = candidates.map(item => item.id);

    const raw = await this.ai.generate<SceneDraft>({
      purpose: 'scene-draft',
      schemaName: 'SceneDraft',
      system: [
        ...((options?.creativeCompass ?? '').trim() ? [options?.creativeCompass?.trim() ?? ''] : []),
        '你是长篇小说的场景作者。按章内节拍把这场戏演完：开场是已经在进行、还没见分晓的动作，后文顺着因果往下写。合同节点是场面顺序，不是待勾选的清单。不得采用预检失败的候选事件。',
        ...renderSceneBeatLines(options?.sceneBeats),
        '只输出一个 JSON 对象，不要 Markdown 代码块，不要解释。',
        'JSON 字段必须为：',
        `{"sceneId":"${expectedSceneId}","beatId":"${primaryBeat.id}","chapterTitle":"短标题","paragraphs":["段落1","段落2"],"candidateEvents":[{"id":"..."}]}`,
        `- sceneId 必须等于 "${expectedSceneId}"`,
        `- beatId 必须等于 "${primaryBeat.id}"`,
        ...titleRules,
        '- paragraphs 至少 1 段，写可直接入库的小说正文（中文）',
        ...CHAPTER_STRUCTURE_RULES,
        ...renderGoldenChapterRules(plan.chapterNumber),
        ...recentEndingRules,
        ...recentCliffhangerRules,
        ...previousEndingRules,
        ...CHAPTER_STYLE_RULES,
        ...renderVocabularyRules(options?.vocabularyTier),
        '- paragraphs 数组元素只能是小说正文，禁止写入 sceneId/beatId/candidateEvents 等字段名，禁止写入 ] } : 等 JSON 骨架',
        '- candidateEvents 只填 id 列表（从 allowedCandidateEventIds 中选），禁止重复粘贴 summary',
        ...wordCountRules,
        ...characterNameRules,
        ...appearanceRules,
        ...hardEmbargoRules,
        ...futureRevealRules,
        ...terminalFateRules,
        ...titleAnchorRules,
        ...identityAnchorRules,
        ...fakedDeathRules,
        ...fateStatusRules,
        ...eraAnchorRules,
        '- 【皇统叙事】在位皇帝只能以「皇帝/陛下/今上/圣上/年号+帝」称呼，「先帝/先皇/大行皇帝」只能用于已驾崩者——上下文显示皇帝仍在世（颁诏/视朝/病重未死）时严禁称其先帝（2026-09-19 g38f r7 实证：老皇帝在位期间五处被称先帝）。驾崩必须有叙述场面（病榻托孤/遗诏宣读/讣告/丧仪任一），不得零叙述直接写新帝即位。「东宫/太子」指代必须单一稳定，不得在「现任储君」与「已废太子」间漂移。涉及「自X年起N年」的年数叙述，落笔前与当前年份验算跨度（r7 实证：「自嘉定三年起整整七年」而当年仅嘉定四年）',
        ...(options?.numericFacts ?? []).length > 0
          ? [
              '- 【数字锚·既成名录】以下是台账锁定的正典数字（对象＝数值单位，同对象以首次确立值为准），本章引用同一对象的数值必须与之一致，未写勘误场面不得改口：',
              ...(options?.numericFacts ?? []).map(item => `  - ${item}`),
            ]
          : [],
        '- 【数字锚】前文既成叙述中对后续剧情有约束力的数字（金额/债务/价格、度量/吨位/规模、数量/编制/人数、期限/天数、比率/赔率等，不限题材单位——信用点/灵石/吨/天与银两/石/兵完全同权）是既定事实：本章引用同一对象必须与既成数值一致；账目勘误、清点更正或数额本来就是虚报等剧情性修正，必须在正文中写出勘误/清点过程与原因，禁止无解释改写既成数字（2026-09-17 g38f r6 实证：同一笔盐税五套口径、存粮四万石无解释改四十万石；2026-10-05 都市文实证：债务总额三百万无解释改三十万、战宠两吨下章变三十吨）。落笔前先验算：凡写「每箱N锭×M箱」「单价N×数量M」类数量×容量叙述，乘积必须与你要写的总量声明一致（2026-09-19 r7 实证：一箱六十锭×五十万箱=15亿两，正文却称三千万两，差500倍）',
        // 作者正典（2026-10-05）：locked 世界观规则高于大纲节点与提取账
        ...(options?.authorCanon ?? []).length > 0
          ? [
              '- 【作者正典】以下是作者锁定的世界观规则，优先级最高——正文任何情节、对话、旁白不得违反或改写；本章大纲节点与正典冲突时以正典为准并把冲突情节改写为符合正典的形态：',
              ...(options?.authorCanon ?? []).map(item => `  - ${item}`),
            ]
          : [],
        ...(options?.timePromises ?? []).length > 0
          ? [
              '- 【期限承诺】以下是正文已立下且尚未兑现的期限承诺：',
              ...(options?.timePromises ?? []).map(item => `  - ${item}`),
              '- 本章剧情时间一旦到达或越过某承诺期限，正文必须兑现该承诺，或写出显式的改期/解除/变故场面；禁止让剧情无声跳过期限（2026-10-05 都市文实证：三次承诺「三天后十六强开赛」，实际次日凌晨开打零拦截）',
            ]
          : [],
        ...(options?.timelineMarks ?? []).length > 0
          ? [
              '- 【时间轴】以下是近章既成的时间标记（按章排列）：',
              ...(options?.timelineMarks ?? []).map(item => `  - ${item}`),
              '- 本章的时间流逝必须与上述标记连续推进（当天/当夜/次日清晨…），跨度变大时用「次日/N天后」类明示锚点让读者可感知；禁止无交代的时间回退或跳跃',
            ]
          : [],
        '- 【机制不复述】金手指规则/战力体系/杀伤原理/世界观定律在首次登场章已完整讲解过，后续章节只许引用结论或写它的新变化、新代价，禁止整段重讲同一套机制原理（2026-10-05 都市文书审实证：同一毒素机制跨 6 章重复讲解 9 次、同一定律近乎同文三讲——老读者感知为复读注水）',
        // 呼吸拍（2026-10-05 生理节律相位，与大纲层节奏相位同款章号确定性映射，
        // 每 3 章第 2 章注入）：高压剧情中的人味节拍
        ...(plan.chapterNumber % 3 === 2
          ? [
              '- 【呼吸拍】本章须有一处主要角色的生理/生活锚点（30-60 字）：进食/饮水/洗漱/睡眠/补眠/疲惫/饥饿/旧伤反应任一——连续高压剧情中的人味节拍，让角色是活人而非战斗机器（2026-10-05 都市文书审实证：主角 15 章零进食零睡眠，通宵血战后直接登台，被「终日营养不良」的设定台词反衬成讽刺）。锚点须自然嵌入场景节拍（等结果时啃冷馒头、验伤时洗掉血污、换药时打盹），禁止脱离剧情的流水账',
            ]
          : []),
        // 群众反应相位（同构治理）：本章群众场面的主基调按章号轮换
        (() => {
          const phase = CROWD_REACTION_PHASES[plan.chapterNumber % CROWD_REACTION_PHASES.length];
          return [
            `- 【群众反应相位】本章若写看台/围观者/旁观者群体反应，主基调用「${phase}」的笔法展开（写两三个具体的人的具体反应，而非笼统的「哄笑」「死寂」）；禁止再写「哄堂嘲笑→全场死寂」组合——该组合前文已反复使用，读者感知为模板复读（2026-10-05 都市文书审实证：15 章里 10 章同款群众反应）`,
          ];
        })(),
        ...revisionRules,
      ].join('\n'),
      prompt: JSON.stringify({
        chapterNumber: plan.chapterNumber,
        chapterBeats,
        primaryBeatId: primaryBeat.id,
        allowedCandidateEventIds: candidateIds,
        // 候选事件只给 id→一句 summary，避免与 beats/合同重复灌长文
        candidateSummaries: Object.fromEntries(
          candidates.map(item => [item.id, item.summary])
        ),
        context,
        targetWordCount: targetWordCount ?? null,
        writingRules: {
          mode: 'single-shot-chapter',
          forbidPlotRestart: true,
          scopeThisChapterOnly: true,
          endOnCEN: true,
          forbidFutureChapterPayoffs: true,
          targetWordCount: targetWordCount ?? null,
          minWordCount,
          maxWordCount,
          allowedAppearanceNames,
          terminalFateCharacters: terminalFateCharacters.map(item => `${item.name}（已${item.status}）`),
          futureReveals: options?.futureReveals ?? [],
        },
        titleHints: existingChapterTitle
          ? { fixedTitle: existingChapterTitle }
          : {
              vibe: '口语网文目录风，信息量够、别公文/案情通报',
              length: {
                min: 2,
                max: 22,
                prefer: '6-16字，宁可稍长也不要四字电报',
              },
              prefer: [
                '打脸',
                '翻车',
                '反转',
                '第一次',
                '秘密',
                '麻烦',
                '悬念半截话',
                '人物+事件',
                '反差钩子',
              ],
              avoid: ['四字成语堆砌', '公文味短句', '过于严肃的案情概括', '连续章节同款硬四字'],
              examples: [
                '这尸体怎么验都不对劲',
                '刚穿越就被诬下狱',
                '县令公子当场翻车',
                '今晚睡不着了',
              ],
            },
        revisionFeedback:
          revisionHints.length > 0 && revisionPlan
            ? {
                rewriteRound: options?.rewriteRound ?? 1,
                mode: revisionPlan.mode,
                mustFix: revisionHints,
                minWords: revisionPlan.minWords ?? minWordCount,
                maxWords: revisionPlan.maxWords ?? maxWordCount,
              }
            : null,
        requiredOutput: {
          sceneId: expectedSceneId,
          beatId: primaryBeat.id,
          chapterTitle: existingChapterTitle || '口语标题（6-16字优先，如：这尸体怎么验都不对劲）',
          paragraphs: ['正文段落...'],
          candidateEvents: candidateIds.map(id => ({ id })),
        },
      }),
      parse: value =>
        parseSchema(
          sceneDraftSchema,
          coerceSceneDraft(value, primaryBeat, candidates),
          `章节 ${plan.chapterNumber} 整章正文`
        ),
    });

    const draft = parseSchema(
      sceneDraftSchema,
      coerceSceneDraft(raw, primaryBeat, candidates),
      `章节 ${plan.chapterNumber} 整章正文`
    );
    if (draft.beatId !== primaryBeat.id) {
      throw new Error(`整章输出 beatId ${draft.beatId} 与主 beat ${primaryBeat.id} 不一致`);
    }
    if (draft.candidateEvents.some(event => blockedIds.has(event.id))) {
      throw new Error(`场景 ${draft.sceneId} 使用了预检失败的候选事件`);
    }
    return [draft];
  }
}
