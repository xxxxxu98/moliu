/**
 * @vitest-environment happy-dom
 *
 * 数字/时间事实台账（2026-10-05 契约 15/17 agent 化改造）：
 * 契约结构化出账 → 项目级台账 → 起草/判官注入。取代退役的
 * collectNumericAnchors 单位词表正则（都市文信用点/吨/天全漏实证）。
 */

import { describe, it, expect } from 'vitest';
import {
  projectNumericLedgerEntries,
  projectTimeLedger,
  mergeNumericLedger,
  mergeTimePromises,
  resolveTimePromisesByText,
  formatNumericAnchorLines,
  formatTimePromiseLines,
  collectTimelineMarks,
} from '../numericLedger';
import type { ExtractedFacts, StoryEvent } from '@/types/story-runtime';
import type { ChapterMemory, NumericLedgerEntry, TimePromiseEntry } from '@/types/project';

function eventOf(overrides: Partial<StoryEvent>): StoryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    chapter: 10,
    sceneId: 'scene-1',
    type: 'event',
    summary: '占位摘要',
    participants: [],
    causes: [],
    effects: [],
    evidence: ['正文原句'],
    ...overrides,
  };
}

function factsOf(events: StoryEvent[]): ExtractedFacts {
  return { events, deltas: [], evidence: [] };
}

describe('projectNumericLedgerEntries（契约 15 结构化出账投影）', () => {
  it('抽取带 numeric 字段的 numeric-fact 事件；单位为题材自由字符串（信用点/吨）', () => {
    const entries = projectNumericLedgerEntries(
      factsOf([
        eventOf({
          type: 'numeric-fact',
          chapter: 10,
          summary: '周巡家欠金刚重工债务连本带利共计三百万信用点',
          numeric: { object: '周巡家欠金刚重工债务总额', amount: 3000000, unit: '信用点', nature: '连本带利总额' },
        }),
        eventOf({
          type: 'numeric-fact',
          chapter: 6,
          summary: '铁皮蛮牛自重三十吨',
          numeric: { object: '铁皮蛮牛自重', amount: 30, unit: '吨', nature: '自重' },
        }),
        eventOf({ type: 'event', summary: '普通事件不入账' }),
        eventOf({ type: 'numeric-fact', summary: '缺 numeric 字段的数字事件跳过' }),
        eventOf({
          type: 'numeric-fact',
          summary: 'amount 非数字跳过',
          numeric: { object: '坏账', amount: Number.NaN, unit: '信用点' },
        }),
      ])
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ object: '周巡家欠金刚重工债务总额', amount: 3000000, unit: '信用点', chapterIndex: 10 });
    expect(entries[1]).toMatchObject({ object: '铁皮蛮牛自重', amount: 30, unit: '吨', chapterIndex: 6 });
  });

  it('unit 缺省时兜底「单位未注明」，object 为空跳过', () => {
    const entries = projectNumericLedgerEntries(
      factsOf([
        eventOf({ type: 'numeric-fact', numeric: { object: '赏金', amount: 500, unit: '' } }),
        eventOf({ type: 'numeric-fact', numeric: { object: '', amount: 1, unit: '两' } }),
      ])
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].unit).toBe('单位未注明');
  });
});

describe('mergeNumericLedger（口径正典：同对象最新章覆盖）', () => {
  it('同对象新值覆盖旧值，不同对象并存，按章号升序', () => {
    const existing: NumericLedgerEntry[] = [
      { object: '债务总额', amount: 300000, unit: '信用点', chapterIndex: 3 },
      { object: '铁皮蛮牛自重', amount: 2, unit: '吨', chapterIndex: 5 },
    ];
    const merged = mergeNumericLedger(existing, [
      { object: '债务总额', amount: 3000000, unit: '信用点', chapterIndex: 10, nature: '连本带利总额' },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find(e => e.object === '债务总额')?.amount).toBe(3000000);
    expect(merged[0].chapterIndex).toBeLessThanOrEqual(merged[1].chapterIndex);
  });

  it('同章重投影幂等（重写轮不重复入账）', () => {
    const entry: NumericLedgerEntry = { object: '债务总额', amount: 3000000, unit: '信用点', chapterIndex: 10 };
    const merged = mergeNumericLedger([entry], [{ ...entry }]);
    expect(merged.filter(e => e.object === '债务总额')).toHaveLength(1);
  });
});

describe('formatNumericAnchorLines（注入行）', () => {
  it('含头部口径规则与对象行；只注入目标章之前的既成值', () => {
    const ledger: NumericLedgerEntry[] = [
      { object: '铁皮蛮牛自重', amount: 30, unit: '吨', chapterIndex: 6 },
      { object: '周巡家欠金刚重工债务总额', amount: 3000000, unit: '信用点', chapterIndex: 10, nature: '连本带利总额' },
    ];
    const lines = formatNumericAnchorLines(ledger, 15);
    expect(lines[0]).toContain('最新既成值');
    expect(lines.some(l => l.includes('第10章既成「周巡家欠金刚重工债务总额＝3000000信用点（连本带利总额）」'))).toBe(true);
    expect(lines.some(l => l.includes('第6章既成「铁皮蛮牛自重＝30吨」'))).toBe(true);
    // 目标章自身与未来章的账不入注入
    expect(formatNumericAnchorLines([{ object: '新账', amount: 1, unit: '个', chapterIndex: 15 }], 15)).toHaveLength(0);
    expect(formatNumericAnchorLines([], 15)).toHaveLength(0);
  });

  it('超过 12 条时保留章号最新的 12 条', () => {
    const ledger: NumericLedgerEntry[] = Array.from({ length: 15 }, (_, i) => ({
      object: `对象${i}`,
      amount: i,
      unit: '个',
      chapterIndex: i + 1,
    }));
    const lines = formatNumericAnchorLines(ledger, 99);
    expect(lines).toHaveLength(13); // 头部 + 12 行
    expect(lines[1]).toContain('第15章既成'); // 最新在前
    expect(lines.some(l => l.includes('第1章既成'))).toBe(false);
  });
});

describe('projectTimeLedger / mergeTimePromises（契约 17）', () => {
  it('open 与 fulfilled/renegotiated 分离', () => {
    const projection = projectTimeLedger(
      factsOf([
        eventOf({ type: 'time-promise', chapter: 11, time: { promise: '十六强开赛前还清三百万债务', due: '三天后', action: 'open' } }),
        eventOf({ type: 'time-promise', chapter: 15, time: { promise: '十六强开赛前还清三百万债务', action: 'fulfilled' } }),
        eventOf({ type: 'time-passage', chapter: 12, summary: '时间流逝：当夜黑市到次日清晨' }),
      ])
    );
    expect(projection.opens).toHaveLength(1);
    expect(projection.resolves).toHaveLength(1);
    expect(projection.opens[0].due).toBe('三天后');
  });

  it('resolve 把匹配的 open 条目流转为 fulfilled（互相包含匹配，最近优先）', () => {
    const existing: TimePromiseEntry[] = [
      { promise: '十六强开赛前还清三百万债务', due: '三天后', createdChapterIndex: 11, status: 'open' },
    ];
    const merged = mergeTimePromises(
      existing,
      projectTimeLedger(
        factsOf([
          eventOf({ type: 'time-promise', chapter: 16, time: { promise: '还清三百万债务', action: 'fulfilled' } }),
        ])
      ),
      16
    );
    expect(merged[0].status).toBe('fulfilled');
    expect(merged[0].resolvedChapterIndex).toBe(16);
  });

  it('同章同 promise 重复 open 幂等；匹配不上的 resolve 静默忽略', () => {
    const projection = projectTimeLedger(
      factsOf([
        eventOf({ type: 'time-promise', chapter: 11, time: { promise: '三天后开赛', due: '三天后', action: 'open' } }),
      ])
    );
    const once = mergeTimePromises([], projection, 11);
    const twice = mergeTimePromises(once, projection, 11);
    expect(twice.filter(p => p.status === 'open')).toHaveLength(1);
    const unmatched = mergeTimePromises(
      twice,
      projectTimeLedger(factsOf([eventOf({ type: 'time-promise', chapter: 12, time: { promise: '完全无关的承诺', action: 'renegotiated' } })])),
      12
    );
    expect(unmatched.find(p => p.promise === '三天后开赛')?.status).toBe('open');
  });
});

describe('formatTimePromiseLines / collectTimelineMarks', () => {
  it('只注入目标章之前立下的 open 承诺，含「已隔X章」', () => {
    const promises: TimePromiseEntry[] = [
      { promise: '十六强开赛前还清三百万债务', due: '三天后', createdChapterIndex: 11, status: 'open' },
      { promise: '已经兑现的承诺', createdChapterIndex: 5, status: 'fulfilled', resolvedChapterIndex: 8 },
      { promise: '本章新立不入', createdChapterIndex: 15, status: 'open' },
    ];
    const lines = formatTimePromiseLines(promises, 15);
    expect(lines[0]).toContain('尚未兑现');
    expect(lines.some(l => l.includes('第11章立下') && l.includes('已 4 章'))).toBe(true);
    expect(lines.some(l => l.includes('已经兑现'))).toBe(false);
    expect(lines.some(l => l.includes('本章新立'))).toBe(false);
  });

  it('collectTimelineMarks：timelineMark 优先，keyEvents「时间流逝：」前缀兜底，取最近 6 条', () => {
    const memories = [
      { chapterIndex: 1, keyEvents: ['时间流逝：契约室当日下午'], timelineMark: undefined },
      { chapterIndex: 2, keyEvents: [], timelineMark: '当夜·贫困生宿舍' },
      ...Array.from({ length: 8 }, (_, i) => ({
        chapterIndex: 3 + i,
        keyEvents: [`时间流逝：第${3 + i}天`],
        timelineMark: undefined,
      })),
    ] as unknown as ChapterMemory[];
    const marks = collectTimelineMarks(memories);
    expect(marks).toHaveLength(6);
    // 10 章取最近 6 章 = 第 5..10 章；第 2 章 timelineMark 被挤出窗口
    expect(marks[0]).toContain('第5章');
    expect(marks[marks.length - 1]).toContain('第10章');
    expect(marks.some(m => m.includes('当夜·贫困生宿舍'))).toBe(false);
  });

  it('2026-10-05 书审场景回归：债务三百万在册时 ch15 注入行必须携带（旧正则全军覆没的对照）', () => {
    const ledger: NumericLedgerEntry[] = [
      { object: '周巡家欠金刚重工债务总额', amount: 3000000, unit: '信用点', chapterIndex: 10, nature: '连本带利总额' },
    ];
    const lines = formatNumericAnchorLines(ledger, 15);
    expect(lines.some(l => l.includes('3000000信用点'))).toBe(true);
  });
});

describe('契约 18 剧情预告（plot-promise，2026-10-05 首轮对手预告落空实证）', () => {
  it('plot-promise 事件入台账带 kind=plot；注入行用「预告」标签', () => {
    const projection = projectTimeLedger(
      factsOf([
        eventOf({
          type: 'plot-promise',
          chapter: 2,
          time: { promise: '第一轮对手是赵天霸赞助的钛合金巨神象', action: 'open' },
        }),
        eventOf({
          type: 'time-promise',
          chapter: 11,
          time: { promise: '十六强开赛前还清三百万债务', due: '三天后', action: 'open' },
        }),
      ])
    );
    expect(projection.opens.find(p => p.promise.includes('巨神象'))?.kind).toBe('plot');
    expect(projection.opens.find(p => p.promise.includes('三百万'))?.kind).toBe('deadline');
    const lines = formatTimePromiseLines(projection.opens, 15);
    expect(lines[0]).toContain('剧情预告');
    expect(lines.some(l => l.includes('第2章预告：') && l.includes('钛合金巨神象'))).toBe(true);
    expect(lines.some(l => l.includes('第11章立下：'))).toBe(true);
  });

  it('plot-promise 的 fulfilled 流转与 deadline 共用 resolve 匹配', () => {
    const opens = projectTimeLedger(
      factsOf([eventOf({ type: 'plot-promise', chapter: 2, time: { promise: '首轮对手是钛合金巨神象', action: 'open' } })])
    ).opens;
    const merged = mergeTimePromises(
      opens,
      projectTimeLedger(
        factsOf([eventOf({ type: 'plot-promise', chapter: 5, time: { promise: '首轮对手是钛合金巨神象', action: 'renegotiated' } })])
      ),
      5
    );
    expect(merged[0].status).toBe('renegotiated');
    expect(merged[0].resolvedChapterIndex).toBe(5);
  });
});

describe('resolveTimePromisesByText（判官兑现闭环，2026-10-08 r19 37/40 永远开放的解药）', () => {
  it('判官确认文本按互相包含匹配 open 条目并流转 fulfilled', () => {
    const promises: TimePromiseEntry[] = [
      { promise: '十六强开赛前还清三百万债务', createdChapterIndex: 11, status: 'open' },
      { promise: '赵天霸三日后带巨神象登门', createdChapterIndex: 5, status: 'open' },
    ];
    const out = resolveTimePromisesByText(
      promises,
      [{ text: '还清三百万债务', action: 'fulfilled' }],
      18
    );
    expect(out.find(p => p.promise.includes('三百万'))?.status).toBe('fulfilled');
    expect(out.find(p => p.promise.includes('三百万'))?.resolvedChapterIndex).toBe(18);
    expect(out.find(p => p.promise.includes('巨神象'))?.status).toBe('open');
  });

  it('无匹配文本与空数组都是 no-op；已 fulfilled 条目不被重复流转', () => {
    const promises: TimePromiseEntry[] = [
      { promise: '已兑现的承诺', createdChapterIndex: 3, status: 'fulfilled', resolvedChapterIndex: 9 },
    ];
    const out = resolveTimePromisesByText(promises, [{ text: '完全无关', action: 'fulfilled' }], 20);
    expect(out[0].status).toBe('fulfilled');
    expect(out[0].resolvedChapterIndex).toBe(9);
    expect(resolveTimePromisesByText(promises, [], 20)).toEqual(promises);
  });
});
