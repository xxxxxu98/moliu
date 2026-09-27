/**
 * 统一实体状态账本（unified-state-ledger 第 2 阶段读侧核心）测试。
 *
 * 覆盖：迁移映射（命运五态/押地/头衔/解除族）、状态机跨属性不变量、
 * ledger-gap 候选、快照折叠、状态卡分组视图、renderStatusRules 双通道
 * 切换与 MOLIU_STATE_CARD 开关默认关闭。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { ChapterMemory } from '@/types/project';

import {
  buildLedgerFromMemories,
  snapshotAt,
  buildStateCardRows,
  isStateCardEnabled,
  renderStatusRules,
} from '../stateLedger';

/** 最小章记忆（只填账本消费的字段，其余按需覆盖） */
const mem = (chapterIndex: number, changes: Array<[string, string, string?]>, extra: Partial<ChapterMemory> = {}): ChapterMemory =>
  ({
    chapterId: `ch-${chapterIndex}`,
    chapterTitle: `第${chapterIndex}章`,
    chapterIndex,
    corePlot: '',
    keyEvents: [],
    locations: [],
    characterStateChanges: changes.map(([characterName, state, detail]) => ({
      characterName,
      state,
      detail: detail ?? '',
    })),
    revealedForeshadows: [],
    newForeshadows: [],
    emotionalTone: '未知',
    wordCount: 0,
    createdAt: new Date().toISOString(),
    ...extra,
  }) as ChapterMemory;

describe('stateLedger 迁移与状态机', () => {
  it('r8-S1-05 顾宪诚形态：押地刷新关押地、他人解除不连带、快照保持 in押', () => {
    const memories = [
      mem(113, [['顾宪诚', '下狱', '三法司定谳下狱']]),
      mem(119, [['崔显', '复职', '磕头领命戴罪效力']]),
      mem(134, [['顾宪诚', '押地:相府书斋', '押回相府看管']]),
    ];
    const { entries, violations } = buildLedgerFromMemories(memories);
    expect(violations).toHaveLength(0);
    const snap = snapshotAt(entries, 142);
    expect(snap.get('顾宪诚')).toMatchObject({ custody: 'held', custodyPlace: '相府书斋' });
    expect(snap.get('崔显')).toMatchObject({ office: 'restored' });
  });

  it('r7-S1-03 周文彬形态：死亡完成体无 vital 条目 → ledger-gap 候选', () => {
    const memories = [
      mem(187, [['周文彬', '下狱', '押入死牢']]),
      mem(188, [], { corePlot: '刑场号炮三响，周文彬人头落地。', keyEvents: ['周文彬枭首示众'] }),
    ];
    const { gaps } = buildLedgerFromMemories(memories);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ chapter: 188 });
  });

  it('合法解除链：下狱→平反后快照 free；越狱后再入押保真为 recapture', () => {
    const { entries, violations } = buildLedgerFromMemories([
      mem(1, [['顾砚之', '下狱', '死牢画押']]),
      mem(56, [['顾砚之', '平反', '洗脱冤狱即刻开释']]),
      mem(60, [['赵恒', '下狱', '一进宫']]),
      mem(62, [['赵恒', '越狱', '一越']]),
      mem(64, [['赵恒', '下狱', '再擒']]),
    ]);
    expect(violations).toHaveLength(0);
    const snap = snapshotAt(entries, 70);
    expect(snap.get('顾砚之')).toMatchObject({ custody: 'free' });
    expect(entries.find(e => e.fromChapter === 64)).toMatchObject({ transition: 'recapture' });
  });

  it('跨属性不变量：死亡在册后再入押/获释报违规候选（r10a 周豹形态）', () => {
    const { violations } = buildLedgerFromMemories([
      mem(170, [['周豹', '死亡', '刀锋抹过咽喉气绝']]),
      mem(180, [['周豹', '下狱', '周掌书暴毙前被押']]),
      mem(190, [['赵恒', '死亡', '坠马气绝']]),
      mem(200, [['赵恒', '获释', '出狱']]),
    ]);
    expect(violations.some(v => v.entityId === '周豹' && v.note.includes('死亡在册'))).toBe(true);
    expect(violations.some(v => v.entityId === '赵恒' && v.note.includes('死亡在册'))).toBe(true);
  });

  it('押地入账但无在押前史报候选（r10 崔元朗移押形态）', () => {
    const { violations } = buildLedgerFromMemories([mem(50, [['崔元朗', '押地:刑部天牢', '下天牢']])]);
    expect(violations.some(v => v.attribute === 'custodyPlace' && v.note.includes('custody 不在押'))).toBe(true);
  });

  it('在押↔逃亡往返第 3 次产出 structure.repeat 候选', () => {
    const { violations } = buildLedgerFromMemories([
      mem(10, [['赵恒', '下狱', '一进宫']]),
      mem(12, [['赵恒', '越狱', '一越']]),
      mem(14, [['赵恒', '下狱', '二进宫']]),
      mem(16, [['赵恒', '越狱', '二越']]),
      mem(18, [['赵恒', '下狱', '三进宫']]),
    ]);
    expect(violations.some(v => v.note.includes('往返已达 3 次'))).toBe(true);
  });

  it('头衔协议：去职→appoint 新衔合法（幂等双去职不算违规）', () => {
    const { violations, entries } = buildLedgerFromMemories([
      mem(60, [['薛怀德', '头衔:户部左侍郎', '掌印']]),
      mem(90, [['薛怀德', '去职', '罚俸']]),
      mem(95, [['薛怀德', '去职', '再提']]),
      mem(120, [['薛怀德', '头衔:户部左侍郎', '复起']]),
    ]);
    expect(violations).toHaveLength(0);
    const snap = snapshotAt(entries, 130);
    expect(snap.get('薛怀德')).toMatchObject({ office: '户部左侍郎' });
  });
});

describe('状态卡与渲染通道', () => {
  it('buildStateCardRows 分组视图：在押含押地/已死/去职/假死/现任头衔', () => {
    const rows = buildStateCardRows(
      [
        mem(10, [['顾宪诚', '下狱', '定谳']]),
        mem(20, [['齐泰', '死亡', '饮鸩']]),
        mem(30, [['薛怀德', '去职', '罚俕']]),
        mem(40, [['主角', '假死', '金蝉脱壳']]),
        mem(50, [['顾宪诚', '押地:相府书斋', '看管']]),
        mem(60, [['沈万思', '头衔:九品典吏', '入账']]),
      ],
      100,
    );
    const text = rows.join('\n');
    expect(text).toContain('顾宪诚（第10章起在押，现押于相府书斋）');
    expect(text).toContain('齐泰（第20章死亡）');
    expect(text).toContain('薛怀德（第30章去职）');
    expect(text).toContain('主角（第40章起假死在册');
    expect(text).toContain('沈万思＝九品典吏');
  });

  it('renderStatusRules：状态卡在场时替换正典块，两通道都带宣告场面规则', () => {
    const card = renderStatusRules(['已死（仅可回忆）：齐泰（第20章死亡）'], []);
    expect(card[0]).toContain('【实体状态卡】');
    expect(card.some(l => l.includes('宣告场面'))).toBe(true);

    const legacy = renderStatusRules(undefined, [{ name: '顾宪诚', status: '下狱', chapterIndex: 113 }]);
    expect(legacy[0]).toContain('【命运状态正典】');
    expect(legacy.some(l => l.includes('顾宪诚：下狱'))).toBe(true);
    expect(legacy.some(l => l.includes('宣告场面'))).toBe(true);

    expect(renderStatusRules(undefined, [])).toHaveLength(0);
  });
});

describe('MOLIU_STATE_CARD 开关', () => {
  const KEY = 'MOLIU_STATE_CARD';
  const original = process.env[KEY];

  beforeEach(() => {
    delete process.env[KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it('默认关闭：未设/非法值时不启用', () => {
    expect(isStateCardEnabled()).toBe(false);
    process.env[KEY] = '0';
    expect(isStateCardEnabled()).toBe(false);
    process.env[KEY] = 'abc';
    expect(isStateCardEnabled()).toBe(false);
  });

  it('=1 时启用（读侧接管第 2 阶段功能开关）', () => {
    process.env[KEY] = '1';
    expect(isStateCardEnabled()).toBe(true);
  });
});
