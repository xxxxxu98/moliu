/**
 * 规范化章节蓝图节点，消除 CEN=`推进至：${CPN}` 等零信息量畸形。
 */

const ADVANCE_PREFIX = /^推进至[：:]\s*/u;
const CHAPTER_TITLE_ONLY = /^第\s*\d+\s*章$/u;
const META_CEN_PATTERN =
  /情节不得原地重复开场|抛出下一拍冲突|章末钩子[：:].*完成「/u;

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

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

export function stripAdvancePrefix(cen: string): string {
  return cen.replace(ADVANCE_PREFIX, '').trim();
}

export function isAdvancePrefixedCen(cen: string): boolean {
  return ADVANCE_PREFIX.test(cen.trim());
}

/** 写作指令型 CEN（非情节节点） */
export function isMetaInstructionCen(cen: string): boolean {
  return META_CEN_PATTERN.test(cen.trim());
}

/** 将长句按中文标点拆成情节子句 */
export function splitPlotClauses(text: string): string[] {
  return text
    .split(/[，,；;。！？!?]/u)
    .map(part => part.trim())
    .filter(part => part.length >= 4);
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
  return joined;
}

/**
 * 单薄 CPN（仅 1 条且远短于 CBN）时，从 CBN 子句补齐 2～3 个推进节点。
 */
export function enrichThinCpns(cpns: string[], cbn: string): string[] {
  const base = unique(cpns);
  if (base.length >= 2) return base.slice(0, 3);

  const text = cbn.trim();
  if (!text) return base;

  const only = base[0] ?? '';
  if (only && text.length <= only.length + 8) return base;

  const clauses = splitPlotClauses(text);
  if (clauses.length < 2) {
    return unique([only, text].filter(Boolean)).slice(0, 3);
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
 * 非块末章 CEN：优先用 CBN 后果作具体情节；禁止元指令与「推进至：=唯一 CPN」。
 */
export function buildMidChapterCen(keyEvents: string[], cbn?: string): string {
  const events = unique(keyEvents);
  const consequence = extractCbnConsequence(cbn, events);
  if (consequence) return consequence;

  const last = events[events.length - 1];
  if (!last) {
    return '章末兑现本章冲突后果，并留下可立即承接的悬念';
  }
  if (events.length === 1) {
    return `${last}之后立刻陷入不可逆危机，章末落在倒计时或反噬后果上`;
  }
  return `推进至：${last}`;
}

export function normalizeChapterBlueprint(
  input: RawChapterBlueprint,
  chapterNumber: number
): NormalizedChapterBlueprint {
  const CBN =
    (input.CBN ?? '').trim() ||
    (input.description ?? '').trim() ||
    input.title ||
    `第 ${chapterNumber} 章开篇`;

  let CPNs = enrichThinCpns(unique(input.CPNs ?? input.keyEvents ?? []), CBN);

  let CEN = (input.CEN ?? '').trim();
  const body = stripAdvancePrefix(CEN);
  const collapsedOntoCpn =
    !!CEN &&
    (CPNs.includes(body) ||
      CPNs.includes(CEN) ||
      (isAdvancePrefixedCen(CEN) && CPNs.some(cpn => cpn === body)));
  if (!CEN || collapsedOntoCpn || isMetaInstructionCen(CEN)) {
    CEN = buildMidChapterCen(CPNs.length > 0 ? CPNs : [CBN], CBN);
  }

  let mustCover = unique(input.mustCover ?? input.keyEvents ?? CPNs);
  // mustCover 若仅有一条薄节点、而 CBN 明显更丰富，则把 CBN 纳入履约检查
  if (
    mustCover.length === 1 &&
    CBN !== mustCover[0] &&
    CBN.length > mustCover[0].length + 8
  ) {
    mustCover = unique([mustCover[0], CBN]);
  }

  let goal = (input.goal ?? '').trim();
  if (!goal || CHAPTER_TITLE_ONLY.test(goal) || goal === input.title) {
    goal = CBN || input.description || input.title;
  }

  return { goal, CBN, CPNs, CEN, mustCover };
}
