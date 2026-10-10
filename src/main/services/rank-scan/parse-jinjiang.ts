/**
 * 解析晋江收入金榜 HTML。
 *
 * 页面按 h5 题材分栏。每栏只取前几本，避免样本全挤在第一个栏目。
 * 栏目标题是页面上的分类名，不在这里重判题材。
 */

import type { RankEntry } from '../../../renderer/src/types/rank-scan';
import { clipRankText } from './clip-rank-text';
import { JINJIANG_MAX_ENTRIES, JINJIANG_PER_SECTION } from './constants';
import type { ParsedRankPage } from './parse-qidian';

function booksIn(section: string): IterableIterator<RegExpMatchArray> {
  return section.matchAll(
    /href="onebook\.php\?novelid=\d+"[^>]*>\s*([^<]{1,40})\s*<\/a>[\s\S]{0,400}?<span class="author">\s*([^<]{1,40})\s*<\/span>/g,
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** 从晋江金榜 HTML 抽出分栏书目；没有书链时返回 null */
export function parseJinjiangRankHtml(html: string): ParsedRankPage | null {
  if (!html.includes('onebook.php')) return null;

  const entries: RankEntry[] = [];
  const sections = html.split('<h5>').slice(1);
  for (const section of sections) {
    if (entries.length >= JINJIANG_MAX_ENTRIES) break;
    const headingEnd = section.indexOf('</h5>');
    if (headingEnd < 0) continue;
    const genre = clipRankText(decodeEntities(section.slice(0, headingEnd).replace(/<[^>]+>/g, '')), 20);
    const body = section.slice(headingEnd);
    let taken = 0;
    for (const match of booksIn(body)) {
      if (taken >= JINJIANG_PER_SECTION || entries.length >= JINJIANG_MAX_ENTRIES) break;
      const title = clipRankText(decodeEntities(match[1] ?? ''), 40);
      if (!title) continue;
      entries.push({
        rank: entries.length + 1,
        title,
        author: clipRankText(decodeEntities(match[2] ?? ''), 20),
        genre,
        tags: genre ? [genre] : [],
        wordCount: '',
        blurb: '',
      });
      taken += 1;
    }
  }

  return { entries, channel: 'mixed' };
}
