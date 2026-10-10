/**
 * 跨章节奏账本(悬念承接 + 爽点节奏)单元测试。
 */

import { describe, it, expect } from 'vitest';

import {
  findSuspenseDanglingIssues,
  findOverdueSuspenseIssues,
  findCoolPointPacingIssues,
  findPacingIssues,
  SUSPENSE_CARRY_WINDOW,
  SUSPENSE_CARRY_MIN_CHARS,
  type PacingScannableBlueprint,
} from '../pacingLedger';

function bp(
  orderIndex: number,
  overrides: Partial<PacingScannableBlueprint> = {},
): PacingScannableBlueprint {
  return {
    orderIndex,
    title: `第${orderIndex}章测试标题`,
    CBN: `第${orderIndex}章开场动作推进剧情`,
    CEN: `第${orderIndex}章章尾悬念钩住读者`,
    CPNs: [`第${orderIndex}章推进节点`],
    mustCover: [`第${orderIndex}章必出事件`],
    coolPointType: '打脸',
    ...overrides,
  };
}

describe('findSuspenseDanglingIssues', () => {
  it('后续章含 CEN 的 4+ 字连续片段(确定性承接)不报', () => {
    const blueprints = [
      bp(1, { CEN: '窗外劲弩破窗直射陆衡面门' }),
      bp(2, { mustCover: ['查出劲弩破窗直射陆衡面门的来处'] }),
      bp(3),
      bp(4),
      bp(5),
    ];
    expect(findSuspenseDanglingIssues(blueprints)).toHaveLength(0);
  });

  it('仅 2 字实体交集(劲弩/陆衡)无 4 字连续承接仍报——词面是下限证据,换措辞承接归 AI 裁决', () => {
    const blueprints = [
      bp(1, { CEN: '窗外劲弩破窗直射陆衡面门' }),
      bp(2, { mustCover: ['劲弩射向陆衡的真相被当堂揭出'] }),
      bp(3),
      bp(4),
      bp(5),
    ];
    // 设计取舍:宁漏报不误报(fail-closed 误报比漏报致命)。该形态报出后
    // 走 warning 观察项,由读者评审 suspensePayoff 维度做语义终审
    const issues = findSuspenseDanglingIssues(blueprints);
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterNumber).toBe(1);
  });

  it('悬念悬空(CEN 与后3章无任何词面交集)报 suspense-dangling', () => {
    const blueprints = [
      bp(1, { CEN: '甲方向的悬念完全独立成篇' }),
      bp(2, { mustCover: ['乙方向的推进毫无交集可言'] }),
      bp(3, { CPNs: ['丙方向节点零词面重叠'] }),
      bp(4, { CBN: '丁方向开场彻底另起炉灶' }),
      bp(5),
    ];
    const issues = findSuspenseDanglingIssues(blueprints);
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterNumber).toBe(1);
    expect(issues[0].kind).toBe('suspense-dangling');
    expect(issues[0].detail).toContain('承接');
  });

  it('末尾窗口不完整的章豁免(承接方蓝图尚未生成)', () => {
    const blueprints = [
      bp(1, { CEN: '完全孤立的悬念甲甲甲甲' }),
      bp(2, { mustCover: ['完全无关的推进乙乙乙乙'] }),
      bp(3, { CEN: '完全孤立的悬念丙丙丙丙' }),
    ];
    // 只有3章:ch1(1+3=4>3)与ch3(3+3=6>3)窗口均不完整 → 全豁免
    expect(findSuspenseDanglingIssues(blueprints)).toHaveLength(0);
  });

  it('窗口边缘:第 N 章只检查 N+1..N+WINDOW,更晚的承接不算', () => {
    const blueprints = [
      bp(1, { CEN: '悬念关键词组甲乙丙丁' }),
      bp(2, { mustCover: ['无关推进戊己庚辛'] }),
      bp(3, { CPNs: ['无关推进壬癸子丑'] }),
      bp(4, { CBN: '无关开场寅卯辰巳' }),
      bp(5, { mustCover: ['第四拍才接住悬念关键词组甲乙丙丁'] }),
      bp(6),
    ];
    const issues = findSuspenseDanglingIssues(blueprints);
    expect(issues.some(i => i.chapterNumber === 1)).toBe(true);
  });

  it('第3章窗口内承接也算(WINDOW 边界内命中)', () => {
    const blueprints = [
      bp(1, { CEN: '悬念关键词组甲乙丙丁' }),
      bp(2, { mustCover: ['无关推进戊己庚辛'] }),
      bp(3, { CPNs: ['无关推进壬癸子丑'] }),
      bp(4, { CBN: '第三拍接住悬念关键词组甲乙丙丁' }),
      bp(5),
    ];
    expect(
      findSuspenseDanglingIssues(blueprints).some(i => i.chapterNumber === 1)
    ).toBe(false);
  });

  it('短于承接下限的 CEN 不参与(信息量不足,词面判定无意义)', () => {
    const blueprints = [
      bp(1, { CEN: '短钩' }),
      bp(2, { mustCover: ['完全无关推进乙乙乙乙'] }),
      bp(3),
      bp(4),
      bp(5),
    ];
    expect(findSuspenseDanglingIssues(blueprints)).toHaveLength(0);
  });

  it('空 CEN 章跳过(incomplete 门禁负责,不重复报)', () => {
    const blueprints = [bp(1, { CEN: '' }), bp(2), bp(3), bp(4), bp(5)];
    expect(findSuspenseDanglingIssues(blueprints)).toHaveLength(0);
  });

  it('标点/空白不干扰承接判定(归一化口径)', () => {
    const blueprints = [
      bp(1, { CEN: '劲弩、破窗!直射陆衡面门?' }),
      bp(2, { mustCover: ['劲弩破窗直射陆衡面门的来处被查出'] }),
      bp(3),
      bp(4),
      bp(5),
    ];
    expect(findSuspenseDanglingIssues(blueprints)).toHaveLength(0);
  });

  it('窗口与下限可配置', () => {
    const blueprints = [
      bp(1, { CEN: '悬念甲甲甲甲' }),
      bp(2, { mustCover: ['悬念乙乙乙乙'] }),
      bp(3, { mustCover: ['推进丙丙丙丙'] }),
      bp(4),
    ];
    // 默认下限4:与ch2公共子串「悬念」=2,无承接 → 报
    expect(findSuspenseDanglingIssues(blueprints)).toHaveLength(1);
    // 下限降到2:「悬念」2字命中 → 不报
    expect(
      findSuspenseDanglingIssues(blueprints, { minCarryChars: 2 })
    ).toHaveLength(0);
  });
});

describe('findCoolPointPacingIssues', () => {
  it('连续3章同类型爽点报 coolpoint-streak', () => {
    const blueprints = [
      bp(1, { coolPointType: '打脸' }),
      bp(2, { coolPointType: '打脸' }),
      bp(3, { coolPointType: '打脸' }),
      bp(4, { coolPointType: '反转' }),
    ];
    const issues = findCoolPointPacingIssues(blueprints);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('coolpoint-streak');
    expect(issues[0].chapterNumber).toBe(1);
    expect(issues[0].detail).toContain('打脸');
  });

  it('连续2章同类型不报(未达阈值),断续同类型不报', () => {
    const blueprints = [
      bp(1, { coolPointType: '打脸' }),
      bp(2, { coolPointType: '打脸' }),
      bp(3, { coolPointType: '反转' }),
      bp(4, { coolPointType: '打脸' }),
    ];
    expect(findCoolPointPacingIssues(blueprints)).toHaveLength(0);
  });

  it('连续2章缺失爽点类型报 coolpoint-missing', () => {
    const blueprints = [
      bp(1, { coolPointType: '打脸' }),
      bp(2, { coolPointType: '' }),
      bp(3, { coolPointType: undefined }),
      bp(4, { coolPointType: '反转' }),
    ];
    const issues = findCoolPointPacingIssues(blueprints);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('coolpoint-missing');
    expect(issues[0].chapterNumber).toBe(2);
  });

  it('单章缺失不报(偶发容错)', () => {
    const blueprints = [
      bp(1, { coolPointType: '打脸' }),
      bp(2, { coolPointType: '' }),
      bp(3, { coolPointType: '反转' }),
    ];
    expect(findCoolPointPacingIssues(blueprints)).toHaveLength(0);
  });

  it('章号不连续(中间章缺失)时两侧不串成 streak', () => {
    const blueprints = [
      bp(1, { coolPointType: '打脸' }),
      bp(2, { coolPointType: '打脸' }),
      bp(4, { coolPointType: '打脸' }),
      bp(5),
    ];
    const issues = findCoolPointPacingIssues(blueprints);
    expect(issues.filter(i => i.kind === 'coolpoint-streak')).toHaveLength(0);
  });

  it('同类型 streak 与缺失交错互不误报', () => {
    const blueprints = [
      bp(1, { coolPointType: '碾压' }),
      bp(2, { coolPointType: '' }),
      bp(3, { coolPointType: '碾压' }),
      bp(4, { coolPointType: '碾压' }),
      bp(5, { coolPointType: '碾压' }),
    ];
    const issues = findCoolPointPacingIssues(blueprints);
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterNumber).toBe(3);
    expect(issues[0].kind).toBe('coolpoint-streak');
  });
});

describe('findPacingIssues(组合入口)', () => {
  it('两类检测合并返回', () => {
    const blueprints = [
      bp(1, { CEN: '完全孤立悬念甲甲甲甲', coolPointType: '打脸' }),
      bp(2, { mustCover: ['完全无关推进乙乙乙乙'], coolPointType: '打脸' }),
      bp(3, { CPNs: ['无关推进丙丙丙丙'], coolPointType: '打脸' }),
      bp(4, { CBN: '无关开场丁丁丁丁', coolPointType: '' }),
      bp(5, { coolPointType: '' }),
      bp(6, { CEN: '孤立悬念戊戊戊戊', coolPointType: '反转' }),
      bp(7, { mustCover: ['承接孤立悬念戊戊戊戊的后续'], coolPointType: '解谜' }),
    ];
    const issues = findPacingIssues(blueprints);
    expect(
      issues.some(i => i.kind === 'suspense-dangling' && i.chapterNumber === 1)
    ).toBe(true);
    expect(
      issues.some(i => i.kind === 'coolpoint-streak' && i.chapterNumber === 1)
    ).toBe(true);
    expect(
      issues.some(i => i.kind === 'coolpoint-missing' && i.chapterNumber === 4)
    ).toBe(true);
    expect(
      issues.some(i => i.chapterNumber === 6 && i.kind === 'suspense-dangling')
    ).toBe(false);
  });
});

describe('阈值常量', () => {
  it('默认参数与文档口径一致', () => {
    expect(SUSPENSE_CARRY_WINDOW).toBe(3);
    expect(SUSPENSE_CARRY_MIN_CHARS).toBe(4);
  });
});

describe('悬念堆积失衡(P2.2 联动编排,2026-10-03)', () => {
  // 悬念文本两两无 ≥4 字公共子串(共享词根会互相「承接」干扰悬空判定)
  const D = ['断线风筝飘过城墙头', '黑衣人影闪过长廊尽头', '铜秤砣裂开一道细缝',
    '火漆印下压着半张残页', '旧账夹层掉出枯叶一枚'] as const;

  it('连续 4+ 章悬空追加 suspense-pileup(报首章)', () => {
    const blueprints = [
      bp(1, { CEN: D[0] }),
      bp(2, { CEN: D[1] }),
      bp(3, { CEN: D[2] }),
      bp(4, { CEN: D[3] }),
      bp(5, { CEN: D[4] }),
      bp(6),
      bp(7),
      bp(8),
    ];
    const issues = findSuspenseDanglingIssues(blueprints);
    // 1-5 章全部悬空(各自后3章无词面承接)→ 5 条单章 + 1 条堆积
    expect(issues.filter(i => i.kind === 'suspense-dangling')).toHaveLength(5);
    const pileup = issues.find(i => i.kind === 'suspense-pileup');
    expect(pileup).toBeDefined();
    expect(pileup!.chapterNumber).toBe(1);
    expect(pileup!.detail).toContain('只抛不接');
  });

  it('连续 3 章悬空(未达堆积线)不追加 pileup——单章情绪钩合法', () => {
    const blueprints = [
      bp(1, { CEN: D[0] }),
      bp(2, { CEN: D[1] }),
      bp(3, { CEN: D[2] }),
      bp(4),
      bp(5),
      bp(6),
      bp(7),
    ];
    const issues = findSuspenseDanglingIssues(blueprints);
    expect(issues.filter(i => i.kind === 'suspense-dangling')).toHaveLength(3);
    expect(issues.some(i => i.kind === 'suspense-pileup')).toBe(false);
  });

  it('悬空不连续(间章承接)不触发堆积', () => {
    const blueprints = [
      bp(1, { CEN: D[0] }),
      bp(2, { mustCover: [`查证${D[0]}的来处`] }), // 承接 ch1
      bp(3, { CEN: D[1] }),
      bp(4, { mustCover: [`追查${D[1]}的真身`] }), // 承接 ch3
      bp(5, { CEN: D[2] }),
      bp(6, { mustCover: [`起获${D[2]}送验`] }),
      bp(7),
      bp(8),
    ];
    const issues = findSuspenseDanglingIssues(blueprints);
    expect(issues.filter(i => i.kind === 'suspense-dangling')).toHaveLength(0);
    expect(issues.some(i => i.kind === 'suspense-pileup')).toBe(false);
  });
});

describe('findOverdueSuspenseIssues', () => {
  it('未标到期章时不报', () => {
    expect(findOverdueSuspenseIssues([bp(1), bp(2), bp(3)])).toHaveLength(0);
  });

  it('到期章还没生成时不报', () => {
    expect(
      findOverdueSuspenseIssues([
        bp(1, { suspenseDueOrder: 4 }),
        bp(2),
        bp(3),
      ]),
    ).toHaveLength(0);
  });

  it('到期窗口内没有承接标注则报，写上承接章号则放过', () => {
    const open = bp(2, { suspenseDueOrder: 4 });
    expect(findOverdueSuspenseIssues([bp(1), open, bp(3), bp(4)])).toHaveLength(1);
    const paid = findOverdueSuspenseIssues([
      bp(1),
      open,
      bp(3),
      bp(4, { resolvesSuspenseFrom: 2 }),
    ]);
    expect(paid).toHaveLength(0);
  });

  it('到期章等于本章（当章揭晓）不要求后章承接', () => {
    expect(
      findOverdueSuspenseIssues([bp(1, { suspenseDueOrder: 1 }), bp(2)]),
    ).toHaveLength(0);
  });
});
