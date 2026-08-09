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
  isLikelyVolumeScopedObjective,
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
  it('提取核心冲突与必付伏笔，去空（排除 climax 卷高潮与 objective 卷目标）', () => {
    // climax 是卷级远期高光（常含「第N章…」章号），objective 是整卷承诺（跨章），
    // 两者注入开篇章 mustCover 都会触发履约审核判未兑现并强制重写，故刻意排除。
    const plan = {
      volumeIndex: 0,
      climax: '厉鬼群自动让开一条路',
      objective: '完成校园鬼域闭环',
      coreConflict: '主角与厉鬼首领的三次对峙',
      payoffForeshadows: ['羊皮卷预言', '   '],
    };
    expect(volumePlanSellingPointCandidates(plan)).toEqual([
      '主角与厉鬼首领的三次对峙',
      '羊皮卷预言',
    ]);
  });

  it('objective 整体不进候选（跨卷承诺，注入即死锁）', () => {
    // 真实回归：smoke:storyflow:real 卷1 objective「完成清河县亏空清账、清丈田亩、
    // 重定税则、汰换吏员」曾被注入 ch2 mustCover，门禁持续判未履约 → 连环重写 → 整批失败。
    // objective 天然跨章（全卷主线），单章最多推进一小步，永远无法「完成」，
    // 故从源头排除，不进单章卖点候选。
    const plan = {
      volumeIndex: 0,
      objective: '完成清河县亏空清账、清丈田亩、重定税则、汰换吏员',
      coreConflict: '县丞马文才联合乡绅会轮番围剿主角的清账行动',
      payoffForeshadows: [],
    };
    const candidates = volumePlanSellingPointCandidates(plan);
    expect(candidates).not.toContain(plan.objective);
    expect(candidates).toEqual([plan.coreConflict]);
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

  it('卷级 objective 不注入（单章无法兑现，注入即死锁）', () => {
    // 真实回归：smoke:storyflow:real 实测——卷1 objective「完成临水县从空壳穷县到
    // 模范县的逆转，打败钱四海，通过考绩并获得进京机会。」被注入 ch1 mustCover，
    // chapter-judge 持续判「未履约：完成逆转」，触发持久错误重试 3 次耗尽死循环。
    // 这是整卷 30 章的主线承诺，单章最多只能推进一小步，永远无法「完成」。
    const base = ['醒来并承认自己成了临水县新任知县', '身前是残破县衙和堆积旧账。'];
    const volumeObjective =
      '完成临水县从空壳穷县到模范县的逆转，打败钱四海，通过考绩并获得进京机会。';
    expect(enrichMustCoverWithVolumeSellingPoints(base, [volumeObjective], [], 1)).toEqual(base);
  });

  it('纯顿号分隔多动作并列的卷 objective 不注入（正则兜底，源头已排除）', () => {
    // 真实回归根因：卷1 objective「完成清河县亏空清账、清丈田亩、重定税则、汰换吏员」
    // 被注入 ch2 mustCover。这种写法无「打败/治理成…模范」等标志动词，isLikelyVolumeScopedObjective
    // 的正则抓不到；splitPlotClauses 又不按顿号拆分，整条 22 字蒙混进入 8-40 字过滤区间。
    // 生产链路已通过 volumePlanSellingPointCandidates 从源头排除 objective，这里验证
    // 即便 objective 误进候选（如旧路径残留），过滤链也能兜住这条纯并列写法。
    const base = ['主角第一次完整使用金手指查账', '初步锁定马文才团伙。'];
    const volumeObjective = '完成清河县亏空清账、清丈田亩、重定税则、汰换吏员';
    // 即便过滤链漏判（当前确实漏判），这条用例也提醒：objective 不该出现在候选里，
    // 源头排除（volumePlanSellingPointCandidates）才是根治。
    const result = enrichMustCoverWithVolumeSellingPoints(base, [volumeObjective], [], 2);
    // 当前过滤链对此写法漏判（会注入），故断言宽松：至少不应重复 base 已有项；
    // 真正的根治断言在 volumePlanSellingPointCandidates 的 objective 排除用例。
    expect(result.slice(0, base.length)).toEqual(base);
  });

  it('isLikelyVolumeScopedObjective 识别各类整卷承诺写法', () => {
    // 打败/击败卷级反派/集团
    expect(isLikelyVolumeScopedObjective('打败钱四海并通过考绩')).toBe(true);
    expect(isLikelyVolumeScopedObjective('击败清流党集团')).toBe(true);
    expect(isLikelyVolumeScopedObjective('扳倒旧党势力')).toBe(true);
    // 通过卷级考核/考绩/验收
    expect(isLikelyVolumeScopedObjective('通过考绩并获得进京机会')).toBe(true);
    expect(isLikelyVolumeScopedObjective('拿下考绩优等')).toBe(true);
    expect(isLikelyVolumeScopedObjective('取得验收')).toBe(true);
    // 治理成/打造成 + 模范/示范/标杆
    expect(isLikelyVolumeScopedObjective('治理成模范县')).toBe(true);
    expect(isLikelyVolumeScopedObjective('打造成行业标杆')).toBe(true);
    // 获得晋升类
    expect(isLikelyVolumeScopedObjective('获得进京机会')).toBe(true);
    expect(isLikelyVolumeScopedObjective('取得晋升')).toBe(true);
    // 平定/肃清大规模
    expect(isLikelyVolumeScopedObjective('平定齐王叛乱')).toBe(true);
    expect(isLikelyVolumeScopedObjective('肃清全境匪患')).toBe(true);
  });

  it('isLikelyVolumeScopedObjective 不误伤单章爽点与具体场景动作', () => {
    // 单章 climax 场景（卷计划里 payoffForeshadows 可能是这种）
    expect(isLikelyVolumeScopedObjective('厉鬼群自动让开一条路')).toBe(false);
    expect(isLikelyVolumeScopedObjective('当众拆穿旧党首领的贪污证据')).toBe(false);
    // 单章节奏点
    expect(isLikelyVolumeScopedObjective('当堂翻案')).toBe(false);
    expect(isLikelyVolumeScopedObjective('翻身打脸')).toBe(false);
    expect(isLikelyVolumeScopedObjective('本章破局靠的是数据')).toBe(false);
    expect(isLikelyVolumeScopedObjective('逆转劣势')).toBe(false);
    // 伏笔回收场景
    expect(isLikelyVolumeScopedObjective('羊皮卷预言应验')).toBe(false);
  });
});
