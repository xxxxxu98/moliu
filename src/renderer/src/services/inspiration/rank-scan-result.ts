/**
 * 榜单结果的形状校验和雷达脚注文案。
 *
 * 持久化数据可能被改过，先丢掉不合格式的条目，再决定展示实时样本还是经验判断。
 */

import type {
  RankBoardReason,
  RankBoardSample,
  RankBoardStatus,
  RankChannel,
  RankEntry,
  RankScanResult,
  RankSite,
} from '@/types/rank-scan';

const SITES = new Set<RankSite>(['qidian', 'fanqie', 'jinjiang', 'qimao', 'zhihu']);
const STATUSES = new Set<RankBoardStatus>(['ok', 'empty', 'http-error', 'parse-error', 'unsupported']);
const CHANNELS = new Set<RankChannel>(['male', 'female', 'mixed', 'unknown']);
const REASONS = new Set<RankBoardReason>([
  'font-obfuscated',
  'no-public-page',
  'http',
  'parse',
  'empty',
  'timeout',
]);

type Translate = (key: string, params?: Record<string, string | number>) => string;

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function readEntry(value: unknown, index: number): RankEntry | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const title = clip(row.title, 40);
  if (!title) return null;
  const rank = typeof row.rank === 'number' && row.rank > 0 ? row.rank : index + 1;
  const tags = Array.isArray(row.tags)
    ? row.tags.map(tag => clip(tag, 20)).filter(Boolean).slice(0, 3)
    : [];
  return {
    rank,
    title,
    author: clip(row.author, 20),
    genre: clip(row.genre, 20),
    tags,
    wordCount: clip(row.wordCount, 20),
    blurb: clip(row.blurb, 60),
  };
}

function readBoard(value: unknown): RankBoardSample | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.site !== 'string' || !SITES.has(row.site as RankSite)) return null;
  if (typeof row.boardId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(row.boardId)) return null;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status as RankBoardStatus)) return null;
  const entries = Array.isArray(row.entries)
    ? row.entries
        .map((entry, index) => readEntry(entry, index))
        .filter((entry): entry is RankEntry => entry !== null)
        .slice(0, 30)
    : [];
  const channel = CHANNELS.has(row.channel as RankChannel) ? (row.channel as RankChannel) : 'unknown';
  const reasonCode = REASONS.has(row.reasonCode as RankBoardReason)
    ? (row.reasonCode as RankBoardReason)
    : undefined;
  return {
    site: row.site as RankSite,
    boardId: row.boardId,
    channel,
    status: row.status as RankBoardStatus,
    entries,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

/** 持久化或 IPC 回包不合格式时返回 null，避免雷达脚注读到脏数据 */
export function sanitizeRankScanResult(value: unknown): RankScanResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (row.availability !== 'live' && row.availability !== 'unavailable') return null;
  if (!Array.isArray(row.boards)) return null;
  const boards = row.boards
    .map(board => readBoard(board))
    .filter((board): board is RankBoardSample => board !== null)
    .slice(0, 6);
  const sampleCount = boards.reduce((total, board) => total + board.entries.length, 0);
  const failure =
    row.failure === 'no-channel' || row.failure === 'invoke-failed' ? row.failure : undefined;
  return {
    availability: sampleCount > 0 && row.availability === 'live' ? 'live' : 'unavailable',
    fetchedAt: typeof row.fetchedAt === 'string' ? row.fetchedAt.slice(0, 40) : '',
    sampleCount,
    boards,
    ...(failure ? { failure } : {}),
  };
}

function formatFetchedAt(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  return `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`;
}

function boardNames(scan: RankScanResult, t: Translate): string {
  return scan.boards
    .filter(board => board.status === 'ok')
    .map(board => t(`topicDiscovery.boards.${board.boardId}`))
    .join('、');
}

/**
 * 雷达页脚的一句来源说明。
 * 没有采集通道时保持原来的经验判断文案，避免测试环境和纯浏览器把经验卡说成采集失败。
 */
export function formatRadarDisclaimer(
  scan: RankScanResult | null,
  applied: boolean,
  t: Translate,
): string {
  if (!scan || scan.failure === 'no-channel') {
    return t('topicDiscovery.radarDisclaimer');
  }
  if (applied && scan.availability === 'live') {
    const params = {
      time: formatFetchedAt(scan.fetchedAt),
      count: scan.sampleCount,
      boards: boardNames(scan, t),
    };
    const partial = scan.boards.some(board => board.status !== 'ok');
    const key = partial
      ? 'topicDiscovery.radarDisclaimerLivePartial'
      : 'topicDiscovery.radarDisclaimerLive';
    return t(key, params);
  }
  if (scan.sampleCount > 0) {
    return t('topicDiscovery.radarDisclaimerNotApplied');
  }
  if (scan.boards.length > 0 && scan.boards.every(board => board.reasonCode === 'font-obfuscated')) {
    return t('topicDiscovery.radarDisclaimerFanqie');
  }
  if (scan.boards.length > 0 && scan.boards.every(board => board.reasonCode === 'no-public-page')) {
    return t('topicDiscovery.radarDisclaimerZhihu');
  }
  return t('topicDiscovery.radarDisclaimerFailed');
}
