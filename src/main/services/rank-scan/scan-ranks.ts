/**
 * 按筛选采集公开榜单，汇总成题材雷达可用的样本。
 *
 * 单块失败不影响其他块。全部没有书目时 availability 为 unavailable，交给经验洞察。
 */

import type {
  RankBoardReason,
  RankBoardSample,
  RankChannel,
  RankEntry,
  RankScanRequest,
  RankScanResult,
} from '../../../renderer/src/types/rank-scan';
import { selectRankBoards, type RankBoardSpec } from './boards';
import { assertRankUrl, RANK_FETCH_TIMEOUT_MS, RANK_USER_AGENT } from './constants';
import { parseJinjiangRankHtml } from './parse-jinjiang';
import { parseQidianRankHtml, type ParsedRankPage } from './parse-qidian';
import { parseQimaoRankJson } from './parse-qimao';
import { decodeRankBytes, readRankBody } from './read-rank-body';

/** 测试可替换 fetch 和“当前时间”，避免打到真实站点 */
export interface RankScanDeps {
  fetchImpl?: typeof fetch;
  now?: Date;
}

function emptyBoard(
  spec: RankBoardSpec,
  status: RankBoardSample['status'],
  reasonCode?: RankBoardReason,
  entries: RankEntry[] = [],
  channel?: RankChannel,
): RankBoardSample {
  return {
    site: spec.site,
    boardId: spec.boardId,
    channel: channel ?? spec.channel,
    status,
    entries,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

function reasonFromError(error: unknown): RankBoardReason {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }
  return 'http';
}

function headersFor(spec: RankBoardSpec): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': RANK_USER_AGENT,
    Accept: spec.parser === 'qimao' ? 'application/json' : 'text/html',
  };
  if (spec.parser === 'qimao') headers.Referer = 'https://www.qimao.com/paihang';
  return headers;
}

function parseBoard(spec: RankBoardSpec, text: string): ParsedRankPage | null {
  if (spec.parser === 'qidian') return parseQidianRankHtml(text);
  if (spec.parser === 'qimao') return parseQimaoRankJson(text);
  if (spec.parser === 'jinjiang') return parseJinjiangRankHtml(text);
  return null;
}

async function scanBoard(spec: RankBoardSpec, fetchImpl: typeof fetch): Promise<RankBoardSample> {
  if (spec.parser === 'unsupported' || !spec.url) {
    return emptyBoard(spec, 'unsupported', spec.reasonCode);
  }

  try {
    assertRankUrl(spec.url);
    const response = await fetchImpl(spec.url, {
      headers: headersFor(spec),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(RANK_FETCH_TIMEOUT_MS),
    });
    if (response.status < 200 || response.status >= 300) {
      return emptyBoard(spec, 'http-error', 'http');
    }
    const bytes = await readRankBody(response);
    const text = decodeRankBytes(bytes, spec.parser === 'jinjiang' ? 'gbk' : 'utf-8');
    const parsed = parseBoard(spec, text);
    if (!parsed) return emptyBoard(spec, 'parse-error', 'parse');
    if (parsed.entries.length === 0) return emptyBoard(spec, 'empty', 'empty', [], parsed.channel);
    return emptyBoard(spec, 'ok', undefined, parsed.entries, parsed.channel);
  } catch (error) {
    return emptyBoard(spec, 'http-error', reasonFromError(error));
  }
}

/**
 * 采集本次筛选对应的公开榜。
 * 至少一块有书目才算 live，否则雷达改走经验判断。
 */
export async function scanRanks(
  request: RankScanRequest,
  deps: RankScanDeps = {},
): Promise<RankScanResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const specs = selectRankBoards(request, deps.now ?? new Date());
  const boards = await Promise.all(specs.map(spec => scanBoard(spec, fetchImpl)));
  const sampleCount = boards.reduce((total, board) => total + board.entries.length, 0);
  return {
    availability: sampleCount > 0 ? 'live' : 'unavailable',
    fetchedAt: new Date().toISOString(),
    sampleCount,
    boards,
  };
}
