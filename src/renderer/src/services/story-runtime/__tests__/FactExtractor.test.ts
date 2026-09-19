import { describe, expect, it, vi } from 'vitest';

import { AIFactExtractor, ensureTopLevelEvidence } from '../FactExtractor';
import type { ExtractedFacts, StructuredAI } from '@/types/story-runtime';

describe('ensureTopLevelEvidence', () => {
  it('顶层为空时从 events/deltas 回填', () => {
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'plot',
          summary: '穿越',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['主角睁开眼'],
        },
      ],
      deltas: [
        {
          operation: 'set',
          path: 'char.location',
          value: '死牢',
          evidence: '把他打入死牢',
        },
      ],
      evidence: [],
    };

    const filled = ensureTopLevelEvidence(facts);
    expect(filled.evidence).toEqual(['主角睁开眼', '把他打入死牢']);
  });

  it('顶层已有证据时不覆盖', () => {
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'e1',
          chapter: 1,
          sceneId: 's1',
          type: 'plot',
          summary: '穿越',
          participants: [],
          causes: [],
          effects: [],
          evidence: ['新证据'],
        },
      ],
      deltas: [],
      evidence: ['已有汇总'],
    };
    expect(ensureTopLevelEvidence(facts).evidence).toEqual(['已有汇总']);
  });
});

describe('命运提取合同护栏', () => {
  // 2026-09-03 反重力 100 章实证：主角 ch9 下狱出账、ch13 正文「迈出死牢大门」
  // 获释不入账，状态摘要永远停留「下狱」，ch33/94 连续 fact_conflict 拖死全跑。
  // 契约 11 逆转族（获释/复职/平反）是对该单向阀的修复，本护栏防其被误删。
  it('系统合同包含逆转宣告必检必出账条款与三族 value', async () => {
    const generate = vi.fn().mockResolvedValue({ events: [], deltas: [], evidence: [] });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1',
      chapterNumber: 13,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });

    const system = String(generate.mock.calls[0]?.[0]?.system ?? '');
    expect(system).toContain('逆转宣告必检必出账');
    expect(system).toContain('获释族');
    expect(system).toContain('value「获释」');
    expect(system).toContain('复职族');
    expect(system).toContain('value「复职」');
    expect(system).toContain('平反族');
    expect(system).toContain('value「平反」');
    // 死亡保持不可逆：真复活只能走 fate-adjudicate，不允许 delta 洗白
    expect(system).toContain('死亡无逆转');
    // 逆向命运族仍在（对称性：只加逆转不删逆向）
    expect(system).toContain('命运宣告必检必出账');
    expect(system).toContain('下狱族');
    // 2026-09-03 r4 实证：伏法/处斩完成体曾不在死亡族清单，ch59 处决不入账
    // → ch99-100 死人复活无人拦截。护栏防线索词再被删。
    expect(system).toContain('伏法');
    expect(system).toContain('被正法');
    expect(system).toContain('越狱族');
    expect(system).toContain('value「越狱」');
    expect(system).toContain('判决不是行刑');
  });

  // 2026-09-06 g38f-200chr2 实证：ch188「太上皇早已驾崩」追认句被当新宣告
  // 二次出账，终态章号被顶到最晚，遮蔽 ch172-188 复活检测窗口；同轮主角被
  // 「沈怀安快步」类动宾粘连名与 mid-book「首次出场」垃圾条目污染状态摘要。
  it('系统合同包含追认句不重复入账与角色名卫生条款', async () => {
    const generate = vi.fn().mockResolvedValue({ events: [], deltas: [], evidence: [] });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1',
      chapterNumber: 188,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });

    const system = String(generate.mock.calls[0]?.[0]?.system ?? '');
    // 契约 12：追认/回述句不是新宣告
    expect(system).toContain('追认/回述句不是新宣告');
    expect(system).toContain('禁止再次出 status delta');
    // 契约 13：角色名卫生
    expect(system).toContain('角色名卫生');
    expect(system).toContain('不是角色');
  });

  // 2026-09-17 g38f r6 实证：ch102 赵宣与孙茂才同章各自画押收监只登了赵宣，
  // 孙茂才 ch111 自由出场；ch80 江万贯「枷锁套死塞入囚车直奔大牢羁押」完成体
  // 整章零 delta，ch88 抄家被重复执行；全书同一笔盐税五套口径无数字账。
  it('系统合同包含同章多角色逐个入账与关键数字 numeric-fact 条款', async () => {
    const generate = vi.fn().mockResolvedValue({ events: [], deltas: [], evidence: [] });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1',
      chapterNumber: 80,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });

    const system = String(generate.mock.calls[0]?.[0]?.system ?? '');
    // 契约 8 扩展：同章多角色独立宣告逐个入账
    expect(system).toContain('同章多个角色各有独立的命运宣告句时同样逐一扫描');
    expect(system).toContain('禁止只登主犯或合并登账');
    // 契约 15：关键数字既成宣告出 numeric-fact 事件（写作侧数字锚的数据源）
    expect(system).toContain('关键数字既成宣告必出 event');
    expect(system).toContain('numeric-fact');
    expect(system).toContain('对象＋数值＋单位＋性质');
  });

  // 2026-09-19 g38f r7 实证：ch189 事件摘要明写「周文彬被斩首处决且首级悬于正阳门
  // 阙楼」却零 delta——死亡账未登，两章后「死士救出周文彬」全程无人拦截（死刑无声
  // 回滚）；配角温廷翰全书 ≥6 职横跳零入账，契约 14 对配角完全空转。
  it('系统合同含事件-账目一致性自检与配角头衔全覆盖条款（g38f r7 实证）', async () => {
    const generate = vi.fn().mockResolvedValue({ events: [], deltas: [], evidence: [] });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1',
      chapterNumber: 189,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });

    const system = String(generate.mock.calls[0]?.[0]?.system ?? '');
    // 契约 8b：事件-账目一致性自检
    expect(system).toContain('事件-账目一致性自检');
    expect(system).toContain('事件有而账无是最优先级错误');
    expect(system).toContain('斩首处决且首级悬于正阳门阙楼');
    // 契约 7 死亡族补 r7 实证完成体
    expect(system).toContain('斩首处决');
    expect(system).toContain('首级悬于X');
    // 契约 14：配角头衔全覆盖
    expect(system).toContain('覆盖范围是本章出场的每一个角色，不只主角');
    expect(system).toContain('翰林修撰/通政使');
  });
});

