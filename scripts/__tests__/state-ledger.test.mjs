/**
 * 统一状态账本·第 1 阶段影子实现测试。
 *
 * 验收口径（docs/unified-state-ledger.md §7 第 1 阶段）：在 4 个回放用例的
 * 起始章上快照给出正确状态（顾宪诚在押、崔显在押、赵恒革职、周文彬死亡零入账
 * 报 ledger-gap），外加 r10 双开书实证形态（死人再入押、押地无在押前史、
 * 在押↔逃亡往返计数）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLedgerFromMemories,
  snapshotAt,
  buildShadowLedgerReport,
} from '../state-ledger.mjs';

/** 快捷造记忆行 */
const mem = (chapterIndex, changes, extra = {}) => ({
  chapterIndex,
  characterStateChanges: changes.map(([characterName, state, detail]) => ({ characterName, state, detail: detail ?? '' })),
  keyEvents: [],
  corePlot: '',
  ...extra,
});

test('r8-S1-05 顾宪诚形态：押地刷新关押地、他人解除不连带、快照保持 in押', () => {
  const memories = [
    mem(113, [['顾宪诚', '下狱', '三法司定谳下狱']]),
    // ch119 崔显「戴罪效力」是别人的 delta，不得解除顾宪诚（第 0 阶段前的正则曾连带）
    mem(119, [['崔显', '复职', '磕头领命戴罪效力']]),
    // ch134 看管被提取成押地：在押者刷新关押地而非解除
    mem(134, [['顾宪诚', '押地:相府书斋', '押回相府看管']]),
  ];
  const { entries, violations } = buildLedgerFromMemories(memories);
  // 押地在 held 之后 = 合法转移，无违规
  assert.equal(violations.length, 0, `押地刷新不应违规：${JSON.stringify(violations)}`);
  const snap = snapshotAt(entries, 142);
  assert.equal(snap.get('顾宪诚')?.custody, 'held');
  assert.equal(snap.get('顾宪诚')?.custodyPlace, '相府书斋');
  assert.equal(snap.get('崔显')?.office, 'restored');
});

test('r7-S1-03 周文彬形态：死亡完成体无 vital 条目 → ledger-gap 候选', () => {
  const memories = [
    mem(187, [['周文彬', '下狱', '押入死牢']]),
    { chapterIndex: 188, characterStateChanges: [], corePlot: '刑场号炮三响，刽子手挥刀，周文彬人头落地。', keyEvents: ['周文彬枭首示众'] },
  ];
  const { gaps, entries } = buildLedgerFromMemories(memories);
  assert.equal(entries.filter(e => e.attribute === 'vital').length, 0, '正文有死亡但提取零入账（用例前提）');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].chapter, 188);
  assert.ok(gaps[0].anchor.length > 0);
});

test('r12 ch158 受害样本：物理死亡描写「洞穿喉管…归于死寂」也要召回 gap 候选（旧词族三道防线全漏形态）', () => {
  const memories = [
    { chapterIndex: 158, characterStateChanges: [], corePlot: '利箭洞穿了周德安高高仰起的喉管，其瘫倒在地彻底归于死寂。', keyEvents: [] },
  ];
  const { gaps } = buildLedgerFromMemories(memories);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].chapter, 158);
});

test('合法解除链：下狱→平反后快照 custody=free（顾砚之 ch1→ch56 形态）', () => {
  const memories = [
    mem(1, [['顾砚之', '下狱', '死牢画押']]),
    mem(56, [['顾砚之', '平反', '旨意洗脱冤狱即刻开释']]),
  ];
  const { entries, violations } = buildLedgerFromMemories(memories);
  assert.equal(violations.length, 0);
  const snap = snapshotAt(entries, 60);
  assert.equal(snap.get('顾砚之')?.custody, 'free');
});

test('违规：死亡在册后再入押（死人不能被逮捕）', () => {
  const memories = [
    mem(170, [['周豹', '死亡', '刀锋抹过咽喉气绝']]),
    mem(180, [['周豹', '下狱', '周掌书突发心疾暴毙前被押']]),
  ];
  const { violations } = buildLedgerFromMemories(memories);
  assert.ok(
    violations.some(v => v.entityId === '周豹' && v.note.includes('死亡在册')),
    `应报死亡在册后再入押：${JSON.stringify(violations)}`
  );
});

test('违规：押地入账但无在押前史（r10 崔元朗移押形态）', () => {
  const memories = [mem(50, [['崔元朗', '押地:刑部天牢', '褫夺功名下天牢']])];
  const { violations } = buildLedgerFromMemories(memories);
  assert.ok(
    violations.some(v => v.attribute === 'custodyPlace' && v.note.includes('custody 不在押')),
    `应报押地无在押前史：${JSON.stringify(violations)}`
  );
});

test('违规：死亡在册后获释 delta（矛盾信号候选）', () => {
  const memories = [
    mem(10, [['赵恒', '死亡', '坠马气绝']]),
    mem(20, [['赵恒', '获释', '出狱']]),
  ];
  const { violations } = buildLedgerFromMemories(memories);
  assert.ok(violations.some(v => v.entityId === '赵恒' && v.note.includes('死亡在册')));
});

test('循环计数：在押↔逃亡往返第 3 次产出 structure.repeat 信号', () => {
  const memories = [
    mem(10, [['赵恒', '下狱', '一进宫']]),
    mem(12, [['赵恒', '越狱', '一越']]),
    mem(14, [['赵恒', '下狱', '二进宫']]),
    mem(16, [['赵恒', '越狱', '二越']]),
    mem(18, [['赵恒', '下狱', '三进宫']]),
  ];
  const { violations, entries } = buildLedgerFromMemories(memories);
  assert.ok(violations.some(v => v.note.includes('往返已达 3 次')));
  // 迁移保真：越狱后的再「下狱」记 recapture 而非 arrest，fugitive→held 合法
  assert.ok(entries.some(e => e.fromChapter === 14 && e.transition === 'recapture'));
  assert.ok(!violations.some(v => v.note.includes('转移枚举不合法')));
});

test('假死族：假死→揭晓合法、假死后 arrest 报 vital 矛盾', () => {
  const legal = buildLedgerFromMemories([
    mem(10, [['主角', '假死', '金蝉脱壳']]),
    mem(30, [['主角', '揭晓', '当众现身']]),
  ]);
  assert.equal(legal.violations.length, 0);
  const illegal = buildLedgerFromMemories([
    mem(10, [['主角', '假死', '金蝉脱壳']]),
    mem(30, [['主角', '死亡', '坠崖']]),
    mem(40, [['主角', '下狱', '被捕']]),
  ]);
  assert.ok(illegal.violations.some(v => v.note.includes('死亡在册')));
});

test('头衔协议：去职→appoint 新衔合法；office 与 custody 独立时间线', () => {
  const memories = [
    mem(60, [['薛怀德', '头衔:户部左侍郎', '掌户部正堂印']]),
    mem(98, [['薛怀德', '去职', '罚俸闭门思过']]),
    mem(120, [['薛怀德', '头衔:户部左侍郎', '复起']]),
  ];
  const { violations, entries } = buildLedgerFromMemories(memories);
  // none→Y 走 appoint 是合法路径（是否有任免叙事由证据句交判官，状态机不判）
  assert.equal(violations.length, 0, `合法复起不应违规：${JSON.stringify(violations)}`);
  const snap = snapshotAt(entries, 130);
  assert.equal(snap.get('薛怀德')?.office, '户部左侍郎');
});

test('影子差异报告：账本有终态但「最晚值」锚读不到（legacyDiff 命中）', () => {
  const memories = [
    mem(113, [['顾宪诚', '下狱', '定谳']]),
    mem(134, [['顾宪诚', '押地:相府书斋', '看管']]),
    mem(120, [['路人甲', '头衔:县丞', '入账']]),
  ];
  const report = buildShadowLedgerReport(memories, 140);
  assert.ok(report.legacyDiff.some(d => d.entityId === '顾宪诚' && d.ledger.includes('custody=held')));
  assert.equal(report.snapshotRows, 2);
  assert.ok(report.summary.length === 4);
});

test('空输入与无状态章不产生噪音', () => {
  const empty = buildShadowLedgerReport([], 10);
  assert.equal(empty.entries, 0);
  assert.equal(empty.violations.length, 0);
  const noChanges = buildLedgerFromMemories([mem(5, [])]);
  assert.equal(noChanges.entries.length, 0);
});
