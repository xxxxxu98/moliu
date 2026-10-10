/**
 * 按开题筛选决定采哪两块以内的公开榜。
 *
 * 一次刷新最多两块，避免雷达按钮等满全部平台。
 * 番茄书名在私有区字体里，知乎盐言会跳到投放页，这两处不发请求。
 */

import type { RankBoardReason, RankChannel, RankScanRequest, RankSite } from '../../../renderer/src/types/rank-scan';
import {
  RANK_BOARD_ID,
  jinjiangIncomeUrl,
  qidianRankUrl,
  qimaoRankUrl,
} from './constants';

/** 页面解析器。unsupported 表示这个站点本轮不发请求 */
export type RankParserKind = 'qidian' | 'qimao' | 'jinjiang' | 'unsupported';

/** 一块待采集榜单。unsupported 没有 url，只带回原因码 */
export interface RankBoardSpec {
  site: RankSite;
  boardId: string;
  channel: RankChannel;
  parser: RankParserKind;
  url?: string;
  reasonCode?: RankBoardReason;
}

function qidianBoard(board: 'yuepiao' | 'newbook'): RankBoardSpec {
  return {
    site: 'qidian',
    boardId: board === 'yuepiao' ? RANK_BOARD_ID.qidianYuepiao : RANK_BOARD_ID.qidianNewbook,
    channel: 'male',
    parser: 'qidian',
    url: qidianRankUrl(board),
  };
}

function qimaoBoard(female: boolean, fresh: boolean, now: Date): RankBoardSpec {
  const boardId = female
    ? fresh
      ? RANK_BOARD_ID.qimaoNewFemale
      : RANK_BOARD_ID.qimaoHotFemale
    : fresh
      ? RANK_BOARD_ID.qimaoNewMale
      : RANK_BOARD_ID.qimaoHotMale;
  return {
    site: 'qimao',
    boardId,
    channel: female ? 'female' : 'male',
    parser: 'qimao',
    url: qimaoRankUrl({ female, fresh, now }),
  };
}

function jinjiangBoard(): RankBoardSpec {
  return {
    site: 'jinjiang',
    boardId: RANK_BOARD_ID.jinjiangIncome,
    channel: 'mixed',
    parser: 'jinjiang',
    url: jinjiangIncomeUrl(),
  };
}

function unsupported(
  site: RankSite,
  boardId: string,
  reasonCode: RankBoardReason,
): RankBoardSpec {
  return {
    site,
    boardId,
    channel: 'unknown',
    parser: 'unsupported',
    reasonCode,
  };
}

/**
 * 选出本次要采集的榜。
 * 未指定受众时用起点月票 + 晋江金榜，男女向各一块；指定受众后再换七猫对应频道。
 */
export function selectRankBoards(request: RankScanRequest, now = new Date()): RankBoardSpec[] {
  const platform = request.platform ?? 'general';
  const audience = request.audience ?? 'general';
  const fresh = request.length === 'short';

  if (platform === 'fanqie') {
    return [unsupported('fanqie', RANK_BOARD_ID.fanqieRank, 'font-obfuscated')];
  }
  if (platform === 'zhihu') {
    return [unsupported('zhihu', RANK_BOARD_ID.zhihuSalt, 'no-public-page')];
  }
  if (platform === 'qidian') {
    return [qidianBoard('yuepiao'), qidianBoard('newbook')];
  }
  if (platform === 'jinjiang') {
    return [jinjiangBoard()];
  }
  if (platform === 'qimao') {
    if (audience === 'general') {
      return [qimaoBoard(false, fresh, now), qimaoBoard(true, fresh, now)];
    }
    return [qimaoBoard(audience === 'female', fresh, now)];
  }

  if (audience === 'female') {
    return [jinjiangBoard(), qimaoBoard(true, fresh, now)];
  }
  if (audience === 'male') {
    return fresh
      ? [qidianBoard('newbook'), qimaoBoard(false, true, now)]
      : [qidianBoard('yuepiao'), qimaoBoard(false, false, now)];
  }
  return fresh
    ? [qidianBoard('newbook'), jinjiangBoard()]
    : [qidianBoard('yuepiao'), jinjiangBoard()];
}
