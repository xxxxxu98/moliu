/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it } from 'vitest';
import {
  buildRollContextBase,
  dropForeshadowConflictingItems,
  findFateReleaseCheck,
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

describe('findLockedForeshadowViolations · 兑现方向', () => {
  // 2026-09-06 g38f-200chr2 ch36 受害样本：初版节点第 36 章「当众颁布三级网格
  // 考成法」，伏笔蓝图锁定第 45 章揭示——5 次拒稿整章死。埋设方向检查对
  // 「埋设后、回收前的整段提前兑现」无能为力（bp.orderIndex >= setupAt 放行）。
  const GRID_LEDGER: ForeshadowTimingHint = {
    hint: '白麻布网格图卷三级网格考成法',
    setupChapter: 20,
    payoffChapter: 45,
  };

  it('埋设后、回收前的强词面命中=提前兑现伏笔载荷（ch36 形态）', () => {
    const blueprints = [
      bp(36, {
        CPNs: ['沈怀安当众颁布三级网格考成法与末位罢黜令'],
        mustCover: ['沈怀安推行网格考成法'],
      }),
    ];
    const issues = findLockedForeshadowViolations(blueprints, [GRID_LEDGER]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('locked-foreshadow-payoff');
    expect(issues[0].chapterNumber).toBe(36);
    expect(issues[0].detail).toContain('第45章');
    expect(issues[0].detail).toContain('铺垫');
  });

  it('埋设后的正常铺垫（弱词面重叠）放行', () => {
    const blueprints = [
      bp(30, { CPNs: ['沈怀安核对白麻布图卷上的粮册批注。'] }),
    ];
    expect(findLockedForeshadowViolations(blueprints, [GRID_LEDGER])).toHaveLength(0);
  });

  it('回收章及之后完整兑现放行', () => {
    const blueprints = [
      bp(45, { mustCover: ['沈怀安全面推行三级网格考成法。'] }),
    ];
    expect(findLockedForeshadowViolations(blueprints, [GRID_LEDGER])).toHaveLength(0);
  });
});

describe('findFateReleaseCheck', () => {
  const LOCKS = [{ name: '沈辞', state: '下狱' }];

  function batchWith(fields: Partial<ChapterBlueprint>, extra?: Partial<ChapterBlueprint>) {
    return [
      bp(24, fields),
      ...(extra ? [bp(25, extra)] : []),
    ];
  }

  // 2026-09-06 g38f-r2fix-100ch 受害样本：主角获释被压成一句回述，台账下狱态
  // 滞后 10 章，判官连续拒稿靠绕过通过——命运锁角色出现在批次节点但无解除事件。
  it('命运锁角色被批次节点提及且无【解除】节点 → 送修复轮核查', () => {
    const issues = findFateReleaseCheck(
      batchWith({ CBN: '沈辞身着正六品官袍乘车赴户部履新' }),
      LOCKS,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('fate-release-check');
    expect(issues[0].chapterNumber).toBe(24);
    expect(issues[0].detail).toContain('【解除】沈辞');
    expect(issues[0].detail).toContain('在押');
  });

  it('批次内已有带【解除】标记的节点 → 不再核查', () => {
    const issues = findFateReleaseCheck(
      batchWith(
        { CBN: '沈辞身着官袍赴户部' },
        { mustCover: ['【解除】沈辞：崇宁帝御笔朱批特简获释，沈辞官复原职'] },
      ),
      LOCKS,
    );
    expect(issues).toHaveLength(0);
  });

  it('命运锁角色未被批次提及 → 无 issue；空锁名单 → 无 issue', () => {
    expect(findFateReleaseCheck(batchWith({ CBN: '顾青舟赴通州查仓' }), LOCKS)).toHaveLength(0);
    expect(findFateReleaseCheck(batchWith({ CBN: '沈辞赴户部' }), [])).toHaveLength(0);
  });
});

describe('dropForeshadowConflictingItems（空章补写节点消毒）', () => {
  // 2026-09-07 修复基建：r2 书 ch36 补写前须删掉与伏笔时点冲突的节点条目，
  // 否则原样补写会重演 5 连拒死章。
  const GRID_LEDGER: ForeshadowTimingHint = {
    hint: '白麻布网格图卷三级网格考成法',
    setupChapter: 20,
    payoffChapter: 45,
  };

  it('删除与伏笔时点冲突的条目，保留干净条目（ch36 形态）', () => {
    const bp = {
      ...bp36Base(),
    };
    const { blueprint, dropped } = dropForeshadowConflictingItems(bp, [GRID_LEDGER]);
    expect(dropped).toHaveLength(2);
    expect(dropped[0]).toContain('网格考成法');
    expect(blueprint.CPNs).toHaveLength(2);
    expect(blueprint.CPNs[0]).toContain('罢市');
    expect(blueprint.mustCover[0]).toContain('铁饭碗');
  });

  it('mustCover 全冲突时退化为通用缝合节点，不保留带毒条目', () => {
    const bp = {
      orderIndex: 36,
      title: '第36章',
      summary: '',
      CBN: '',
      CPNs: [],
      CEN: '',
      mustCover: ['沈怀安当众颁布三级网格考成法'],
      forbiddenZones: [],
      hookType: 'reveal',
    };
    const { blueprint, dropped } = dropForeshadowConflictingItems(bp, [GRID_LEDGER]);
    expect(dropped).toHaveLength(1);
    expect(blueprint.mustCover).toHaveLength(1);
    expect(blueprint.mustCover[0]).toContain('过渡事件');
    expect(blueprint.mustCover[0]).not.toContain('考成法');
  });

  function bp36Base() {
    return {
      orderIndex: 36,
      title: '破除铁饭碗，推行网格考成掀桌子',
      summary: '公堂改革',
      CBN: '沈怀安将吏员铁券当堂撕成两半',
      CPNs: [
        '清河县县衙公堂上老粮吏以罢市抗税相威胁',
        '沈怀安当众颁布三级网格考成法与末位罢黜令',
        '赵延现身以皇庄护卫为考成推行提供铁血武力背书',
      ],
      CEN: '老吏们摔碎算盘夺门而去',
      mustCover: [
        '沈怀安推行网格考成法',
        '打破胥吏终身制铁饭碗',
        '老吏抱团对抗罢工',
      ],
      forbiddenZones: [],
      hookType: 'reveal',
    };
  }
});

describe('buildRollContextBase · 登场锁标注与假死在册清单（g38f r8 实证）', () => {
  it('revealTiming 晚于滚动起点的角色在名单中标注禁登场；假死在册角色进 fakedDeaths 不进命运锁', () => {
    // r8：赵宣 revealTiming=第155章，滚纲名单不带锁信息 → ch82 蓝图点名 → 五连拒成洞；
    // 主角 ch151 假死被登「死亡」→ 死亡锁锁死滚纲按死人写「生前密信」
    const project = {
      name: '做个天子孤臣',
      characters: [
        { name: '陆九霄', role: 'protagonist' },
        { name: '赵宣', role: 'antagonist', profile: { revealTiming: '第155章身份揭晓' } },
        { name: '冯恩', role: 'support' },
      ],
      chapterMemories: [
        {
          chapterId: 'c151',
          chapterTitle: '第151章',
          chapterIndex: 150,
          corePlot: '假死局',
          keyEvents: [],
          locations: [],
          characterStateChanges: [
            { characterName: '陆九霄', stateType: 'status', state: '假死', detail: '蜡衣药丸' },
          ],
          revealedForeshadows: [],
          newForeshadows: [],
          wordCount: 3000,
          createdAt: new Date().toISOString(),
        },
      ],
      foreshadows: [],
      plotOutline: [],
      chapters: [],
    } as never;

    const base = buildRollContextBase(project, 155);
    // 登场锁：赵宣 155 章起点 → 155>155 为 false 不锁；从 100 起点则锁
    const baseEarly = buildRollContextBase(project, 100);
    expect(baseEarly.characterRoster).toContain('赵宣(antagonist)【155章前禁登场/禁揭示】');
    expect(baseEarly.characterRoster).not.toContain('【155章前禁登场】陆九霄');
    expect(base.characterRoster).toContain('赵宣(antagonist)');

    // 假死在册：进 fakedDeaths 清单，不进命运锁
    expect(base.fakedDeaths).toHaveLength(1);
    expect(base.fakedDeaths[0]).toContain('陆九霄');
    expect(base.fakedDeaths[0]).toContain('假死在册');
    expect(base.fateLocks.some(lock => lock.includes('陆九霄'))).toBe(false);
  });
});
