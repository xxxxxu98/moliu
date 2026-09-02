// storyflow-triage 命运台账死而复活候选扫描回归测试（node --test）
// 2026-09-02 agent 化重构：命运入账全权归写作侧 AI 提取合同（FactExtractor 契约
// 7-10），正文词表塔退役。本文件覆盖新台账扫描的候选语义；「祈使/条件句误报」
// 类样本的防护迁移至写作侧 sanitizeUnconfirmedDeathDeltas 测试。
// 运行：npm run test:storyflow-triage
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanLedgerDeathResurrection } from '../storyflow-triage.mjs';

const mem = (chapterIndex, changes) => ({ chapterIndex, characterStateChanges: changes });
const ch = (n, text) => ({ n, text });

test('台账死亡 + 后章正文提及 → 命中候选（r2 A 书顾成化形态）', () => {
  const memories = [
    mem(156, [{ characterName: '顾成化', state: '死亡', detail: '顾成化全族伏诛' }]),
  ];
  const chapters = [
    ch(156, '南门瓮城顾成化全族伏诛。'),
    ch(162, '殿阶下的顾成化跪伏在地。'),
    ch(194, '太后懿旨斥顾成化逼宫。'),
  ];
  const res = scanLedgerDeathResurrection(memories, chapters);
  assert.equal(res.length, 1);
  assert.equal(res[0].name, '顾成化');
  assert.equal(res[0].state, '死亡');
  assert.equal(res[0].chapter, 157);
  assert.deepEqual(res[0].activeChapters, [162, 194]);
});

test('台账死亡 + 后章无正文提及 → 不命中', () => {
  const memories = [mem(50, [{ characterName: '王庸', state: '死亡', detail: '王庸伏诛' }])];
  const chapters = [ch(50, '王庸伏诛。'), ch(51, '别人在朝堂奏对。')];
  assert.equal(scanLedgerDeathResurrection(memories, chapters).length, 0);
});

test('非终端态（下狱/去职/定罪）不出候选——复位裁决归书审 AI', () => {
  const memories = [
    mem(130, [{ characterName: '赵煜', state: '下狱', detail: '赵煜被关进了天牢' }]),
    mem(140, [{ characterName: '顾成化', state: '去职', detail: '当堂革职' }]),
  ];
  const chapters = [ch(158, '赵煜站在朝堂上。'), ch(160, '顾成化朗声出列。')];
  assert.equal(scanLedgerDeathResurrection(memories, chapters).length, 0);
});

test('同一角色多次终端命运取最晚章号', () => {
  const memories = [
    mem(10, [{ characterName: '反派', state: '死亡', detail: 'a' }]),
    mem(20, [{ characterName: '反派', state: '死亡', detail: 'b' }]),
  ];
  const chapters = [ch(25, '反派又出现了。')];
  const res = scanLedgerDeathResurrection(memories, chapters);
  assert.equal(res.length, 1);
  assert.equal(res[0].chapter, 21);
});

test('命运章之前的提及不算复活（chapterIndex 0 基：mem(149) → 第150章）', () => {
  const memories = [mem(149, [{ characterName: '先帝', state: '驾崩', detail: '驾崩' }])];
  const chapters = [ch(50, '先帝当年励精图治。'), ch(150, '先帝陵寝肃穆。')];
  assert.equal(scanLedgerDeathResurrection(memories, chapters).length, 0);
});

test('脏实体名（不在角色卡名单/过长/过短）不入候选', () => {
  const memories = [
    mem(5, [{ characterName: '太后伸手', state: '死亡', detail: 'x' }]),
    mem(6, [{ characterName: '某', state: '死亡', detail: 'y' }]),
    mem(7, [{ characterName: '正统角色', state: '死亡', detail: 'z' }]),
  ];
  const chapters = [ch(9, '太后伸手、某与正统角色都出现了。')];
  const roster = new Set(['正统角色']);
  const res = scanLedgerDeathResurrection(memories, chapters, roster);
  assert.equal(res.length, 1);
  assert.equal(res[0].name, '正统角色');
});

test('空台账/空正文 → 无候选不抛错', () => {
  assert.deepEqual(scanLedgerDeathResurrection([], [ch(1, 'x')]), []);
  assert.deepEqual(scanLedgerDeathResurrection([mem(1, [])], []), []);
});
