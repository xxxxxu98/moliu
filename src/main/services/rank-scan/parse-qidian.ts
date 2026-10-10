/**
 * 解析起点移动榜单页的 SSR JSON。
 *
 * 只读 vite-plugin-ssr_pageContext 里的 records，不根据简介判断是否值得开题。
 */

import type { RankChannel, RankEntry } from '../../../renderer/src/types/rank-scan';
import { clipRankText } from './clip-rank-text';
import { RANK_ENTRIES_PER_BOARD } from './constants';

/** 起点页解析结果。channel 只在页面自己标了男女频时出现 */
export interface ParsedRankPage {
  entries: RankEntry[];
  channel?: RankChannel;
}

interface QidianRecord {
  bName?: unknown;
  bAuth?: unknown;
  cat?: unknown;
  subCat?: unknown;
  cnt?: unknown;
  desc?: unknown;
  rankNum?: unknown;
}

function readChannel(value: unknown): RankChannel | undefined {
  if (value === 'male' || value === 'female') return value;
  return undefined;
}

function readRecords(payload: unknown): { records: QidianRecord[]; channel?: RankChannel } | null {
  if (!payload || typeof payload !== 'object') return null;
  const pageContext = (payload as { pageContext?: unknown }).pageContext;
  if (!pageContext || typeof pageContext !== 'object') return null;
  const pageProps = (pageContext as { pageProps?: unknown }).pageProps;
  if (!pageProps || typeof pageProps !== 'object') return null;
  const pageData = (pageProps as { pageData?: unknown }).pageData;
  if (!pageData || typeof pageData !== 'object') return null;
  const records = (pageData as { records?: unknown }).records;
  if (!Array.isArray(records)) return null;
  return {
    records: records as QidianRecord[],
    channel: readChannel((pageData as { gender?: unknown }).gender),
  };
}

function toEntry(record: QidianRecord, index: number): RankEntry | null {
  const title = clipRankText(record.bName, 40);
  if (!title) return null;
  const genre = clipRankText(record.cat, 20);
  const subGenre = clipRankText(record.subCat, 20);
  const tags = [genre, subGenre].filter((tag, index, list) => tag && list.indexOf(tag) === index);
  const rank = typeof record.rankNum === 'number' && record.rankNum > 0 ? record.rankNum : index + 1;
  return {
    rank,
    title,
    author: clipRankText(record.bAuth, 20),
    genre,
    tags: tags.slice(0, 3),
    wordCount: clipRankText(record.cnt, 20),
    blurb: clipRankText(record.desc, 60),
  };
}

/** 从起点榜单 HTML 抽出书目；页面结构不对时返回 null */
export function parseQidianRankHtml(html: string): ParsedRankPage | null {
  const marker = '<script id="vite-plugin-ssr_pageContext"';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const open = html.indexOf('>', start);
  const close = html.indexOf('</script>', open);
  if (open < 0 || close < 0) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(html.slice(open + 1, close));
  } catch {
    return null;
  }

  const page = readRecords(payload);
  if (!page) return null;
  const entries = page.records
    .map((record, index) => toEntry(record, index))
    .filter((entry): entry is RankEntry => entry !== null)
    .slice(0, RANK_ENTRIES_PER_BOARD);
  return { entries, channel: page.channel };
}
