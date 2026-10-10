/**
 * 公开榜单采集的地址与体积上限。
 *
 * 只允许三个 https 主机。番茄字体加密、知乎无公开榜页不在这里发请求。
 */

/** 单块榜单请求超时。公开页打不开就放弃，不阻塞另一块 */
export const RANK_FETCH_TIMEOUT_MS = 8_000;

/** 榜单页实际在百 KB 级；超过此值直接丢弃，避免异常响应撑满内存 */
export const RANK_FETCH_MAX_BYTES = 1_500_000;

/** 每块榜最多带进洞察的书目数 */
export const RANK_ENTRIES_PER_BOARD = 12;

/** 晋江每个题材栏目取样本数 */
export const JINJIANG_PER_SECTION = 2;

/** 晋江金榜整页样本上限 */
export const JINJIANG_MAX_ENTRIES = 24;

/** 允许抓取的榜单主机 */
export const RANK_HOSTS = {
  qidian: 'm.qidian.com',
  qimao: 'www.qimao.com',
  jinjiang: 'www.jjwxc.net',
} as const;

/** 榜单 id，界面文案和提示词都按这个对齐 */
export const RANK_BOARD_ID = {
  qidianYuepiao: 'qidian-yuepiao',
  qidianNewbook: 'qidian-newbook',
  qimaoHotMale: 'qimao-hot-male',
  qimaoHotFemale: 'qimao-hot-female',
  qimaoNewMale: 'qimao-new-male',
  qimaoNewFemale: 'qimao-new-female',
  jinjiangIncome: 'jinjiang-income',
  fanqieRank: 'fanqie-rank',
  zhihuSalt: 'zhihu-salt',
} as const;

/**
 * 起点移动页按普通浏览器返回 SSR。固定一个 UA，不轮换、不解验证码。
 */
export const RANK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/** 起点月票或新书榜的移动端 SSR 页 */
export function qidianRankUrl(board: 'yuepiao' | 'newbook'): string {
  return `https://${RANK_HOSTS.qidian}/rank/${board}/`;
}

/**
 * 七猫公开 JSON 榜。
 * date 用当前年月，与站点日榜参数一致。
 */
export function qimaoRankUrl(input: { female: boolean; fresh: boolean; now: Date }): string {
  const month = `${input.now.getFullYear()}${String(input.now.getMonth() + 1).padStart(2, '0')}`;
  const rankType = input.fresh ? 2 : 1;
  const girl = input.female ? 1 : 0;
  const params = new URLSearchParams({
    is_girl: String(girl),
    rank_type: String(rankType),
    date_type: '1',
    date: month,
    page: '1',
  });
  return `https://${RANK_HOSTS.qimao}/api/rank/book-list?${params.toString()}`;
}

/** 晋江收入金榜。页面按题材分栏，编码是 GBK */
export function jinjiangIncomeUrl(): string {
  return `https://${RANK_HOSTS.jinjiang}/topten.php?orderstr=12`;
}

/** 采集地址必须是允许名单里的 https 主机 */
export function assertRankUrl(url: string): void {
  const parsed = new URL(url);
  const allowed = new Set<string>(Object.values(RANK_HOSTS));
  if (parsed.protocol !== 'https:' || !allowed.has(parsed.hostname)) {
    throw Object.assign(new Error('榜单地址不在允许名单'), { name: 'RankHttpError' });
  }
}
