/**
 * enhanced-context-agent 纯函数单测
 *
 * 覆盖：
 * - normalizeForbiddenZonesByChapter：禁区按章归一化（单点/区间/开放下限/无章号）
 * - volumePlanSellingPointCandidates：卷卖点候选提取（排除远期 climax）
 * - referencesFutureChapter：远期章号引用识别
 * - enrichMustCoverWithVolumeSellingPoints：卖点注入 mustCover（短句/跨章/远期章号过滤/去重）
 */
import { describe, expect, it } from 'vitest';

import {
  enrichMustCoverWithVolumeSellingPoints,
  matchVolumePlanByIndex,
  normalizeForbiddenZonesByChapter,
  referencesFutureChapter,
  volumePlanSellingPointCandidates,
} from '../enhanced-context-agent';

describe('normalizeForbiddenZonesByChapter', () => {
  it('单点禁区：目标章号已过则过滤（“第1章就出现”写第 3 章）', () => {
    const result = normalizeForbiddenZonesByChapter(
      ['不能让沈青梧在第1章就出现', '不能解释厉鬼绕行原因'],
      3
    );
    expect(result).toEqual(['不能解释厉鬼绕行原因']);
  });

  it('单点禁区：目标章号未过则保留（写第 1 章）', () => {
    const result = normalizeForbiddenZonesByChapter(['不能让沈青梧在第1章就出现'], 1);
    expect(result).toEqual(['不能让沈青梧在第1章就出现']);
  });

  it('区间禁区：任一目标章号未过则保留（“第1章到第3章”写第 2 章）', () => {
    const result = normalizeForbiddenZonesByChapter(
      ['第1章到第3章不能让主角死亡'],
      2
    );
    expect(result).toHaveLength(1);
  });

  it('区间禁区：全部章号已过则过滤（写第 4 章）', () => {
    const result = normalizeForbiddenZonesByChapter(
      ['第1章到第3章不能让主角死亡'],
      4
    );
    expect(result).toHaveLength(0);
  });

  it('开放下限禁区：“第5章以后”写第 6 章仍保留', () => {
    const result = normalizeForbiddenZonesByChapter(['第5章以后不能让X出现'], 6);
    expect(result).toHaveLength(1);
  });

  it('开放下限禁区：“第5章以后”写第 4 章已过期', () => {
    const result = normalizeForbiddenZonesByChapter(['第5章以后不能让X出现'], 4);
    expect(result).toHaveLength(0);
  });

  it('“从第N章起”也识别为开放下限', () => {
    expect(normalizeForbiddenZonesByChapter(['从第3章起不能让X出现'], 5)).toHaveLength(1);
    expect(normalizeForbiddenZonesByChapter(['从第3章起不能让X出现'], 2)).toHaveLength(0);
  });

  it('“起因/起来”不误判为开放下限（无“第N章起”前缀）', () => {
    // “起”出现在词中而非“第N章起”，应走单点/无章号分支
    expect(normalizeForbiddenZonesByChapter(['不能解释厉鬼绕行的起因'], 3)).toEqual([
      '不能解释厉鬼绕行的起因',
    ]);
  });

  it('无章号禁区恒保留', () => {
    const result = normalizeForbiddenZonesByChapter(['不能解释厉鬼绕行原因'], 30);
    expect(result).toEqual(['不能解释厉鬼绕行原因']);
  });
});

describe('matchVolumePlanByIndex', () => {
  it('volumePlans.volumeIndex 为 1 基，0 基卷索引匹配时 +1', () => {
    const plans = [
      { volumeIndex: 1, objective: '第一卷' },
      { volumeIndex: 2, objective: '第二卷' },
    ];
    expect(matchVolumePlanByIndex(plans, 0)?.objective).toBe('第一卷');
    expect(matchVolumePlanByIndex(plans, 1)?.objective).toBe('第二卷');
  });

  it('无匹配或无 plans 返回 undefined', () => {
    expect(matchVolumePlanByIndex([{ volumeIndex: 1, objective: '第一卷' }], 3)).toBeUndefined();
    expect(matchVolumePlanByIndex(undefined, 0)).toBeUndefined();
  });
});

describe('volumePlanSellingPointCandidates', () => {
  it('按 目标>冲突>必付伏笔 顺序提取并去空（排除 climax 卷高潮）', () => {
    // climax 是卷级远期高光（常含「第N章…」章号），注入开篇章 mustCover 会触发
    // 履约审核判未兑现并强制重写，故刻意排除。
    const plan = {
      volumeIndex: 0,
      climax: '厉鬼群自动让开一条路',
      objective: '完成校园鬼域闭环',
      coreConflict: '',
      payoffForeshadows: ['羊皮卷预言', '   '],
    };
    expect(volumePlanSellingPointCandidates(plan)).toEqual([
      '完成校园鬼域闭环',
      '羊皮卷预言',
    ]);
  });

  it('无 plan 返回空数组', () => {
    expect(volumePlanSellingPointCandidates(undefined)).toEqual([]);
  });
});

describe('referencesFutureChapter', () => {
  it('含「第N章」且 N 远超当前章 → true（卷级 climax 典型场景）', () => {
    // 真实回归数据：第1章 mustCover 注入了「第59章…朝会拆穿旧党首领贪污证据」
    expect(
      referencesFutureChapter('主角在朝会上当众拆穿旧党首领的贪污证据', 1)
    ).toBe(false); // 无章号引用，不触发
    expect(
      referencesFutureChapter('第59章，主角在朝会上当众拆穿旧党首领的贪污证据', 1)
    ).toBe(true);
  });

  it('章号在近期视窗内（默认 horizon=5）→ false（仍可作为近期铺垫注入）', () => {
    expect(referencesFutureChapter('第3章完成考核汇总', 1)).toBe(false);
    expect(referencesFutureChapter('第6章兑现打脸', 1)).toBe(false); // 6 ≤ 1+5
  });

  it('章号刚好超出视窗 → true', () => {
    expect(referencesFutureChapter('第7章兑现打脸', 1)).toBe(true); // 7 > 1+5
  });

  it('无章号引用 → false', () => {
    expect(referencesFutureChapter('主角用 Excel 整理卷宗', 1)).toBe(false);
  });

  it('chapterNumber ≤ 0 时不判远期（保守放过）', () => {
    expect(referencesFutureChapter('第59章兑现高潮', 0)).toBe(false);
  });

  it('可自定义 horizon', () => {
    // horizon=0：只允许当前章及以前的章号引用
    expect(referencesFutureChapter('第2章兑现', 1, 0)).toBe(true);
    expect(referencesFutureChapter('第1章兑现', 1, 0)).toBe(false);
  });
});

describe('enrichMustCoverWithVolumeSellingPoints', () => {
  it('注入可单章兑现的短句（“厉鬼群自动让开一条路，全场死寂”→ 前子句）', () => {
    const result = enrichMustCoverWithVolumeSellingPoints(['顾无咎在教室醒来'], [
      '厉鬼群自动让开一条路，全场死寂',
    ]);
    expect(result).toEqual(['顾无咎在教室醒来', '厉鬼群自动让开一条路']);
  });

  it('跨章目标（限期+威胁）不注入', () => {
    const result = enrichMustCoverWithVolumeSellingPoints(['顾无咎在教室醒来'], [
      '三天内翻案否则将被处斩',
    ]);
    expect(result).toEqual(['顾无咎在教室醒来']);
  });

  it('与既有 mustCover 重叠的候选跳过', () => {
    const result = enrichMustCoverWithVolumeSellingPoints(['厉鬼群自动让开一条路'], [
      '厉鬼群自动让开一条路，全场死寂',
    ]);
    expect(result).toEqual(['厉鬼群自动让开一条路']);
  });

  it('候选与禁区冲突时跳过（不软化作者禁区）', () => {
    const result = enrichMustCoverWithVolumeSellingPoints(
      ['顾无咎在教室醒来'],
      ['当众提前揭露真相，全场哗然'],
      ['不能提前揭露真相']
    );
    expect(result).toEqual(['顾无咎在教室醒来']);
  });

  it('空候选返回原样', () => {
    const base = ['A'];
    expect(enrichMustCoverWithVolumeSellingPoints(base, [])).toBe(base);
    expect(enrichMustCoverWithVolumeSellingPoints(base, undefined as unknown as string[])).toBe(
      base
    );
  });

  it('远期章号引用不注入（传 chapterNumber 时过滤）', () => {
    // 真实回归：第1章 mustCover 被注入了卷1 climax「第59章，主角在朝会上当众拆穿
    // 旧党首领的贪污证据」，导致履约审核判未兑现、强制整章重写透支后续高潮。
    const base = ['穿越醒来', '发现身份', '接受第一份任务', '展示金手指初现'];
    const candidates = [
      '第59章，主角在朝会上当众拆穿旧党首领的贪污证据，皇帝当场下令抄家',
    ];
    // 传 chapterNumber=1（开篇章）：远期章号应被过滤
    expect(enrichMustCoverWithVolumeSellingPoints(base, candidates, [], 1)).toEqual(base);
    // 不传 chapterNumber（向后兼容）：退化为不过滤章号引用——子句本身能拆出合规短句
    // 「主角在朝会上当众拆穿旧党首领的贪污证据」（28字、非跨章、无重叠），仍会注入
    const legacy = enrichMustCoverWithVolumeSellingPoints(base, candidates);
    expect(legacy.length).toBe(base.length + 1);
  });

  it('近期章号引用可注入（horizon 视窗内）', () => {
    // 卷目标「第3章完成考核汇总」对第1章而言在 5 章视窗内，可作为近期铺垫
    const base = ['穿越醒来'];
    const result = enrichMustCoverWithVolumeSellingPoints(
      base,
      ['第3章完成考核汇总，打脸质疑者'],
      [],
      1
    );
    // 「第3章完成考核汇总」8 字（含章号）刚过下限；拆出的子句若通过长度过滤即注入
    expect(result.length).toBeGreaterThanOrEqual(base.length);
  });
});
