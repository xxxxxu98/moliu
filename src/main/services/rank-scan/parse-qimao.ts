/**
 * 解析七猫公开榜单 JSON。
 *
 * 只取 data.table_data 的书目字段。
 */

import type { RankEntry } from '../../../renderer/src/types/rank-scan';
import { clipRankText } from './clip-rank-text';
import { RANK_ENTRIES_PER_BOARD } from './constants';
import type { ParsedRankPage } from './parse-qidian';

interface QimaoRow {
  title?: unknown;
  author?: unknown;
  category1_name?: unknown;
  category2_name?: unknown;
  words_num?: unknown;
  intro?: unknown;
  number?: unknown;
}

function readRows(payload: unknown): QimaoRow[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const rows = (data as { table_data?: unknown }).table_data;
  if (!Array.isArray(rows)) return null;
  return rows as QimaoRow[];
}

function toEntry(row: QimaoRow, index: number): RankEntry | null {
  const title = clipRankText(row.title, 40);
  if (!title) return null;
  const genre = clipRankText(row.category1_name, 20);
  const subGenre = clipRankText(row.category2_name, 20);
  const tags = [genre, subGenre].filter((tag, tagIndex, list) => tag && list.indexOf(tag) === tagIndex);
  const numericRank = Number(row.number);
  const rank = Number.isFinite(numericRank) && numericRank > 0 ? numericRank : index + 1;
  return {
    rank,
    title,
    author: clipRankText(row.author, 20),
    genre,
    tags: tags.slice(0, 3),
    wordCount: clipRankText(row.words_num, 20),
    blurb: clipRankText(row.intro, 60),
  };
}

/** 从七猫榜单 JSON 抽出书目；不是该结构时返回 null */
export function parseQimaoRankJson(text: string): ParsedRankPage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  const rows = readRows(payload);
  if (!rows) return null;
  return {
    entries: rows
      .map((row, index) => toEntry(row, index))
      .filter((entry): entry is RankEntry => entry !== null)
      .slice(0, RANK_ENTRIES_PER_BOARD),
  };
}
