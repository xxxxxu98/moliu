/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest';
import {
  findLockedForeshadowViolations,
  type ForeshadowTimingHint,
} from '../outline-roller';
import type { ChapterBlueprint } from '../../types/executable-outline';

function bp(orderIndex: number, fields: Partial<ChapterBlueprint>): ChapterBlueprint {
  return {
    orderIndex,
    title: `第${orderIndex}章测试`,
    summary: '概要',
    CBN: '开篇动作',
    CPNs: [],
    CEN: '章尾悬念。',
    mustCover: [],
    forbiddenZones: [],
    hookType: 'reveal',
    ...fields,
  } as ChapterBlueprint;
}

const HORSE_LEDGER: ForeshadowTimingHint = {
  hint: '九边战马折损清册异常',
  createdChapter: 42,
};

describe('findLockedForeshadowViolations', () => {
  it('蓝图词面复现锁定伏笔词组时命中（2026-08-28 终验 ch40 死锁受害样本）', () => {
    const blueprints = [
      bp(40, {
        CPNs: ['顾承礼调阅兵部战马清册发现异常台阶数据。'],
        mustCover: ['设立九边战马折损清册异常伏笔。'],
      }),
    ];
    const issues = findLockedForeshadowViolations(blueprints, [HORSE_LEDGER]);
    expect(issues).toHaveLength(1);
    expect(issues[0].chapterNumber).toBe(40);
    expect(issues[0].kind).toBe('locked-foreshadow');
    expect(issues[0].detail).toContain('第42章');
  });

  it('仅出现单个弱相关词（清册）不误伤无关章节', () => {
    const blueprints = [
      bp(12, { CPNs: ['徐文渊整理户部旧年清册归档。'] }),
      bp(13, { CEN: '边关送来战马损伤的口信。' }),
    ];
    expect(findLockedForeshadowViolations(blueprints, [HORSE_LEDGER])).toHaveLength(0);
  });

  it('到达埋设章之后的蓝图不受锁定约束', () => {
    const blueprints = [bp(42, { CPNs: ['顾承礼核对九边战马折损清册异常。'] })];
    expect(findLockedForeshadowViolations(blueprints, [HORSE_LEDGER])).toHaveLength(0);
  });

  it('无计时信息或提示语过短的伏笔跳过校验', () => {
    const blueprints = [bp(3, { CPNs: ['战马清册异常再现。'] })];
    expect(
      findLockedForeshadowViolations(blueprints, [
        { hint: '九边战马折损清册异常' },
        { hint: '短', createdChapter: 10 },
      ])
    ).toHaveLength(0);
  });
});
