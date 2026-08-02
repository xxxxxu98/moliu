/**
 * 章节合同健康度：mustCover×禁区冲突消解、已兑现节点去重、畸形 CBN 清洗、可执行重写提示。
 */

import type { ChapterContract, ExtractedFacts, StoryState } from '@/types/story-runtime';

import {
  isCrossChapterGoal,
  sanitizeInheritedCbn,
  stripOpeningCbnPrefix,
} from './chapterBlueprintNormalize';

export { buildChainedCbn, sanitizeInheritedCbn } from './chapterBlueprintNormalize';

/** 轻量字面/片语命中（避免与 ContinuityValidator 循环依赖） */
const CONCEPT_ALIASES: Record<string, string[]> = {
  入狱: ['入狱', '死牢', '大牢', '监牢', '收监', '关押', '下狱', '打入'],
  反诬: ['反诬', '诬陷', '栽赃', '被诬'],
  翻案: ['翻案', '翻供', '洗脱', '自证清白'],
  处斩: ['处斩', '问斩', '斩首', '处死', '三日后问斩'],
  验尸: ['验尸', '尸检', '勘验'],
};

function haystackHasToken(haystack: string, token: string): boolean {
  if (!token) return false;
  if (haystack.includes(token)) return true;
  const aliases = CONCEPT_ALIASES[token];
  if (aliases) return aliases.some(alias => haystack.includes(alias));
  return false;
}

function nodeLikelyFulfilled(node: string, haystack: string, facts: ExtractedFacts): boolean {
  const text = node.trim();
  if (!text) return true;
  if (haystack.includes(text)) return true;
  if (
    facts.events.some(
      event =>
        event.summary.includes(text) ||
        event.effects.some(effect => effect.includes(text)) ||
        event.evidence.some(evidence => evidence.includes(text))
    )
  ) {
    return true;
  }
  const softTokens = text
    .replace(/[是的了在与和被将把]/gu, ' ')
    .split(/\s+/u)
    .map(part => part.trim())
    .filter(part => part.length >= 2 && part.length <= 16);
  const segments = text
    .split(/[，,。；;：:\s]/u)
    .map(part => part.trim())
    .filter(part => part.length >= 2 && part.length <= 16 && part !== text);
  let tokens = [...new Set([...segments, ...softTokens])].filter(token => token.length >= 2);
  // 单长词（如「反诬入狱」）拆成首尾两截，避免要求全文连写命中
  if (tokens.length === 1 && tokens[0].length >= 4) {
    const only = tokens[0];
    tokens = [only.slice(0, 2), only.slice(-2)].filter(token => token.length >= 2);
  }
  if (tokens.length === 0) return false;
  const hitCount = tokens.filter(token => haystackHasToken(haystack, token)).length;
  if (tokens.length === 1) return hitCount === 1;
  return hitCount >= Math.ceil(tokens.length * 0.5);
}

const REVEAL_ZONE_RE =
  /提前.?(展示|揭露|公开|泄露).*(真相|全貌)|全部真相|完整真相|提前展示.*案|揭开.*全貌/u;
const HELP_ZONE_RE = /外界帮助|提前获得.?帮助|外援|神秘人.*(帮助|援助)/u;
const REVEAL_MUST_RE = /指出|指认|揭穿|当众|铁证|凶手|验尸|真相|公堂|对质|举证/u;
const HELP_MUST_RE = /获得.*(帮助|援助|外援)|救援|神秘人/u;
/** 已软化过的禁区标记（幂等：避免多级清洗时在已软化文本上重复追加） */
const SOFTENED_ZONE_RE = /本章为履约「|以履约为准|所需帮助除外/u;

export interface ContractConflict {
  mustCover: string;
  forbidden: string;
  kind: 'reveal' | 'help' | 'overlap';
}

export interface ContractHealthReport {
  conflicts: ContractConflict[];
  softenedForbidden: string[];
  prunedMustCover: string[];
  prunedCpns: string[];
  cbnSanitized: boolean;
  originalCbn: string;
  /** 人类可读摘要，便于冒烟日志 */
  notes: string[];
}

export interface ContractHealthOptions {
  /** 上章及更早已抽取事件摘要（用于 mustCover/CPN 去重） */
  priorEventSummaries?: string[];
  priorFacts?: ExtractedFacts;
  state?: StoryState;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function shareKeyTokens(a: string, b: string): boolean {
  const tokens = (text: string): string[] =>
    text
      .split(/[，,。；;：:\s、（）()「」《》·\-—]/u)
      .map(part => part.trim())
      .filter(part => part.length >= 2);
  const left = tokens(a);
  const right = new Set(tokens(b));
  if (left.length === 0 || right.size === 0) return false;
  const hits = left.filter(token => right.has(token) || [...right].some(r => r.includes(token) || token.includes(r)));
  return hits.length >= Math.min(2, left.length);
}

export function detectMustCoverForbiddenConflicts(
  mustCover: string[],
  forbidden: string[]
): ContractConflict[] {
  const conflicts: ContractConflict[] = [];
  for (const zone of unique(forbidden)) {
    // 已软化过的禁区不再二次处理，避免多级清洗重复追加豁免文本
    if (SOFTENED_ZONE_RE.test(zone)) continue;
    for (const node of unique(mustCover)) {
      if (REVEAL_ZONE_RE.test(zone) && (REVEAL_MUST_RE.test(node) || shareKeyTokens(zone, node))) {
        conflicts.push({ mustCover: node, forbidden: zone, kind: 'reveal' });
        continue;
      }
      if (HELP_ZONE_RE.test(zone) && HELP_MUST_RE.test(node)) {
        conflicts.push({ mustCover: node, forbidden: zone, kind: 'help' });
        continue;
      }
      // 字面重叠：禁区正文几乎就是「不能」+ mustCover
      const zoneBody = zone.replace(/^不能|^禁止|^勿|^别/u, '').trim();
      if (zoneBody.length >= 4 && (node.includes(zoneBody) || zoneBody.includes(node))) {
        conflicts.push({ mustCover: node, forbidden: zone, kind: 'overlap' });
      }
    }
  }
  return conflicts;
}

export function softenConflictingForbidden(
  forbidden: string[],
  conflicts: ContractConflict[]
): { forbidden: string[]; softened: string[] } {
  if (conflicts.length === 0) {
    return { forbidden: unique(forbidden), softened: [] };
  }
  const byZone = new Map<string, ContractConflict[]>();
  for (const conflict of conflicts) {
    const list = byZone.get(conflict.forbidden) ?? [];
    list.push(conflict);
    byZone.set(conflict.forbidden, list);
  }

  const softened: string[] = [];
  const next = unique(forbidden).map(zone => {
    const hits = byZone.get(zone);
    if (!hits || hits.length === 0) return zone;
    const mustList = unique(hits.map(item => item.mustCover)).join('、');
    let rewritten = zone;
    if (hits.some(item => item.kind === 'reveal')) {
      rewritten = `${zone}（本章为履约「${mustList}」允许必要指认与证据展示；禁止提前完结翻案、幕后全貌或长线伏笔）`;
    } else if (hits.some(item => item.kind === 'help')) {
      rewritten = `${zone}（本章 mustCover「${mustList}」所需帮助除外；禁止无剧情依据的神秘人开挂援助）`;
    } else {
      rewritten = `${zone}（与本章 mustCover「${mustList}」冲突的部分以履约为准，其余仍禁止）`;
    }
    softened.push(rewritten);
    return rewritten;
  });
  return { forbidden: next, softened };
}

export function pruneFulfilledNodes(
  nodes: string[],
  options: ContractHealthOptions
): { kept: string[]; pruned: string[] } {
  const summaries = unique([
    ...(options.priorEventSummaries ?? []),
    ...(options.state?.events ?? []).map(event => event.summary),
  ]);
  if (summaries.length === 0) {
    return { kept: unique(nodes), pruned: [] };
  }

  const facts: ExtractedFacts = options.priorFacts ?? {
    events: (options.state?.events ?? []).map(event => ({
      id: event.id,
      chapter: event.chapter,
      sceneId: event.sceneId,
      type: event.type,
      summary: event.summary,
      participants: event.participants,
      causes: event.causes,
      effects: event.effects,
      evidence: event.evidence,
    })),
    deltas: [],
    evidence: [],
  };
  const haystack = summaries.join('\n');
  const kept: string[] = [];
  const pruned: string[] = [];
  for (const node of unique(nodes)) {
    const body = stripOpeningCbnPrefix(node) || node;
    if (nodeLikelyFulfilled(body, haystack, facts) || nodeLikelyFulfilled(node, haystack, facts)) {
      pruned.push(node);
    } else {
      kept.push(body === node ? node : body);
    }
  }
  // 不可把 mustCover 裁成空——至少保留一条推进目标；优先保留非跨章节点
  if (kept.length === 0 && unique(nodes).length > 0) {
    const all = unique(nodes);
    const nonCross = all.filter(
      item => !isCrossChapterGoal(stripOpeningCbnPrefix(item) || item)
    );
    const pick = nonCross.length > 0 ? nonCross[nonCross.length - 1] : all[all.length - 1];
    return { kept: [pick], pruned: all.filter(item => item !== pick) };
  }
  return { kept, pruned };
}

/**
 * 综合清洗章节合同：CBN、mustCover×禁区、已兑现去重。
 */
export function healChapterContract(
  chapter: ChapterContract,
  options: ContractHealthOptions = {}
): { chapter: ChapterContract; report: ContractHealthReport } {
  const originalCbn = chapter.CBN;
  const cbnResult = sanitizeInheritedCbn(chapter.CBN, {
    cpns: chapter.CPNs,
    fallback: chapter.goal || chapter.title,
  });

  const mustPrune = pruneFulfilledNodes(
    chapter.mustCover.map(item => stripOpeningCbnPrefix(item) || item),
    options
  );
  const cpnPrune = pruneFulfilledNodes(
    chapter.CPNs.map(item => stripOpeningCbnPrefix(item) || item),
    options
  );
  // CPN 裁空时回退到 mustCover / goal
  const nextCpns =
    cpnPrune.kept.length > 0
      ? cpnPrune.kept
      : mustPrune.kept.length > 0
        ? mustPrune.kept.slice(0, 2)
        : unique([chapter.goal, chapter.title]).slice(0, 1);

  let nextMustCover =
    mustPrune.kept.length > 0 ? mustPrune.kept : unique([nextCpns[0], chapter.goal]).slice(0, 2);
  // 防跨章目标独占 mustCover：若全部节点都是跨章目标（时限/否则将等），
  // 从 CPNs 优先补一条非跨章推进节点，避免单章履约审核对跨章目标死锁
  if (
    nextMustCover.length > 0 &&
    nextMustCover.every(item => isCrossChapterGoal(stripOpeningCbnPrefix(item) || item))
  ) {
    const fallback = nextCpns.find(
      item => !isCrossChapterGoal(stripOpeningCbnPrefix(item) || item)
    );
    if (fallback) {
      nextMustCover = unique([fallback, ...nextMustCover]).slice(0, 2);
    }
  }

  const conflicts = detectMustCoverForbiddenConflicts(nextMustCover, chapter.forbidden);
  const { forbidden, softened } = softenConflictingForbidden(chapter.forbidden, conflicts);

  const notes: string[] = [];
  if (cbnResult.changed) notes.push(`CBN 已清洗：${originalCbn.slice(0, 40)} → ${cbnResult.cbn.slice(0, 40)}`);
  if (mustPrune.pruned.length > 0) {
    notes.push(`mustCover 去重 ${mustPrune.pruned.length} 条（上章已兑现）`);
  }
  if (cpnPrune.pruned.length > 0) {
    notes.push(`CPN 去重 ${cpnPrune.pruned.length} 条（上章已兑现）`);
  }
  if (conflicts.length > 0) {
    notes.push(`mustCover×禁区冲突 ${conflicts.length} 处，已软化禁区`);
  }

  const healed: ChapterContract = {
    ...chapter,
    CBN: cbnResult.cbn,
    CPNs: nextCpns,
    mustCover: nextMustCover,
    forbidden,
    goal:
      chapter.goal === originalCbn || !chapter.goal.trim()
        ? cbnResult.cbn || chapter.goal
        : chapter.goal,
  };

  return {
    chapter: healed,
    report: {
      conflicts,
      softenedForbidden: softened,
      prunedMustCover: mustPrune.pruned,
      prunedCpns: cpnPrune.pruned,
      cbnSanitized: cbnResult.changed,
      originalCbn,
      notes,
    },
  };
}

/**
 * 将审核问题转成可执行重写提示（负例 + 正向替代）。
 */
export function enrichRevisionHint(message: string, evidence: string[] = []): string {
  const base = evidence.length > 0 ? `${message}（证据：${evidence.slice(0, 2).join(' / ')}）` : message;

  if (/外界帮助|黑衣人|干粮|金疮药|神秘人/u.test(base)) {
    return (
      `${base}\n` +
      `【禁止】狱中神秘人送物/送药/递纸条等无依据外援。\n` +
      `【改为】章末只保留倒计时压迫、主角独自推演证据或官方押送，不引入外来帮助。`
    );
  }
  if (/全部真相|提前展示|完整揭示/u.test(base) && /履约|mustCover|当众指出|指认/u.test(base) === false) {
    return (
      `${base}\n` +
      `【注意】若本章 mustCover 要求当众指认/举证，允许必要证据与点名；\n` +
      `【禁止】提前完结翻案、幕后全貌或长线身份揭晓。`
    );
  }
  if (/未履约节点/u.test(base)) {
    return `${base}\n【改为】正文必须情节兑现该节点，不可只在内心独白里带过。`;
  }
  return base;
}

/** 判断禁区触发是否因履约 mustCover 而被豁免（安全网） */
export function isForbiddenExemptForFulfillment(
  zone: string,
  mustCover: string[],
  reason: string
): boolean {
  // 已软化的禁区视为已豁免过：按软化类型匹配对应语义的 reason，不再走 detect（幂等）
  if (SOFTENED_ZONE_RE.test(zone)) {
    if (/允许必要指认/u.test(zone)) {
      // reveal 型软化：指认/举证类 reason 豁免
      return (
        /指认|指出|凶手|证据|验尸|公堂/u.test(reason) &&
        !/翻案完结|幕后全貌|长线身份/u.test(reason)
      );
    }
    if (/所需帮助除外/u.test(zone)) {
      // help 型软化：仅「获得帮助/救援」类 reason 豁免，指认/证据词不放行
      return /获得.*(帮助|援助|外援)|求援|救出|递(?:药|信|物)|送(?:物|药)/u.test(reason);
    }
    // 其余软化（以履约为准等）：仅履约诉求本身豁免
    return /履约|mustCover/u.test(reason);
  }
  const conflicts = detectMustCoverForbiddenConflicts(mustCover, [zone]);
  if (conflicts.length === 0) return false;
  // 软化后的禁区或明确写了「允许必要指认」时，若 reason 只谈指认/证据，则豁免
  if (/允许必要指认|以履约为准|mustCover/u.test(zone)) {
    if (/指认|指出|凶手|证据|验尸|公堂/u.test(reason) && !/翻案完结|幕后全貌|长线身份/u.test(reason)) {
      return true;
    }
  }
  return conflicts.some(conflict => conflict.kind === 'reveal' && REVEAL_MUST_RE.test(conflict.mustCover));
}
