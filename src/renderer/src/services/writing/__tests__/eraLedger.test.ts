/**
 * 纪年台账：首次年号为正典，年份只向后走，异名只有改元标注才替换。
 */

import { describe, expect, it } from 'vitest';
import { formatEraAnchorLines, mergeEraLedger, projectEraLedgerEntries } from '../eraLedger';
import type { EraLedgerEntry } from '@/types/project';
import type { ExtractedFacts, StoryEvent } from '@/types/story-runtime';

function eventOf(overrides: Partial<StoryEvent>): StoryEvent {
  return {
    id: 'e1',
    chapter: 10,
    sceneId: 's1',
    type: 'era-fact',
    summary: '天兴二十一年',
    participants: [],
    causes: [],
    effects: [],
    evidence: ['天兴二十一年春'],
    ...overrides,
  };
}

describe('projectEraLedgerEntries', () => {
  it('只收合法 era-fact', () => {
    const facts: ExtractedFacts = {
      events: [
        eventOf({ era: { name: ' 天兴 ', year: 21, revision: 'establish' } }),
        eventOf({ id: 'e2', type: 'plot', era: { name: '建元', year: 1 } }),
        eventOf({ id: 'e3', era: { name: '天兴', year: 0 } }),
        eventOf({ id: 'e4', chapter: 0, era: { name: '天兴', year: 21 } }),
      ],
      deltas: [],
      evidence: [],
    };
    expect(projectEraLedgerEntries(facts)).toEqual([
      {
        eraName: '天兴',
        year: 21,
        chapterIndex: 10,
        revision: 'establish',
        evidence: '天兴二十一年春',
      },
    ]);
  });
});

describe('mergeEraLedger', () => {
  it('首次年号为正典，同章同年不挪章，年份只向后走', () => {
    const ledger = mergeEraLedger([], [
      { eraName: '天兴', year: 21, chapterIndex: 10 },
      { eraName: '天兴', year: 21, chapterIndex: 12 },
      { eraName: '天兴', year: 20, chapterIndex: 15 },
      { eraName: '天兴', year: 22, chapterIndex: 20 },
    ]);
    expect(ledger.map(entry => [entry.eraName, entry.year, entry.chapterIndex])).toEqual([
      ['天兴', 21, 10],
      ['天兴', 22, 20],
    ]);
  });

  it('未标改元的异名不覆盖正典', () => {
    const ledger = mergeEraLedger(
      [{ eraName: '天兴', year: 21, chapterIndex: 10 }],
      [{ eraName: '建元', year: 1, chapterIndex: 50 }],
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.eraName).toBe('天兴');
  });

  it('改元替换正典并记住旧年号，再次合并不会把新年号丢掉', () => {
    const first = mergeEraLedger([{ eraName: '天兴', year: 21, chapterIndex: 10 }], [
      { eraName: '景和', year: 1, chapterIndex: 40, revision: 'correct' },
    ]);
    const again = mergeEraLedger(first, []);
    expect(again[again.length - 1]).toMatchObject({
      eraName: '景和',
      year: 1,
      previousEraName: '天兴',
      reignChangeChapter: 40,
    });
    const lines = formatEraAnchorLines(again);
    expect(lines.join('\n')).toContain('当前纪年「景和1年」');
    expect(lines.join('\n')).toContain('改元前一年号「天兴」');
    expect(lines.some(line => line.includes('第40章纪年「景和1年」'))).toBe(true);
  });

  it('勘误可以把同一年号的年份改小', () => {
    const ledger = mergeEraLedger([{ eraName: '天兴', year: 22, chapterIndex: 20 }], [
      { eraName: '天兴', year: 19, chapterIndex: 30, revision: 'correct' },
    ]);
    expect(ledger[ledger.length - 1]?.year).toBe(19);
  });
});

describe('formatEraAnchorLines', () => {
  it('空账不产出锚，起草侧走未确立年号', () => {
    const empty: EraLedgerEntry[] = [];
    expect(formatEraAnchorLines(empty)).toEqual([]);
  });
});
