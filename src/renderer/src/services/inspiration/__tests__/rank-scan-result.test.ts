/**
 * 雷达脚注：有样本才说实时榜，没有采集通道时保持经验判断文案。
 */
import { describe, expect, it } from 'vitest';
import { formatRadarDisclaimer, sanitizeRankScanResult } from '../rank-scan-result';
import type { RankScanResult } from '@/types/rank-scan';

const t = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key}:${JSON.stringify(params)}` : key;

function liveScan(partial = false): RankScanResult {
  return {
    availability: 'live',
    fetchedAt: '2026-10-10T03:28:00.000Z',
    sampleCount: 1,
    boards: [
      {
        site: 'qidian',
        boardId: 'qidian-yuepiao',
        channel: 'male',
        status: 'ok',
        entries: [
          {
            rank: 1,
            title: '夜无疆',
            author: '辰东',
            genre: '玄幻',
            tags: ['玄幻'],
            wordCount: '1万字',
            blurb: '',
          },
        ],
      },
      ...(partial
        ? [
            {
              site: 'jinjiang' as const,
              boardId: 'jinjiang-income',
              channel: 'mixed' as const,
              status: 'http-error' as const,
              entries: [],
              reasonCode: 'http' as const,
            },
          ]
        : []),
    ],
  };
}

describe('formatRadarDisclaimer', () => {
  it('keeps the experience line when the scan channel is missing', () => {
    expect(
      formatRadarDisclaimer(
        { availability: 'unavailable', fetchedAt: '', sampleCount: 0, boards: [], failure: 'no-channel' },
        false,
        t,
      ),
    ).toBe('topicDiscovery.radarDisclaimer');
  });

  it('names the collected boards when insights used the samples', () => {
    const text = formatRadarDisclaimer(liveScan(), true, t);
    expect(text).toContain('topicDiscovery.radarDisclaimerLive');
    expect(text).toContain('2026-10-10 03:28 UTC');
    expect(text).toContain('topicDiscovery.boards.qidian-yuepiao');
  });

  it('says the list was partial when one board failed', () => {
    expect(formatRadarDisclaimer(liveScan(true), true, t)).toContain(
      'topicDiscovery.radarDisclaimerLivePartial',
    );
  });

  it('explains fanqie font encryption without calling it a live scan', () => {
    const text = formatRadarDisclaimer(
      {
        availability: 'unavailable',
        fetchedAt: '2026-10-10T03:28:00.000Z',
        sampleCount: 0,
        boards: [
          {
            site: 'fanqie',
            boardId: 'fanqie-rank',
            channel: 'unknown',
            status: 'unsupported',
            entries: [],
            reasonCode: 'font-obfuscated',
          },
        ],
      },
      false,
      t,
    );
    expect(text).toBe('topicDiscovery.radarDisclaimerFanqie');
  });
});

describe('sanitizeRankScanResult', () => {
  it('drops malformed boards and refuses to call a dirty payload live', () => {
    const sanitized = sanitizeRankScanResult({
      availability: 'live',
      fetchedAt: '2026-10-10T03:28:00.000Z',
      boards: [{ site: 'qidian', boardId: '../etc', status: 'ok', entries: [] }, null],
    });
    expect(sanitized?.availability).toBe('unavailable');
    expect(sanitized?.boards).toEqual([]);
  });
});
