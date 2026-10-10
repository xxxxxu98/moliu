/**
 * 选榜与采集编排：番茄/知乎不发请求，单块失败不拖垮另一块。
 */
import { describe, expect, it, vi } from 'vitest';
import { selectRankBoards } from '../boards';
import { assertRankUrl } from '../constants';
import { decodeRankBytes, readRankBody } from '../read-rank-body';
import { scanRanks } from '../scan-ranks';

function mockFetch(impl: (url: string) => Promise<Response> | Response): typeof fetch {
  return (async (input: RequestInfo | URL) => impl(String(input))) as typeof fetch;
}

const NOW = new Date(2026, 9, 10);

const QIDIAN_HTML = `<script id="vite-plugin-ssr_pageContext" type="application/json">{"pageContext":{"pageProps":{"pageData":{"gender":"male","records":[{"bName":"夜无疆","rankNum":1,"cat":"玄幻","subCat":"东方玄幻","cnt":"1万字","bAuth":"辰东","desc":"太阳"}]}}}}</script>`;

describe('selectRankBoards', () => {
  it('uses qidian monthly tickets and jinjiang when audience is unset', () => {
    const boards = selectRankBoards({ platform: 'general', length: 'long' }, NOW);
    expect(boards.map(board => board.boardId)).toEqual(['qidian-yuepiao', 'jinjiang-income']);
    expect(boards.every(board => board.url?.startsWith('https://'))).toBe(true);
  });

  it('uses the female lists when audience is female', () => {
    const boards = selectRankBoards({ platform: 'general', audience: 'female' }, NOW);
    expect(boards.map(board => board.boardId)).toEqual(['jinjiang-income', 'qimao-hot-female']);
  });

  it('does not request fanqie or zhihu', () => {
    const fanqie = selectRankBoards({ platform: 'fanqie' }, NOW)[0];
    expect(fanqie).toMatchObject({
      parser: 'unsupported',
      reasonCode: 'font-obfuscated',
    });
    expect(fanqie?.url).toBeUndefined();
    expect(selectRankBoards({ platform: 'zhihu' }, NOW)[0]).toMatchObject({
      reasonCode: 'no-public-page',
    });
  });

  it('puts the current month on the qimao url', () => {
    const board = selectRankBoards({ platform: 'qimao', audience: 'male', length: 'short' }, NOW)[0];
    expect(board?.url).toContain('date=202610');
    expect(board?.url).toContain('rank_type=2');
    expect(board?.url).toContain('is_girl=0');
  });
});

describe('assertRankUrl', () => {
  it('rejects hosts and schemes outside the public rank allowlist', () => {
    expect(() => assertRankUrl('https://evil.test/rank')).toThrow(/允许名单/);
    expect(() => assertRankUrl('http://m.qidian.com/rank/yuepiao/')).toThrow(/允许名单/);
    expect(() => assertRankUrl('https://m.qidian.com/rank/yuepiao/')).not.toThrow();
  });
});

describe('readRankBody', () => {
  it('rejects a declared body larger than the cap', async () => {
    const response = new Response('x', { headers: { 'content-length': '2000000' } });
    await expect(readRankBody(response)).rejects.toMatchObject({ name: 'RankHttpError' });
  });

  it('decodes gbk bytes', () => {
    expect(decodeRankBytes(Uint8Array.of(0xc4, 0xe3), 'gbk')).toBe('你');
  });
});

describe('scanRanks', () => {
  it('returns live samples from qidian and keeps going when the other board fails', async () => {
    const fetchImpl = mockFetch(async url => {
      if (url.includes('yuepiao')) return new Response(QIDIAN_HTML, { status: 200 });
      return new Response('nope', { status: 500 });
    });

    const result = await scanRanks({ platform: 'general' }, { fetchImpl, now: NOW });
    expect(result.availability).toBe('live');
    expect(result.sampleCount).toBe(1);
    expect(result.boards.find(board => board.boardId === 'qidian-yuepiao')?.entries[0]?.title).toBe(
      '夜无疆',
    );
    expect(result.boards.find(board => board.boardId === 'jinjiang-income')?.status).toBe('http-error');
  });

  it('does not fetch when the platform has no public list', async () => {
    const fetchImpl = vi.fn();
    const result = await scanRanks(
      { platform: 'fanqie' },
      { fetchImpl: mockFetch(url => fetchImpl(url)), now: NOW },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.availability).toBe('unavailable');
    expect(result.boards[0]?.reasonCode).toBe('font-obfuscated');
  });

  it('treats a redirect as a failed board instead of following it', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 302 }));
    const result = await scanRanks(
      { platform: 'qidian' },
      { fetchImpl: mockFetch(() => fetchImpl()), now: NOW },
    );
    expect(result.availability).toBe('unavailable');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.boards.every(board => board.status === 'http-error')).toBe(true);
  });
});
