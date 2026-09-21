/**
 * 章节合同健康度：mustCover×禁区冲突消解、已兑现节点去重、畸形 CBN 清洗、可执行重写提示。
 */

import type { ChapterContract, ContinuityIssue, ExtractedFacts, StoryState } from '@/types/story-runtime';

import { normalizedSimilarity } from '@/utils/text-similarity';
import {
  isCrossChapterGoal,
  sanitizeInheritedCbn,
  stripOpeningCbnPrefix,
} from './chapterBlueprintNormalize';

export { sanitizeInheritedCbn } from './chapterBlueprintNormalize';

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
/** 生成侧自标注（【让路】=滚纲判定该禁区与本章 mustCover 必然冲突）：
 *  跳过词表猜测直接按冲突软化（2026-08-28 根治方案，词表只兜底无标注旧路径） */
const YIELD_ZONE_RE = /^【让路】/u;

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
  /** 被陈旧度门禁裁除的 mustCover 原句（终态角色节点）——引擎侧重建 review.mustCheck
   *  时必须同步减除，否则建合同期（无 state）固化的陈旧节点会重新喂进起草 prompt */
  staleRemovedMustCover: string[];
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
    // 生成侧【让路】标注：与本章每个 mustCover 配对成冲突，走通用「以履约为准」软化
    if (YIELD_ZONE_RE.test(zone)) {
      for (const node of unique(mustCover)) {
        conflicts.push({ mustCover: node, forbidden: zone, kind: 'overlap' });
      }
      continue;
    }
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

  // 陈旧度门禁：状态里已进入命运级终态的角色，其蓝图硬约束节点先行裁除
  const staleNames = collectDeceasedEntityNames(options.state);
  const staleSafe = (item: string) =>
    !nodeMentionsFateLockedCharacter(stripOpeningCbnPrefix(item) || item, staleNames);
  const stalePrunedMustCover = staleNames.size > 0
    ? (chapter.mustCover ?? [])
        .map(item => stripOpeningCbnPrefix(item) || item)
        .filter(item => {
          const offender = nodeMentionsFateLockedCharacter(item, staleNames);
          if (offender) {
            console.info(
              `[contractHealth] ch${chapter.chapterNumber} 陈旧度裁剪 mustCover「${item.slice(0, 30)}」（${offender} 已进入终态）`
            );
            return false;
          }
          return true;
        })
    : [];
  // 被陈旧度裁掉的 mustCover 原句：必须显式导出给引擎侧减除——review.mustCheck 在
  // ContractPackBuilder 建合同时无 state、含陈旧节点，引擎重建 mustCheck 时若减不掉
  // （2026-09-05 g38f2-100ch ch24 实测：孙泰 ch13 死亡入账，ch24 起草 prompt 仍被
  // 喂「孙泰公堂受审」→ 判官 fact_conflict 拒 3 轮整章死），写作侧会一直被投毒。
  const staleRemovedMustCover = staleNames.size > 0
    ? (chapter.mustCover ?? []).flatMap(item => {
        if (staleSafe(item)) return [];
        // 同时导出原始句与剥前缀句：review.mustCheck 在建合同期固化的是原始形态，
        // 只存剥前缀形态会让引擎侧 includes 减除失配
        const stripped = stripOpeningCbnPrefix(item) || item;
        return item === stripped ? [item] : [item, stripped];
      })
    : [];
  const stalePrunedCpns = staleNames.size > 0
    ? (chapter.CPNs ?? []).filter(
        item => !nodeMentionsFateLockedCharacter(stripOpeningCbnPrefix(item) || item, staleNames)
      )
    : [];

  const mustSource =
    stalePrunedMustCover.length > 0
      ? stalePrunedMustCover
      : staleNames.size === 0
        ? chapter.mustCover.map(item => stripOpeningCbnPrefix(item) || item)
        : [];
  const mustPrune = pruneFulfilledNodes(mustSource, options);
  const cpnPrune = pruneFulfilledNodes(
    // 陈旧裁剪存在时必须用裁后列表（即使被裁空）：旧写法 stalePrunedCpns.length > 0
    // 会在「CPNs 全部涉终态角色」时回退到未裁剪原表，让死人节点从源头溜回。
    (staleNames.size > 0 ? stalePrunedCpns : chapter.CPNs).map(
      item => stripOpeningCbnPrefix(item) || item
    ),
    options
  );
  // CPN 裁空时回退到 mustCover / goal；goal 来自整章 outline，可能自带陈旧剧情，
  // 回退候选同样过陈旧度筛（筛空时退到 title，标题只是语境不是情节指令）
  const nextCpns =
    cpnPrune.kept.length > 0
      ? cpnPrune.kept
      : mustPrune.kept.length > 0
        ? mustPrune.kept.slice(0, 2)
        : chapter.goal && staleSafe(chapter.goal)
          ? [chapter.goal]
          : [chapter.title];

  let nextMustCover =
    mustPrune.kept.length > 0
      ? mustPrune.kept
      : unique([nextCpns[0], chapter.goal].filter(staleSafe)).slice(0, 2);
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
  const stalePrunedMustCount =
    staleNames.size > 0 ? chapter.mustCover.length - mustSource.length : 0;
  const stalePrunedCpnCount =
    staleNames.size > 0 ? Math.max(0, chapter.CPNs.length - stalePrunedCpns.length) : 0;
  const stalePrunedCount = stalePrunedMustCount + stalePrunedCpnCount;
  if (staleNames.size > 0 && mustSource.length === 0 && chapter.mustCover.length > 0) {
    notes.push(`mustCover 全部节点涉及终态角色，已整体裁剪待重生`);
  } else if (stalePrunedCount > 0) {
    notes.push(`陈旧度裁剪 ${stalePrunedCount} 条（节点涉及终态角色）`);
  }
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
      staleRemovedMustCover,
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

  const absentCharacter = base.match(/触发本章禁区：不得让([^，,。；;（）()]+)出场/u)?.[1]?.trim();
  if (absentCharacter) {
    return (
      `${base}\n` +
      `【严格缺席】“${absentCharacter}不出场”也包括幕后声音、帘后说话、传音、书信署名和他人口述其即时反应；` +
      `重写时删除该角色的一切台词与现场反应，只用环境、无名官员或已允许角色完成场景。`
    );
  }

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
  // 跨章事实冲突：补充「以状态摘要为准」的具体可执行指引，避免重写时重复同样错误。
  // （fact_conflict 经 ContinuityValidator 强制 blocking，是重写的高频原因。）
  if (/语义问题\[fact_conflict\]/u.test(base)) {
    return (
      `${base}\n` +
      `【跨章状态以状态摘要为准】本章不可推翻上章已确立的状态：` +
      `已死/已离开/已失忆/已揭穿身份的角色，本章不能让其活动、在场或装作未知；` +
      `已销毁/已赠出/已丢失的物品，本章不能再次出现。请对照状态摘要里的实体 attributes 与 inventory 核对后重写冲突段落。`
    );
  }
  // 未知实体（兜底）：方法2 已将其降级为 warning，但批量层 seedRevisionHints 仍可能携带。
  // 给出正向指引而非单纯复述报错，让模型知道该改用身份称呼还是修正笔误。
  if (/引用了未知实体\s+\S+/u.test(base)) {
    return (
      `${base}\n` +
      `【该名未在角色表登记】若为功能性临时配角，正文请改用身份称呼（如「那斥候」「一名伤兵」），` +
      `不要让其以具名角色身份登场或被抽为事件参与者；若为已知角色的笔误/形近字，请用角色表中的正确名字。`
    );
  }
  return base;
}

/**
 * 陈旧度门禁（根治方案 ④）：远期蓝图降级为咨询性。
 *
 * 批内第 40 章蓝图是对着 30 章前的状态写的；其中引用的角色若已进入
 * 命运级终态（死亡/驾崩/下狱/定罪，词表与 extract-plot-memory 对齐），
 * 该节点作为硬约束必然触发 fact_conflict → 履约死循环。
 * 与其让审查层事后拦截重写，不如起草前把「与已写状态矛盾」的节点
 * 从硬合同里静默裁掉——蓝图语义仍在上下文包里作软提示，但不再强制验收。
 */
const STALE_FATE_ATTRIBUTE_VALUES = new Set(['死亡', '驾崩', '下狱', '定罪', '去职']);

function collectDeceasedEntityNames(state?: StoryState): Set<string> {
  const names = new Set<string>();
  if (!state?.entities) return names;
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== 'character') continue;
    const status = entity.attributes?.status;
    if (typeof status === 'string' && STALE_FATE_ATTRIBUTE_VALUES.has(status)) {
      names.add(entity.name.trim());
      for (const alias of entity.aliases ?? []) {
        if (alias.trim()) names.add(alias.trim());
      }
    }
  }
  return names;
}

/**
 * 死亡族终态子集：与 STALE 全集（含下狱/定罪/去职）不同，这一族决定
 * 「角色不可再以存活形态出场」——羁押/去职角色仍可在押解/解任语境合法出场，
 * 只有死者必须退场。用于出场白名单过滤与起草禁令。
 * 2026-09-06 g38f-200chr2 ch184 实证：写手自发发明「已驾崩皇帝病危急报」钩子，
 * 5 次重写均被 fact_conflict 拒稿，整章死。
 */
const DEATH_FATE_ATTRIBUTE_VALUES = new Set(['死亡', '驾崩']);

export function isTerminalDeathStatus(status: unknown): boolean {
  return typeof status === 'string' && DEATH_FATE_ATTRIBUTE_VALUES.has(status);
}

export interface TerminalDeathCharacter {
  name: string;
  status: string;
}

export function collectTerminalDeathCharacters(state?: StoryState): TerminalDeathCharacter[] {
  if (!state?.entities) return [];
  const out: TerminalDeathCharacter[] = [];
  const seen = new Set<string>();
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== 'character') continue;
    const status = entity.attributes?.status;
    if (!isTerminalDeathStatus(status)) continue;
    const name = entity.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, status });
  }
  return out;
}

/**
 * 头衔锚（2026-09-15 契约 14，g38f 200 章全文通读实证官职五重漂移）：
 * 从实体 attributes.title（章记忆头衔账 overlay 接线）读每角色当前头衔，
 * 注入起草 prompt 作正文称谓锚——官职/品级/袍服称谓必须与最近一次入账一致。
 */
export interface CharacterTitleAnchor {
  name: string;
  title: string;
}

export function collectCharacterTitleAnchors(state?: StoryState): CharacterTitleAnchor[] {
  if (!state?.entities) return [];
  const out: CharacterTitleAnchor[] = [];
  const seen = new Set<string>();
  for (const entity of Object.values(state.entities)) {
    if (entity.kind !== 'character') continue;
    const title = String(entity.attributes?.title ?? '').trim();
    if (!title) continue;
    const name = entity.name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, title });
  }
  return out;
}

/**
 * 从节点文本中解析出命运级终态角色名；至少命中一个即视为「被过期货污染」的节点。
 * 命中即视为「被过期货污染」的节点（子串匹配：蓝图提及终态角色的在场行动，
 * 如「周茂现身公堂」；回忆/追述由模型措辞区分，此处宁可保守裁剪）。
 */
function nodeMentionsFateLockedCharacter(node: string, staleNames: Set<string>): string | null {
  for (const name of staleNames) {
    if (node.includes(name)) return name;
  }
  return null;
}

/**
 * 节点原句照抄检测（mustCover 节点 ≥minRun 字连续逐字出现在正文）。
 *
 * 前两道防线是 prompt 级（proseRules【节点原句禁抄】+ judge【节点抄用】规则），
 * 终验实测（2026-09-12 gemini 196 章）仍有 4 处终稿实锤——prompt 约束在长跑
 * 尺度必然漏。本检测与其同口径（连续 ≥12 字逐字相同，只去空白归一），命中产出
 * warning 级 issue 驱动 writerAgent 定向改写（同 uniform-cv-survived 语义：
 * 不升 blocking 防死章，改不掉保留最优稿走黄签）。
 *
 * 专名/官名不会误伤：12 字连续相同要求足够长，3-5 字专名单独不触发；
 * 「同义改写、拆句、换人称不算」由连续性严格保证。
 */
export function detectNodeVerbatimOverlapIssues(
  prose: string,
  mustCover: string[],
  minRun = 12,
  severity: 'warning' | 'blocking' = 'warning',
): ContinuityIssue[] {
  const normalizedProse = (prose ?? '').replace(/\s+/gu, '');
  if (!normalizedProse) return [];
  const issues: ContinuityIssue[] = [];
  for (const node of mustCover ?? []) {
    const normalizedNode = (node ?? '').replace(/\s+/gu, '');
    if (normalizedNode.length < minRun) continue;
    // 滚动数组求最长公共子串：节点 ≤~80 字 × 正文 ~3500 字，单节点 ~28 万步
    let prev = new Array<number>(normalizedNode.length + 1).fill(0);
    let best = 0;
    let bestEndInProse = -1;
    for (let j = 1; j <= normalizedProse.length; j += 1) {
      const cur = new Array<number>(normalizedNode.length + 1).fill(0);
      const pj = normalizedProse[j - 1];
      for (let i = 1; i <= normalizedNode.length; i += 1) {
        if (pj === normalizedNode[i - 1]) {
          const len = prev[i - 1] + 1;
          cur[i] = len;
          if (len > best) {
            best = len;
            bestEndInProse = j;
          }
        }
      }
      prev = cur;
    }
    if (best >= minRun) {
      const overlap = normalizedProse.slice(bestEndInProse - best, bestEndInProse);
      issues.push({
        id: issues.length === 0 ? 'node-verbatim-overlap' : `node-verbatim-overlap-${issues.length + 1}`,
        domain: 'fulfillment',
        severity,
        message:
          `正文与大纲节点存在连续 ${best} 字逐字相同（节点原句照抄）：` +
          `「${overlap.slice(0, 24)}…」。大纲节点是给作者的合同描述，不是读者要读的正文——` +
          `把该句改写为场景化语言（换主语视角/拆句/补动作与感官细节），保留事件本身但不得逐字照抄。`,
        evidence: [overlap.slice(0, 40)],
      });
    }
  }
  return issues;
}

/**
 * 开场重叠检测（章界重演的写作期防线）。
 *
 * 根因链：大纲把「上章 CEN 复述」写成 CBN → 履约校验当硬约束强制覆盖 →
 * 正文整段重演上章结尾（绝症书 4→5、7→8 章实测）。前两道防线在大纲层
 * （prompt 反复述约束 + outlineCompleteness 相似度 blocker）；这是第三道：
 * 成稿后确定性比对「本章开头 vs 上章结尾」，大面积重叠即 blocking 驱动重写。
 *
 * 阈值取 0.55（归一化后）：正文承接时短暂呼应上一幕属正常叙事，只有
 * 「结尾窗口的一半以上被原文复刻」才算重演；比较窗口各取 ~120 字，
 * 覆盖「整段复读」形态而不误伤单句钩子衔接。
 */
export function detectOpeningRepetitionIssue(
  prose: string,
  previousChapterEnding?: string,
  threshold = 0.55,
): ContinuityIssue | null {
  const prevTail = (previousChapterEnding ?? '').trim().slice(-120);
  const opening = (prose ?? '').trim().slice(0, 160);
  if (prevTail.length < 40 || opening.length < 40) return null;
  const similarity = normalizedSimilarity(prevTail, opening);
  if (similarity < threshold) return null;
  return {
    id: 'chapter-opening-repetition',
    domain: 'fulfillment',
    severity: 'blocking',
    message:
      `本章开场与上章结尾高度重叠（相似度 ${Math.round(similarity * 100)}%），` +
      `读者刚在上一章末尾读过这段内容，整段重演是剧情空转。重写时删除对上章结尾的复述段落，` +
      `从上一章没有出现过的新动作直接开场，收束状态只用一句话暗前提带过。`,
    evidence: [opening.slice(0, 80), prevTail.slice(0, 80)],
  };
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
