/**
 * 规范化章节蓝图节点，消除 CEN=`推进至：${CPN}` 等零信息量畸形。
 */

const ADVANCE_PREFIX = /^推进至[：:]\s*/u;
const CHAPTER_TITLE_ONLY = /^第\s*\d+\s*章$/u;
const META_CEN_PATTERN =
  /情节不得原地重复开场|抛出下一拍冲突|章末钩子[：:].*完成「|本章只推进到可落地|本章兑现下一拍|抛出下一拍未解问题|章末落在其直接后果|不可逆危机，章末落在/u;
/** 模板空壳章钩：只有压迫话术、没有具体情节 */
const TEMPLATE_HOOK_PATTERN =
  /之后立刻陷入不可逆危机|倒计时或反噬压到眼前|本章冲突兑现后压力升级|之后压力升级，留下立刻可接的悬念|已发生，直接后果落地并带出新的压迫|留下悬念，吸引读者继续阅读/u;
/** 大纲/企划口吻（读者期待、代入感等），不可当情节节点 */
const READER_META_PATTERN =
  /读者期待|让读者对|强烈代入感|爽文预期|建立[「「"'].*预期|完成穿越设定|建立主角技术权威|制造生死危机，开启/u;
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
      ? { cbn: `开场承接：${tip}`, changed: true }
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
      const prevCenBody = stripAdvancePrefix((options?.previousCen ?? '').trim()).replace(
        OPENING_CBN_PREFIX,
        ''
      );
      const distilled = distillEndingTip(options?.previousEnding ?? '');
      const fromPrev =
        (!!prevCenBody && (tip === prevCenBody || prevCenBody.startsWith(tip) || tip.startsWith(prevCenBody.slice(0, 12)))) ||
        (!!distilled && tip === distilled);
      return {
        cbn: `${fromPrev ? '承接上章结尾' : '开场承接'}：${tip}`,
        changed: true,
      };
    }
    if (cpns[0]) {
      return { cbn: `开场承接：${cpns[0]}`, changed: true };
    }
  }

  if (hadOpeningPrefix && isProseDebrisTip(body)) {
    const tip = pickContinuationTip({ ...options, cpns });
    if (tip) {
      return { cbn: `承接上章结尾：${tip}`, changed: true };
    }
  }

  if (changed && body.length >= 6 && !isProseDebrisTip(body)) {
    return { cbn: `承接上章结尾：${body}`, changed: true };
  }
  return { cbn: original, changed: false };
}

/**
 * 大纲连锁：上一章 CEN → 下一章 CBN，避免套娃「承接：推进至」。
 */
export function buildChainedCbn(prevCen: string, fallbackObjective: string): string {
  const cleaned = stripAdvancePrefix((prevCen ?? '').trim());
  // 短但可执行的章末（如「药老现身」）应继续连锁；仅拒绝真正的模板/元指令空壳
  const rejectPrev =
    !cleaned ||
    cleaned.length < 4 ||
    isMetaInstructionCen(cleaned) ||
    isTemplateHookCen(cleaned) ||
    (isHollowChapterHook(cleaned) && cleaned.length >= 6);
  if (rejectPrev) {
    const tip = fallbackObjective || '主线推进';
    if (!(prevCen ?? '').trim()) {
      return `承接前段：${tip}`;
    }
    return `开场承接：${tip}`;
  }
  return `承接上章结尾：${cleaned}`;
}

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
      return `${body}后对手反手施压，倒计时与证据链同时收紧`;
    }
    return '本章冲突兑现后局势恶化，压迫升级并逼出下一步行动';
  }
  if (events.length === 1) {
    return `${last}后对手反手施压，倒计时与证据链同时收紧`;
  }
  return `${last}已发生，直接后果落地并逼出新的压迫`;
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

  let mustCover = unique(input.mustCover ?? input.keyEvents ?? CPNs).filter(item =>
    isUsablePlotNode(item)
  );
  // mustCover 若仅有一条薄节点、而 CBN 明显更丰富，则把 CBN 纳入履约检查
  if (
    mustCover.length === 1 &&
    CBN !== mustCover[0] &&
    CBN.length > mustCover[0].length + 8 &&
    isUsablePlotNode(CBN)
  ) {
    mustCover = unique([mustCover[0], CBN]);
  }
  // 有效 CEN 纳入 mustCover，避免章末钩子只写进合同却不验收
  if (CEN && !isHollowChapterHook(CEN, CPNs) && !mustCover.includes(CEN)) {
    mustCover = unique([...mustCover, CEN]);
  }

  return { goal, CBN, CPNs, CEN, mustCover };
}
