/**
 * 纪年台账：投影、合并、注入格式化。
 *
 * 契约 19 让提取侧交出年号和年份。本模块只做格式校验和单调合并：
 * 首次确立的年号是正典，另一个年号只有标了改元才替换；同一年号的年份
 * 只许向后走，标了勘误才允许改小。不再从正文用正则猜年号。
 */
import type { EraLedgerEntry } from '@/types/project';
import type { ExtractedFacts, StoryEvent } from '@/types/story-runtime';

const MAX_ERA_NAME_LENGTH = 8;

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function acceptEraName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_ERA_NAME_LENGTH) return null;
  if (/[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

function eventEra(event: StoryEvent): EraLedgerEntry | null {
  if (event.type !== 'era-fact') return null;
  const era = event.era;
  if (!era) return null;
  const eraName = acceptEraName(String(era.name ?? ''));
  if (!eraName || !isPositiveInt(era.year) || era.year > 9999) return null;
  return {
    eraName,
    year: era.year,
    chapterIndex: isPositiveInt(event.chapter) ? event.chapter : 0,
    revision: era.revision === 'correct' || era.revision === 'establish' ? era.revision : undefined,
    evidence: event.evidence?.[0],
  };
}

/** 只认 type=era-fact 且带合法 name/year 的事件。 */
export function projectEraLedgerEntries(facts: ExtractedFacts): EraLedgerEntry[] {
  const entries: EraLedgerEntry[] = [];
  for (const event of facts.events ?? []) {
    const entry = eventEra(event);
    if (entry && entry.chapterIndex > 0) entries.push(entry);
  }
  return entries;
}

function sortedEntries(entries: EraLedgerEntry[]): EraLedgerEntry[] {
  const normalized: EraLedgerEntry[] = [];
  for (const entry of entries) {
    const eraName = acceptEraName(entry.eraName);
    if (!eraName || !isPositiveInt(entry.year) || entry.year > 9999 || !isPositiveInt(entry.chapterIndex)) continue;
    normalized.push({ ...entry, eraName });
  }
  return normalized.sort((left, right) => left.chapterIndex - right.chapterIndex || left.year - right.year);
}

function storedEntry(entry: EraLedgerEntry, carry?: EraLedgerEntry): EraLedgerEntry {
  const previousEraName = entry.previousEraName ?? carry?.previousEraName;
  const reignChangeChapter = entry.reignChangeChapter ?? carry?.reignChangeChapter;
  return {
    eraName: acceptEraName(entry.eraName) ?? entry.eraName,
    year: entry.year,
    chapterIndex: entry.chapterIndex,
    ...(previousEraName ? { previousEraName, reignChangeChapter } : {}),
    ...(entry.evidence ? { evidence: entry.evidence } : {}),
  };
}

/** 已落盘的记录按接受过的历史重放，不再要求 revision。 */
function absorbTrusted(kept: EraLedgerEntry[], entry: EraLedgerEntry): void {
  const canon = kept[kept.length - 1];
  if (!canon) {
    kept.push(storedEntry(entry));
    return;
  }
  if (entry.eraName === canon.eraName) {
    if (entry.year === canon.year) return;
    kept.push(storedEntry(entry, canon));
    return;
  }
  kept.push(storedEntry({
    ...entry,
    previousEraName: entry.previousEraName ?? canon.eraName,
    reignChangeChapter: entry.reignChangeChapter ?? entry.chapterIndex,
  }));
}

/** 新投影：同名只向后走，异名只有改元标注才换正典。 */
function absorbStrict(kept: EraLedgerEntry[], entry: EraLedgerEntry): void {
  const canon = kept[kept.length - 1];
  if (!canon) {
    kept.push(storedEntry(entry));
    return;
  }
  if (entry.eraName === canon.eraName) {
    const year = entry.revision === 'correct' ? entry.year : entry.year > canon.year ? entry.year : null;
    if (year == null || year === canon.year) return;
    kept.push(storedEntry({ ...entry, year }, canon));
    return;
  }
  if (entry.revision !== 'correct') return;
  kept.push(storedEntry({
    ...entry,
    previousEraName: canon.eraName,
    reignChangeChapter: entry.chapterIndex,
  }));
}

/**
 * 合并纪年。已有账按历史重放；新投影里第一条合法记录确立年号，
 * 同名年份只向后推进，异名只有 revision=correct（改元场面）才换正典。
 */
export function mergeEraLedger(
  existing: EraLedgerEntry[],
  additions: EraLedgerEntry[],
): EraLedgerEntry[] {
  const kept: EraLedgerEntry[] = [];
  for (const entry of sortedEntries(existing)) absorbTrusted(kept, entry);
  for (const entry of sortedEntries(additions)) absorbStrict(kept, entry);
  return kept;
}

/** 起草与判官共用的纪年锚行。空账返回空数组，起草侧按「未确立年号」处理。 */
export function formatEraAnchorLines(entries: EraLedgerEntry[]): string[] {
  const canon = entries[entries.length - 1];
  if (!canon) return [];
  const lines = [
    `当前纪年「${canon.eraName}${canon.year}年」（第${canon.chapterIndex}章确立）：「${canon.eraName}X年至${canon.eraName}Y年」的跨度＝(Y−X)年；正文与文书中的年份不得大于${canon.year}`,
    `第${canon.chapterIndex}章纪年「${canon.eraName}${canon.year}年」`,
  ];
  if (canon.previousEraName && canon.reignChangeChapter) {
    lines.push(
      `第${canon.reignChangeChapter}章改元前一年号「${canon.previousEraName}」，改元之后只用「${canon.eraName}」`,
    );
  }
  return lines;
}
