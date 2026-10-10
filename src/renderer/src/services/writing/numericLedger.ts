/**
 * 跨章事实台账（数字/时间）——投影、合并与注入格式化。
 *
 * 2026-10-05 都市校园文书审实证改造：旧数字锚链路是「FactExtractor 把数字拍扁成
 * 句子进 keyEvents → collectNumericAnchors 用单位词表正则从句子里回抽」，单位表
 * 清一色古代计量（石两兵亩箱贯斛斗文），现代/科幻/修真题材数字（信用点/吨/天/条）
 * 全军覆没——账记了、查账的只认旧币种。本模块按命运系统 agent 化同款路径收编：
 * 契约 15/17 结构化出账（AI 归一「对象+数值+单位」「承诺+期限+动作」），本模块
 * 只做确定性投影/合并/格式化（结构运算与字符串包含匹配，不做语义判定——语义
 * 归判官），单位是自由字符串，题材无关。同对象正典锁定首次确立值，异值只有
 * 提取侧标了勘误才覆盖。
 */

import type { ChapterMemory, NumericLedgerEntry, TimePromiseEntry } from '@/types/project';
import type { ExtractedFacts, StoryEvent } from '@/types/story-runtime';

/** 台账注入行数上限：过载稀释注意力，同对象最新值已在合并层胜出 */
const MAX_NUMERIC_ROWS = 12;
const MAX_OPEN_PROMISES_INJECTED = 8;
const MAX_TIMELINE_MARKS = 6;

/** 显著性（2026-10-05 借鉴 Sudowrite Saliency Engine）：条目文本与本章
 * 蓝图的 2 字滑窗共享数。>0 的条目优先注入（组内仍按章号新旧），防 200 章
 * 台账膨胀后「最新 N 条」把本章真正相关的旧账（如第 20 章立的债到 180 章
 * 还在还）挤出窗口。确定性词面交集，语义判定归判官。 */
function bigramSet(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 2 <= text.length; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

function saliencyScore(text: string, hintBigrams: Set<string>): number {
  if (hintBigrams.size === 0 || !text) return 0;
  let score = 0;
  for (let i = 0; i + 2 <= text.length; i += 1) {
    if (hintBigrams.has(text.slice(i, i + 2))) score += 1;
  }
  return score;
}

function eventNumeric(event: StoryEvent): NumericLedgerEntry | null {
  if (event.type !== 'numeric-fact') return null;
  const numeric = event.numeric;
  if (!numeric || typeof numeric.amount !== 'number' || !Number.isFinite(numeric.amount)) {
    return null;
  }
  const object = String(numeric.object ?? '').trim();
  const unit = String(numeric.unit ?? '').trim() || '单位未注明';
  if (!object) return null;
  return {
    object,
    amount: numeric.amount,
    unit,
    nature: String(numeric.nature ?? '').trim() || undefined,
    revision: numeric.revision === 'correct' || numeric.revision === 'establish' ? numeric.revision : undefined,
    chapterIndex: event.chapter || 0,
    evidence: event.evidence?.[0] ?? undefined,
  };
}

/** FactExtractor 输出 → 数字台账条目（只认带结构化 numeric 字段的事件） */
export function projectNumericLedgerEntries(facts: ExtractedFacts): NumericLedgerEntry[] {
  const entries: NumericLedgerEntry[] = [];
  for (const event of facts.events ?? []) {
    const entry = eventNumeric(event);
    if (entry) entries.push(entry);
  }
  return entries;
}

export interface TimeLedgerProjection {
  /** 本章新立下的承诺 */
  opens: TimePromiseEntry[];
  /** 本章兑现/改期（promise 引用原承诺内容，供匹配台账在册条目） */
  resolves: Array<{ promise: string; action: 'fulfilled' | 'renegotiated'; evidence?: string }>;
}

function eventTime(event: StoryEvent): { entry: TimePromiseEntry } | { resolve: TimeLedgerProjection['resolves'][number] } | null {
  // 契约 17 期限承诺 / 契约 18 剧情预告共用 time 结构与台账，kind 区分
  if (event.type !== 'time-promise' && event.type !== 'plot-promise') return null;
  const time = event.time;
  if (!time || !String(time.promise ?? '').trim()) return null;
  if (time.action === 'open') {
    return {
      entry: {
        promise: String(time.promise).trim(),
        due: String(time.due ?? '').trim() || undefined,
        kind: event.type === 'plot-promise' ? 'plot' : 'deadline',
        createdChapterIndex: event.chapter || 0,
        status: 'open',
        evidence: event.evidence?.[0] ?? undefined,
      },
    };
  }
  return {
    resolve: {
      promise: String(time.promise).trim(),
      action: time.action,
      evidence: event.evidence?.[0] ?? undefined,
    },
  };
}

/** FactExtractor 输出 → 时间承诺投影（新立 + 兑现/改期） */
export function projectTimeLedger(facts: ExtractedFacts): TimeLedgerProjection {
  const projection: TimeLedgerProjection = { opens: [], resolves: [] };
  for (const event of facts.events ?? []) {
    const item = eventTime(event);
    if (!item) continue;
    if ('entry' in item) projection.opens.push(item.entry);
    else projection.resolves.push(item.resolve);
  }
  return projection;
}

/**
 * 提取合同规定的勘误标注。只认枚举和合同固定短语，不读正文判断「这句是不是勘误」。
 * nature「勘误后新值」是契约 15 既有自标注，revision=correct 是同一语义的显式枚举。
 */
const CANON_CORRECTION_NATURE = '勘误后新值';

/** 该条目是否被提取侧标成「允许覆盖正典」的勘误 */
export function isNumericCanonCorrection(entry: NumericLedgerEntry): boolean {
  return entry.revision === 'correct' || entry.nature === CANON_CORRECTION_NATURE;
}

/**
 * 同对象正典锁定首次确立的数值与单位。
 * 后章抽出的不同数值默认丢弃，避免写错的数变成下一章的正典（r16：十二丈填平六丈后被写成十丈并固化）。
 * 只有提取侧标了勘误（revision=correct 或 nature=勘误后新值）才替换。同值复述不改确立章。
 */
export function mergeNumericLedger(
  existing: NumericLedgerEntry[],
  additions: NumericLedgerEntry[]
): NumericLedgerEntry[] {
  const byObject = new Map<string, NumericLedgerEntry>();
  for (const entry of [...existing, ...additions]) {
    const prev = byObject.get(entry.object);
    if (!prev) {
      byObject.set(entry.object, entry);
      continue;
    }
    const sameValue = prev.amount === entry.amount && prev.unit === entry.unit;
    if (sameValue) continue;
    if (isNumericCanonCorrection(entry)) byObject.set(entry.object, entry);
  }
  return [...byObject.values()].sort((a, b) => a.chapterIndex - b.chapterIndex);
}

const normalizePromiseText = (s: string): string => s.replace(/\s+/gu, '');

/**
 * 应用时间承诺投影：opens 追加在册；resolves 把匹配的 open 条目流转为
 * fulfilled/renegotiated（匹配用归一化文本互相包含——格式级字符串运算，
 * 语义判定归判官；匹配不上的 resolve 静默忽略，不误伤台账）。
 * @param chapterNumber 本章章号，resolve 流转时记为兑现/改期章
 */
export function mergeTimePromises(
  existing: TimePromiseEntry[],
  projection: TimeLedgerProjection,
  chapterNumber: number
): TimePromiseEntry[] {
  const merged = existing.map(entry => ({ ...entry }));
  for (const open of projection.opens) {
    // 同章重复投影（重写轮）幂等：同 promise 且同章的 open 不重复入账
    const dup = merged.some(
      entry =>
        entry.status === 'open' &&
        entry.createdChapterIndex === open.createdChapterIndex &&
        normalizePromiseText(entry.promise) === normalizePromiseText(open.promise)
    );
    if (!dup) merged.push({ ...open });
  }
  for (const resolve of projection.resolves) {
    const needle = normalizePromiseText(resolve.promise);
    // 最近的 open 条目优先（同款承诺可能多次立下又多次兑现）
    for (let i = merged.length - 1; i >= 0; i -= 1) {
      const entry = merged[i];
      if (entry.status !== 'open') continue;
      const hay = normalizePromiseText(entry.promise);
      if (hay.includes(needle) || needle.includes(hay)) {
        merged[i] = {
          ...entry,
          status: resolve.action,
          resolvedChapterIndex: chapterNumber,
          evidence: resolve.evidence ?? entry.evidence,
        };
        break;
      }
    }
  }
  return merged.slice(-40);
}

/**
 * 承诺兑现流转（2026-10-08 r19 实证：37/40 永远开放——提取侧漏判兑现）：
 * 判官逐章确认的兑现/改期文本（互相包含匹配，同 mergeTimePromises 的
 * resolve 语义）把 open 条目流转为 fulfilled/renegotiated。
 */
export function resolveTimePromisesByText(
  promises: TimePromiseEntry[],
  texts: Array<{ text: string; action: 'fulfilled' | 'renegotiated' }>,
  chapterNumber: number
): TimePromiseEntry[] {
  if (texts.length === 0) return promises;
  const out = promises.map(entry => ({ ...entry }));
  for (const { text, action } of texts) {
    const needle = normalizePromiseText(text);
    if (!needle) continue;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const entry = out[i];
      if (entry.status !== 'open') continue;
      const hay = normalizePromiseText(entry.promise);
      if (hay.includes(needle) || needle.includes(hay)) {
        out[i] = { ...entry, status: action, resolvedChapterIndex: chapterNumber };
        break;
      }
    }
  }
  return out;
}

/** 数字台账 → 注入行（写作侧【数字锚·既成名录】与判官【数字一致】共源）。
 * @param relevanceHint 本章蓝图/出场名单文本——显著性行与本章相关者优先注入 */
export function formatNumericAnchorLines(
  ledger: NumericLedgerEntry[],
  chapterNumber: number,
  relevanceHint?: string
): string[] {
  const hintBigrams = bigramSet(relevanceHint ?? '');
  const rows = ledger
    .filter(entry => entry.chapterIndex < chapterNumber)
    .map(entry => ({
      entry,
      score: saliencyScore(`${entry.object} ${entry.nature ?? ''}`, hintBigrams),
    }))
    .sort((a, b) => (b.score > 0 ? 1 : 0) - (a.score > 0 ? 1 : 0) || b.entry.chapterIndex - a.entry.chapterIndex)
    .slice(0, MAX_NUMERIC_ROWS)
    .map(item => item.entry);
  if (rows.length === 0) return [];
  return [
    `以下为各关键数字对象首次确立的正典（后章未标勘误的不同数值已丢弃，不得当成新正典）。同一对象在本章内多次出现的数额必须一致；要改口必须先写出勘误、清点或查实虚报的场面。涉及乘除换算（单价×数量、比例×基数、年数×岁入）先笔算核验再落笔——乘积与总量声明对不上、同账两说，判官将直接拒稿`,
    ...rows.map(
      entry =>
        `第${entry.chapterIndex}章既成「${entry.object}＝${entry.amount}${entry.unit}` +
        (entry.nature ? `（${entry.nature}）` : '') +
        `」`
    ),
  ];
}

/** 时间承诺台账 → 待兑现清单注入行（写作侧【期限承诺】与判官【期限一致】共源）。
 * 期限承诺（deadline）与剧情预告（plot）统一列出：前者按期限约束，后者按
 * 兑现点约束（正文越过预告的应兑现点而未兑现且无否定交代即违约）。 */
export function formatTimePromiseLines(
  promises: TimePromiseEntry[],
  chapterNumber: number,
  relevanceHint?: string
): string[] {
  const open = promises.filter(
    entry => entry.status === 'open' && entry.createdChapterIndex < chapterNumber
  );
  if (open.length === 0) return [];
  const hintBigrams = bigramSet(relevanceHint ?? '');
  const ordered = [...open]
    .map(entry => ({
      entry,
      score: saliencyScore(entry.promise, hintBigrams),
    }))
    .sort((a, b) => (b.score > 0 ? 1 : 0) - (a.score > 0 ? 1 : 0) || b.entry.createdChapterIndex - a.entry.createdChapterIndex)
    .map(item => item.entry);
  const rows = ordered.slice(0, MAX_OPEN_PROMISES_INJECTED).map(
    entry =>
      `第${entry.createdChapterIndex}章${entry.kind === 'plot' ? '预告' : '立下'}：「${entry.promise}」` +
      (entry.due ? `（期限：${entry.due}）` : '') +
      `——距今已 ${chapterNumber - entry.createdChapterIndex} 章`
  );
  return [
    '以下是正文已立下且尚未兑现的承诺（期限承诺与剧情预告）。期限承诺：本章剧情时间一旦到达或越过期限，正文必须兑现，或写出显式的改期/解除/变故场面，禁止无声跳过。剧情预告：本章一旦写到该预告的应兑现节点（预告的对手/人物/事件到场的时点），正文必须兑现或写出显式的否定/变故交代（情报有误/计划取消/人物改变主意），禁止当预告不存在（2026-10-05 都市文书审实证：第2章预告首轮对手是钛合金巨神象、赵天霸其人，实际首轮对手是蛮牛且该名字全书消失）',
    ...rows,
  ];
}

/**
 * 近章时间标记（storyClock 轻量版）：契约 17 的 time-passage 事件以
 * 「时间流逝：…」前缀落在章记忆 keyEvents（格式前缀匹配，非语义正则），
 * 加上规则层已有的 timelineMark 字段，取最近 N 条供【时间轴】注入。
 */
export function collectTimelineMarks(memories: ChapterMemory[]): string[] {
  const marks: Array<{ chapterIndex: number; text: string }> = [];
  const sorted = [...memories].sort((a, b) => a.chapterIndex - b.chapterIndex);
  for (const memory of sorted) {
    if (memory.timelineMark?.trim()) {
      marks.push({ chapterIndex: memory.chapterIndex, text: memory.timelineMark.trim() });
      continue;
    }
    const passage = (memory.keyEvents ?? []).find(
      event => typeof event === 'string' && event.startsWith('时间流逝：')
    );
    if (passage) marks.push({ chapterIndex: memory.chapterIndex, text: passage.slice('时间流逝：'.length) });
  }
  return marks
    .slice(-MAX_TIMELINE_MARKS)
    .map(mark => `第${mark.chapterIndex}章：${mark.text}`);
}
