/**
 * 公开榜单解析回归：只抽字段，页面结构不对就返回 null。
 */
import { describe, expect, it } from 'vitest';
import { parseJinjiangRankHtml } from '../parse-jinjiang';
import { parseQidianRankHtml } from '../parse-qidian';
import { parseQimaoRankJson } from '../parse-qimao';

const QIDIAN_HTML = `<script id="vite-plugin-ssr_pageContext" type="application/json">{"pageContext":{"pageProps":{"pageData":{"gender":"male","records":[{"bName":"夜无疆","rankNum":1,"cat":"玄幻","subCat":"东方玄幻","cnt":"413万字","bAuth":"辰东","desc":"太阳落下"},{"bName":"   ","rankNum":2}]}}}}</script>`;

describe('parseQidianRankHtml', () => {
  it('reads SSR records and drops blank titles', () => {
    const page = parseQidianRankHtml(QIDIAN_HTML);
    expect(page?.channel).toBe('male');
    expect(page?.entries).toEqual([
      {
        rank: 1,
        title: '夜无疆',
        author: '辰东',
        genre: '玄幻',
        tags: ['玄幻', '东方玄幻'],
        wordCount: '413万字',
        blurb: '太阳落下',
      },
    ]);
  });

  it('returns null when the SSR script is missing', () => {
    expect(parseQidianRankHtml('<html>no rank</html>')).toBeNull();
  });
});

describe('parseQimaoRankJson', () => {
  it('reads table_data titles', () => {
    const page = parseQimaoRankJson(
      JSON.stringify({
        data: {
          table_data: [
            {
              number: '2',
              title: '盖世神医',
              author: '狐颜乱语',
              category1_name: '都市',
              category2_name: '都市高武',
              words_num: '919万字',
              intro: '能救你的命',
            },
          ],
        },
      }),
    );
    expect(page?.entries[0]).toMatchObject({
      rank: 2,
      title: '盖世神医',
      genre: '都市',
      tags: ['都市', '都市高武'],
    });
  });

  it('returns null for a non-rank payload', () => {
    expect(parseQimaoRankJson('{"data":{}}')).toBeNull();
  });
});

describe('parseJinjiangRankHtml', () => {
  it('takes two books from each genre heading', () => {
    const html = `
      <h5>古代言情</h5>
      <a href="onebook.php?novelid=1">兰摧不折玉</a><span class="author">松庭</span>
      <a href="onebook.php?novelid=2">荒腔走板</a><span class="author">甲</span>
      <a href="onebook.php?novelid=3">第三本</a><span class="author">乙</span>
      <h5>现代言情</h5>
      <a href="onebook.php?novelid=4">高嫁之后</a><span class="author">丙</span>
    `;
    const page = parseJinjiangRankHtml(html);
    expect(page?.entries.map(entry => entry.title)).toEqual(['兰摧不折玉', '荒腔走板', '高嫁之后']);
    expect(page?.entries[0]).toMatchObject({ genre: '古代言情', author: '松庭', rank: 1 });
    expect(page?.entries[2]?.genre).toBe('现代言情');
  });

  it('returns null when the page has no book links', () => {
    expect(parseJinjiangRankHtml('<html><h5>古代言情</h5></html>')).toBeNull();
  });
});
