/**
 * enhanced-context-agent 纯函数单测
 *
 * 覆盖：
 * - normalizeForbiddenZonesByChapter：禁区按章归一化（单点/区间/开放下限/无章号）
 * - volumePlanSellingPointCandidates：卷卖点候选提取
 * - enrichMustCoverWithVolumeSellingPoints：卖点注入 mustCover（短句/跨章过滤/去重）
 */
import { describe, expect, it } from 'vitest';

import {
  enrichMustCoverWithVolumeSellingPoints,
  matchVolumePlanByIndex,
  normalizeForbiddenZonesByChapter,
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
  it('按 高光>目标>冲突>必付伏笔 顺序提取并去空', () => {
    const plan = {
      volumeIndex: 0,
      climax: '厉鬼群自动让开一条路',
      objective: '完成校园鬼域闭环',
      coreConflict: '',
      payoffForeshadows: ['羊皮卷预言', '   '],
    };
    expect(volumePlanSellingPointCandidates(plan)).toEqual([
      '厉鬼群自动让开一条路',
      '完成校园鬼域闭环',
      '羊皮卷预言',
    ]);
  });

  it('无 plan 返回空数组', () => {
    expect(volumePlanSellingPointCandidates(undefined)).toEqual([]);
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
});
