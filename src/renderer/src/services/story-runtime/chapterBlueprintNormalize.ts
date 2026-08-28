/**
 * 规范化章节蓝图节点，消除 CEN=`推进至：${CPN}` 等零信息量畸形。
 */

const ADVANCE_PREFIX = /^推进至[：:]\s*/u;
const CHAPTER_TITLE_ONLY = /^第\s*\d+\s*章$/u;
const META_CEN_PATTERN =
  /情节不得原地重复开场|抛出下一拍冲突|章末钩子[：:].*完成「|本章只推进到可落地|本章兑现下一拍|抛出下一拍未解问题|章末落在其直接后果|不可逆危机，章末落在/u;
/** 模板空壳章钩：只有压迫话术、没有具体情节 */
const TEMPLATE_HOOK_PATTERN =
  /之后立刻陷入不可逆危机|倒计时或反噬压到眼前|本章冲突兑现后压力升级|之后压力升级，留下立刻可接的悬念|已发生，直接后果落地并带出新的压迫|留下悬念，吸引读者继续阅读|后对手反手施压，倒计时与证据链同时收紧|对手反手施压[，,]倒计时与证据链同时收紧|倒计时与证据链同时收紧/u;
/** 大纲/企划口吻（读者期待、代入感等），不可当情节节点 */
const READER_META_PATTERN =
  /读者期待|让读者对|强烈代入感|爽文预期|建立[「「"'].{0,16}预期|完成(?:开篇|穿越)设定|建立主角(?:技术)?权威|制造生死危机/u;
const INHERITED_CBN_PREFIX = /^承接上[章段]结尾[：:]\s*/u;
const WEAK_CONTINUE_CBN_PREFIX = /^承接上章危机后继续推进[：:]\s*/u;
const OPENING_CBN_PREFIX =
  /^(开场承接|承接上章结尾|承接前段|承接上章危机后继续推进|承接前章结尾继续)[：:]\s*/u;

export interface RawChapterBlueprint {
  title: string;
  goal?: string;
  CBN?: string;
  CPNs?: string[];
  CEN?: string;
  mustCover?: string[];
  keyEvents?: string[];
  description?: string;
}

export interface NormalizedChapterBlueprint {
  goal: string;
  CBN: string;
  CPNs: string[];
  CEN: string;
  mustCover: string[];
}

export interface NormalizeBlueprintOptions {
  /** 上章正文结尾（实况衔接） */
  previousEnding?: string;
  /** 上章 CEN（优先于正文碎片作承接 tip） */
  previousCen?: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function stripAdvancePrefix(cen: string): string {
  return cen.replace(ADVANCE_PREFIX, '').trim();
}

/** 去掉承接/开场前缀，得到可履约的情节正文 */
export function stripOpeningCbnPrefix(text: string): string {
  return (text ?? '').replace(OPENING_CBN_PREFIX, '').trim();
}

export function isAdvancePrefixedCen(cen: string): boolean {
  return ADVANCE_PREFIX.test(cen.trim());
}

/** 写作指令 / 流程话术（非情节节点） */
export function isMetaInstructionCen(cen: string): boolean {
  return META_CEN_PATTERN.test(cen.trim());
}

export function isTemplateHookCen(text: string): boolean {
  return TEMPLATE_HOOK_PATTERN.test((text ?? '').trim());
}

/**
 * 时限/限期等跨章标记（支持中文数字：「三天内」「三日后」「一年内」）。
 * 年份回溯“发生在三年前”不是期限，不能因命中“三年”而误删有效单章取证节点。
 */
const CROSS_CHAPTER_DEADLINE_RE =
  /[0-9一二三四五六七八九十百零两]+\s*(?:(?:个?月|天|日|周)(?:内|后)?|年(?:内|后))/u;
const CROSS_CHAPTER_DEADLINE_WORD_RE = /限期|截止/u;
/** 威胁后果标记（须与限期目标组合才判跨章，单独成句是章末钩子） */
const CROSS_CHAPTER_THREAT_RE = /否则(?:将|就|便会)?(?:被|遭)?/u;
/**
 * 流程完成式跨章目标：卷计划 objective 常写成「完成从X到Y的全流程/全过程」，
 * 这类表述天然是跨章的（整卷主线），单章不可能完整兑现。注入 mustCover 后会触发
 * 履约审核判「未兑现」并连环重写熔断。检测标志词：
 * - 「全流程/全过程/整个流程/整个过程」+ 动词「完成/实现/走完/跑通」
 * - 「从…到…的(全|整个)…」跨度式表述
 */
const CROSS_CHAPTER_PROCESS_RE = /(?:完成|实现|走完|跑通|推进).{0,8}(?:全流程|全过程|整个流程|整个过程)/u;
const CROSS_CHAPTER_SPAN_RE = /从.{2,12}到.{2,12}的(?:全|整个)/u;

/**
 * 弧线终态式跨章目标：卷计划 objective 另一种常见写法——「完成/实现 + 大跨度 + 终态动作」。
 * 终态动作词（逆转/翻身/崛起/逆袭/翻盘/复兴/蜕变/破局/称霸/统一/登顶/封神/称帝/建国）
 * 描述的是整卷（甚至全书）的最终格局，单章最多只能推进一小步，不可能「完成」。
 * 必须同时满足「完成/实现/达成/做到 + 终态词」才判跨章——单独的「翻案」「破局」
 * 在单章里完全可以是一个具体场景（如「当堂翻案」「这次破局靠的是数据」），不能误伤。
 * 「逆转/翻身」单独出现同理：本章逆转一次劣势、本章翻身打脸，都是合法单章爽点。
 */
const CROSS_CHAPTER_ARC_TERMINAL_RE =
  /逆转|翻身|崛起|逆袭|翻盘|复兴|蜕变|称霸|统一|登顶|封神|称帝|建国|崛起|大逆转|翻篇/u;
const CROSS_CHAPTER_ARC_ACTION_RE = /完成|实现|达成|做到|走向|迈向|开启|完成/u;
const CROSS_CHAPTER_ARC_RE = new RegExp(
  `(?:${CROSS_CHAPTER_ARC_ACTION_RE.source}).{0,16}(?:${CROSS_CHAPTER_ARC_TERMINAL_RE.source})`,
  'u',
);

/**
 * 跨章目标检测：带时限（三天内/七日内/限期）或「限期+威胁后果」的长目标
 * （如「必须在三天内翻案，否则将被处斩」）。这类节点单章无法完整兑现，
 * 不应作为 mustCover 硬性履约，否则与「禁止提前完结翻案」类禁区自相矛盾，
 * 导致 AI 怎么写都过不了履约审核。
 * 注意：不按子句数量判定——「收集证词，锁定真凶，公堂对峙」这类 3 子句节点
 * 是单章可兑现的（且与生成 prompt 的「场景链合并为一条」约束一致），不能误伤。
 *
 * 另识别两类卷级 objective 常见的跨章目标：
 * 1. 流程完成式：「完成从补亏空到税制改革的全流程」「实现从查账到定罪的全过程」
 * 2. 弧线终态式：「完成临水县从空壳穷县到模范县的逆转」「实现家族复兴」「达成称霸」
 * 二者都是整卷主线，单章无法兑现，注入 mustCover 即死锁。
 */
export function isCrossChapterGoal(node: string): boolean {
  const text = (node ?? '').trim();
  if (!text) return false;
  // 生成侧自标注优先（2026-08-28 根治方案）：滚纲输出时已判定单章可兑现性，
  // 标注语义由模型在生成语境里判断，不再让正则词表抢答；无标注（旧路径/
  // 展开式大纲）才落到下方词表兜底
  if (text.startsWith('【跨章】')) return true;
  if (text.startsWith('【单章】')) return false;
  if (CROSS_CHAPTER_DEADLINE_RE.test(text)) return true;
  if (CROSS_CHAPTER_DEADLINE_WORD_RE.test(text)) return true;
  // 带威胁后果的限期目标（必须在…翻案，否则将被处斩）；短威胁钩子（否则将被处斩）不算
  if (CROSS_CHAPTER_THREAT_RE.test(text) && text.length >= 12) return true;
  // 流程完成式跨章目标（卷级 objective 常见）
  if (CROSS_CHAPTER_PROCESS_RE.test(text) || CROSS_CHAPTER_SPAN_RE.test(text)) return true;
  // 弧线终态式跨章目标（卷级 objective 常见，如「完成…逆转」「实现…复兴」）
  if (CROSS_CHAPTER_ARC_RE.test(text)) return true;
  return false;
}

export function isReaderMetaText(text: string): boolean {
  return READER_META_PATTERN.test((text ?? '').trim());
}

/** 去掉「读者期待：…」等企划尾巴，保留可执行情节目标 */
export function stripReaderMeta(text: string): string {
  return (text ?? '')
    .replace(/[；;].*读者期待.*$/u, '')
    .replace(/读者期待[：:][^；;]*/gu, '')
    .replace(/让读者对[^，。；;]*/gu, '')
    .trim();
}

/**
 * 正文切片碎片：从 ending.slice(-N) 截出来的半截对话/抒情，不宜作 CBN tip。
 */
export function isProseDebrisTip(tip: string): boolean {
  const t = (tip ?? '').trim();
  if (!t) return true;
  if (/^[」』"'“‘，,、。！？!?\s]+/u.test(t)) return true;
  if (/^(下来|然后|说罢|你指望|等待着|扭扭|彻底失去了意识|黑暗再次降临)/u.test(t)) {
    return true;
  }
  // 大段抒情/对话收束，缺少可执行情节名词
  if (/或许会有人看到|一切都会不一样|微弱的光|沉默地等待/u.test(t)) return true;
  return false;
}

/**
 * 空壳章钩：推进至、纯承接模板、流程话术、模板压迫句、与唯一 CPN 同义重复等。
 */
export function isHollowChapterHook(text: string, cpns: string[] = []): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return true;
  if (isAdvancePrefixedCen(raw) || isMetaInstructionCen(raw) || isTemplateHookCen(raw)) {
    return true;
  }
  if (isReaderMetaText(raw)) return true;
  if (WEAK_CONTINUE_CBN_PREFIX.test(raw)) return true;
  const body = stripAdvancePrefix(raw).replace(OPENING_CBN_PREFIX, '').trim();
  if (body.length < 6) return true;
  if (
    isMetaInstructionCen(body) ||
    isTemplateHookCen(body) ||
    isReaderMetaText(body) ||
    isProseDebrisTip(body)
  ) {
    return true;
  }
  const normalizedCpns = unique(cpns).map(item => item.replace(OPENING_CBN_PREFIX, '').trim());
  if (
    normalizedCpns.length === 1 &&
    (body === normalizedCpns[0] || raw === normalizedCpns[0] || raw === cpns[0])
  ) {
    return true;
  }
  return false;
}

function isUsablePlotNode(text: string, excludeSameAs: string[] = []): boolean {
  const raw = (text ?? '').trim();
  if (!raw) return false;
  if (isMetaInstructionCen(raw) || isAdvancePrefixedCen(raw) || isTemplateHookCen(raw)) {
    return false;
  }
  if (isReaderMetaText(raw)) return false;
  if (WEAK_CONTINUE_CBN_PREFIX.test(raw)) return false;
  const body = raw.replace(OPENING_CBN_PREFIX, '').replace(ADVANCE_PREFIX, '').trim();
  if (body.length < 4) return false;
  if (
    isMetaInstructionCen(body) ||
    isTemplateHookCen(body) ||
    isReaderMetaText(body) ||
    isProseDebrisTip(body)
  ) {
    return false;
  }
  // 仅用于「从 CBN 拆句补节点」时：不要把已有唯一 CPN 再当新节点塞一遍
  const exclude = unique(excludeSameAs).map(item =>
    item.replace(OPENING_CBN_PREFIX, '').replace(ADVANCE_PREFIX, '').trim()
  );
  if (exclude.length === 1 && (body === exclude[0] || raw === exclude[0])) return false;
  return true;
}

/**
 * 从上章空壳/模板 CEN 里抢救可执行 tip（去掉模板尾巴，保留情节主语）。
 */
export function salvagePlotTipFromHollowCen(cen: string): string | undefined {
  const raw = stripAdvancePrefix((cen ?? '').trim()).replace(OPENING_CBN_PREFIX, '').trim();
  if (!raw) return undefined;
  const patterns = [
    /^(.+?)之后立刻陷入不可逆危机/u,
    /^(.+?)后对手反手施压/u,
    /^(.+?)已发生，直接后果落地/u,
    /^(.+?)之后压力升级/u,
  ];
  for (const re of patterns) {
    const matched = raw.match(re);
    const tip = matched?.[1]?.trim();
    if (tip && tip.length >= 6 && !isProseDebrisTip(tip)) return tip;
  }
  if (
    raw.length >= 8 &&
    !isTemplateHookCen(raw) &&
    !isMetaInstructionCen(raw) &&
    !isReaderMetaText(raw) &&
    !isProseDebrisTip(raw)
  ) {
    return raw.length > 56 ? raw.slice(0, 56) : raw;
  }
  return undefined;
}

/**
 * 从上章正文结尾提炼可执行承接 tip；失败返回 undefined。
 */
export function distillEndingTip(ending: string, maxLen = 40): string | undefined {
  const raw = (ending ?? '').trim();
  if (!raw) return undefined;

  const sentences = raw
    .split(/(?<=[。！？!?])/u)
    .map(part => part.trim())
    .filter(Boolean);
  const candidates = [...sentences].reverse();
  if (candidates.length === 0) candidates.push(raw);

  const normalizeCandidate = (sentence: string): string => {
    let tip = sentence
      .replace(/^[」』"'“‘，,、。\s]+/u, '')
      .replace(/^(说罢|然后|于是|接着)[，,]\s*/u, '')
      .trim();
    if (tip.length > maxLen) {
      tip = tip.slice(-maxLen).replace(/^[」』"'“‘，,、。\s]+/u, '').trim();
    }
    return tip;
  };

  for (const sentence of candidates) {
    const tip = normalizeCandidate(sentence);
    if (tip.length < 8) continue;
    if (isProseDebrisTip(tip) || isMetaInstructionCen(tip) || isTemplateHookCen(tip)) continue;
    if (isAdvancePrefixedCen(tip)) continue;
    return tip;
  }

  // 再尝试从尾部子句里捞动作短句
  const tail = raw.length > 100 ? raw.slice(-100) : raw;
  const clauses = tail
    .split(/[，,；;。！？!?\n]/u)
    .map(part => part.replace(/^(说罢|然后|于是|接着)\s*/u, '').trim())
    .filter(part => part.length >= 8 && part.length <= maxLen + 8);
  for (const clause of [...clauses].reverse()) {
    if (isProseDebrisTip(clause) || isMetaInstructionCen(clause) || isTemplateHookCen(clause)) {
      continue;
    }
    // 需像动作场面，而不是纯抒情
    if (!/[烧刺拿押跪拔递砸封绑刀剑针证案牢审]/u.test(clause)) continue;
    return clause.length > maxLen ? clause.slice(0, maxLen) : clause;
  }
  return undefined;
}

function pickContinuationTip(options?: {
  cpns?: string[];
  fallback?: string;
  previousEnding?: string;
  previousCen?: string;
}): string | undefined {
  const salvagedPrev = salvagePlotTipFromHollowCen(options?.previousCen ?? '');
  if (salvagedPrev && salvagedPrev.length >= 8) {
    return salvagedPrev.length > 56 ? salvagedPrev.slice(0, 56) : salvagedPrev;
  }

  const distilled = distillEndingTip(options?.previousEnding ?? '');
  if (distilled) return distilled;

  const cpns = unique(options?.cpns ?? []).filter(item => isUsablePlotNode(item));
  if (cpns[0]) return cpns[0];

  const fallback = (options?.fallback ?? '').trim();
  if (fallback.length >= 6 && !CHAPTER_TITLE_ONLY.test(fallback) && isUsablePlotNode(fallback)) {
    return fallback.length > 56 ? fallback.slice(0, 56) : fallback;
  }
  return undefined;
}

/**
 * 清洗「承接上章结尾：推进至：…」等零信息量 CBN。
 * 注意：CBN 只保留「承接前缀 + 情节 tip」，不要再拼流程话术（会泄漏进 CPN/CEN）。
 * tip 优先级：上章 CEN > 提炼后的正文结尾 > 本章 CPN > fallback。
 */
export function sanitizeInheritedCbn(
  cbn: string,
  options?: {
    cpns?: string[];
    fallback?: string;
    previousEnding?: string;
    previousCen?: string;
  }
): { cbn: string; changed: boolean } {
  const original = (cbn ?? '').trim();
  if (!original) {
    const tip = pickContinuationTip(options);
    return tip
      ? { cbn: tip, changed: true }
      : { cbn: options?.fallback ?? '', changed: false };
  }

  let body = original;
  let changed = false;
  let unwrappedAdvance = false;
  let hadOpeningPrefix = false;
  if (
    INHERITED_CBN_PREFIX.test(body) ||
    WEAK_CONTINUE_CBN_PREFIX.test(body) ||
    OPENING_CBN_PREFIX.test(body)
  ) {
    hadOpeningPrefix = true;
    body = body
      .replace(INHERITED_CBN_PREFIX, '')
      .replace(WEAK_CONTINUE_CBN_PREFIX, '')
      .replace(OPENING_CBN_PREFIX, '')
      .trim();
    // 去掉误拼的引号包裹
    body = body.replace(/^["'“‘]|["'”’…]+$/gu, '').trim();
    changed = true;
  }
  // 去掉历史上拼进去的流程话术尾巴
  if (/，本章只推进到可落地的下一拍危机$/u.test(body) || /，本章兑现下一拍冲突$/u.test(body)) {
    body = body
      .replace(/，本章只推进到可落地的下一拍危机$/u, '')
      .replace(/，本章兑现下一拍冲突$/u, '')
      .trim();
    changed = true;
  }
  if (isAdvancePrefixedCen(body) || isMetaInstructionCen(body) || isTemplateHookCen(body)) {
    unwrappedAdvance = isAdvancePrefixedCen(body);
    body = stripAdvancePrefix(body);
    if (isMetaInstructionCen(body) || isTemplateHookCen(body)) {
      body = '';
    }
    changed = true;
  }

  const cpns = unique(options?.cpns ?? []).filter(item => isUsablePlotNode(item));
  const bodyUnusable =
    body.length < 6 ||
    isProseDebrisTip(body) ||
    isHollowChapterHook(body, cpns) ||
    cpns.includes(body) ||
    isMetaInstructionCen(original) ||
    (unwrappedAdvance && !!cpns[0] && cpns[0] !== body);

  if (changed && bodyUnusable) {
    const tip = pickContinuationTip({ ...options, cpns });
    if (tip) {
      return { cbn: tip, changed: true };
    }
    if (cpns[0]) {
      return { cbn: cpns[0], changed: true };
    }
  }

  if (hadOpeningPrefix && isProseDebrisTip(body)) {
    const tip = pickContinuationTip({ ...options, cpns });
    if (tip) {
      return { cbn: tip, changed: true };
    }
  }

  if (changed && body.length >= 6 && !isProseDebrisTip(body)) {
    return { cbn: body, changed: true };
  }
  return { cbn: original, changed: false };
}

/*
 * 原 buildChainedCbn（上章 CEN → 下章 CBN 连锁）已删除：
 * 它把上章章末复述包装成「承接上章结尾：{CEN截尾}」模板，
 * 被当作下章履约硬约束后引发 CBN→CEN→CBN 循环污染，
 * 且把本章新事件挤出 CBN/CPNs/mustCover。
 * 逐章 CBN 改由 executable-outline-adapter 从本章关键事件派生。
 */

/** 将长句按中文标点拆成情节子句（过滤流程话术） */
export function splitPlotClauses(text: string): string[] {
  return text
    .split(/[，,；;。！？!?]/u)
    .map(part => part.replace(OPENING_CBN_PREFIX, '').trim())
    .filter(part => part.length >= 4 && isUsablePlotNode(part));
}

function clausesOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

/**
 * 提取文本中的场景核心实体词（地点/物件/人物类名词片段），用于同义不同字的语义重叠判定。
 * 如「库房」「军资」「银锭」「地砖」「掌柜」等承载情节核心的实体，过滤掉纯动词/抒情片段。
 */
const ENTITY_PATTERN =
  /库房|地砖|银锭|军资|掌柜|银庄|账册|汇票|亏空|密账|库银|盐引|公堂|县衙|牢房|证据|供词|水印|暗记/gu;
const ENTITY_RUN_RE = /[\u4e00-\u9fa5]{2,6}/gu;

function extractSceneEntities(text: string): string[] {
  const cleaned = (text ?? '').replace(/[^\u4e00-\u9fa5]/gu, '');
  if (!cleaned) return [];
  const entities = new Set<string>();
  // 1. 内置核心实体词（高置信度）
  (cleaned.match(ENTITY_PATTERN) ?? []).forEach((m: string) => entities.add(m));
  // 2. 含实体字眼的连续中文片段（2-6字，覆盖词表外的实体）
  (cleaned.match(ENTITY_RUN_RE) ?? []).forEach((frag: string) => {
    if (frag.length >= 2 && /[银库房军资账票案印砖箱牢庄号掌柜司衙]/u.test(frag)) {
      entities.add(frag);
    }
  });
  return [...entities];
}

/**
 * 判定 CEN 是否与已有 mustCover 语义重叠（同义不同字）。
 * 判定层级（任一命中即视为重叠，跳过注入）：
 * 1. 整句子串包含（clausesOverlap）
 * 2. 子句级子串包含（CEN/mustCover 拆子句后任一对重叠）
 * 3. 场景核心实体共享（如 CEN「…军资二字…库房…」与 mustCover「库房地下挖出军资银」
 *    共享「库房」「军资」核心实体，描述同一场景）
 */
function cenOverlapsMustCover(cen: string, mustCover: string[]): boolean {
  const cenText = (cen ?? '').trim();
  if (!cenText || mustCover.length === 0) return false;
  // 1. 整句精确/子串包含
  if (mustCover.some(item => clausesOverlap(cenText, item))) return true;
  // 2. 子句级重叠
  const cenClauses = splitPlotClauses(cenText);
  const coverClauses = mustCover.flatMap(item => splitPlotClauses(item));
  if (cenClauses.some(cc => coverClauses.some(mc => clausesOverlap(cc, mc)))) {
    return true;
  }
  // 3. 场景核心实体共享（治同义不同字：CEN 与 mustCover 描述同一场景但措辞不同）
  const cenEntities = extractSceneEntities(cenText);
  if (cenEntities.length === 0) return false;
  return mustCover.some(item => {
    const itemEntities = extractSceneEntities(item);
    // 至少共享一个核心实体（子串级匹配，如「军资」∈「军资银」）才判重叠
    return cenEntities.some(ce => itemEntities.some(ie => clausesOverlap(ce, ie)));
  });
}

/**
 * 从丰富 CBN 中抽取后半段后果，作为具体章末情节（避免元指令钩子）。
 */
export function extractCbnConsequence(cbn: string | undefined, events: string[]): string | undefined {
  const text = (cbn ?? '').trim();
  if (text.length < 12) return undefined;

  const clauses = splitPlotClauses(text);
  if (clauses.length < 2) return undefined;

  const early = events[0] ?? '';
  const consequenceClauses = clauses.filter(clause => {
    if (early && clausesOverlap(clause, early)) return false;
    return events.every(event => !clausesOverlap(clause, event) || clause.length > event.length + 4);
  });

  const pool =
    consequenceClauses.length > 0
      ? consequenceClauses
      : clauses.slice(Math.floor(clauses.length / 2));
  // 取后半段前两条，兼顾「冲突兑现」与「危机钩子」
  const start = Math.max(0, Math.floor(pool.length / 2));
  const joined = unique(pool.slice(start, start + 2)).join('，');
  if (!joined || joined.length < 6) return undefined;
  if (events.some(event => event === joined)) return undefined;
  if (!isUsablePlotNode(joined, events)) return undefined;
  if (isTemplateHookCen(joined)) return undefined;
  return joined;
}

/**
 * 单薄 CPN（仅 1 条且远短于 CBN）时，从 CBN 子句补齐 2～3 个推进节点。
 */
export function enrichThinCpns(cpns: string[], cbn: string): string[] {
  const base = unique(cpns).filter(item => isUsablePlotNode(item));
  if (base.length >= 2) return base.slice(0, 3);

  const text = cbn.trim();
  if (!text) return base;

  const only = base[0] ?? '';
  const plotBody = text.replace(OPENING_CBN_PREFIX, '').trim();
  if (only && plotBody.length <= only.length + 8) return base;

  const clauses = splitPlotClauses(text);
  if (clauses.length < 2) {
    return unique([only, ...(isUsablePlotNode(plotBody, base) ? [plotBody] : [])].filter(Boolean)).slice(
      0,
      3
    );
  }

  const picked: string[] = [];
  if (only) picked.push(only);
  for (const clause of clauses) {
    if (picked.length >= 3) break;
    if (picked.some(item => clausesOverlap(item, clause))) continue;
    picked.push(clause);
  }
  return picked.slice(0, 3);
}

/**
 * 非块末章 CEN：优先用 CBN 后果作具体情节；禁止元指令与模板空壳。
 */
export function buildMidChapterCen(
  keyEvents: string[],
  cbn?: string,
  options?: { goal?: string }
): string {
  const events = unique(keyEvents).filter(item => isUsablePlotNode(item));
  const consequence = extractCbnConsequence(cbn, events);
  if (consequence && !isHollowChapterHook(consequence, events)) {
    return consequence;
  }

  const goalRaw = stripReaderMeta((options?.goal ?? '').trim());
  if (
    goalRaw.length >= 10 &&
    !CHAPTER_TITLE_ONLY.test(goalRaw) &&
    !isHollowChapterHook(goalRaw, events) &&
    !isMetaInstructionCen(goalRaw) &&
    !isTemplateHookCen(goalRaw) &&
    !isReaderMetaText(goalRaw)
  ) {
    const last = events[events.length - 1] ?? '';
    if (!last || goalRaw !== last) {
      return goalRaw.length > 72 ? goalRaw.slice(0, 72) : goalRaw;
    }
  }

  const body = (cbn ?? '').replace(OPENING_CBN_PREFIX, '').trim();
  if (body.length >= 12 && isUsablePlotNode(body) && !events.includes(body)) {
    const fromBody = extractCbnConsequence(body, events);
    if (fromBody && !isHollowChapterHook(fromBody, events)) return fromBody;
    if (body.length > (events[0]?.length ?? 0) + 8 && !isHollowChapterHook(body, events)) {
      return body.length > 72 ? body.slice(0, 72) : body;
    }
  }

  const last = events[events.length - 1];
  if (!last) {
    if (body.length >= 8 && isUsablePlotNode(body) && !isHollowChapterHook(body)) {
      return fallbackCenFor(body);
    }
    return '本章冲突兑现后局势恶化，压迫升级并逼出下一步行动';
  }
  if (events.length === 1) {
    return fallbackCenFor(last);
  }
  return `${last}已发生，直接后果落地并逼出新的压迫`;
}

/**
 * 兜底 CEN 生成（去模板化）：按前缀文本哈希轮换后果短语，
 * 避免全书反复出现「X后对手反手施压，倒计时与证据链同时收紧」同款模板句。
 * 同一事件确定性收敛到同一短语（跨章一致），不同事件得到不同短语（避免重复感）。
 */
const FALLBACK_CEN_PHRASES = [
  '后对手反手施压，局势随之收紧',
  '，紧接着对方反扑，危机进一步升级',
  '后事态急转直下，新的压迫接踵而至',
  '，随之引来反噬，倒计时逼近眼前',
  '后冲突升级，背后势力开始出手',
];

function fallbackCenFor(prefix: string): string {
  let hash = 0;
  for (let i = 0; i < prefix.length; i += 1) {
    hash = (hash * 31 + prefix.charCodeAt(i)) >>> 0;
  }
  const phrase = FALLBACK_CEN_PHRASES[hash % FALLBACK_CEN_PHRASES.length];
  return `${prefix}${phrase}`;
}

export function normalizeChapterBlueprint(
  input: RawChapterBlueprint,
  chapterNumber: number,
  options?: NormalizeBlueprintOptions
): NormalizedChapterBlueprint {
  const rawCbn =
    (input.CBN ?? '').trim() ||
    (input.description ?? '').trim() ||
    input.title ||
    `第 ${chapterNumber} 章开篇`;
  const earlyCpns = unique(input.CPNs ?? input.keyEvents ?? []).filter(item =>
    isUsablePlotNode(item)
  );
  const CBN = sanitizeInheritedCbn(rawCbn, {
    cpns: earlyCpns,
    fallback: input.title || `第 ${chapterNumber} 章开篇`,
    previousEnding: options?.previousEnding,
    previousCen: options?.previousCen,
  }).cbn;

  const CPNs = enrichThinCpns(earlyCpns, CBN).filter(item => isUsablePlotNode(item));

  let goal = stripReaderMeta((input.goal ?? '').trim());
  if (!goal || CHAPTER_TITLE_ONLY.test(goal) || goal === input.title || isReaderMetaText(goal)) {
    const fromDesc = stripReaderMeta((input.description ?? '').trim());
    const descUsable =
      !!fromDesc &&
      !CHAPTER_TITLE_ONLY.test(fromDesc) &&
      fromDesc !== input.title &&
      !isReaderMetaText(fromDesc);
    goal = (descUsable && fromDesc) || CBN || input.title;
  }

  let CEN = (input.CEN ?? '').trim();
  const body = stripAdvancePrefix(CEN);
  const collapsedOntoCpn =
    !!CEN &&
    (CPNs.includes(body) ||
      CPNs.includes(CEN) ||
      (isAdvancePrefixedCen(CEN) && CPNs.some(cpn => cpn === body)));
  if (
    !CEN ||
    collapsedOntoCpn ||
    isMetaInstructionCen(CEN) ||
    isTemplateHookCen(CEN) ||
    isHollowChapterHook(CEN, CPNs)
  ) {
    CEN = buildMidChapterCen(CPNs.length > 0 ? CPNs : [CBN], CBN, {
      goal: goal !== CBN ? goal : input.description,
    });
  }

  let mustCover = unique(input.mustCover ?? input.keyEvents ?? CPNs)
    .map(item => item.replace(OPENING_CBN_PREFIX, '').trim())
    .filter(item => isUsablePlotNode(item));
  // mustCover 若仅有一条薄节点、而 CBN 情节体明显更丰富，则纳入履约（不要带「承接上章结尾」前缀）
  const cbnBody = CBN.replace(OPENING_CBN_PREFIX, '').trim();
  if (
    mustCover.length === 1 &&
    cbnBody !== mustCover[0] &&
    cbnBody.length > mustCover[0].length + 8 &&
    isUsablePlotNode(cbnBody) &&
    !isCrossChapterGoal(cbnBody)
  ) {
    mustCover = unique([mustCover[0], cbnBody]);
  }
  // 有效 CEN 纳入 mustCover，避免章末钩子只写进合同却不验收（跨章目标除外：
  // 「三天内翻案，否则将被处斩」这类目标单章无法完整兑现，纳入即死锁）
  // 语义去重：CEN 与已有 mustCover 同义不同字时（如 CEN「许衡深夜带人挖开库房地砖…军资二字」
  // vs mustCover「库房地下挖出军资银」）不重复纳入，避免同一事件被两次验收、
  // 履约审核因措辞差异反复判「未兑现」连环重写熔断。
  if (
    CEN &&
    !isHollowChapterHook(CEN, CPNs) &&
    !isCrossChapterGoal(CEN) &&
    !cenOverlapsMustCover(CEN, mustCover)
  ) {
    mustCover = unique([...mustCover, CEN]);
  }

  return { goal, CBN, CPNs, CEN, mustCover };
}
