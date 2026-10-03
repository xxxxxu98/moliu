import { describe, expect, it, vi } from 'vitest';

import { AIFactExtractor, ensureTopLevelEvidence, detectUnledgeredFateEvents, implyCustodyClearOnReversal } from '../FactExtractor';
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
    // 2026-09-23 r8-S1-05：消费侧删除解除词正则共现后，保释中间态与主语归属只靠合同
    expect(system).toContain('保释族');
    expect(system).toContain('value「保释」');
    expect(system).toContain('逆转 delta 只登给逆转句的主语本人');
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

  // 2026-09-20 g38f r8 实证：ch152 同章实写「气绝倒地」与「施针唤醒」却只登
  // 「死亡」——死亡禁令/陈旧度/判官三道防线锁死主角 48 章，写手被迫发明衣冠道具。
  it('系统合同含假死族与假死揭晓族，死亡无逆转豁免假死（g38f r8 实证）', async () => {
    const generate = vi.fn().mockResolvedValue({ events: [], deltas: [], evidence: [] });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1',
      chapterNumber: 152,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });

    const system = String(generate.mock.calls[0]?.[0]?.system ?? '');
    expect(system).toContain('假死族');
    expect(system).toContain('登 value「假死」而非「死亡」');
    expect(system).toContain('假死揭晓族');
    expect(system).toContain('value「揭晓」');
    expect(system).toContain('「假死」不适用死亡无逆转条款');
    expect(system).toContain('施针放血唤醒');
  });
});


describe('命运漏登复检闸（2026-09-23 g38f 500ch S1×5 根因修复）', () => {
  // 受害样本一：ch30 events 明写「绞断颈骨悬梁气绝毙命」而 deltas=[]——
  // 契约 8b 同响应自检失效，崔有道死亡未入账，ch41 起死人反复活体出场。
  const cuiEntity = { id: 'char-cui', name: '崔有道', aliases: [] };
  const ch30Facts = {
    events: [
      {
        id: 'e1',
        chapter: 30,
        sceneId: 's1',
        type: 'plot',
        summary: '崔有道被牢房内预设的机关吊索生生绞断颈骨悬梁灭口毙命。',
        participants: ['char-cui'],
        causes: [],
        effects: [],
        evidence: ['崔有道被牢房内预设的机关吊索生生绞断颈骨悬梁灭口毙命。'],
      },
    ],
    deltas: [],
    evidence: ['崔有道被牢房内预设的机关吊索生生绞断颈骨悬梁灭口毙命。'],
  };

  it('events 命中死亡完成体而账面为空时触发复检并合并补登（ch30 形态）', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(ch30Facts)
      .mockResolvedValueOnce({
        deltas: [
          { operation: 'set', path: 'characters.char-cui.attributes.status', value: '死亡', evidence: '崔有道被机关吊索绞断颈骨悬梁灭口毙命。' },
        ],
      });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    const facts = await extractor.extract({
      projectId: 'p1',
      chapterNumber: 30,
      sceneDrafts: [],
      state: { entities: { 'char-cui': cuiEntity }, events: [] } as never,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[0]?.purpose).toBe('fact-extraction-recheck');
    const death = facts.deltas.find(d => d.path === 'characters.char-cui.attributes.status');
    expect(death?.value).toBe('死亡');
  });

  // 受害样本二：ch66「冯保义于诏狱被赐死」同响应零 delta。
  it('赐死完成体同样触发复检（ch66 形态）', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        events: [
          {
            id: 'e1', chapter: 66, sceneId: 's1', type: 'plot',
            summary: '奉天殿大案告一段落，冯保义于诏狱被赐死。',
            participants: ['冯保义'], causes: [], effects: [],
            evidence: ['冯保义在诏狱饮鸩，尸首弃于荒野。'],
          },
        ],
        deltas: [],
        evidence: ['冯保义在诏狱饮鸩。'],
      })
      .mockResolvedValueOnce({
        deltas: [
          { operation: 'set', path: 'characters.char-feng.attributes.status', value: '死亡', evidence: '冯保义在诏狱饮鸩，尸首弃于荒野。' },
        ],
      });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    const facts = await extractor.extract({
      projectId: 'p1',
      chapterNumber: 66,
      sceneDrafts: [],
      state: { entities: { 'char-feng': { id: 'char-feng', name: '冯保义', aliases: [] } }, events: [] } as never,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(facts.deltas.some(d => d.path === 'characters.char-feng.attributes.status' && d.value === '死亡')).toBe(true);
  });

  it('无命运词族时不触发复检（省调用）', async () => {
    const generate = vi.fn().mockResolvedValue({
      events: [
        { id: 'e1', chapter: 14, sceneId: 's1', type: 'numeric-fact', summary: '苏晚晴核算丝市五倍暴利。', participants: ['char-a'], causes: [], effects: [], evidence: ['x'] },
      ],
      deltas: [],
      evidence: ['x'],
    });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1', chapterNumber: 14, sceneDrafts: [],
      state: { entities: { 'char-a': { id: 'char-a', name: '苏晚晴', aliases: [] } }, events: [] } as never,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('命中事件但角色已在账时不触发复检', async () => {
    const generate = vi.fn().mockResolvedValue({
      events: [
        { id: 'e1', chapter: 31, sceneId: 's1', type: 'plot', summary: '崔有道毙命后狱中清点。', participants: ['char-cui'], causes: [], effects: [], evidence: ['x'] },
      ],
      deltas: [
        { operation: 'set', path: 'characters.char-cui.attributes.status', value: '死亡', evidence: '崔有道毙命。' },
      ],
      evidence: ['x'],
    });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1', chapterNumber: 31, sceneDrafts: [],
      state: { entities: { 'char-cui': cuiEntity }, events: [] } as never,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('复检调用失败时静默降级返回首轮结果（防线不成为新故障点）', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(ch30Facts)
      .mockRejectedValueOnce(new Error('网关抖动'));
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    const facts = await extractor.extract({
      projectId: 'p1', chapterNumber: 30, sceneDrafts: [],
      state: { entities: { 'char-cui': cuiEntity }, events: [] } as never,
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(facts.events).toHaveLength(1);
    expect(facts.deltas).toEqual([]);
  });

  it('复检返回与既有账同键的 delta 时不重复入账', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        events: [
          { id: 'e1', chapter: 32, sceneId: 's1', type: 'plot', summary: '崔有道毙命案卷封存。', participants: ['char-cui'], causes: [], effects: [], evidence: ['x'] },
        ],
        deltas: [
          { operation: 'set', path: 'characters.char-cui.attributes.status', value: '死亡', evidence: '崔有道毙命。' },
        ],
        evidence: ['x'],
      })
      .mockResolvedValueOnce({
        deltas: [
          { operation: 'set', path: 'characters.char-cui.attributes.status', value: '死亡', evidence: '崔有道毙命（复检重复）。' },
        ],
      });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    const facts = await extractor.extract({
      projectId: 'p1', chapterNumber: 32, sceneDrafts: [],
      state: { entities: { 'char-cui': cuiEntity }, events: [] } as never,
    });
    const deaths = facts.deltas.filter(d => d.path === 'characters.char-cui.attributes.status' && d.value === '死亡');
    expect(deaths).toHaveLength(1);
  });
});

describe('detectUnledgeredFateEvents 物理死亡描写触发（r12 ch158 受害样本）', () => {
  it('「洞穿喉管…归于死寂」漏登死亡时触发复检候选（旧词族三道防线全漏形态）', () => {
    const facts = {
      events: [
        {
          id: 'e1',
          chapter: 158,
          sceneId: 's1',
          type: 'plot',
          summary: '利箭洞穿了周德安高高仰起的喉管，其瘫倒在地彻底归于死寂',
          participants: ['char-zhou'],
          causes: [],
          effects: [],
          evidence: ['喉管'],
        },
      ],
      deltas: [],
    } as unknown as ExtractedFacts;
    const entities = { 'char-zhou': { id: 'char-zhou', name: '周德安' } };
    const { suspectEvents, suspectEntityIds } = detectUnledgeredFateEvents(facts, entities);
    expect(suspectEvents).toHaveLength(1);
    expect(suspectEntityIds.has('char-zhou')).toBe(true);
  });

  it('无命运语汇的普通事件不触发（省一次复检调用）', () => {
    const facts = {
      events: [
        {
          id: 'e1',
          chapter: 2,
          sceneId: 's1',
          type: 'plot',
          summary: '沈淮在灯下核对新版四柱账册',
          participants: ['char-shen'],
          causes: [],
          effects: [],
          evidence: ['账册'],
        },
      ],
      deltas: [],
    } as unknown as ExtractedFacts;
    const entities = { 'char-shen': { id: 'char-shen', name: '沈淮' } };
    const { suspectEvents } = detectUnledgeredFateEvents(facts, entities);
    expect(suspectEvents).toHaveLength(0);
  });
});

describe('逆转族 custody 清除（2026-09-30 r16 ch114 成洞实证）', () => {
  // 徐茂德 ch49 押地「天牢」、ch109 特旨无罪起复：复职 delta 正常入账但
  // custody 属性无清除路径，stateDigest「custody:天牢」永久残留 → 判官按
  // 在押连拒正确章节（fact_conflict + 字数超限死亡螺旋成洞，199/200）。
  const reversalDelta = (value: string, entityId = 'char-xu') => ({
    operation: 'set' as const,
    path: `characters.${entityId}.attributes.status`,
    value,
    evidence: '监国太子赵显驳回定论，以水利吃紧为由特旨将他无罪起复',
  });

  it('复职 delta 自动伴随 custody remove delta', () => {
    const facts = { events: [], deltas: [reversalDelta('复职')], evidence: [] } as unknown as ExtractedFacts;
    const out = implyCustodyClearOnReversal(facts);
    const companion = out.deltas.find(d => d.path === 'characters.char-xu.attributes.custody');
    expect(companion).toBeDefined();
    expect(companion?.operation).toBe('remove');
    expect(companion?.evidence).toContain('无罪起复');
  });

  it('获释/平反/保释/起复/越狱/揭晓同受保护；下狱/死亡不触发', () => {
    for (const value of ['获释', '平反', '保释', '起复', '越狱', '揭晓']) {
      const out = implyCustodyClearOnReversal({ events: [], deltas: [reversalDelta(value)], evidence: [] } as unknown as ExtractedFacts);
      expect(out.deltas.some(d => d.path === 'characters.char-xu.attributes.custody')).toBe(true);
    }
    for (const value of ['下狱', '死亡', '去职', '定罪']) {
      const out = implyCustodyClearOnReversal({ events: [], deltas: [reversalDelta(value)], evidence: [] } as unknown as ExtractedFacts);
      expect(out.deltas.some(d => d.path === 'characters.char-xu.attributes.custody')).toBe(false);
    }
  });

  it('本章已显式出 custody delta 时不重复补', () => {
    const facts = {
      events: [],
      deltas: [
        reversalDelta('获释'),
        { operation: 'set', path: 'characters.char-xu.attributes.custody', value: '已出狱移交宅邸', evidence: '出狱' },
      ],
      evidence: [],
    } as unknown as ExtractedFacts;
    const out = implyCustodyClearOnReversal(facts);
    const custodyDeltas = out.deltas.filter(d => d.path === 'characters.char-xu.attributes.custody');
    expect(custodyDeltas).toHaveLength(1);
    expect(custodyDeltas[0]?.value).toBe('已出狱移交宅邸');
  });

  it('无逆转 delta 时原样返回（零副作用）', () => {
    const facts = {
      events: [],
      deltas: [{ operation: 'set', path: 'characters.char-xu.attributes.status', value: '下狱', evidence: '押入天牢' }],
      evidence: [],
    } as unknown as ExtractedFacts;
    expect(implyCustodyClearOnReversal(facts)).toBe(facts);
  });

  it('extract() 出口接线：复职提取结果带伴随 custody remove', async () => {
    const generate = vi.fn().mockResolvedValue({
      events: [],
      deltas: [reversalDelta('复职')],
      evidence: [],
    });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    const out = await extractor.extract({
      projectId: 'p1',
      chapterNumber: 109,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });
    expect(out.deltas.some(d => d.path === 'characters.char-xu.attributes.custody' && d.operation === 'remove')).toBe(true);
  });
});

describe('契约 16：关键实物终态必出账（2026-09-30 r16 S1-02 定江号复活实证）', () => {
  it('系统合同包含实物终态条款与 items 路径、完成体门槛', async () => {
    const generate = vi.fn().mockResolvedValue({ events: [], deltas: [], evidence: [] });
    const extractor = new AIFactExtractor({ generate } as unknown as StructuredAI);
    await extractor.extract({
      projectId: 'p1',
      chapterNumber: 18,
      sceneDrafts: [],
      state: { entities: {}, events: [] } as never,
    });
    const system = String(generate.mock.calls[0]?.[0]?.system ?? '');
    expect(system).toContain('关键实物终态必出账');
    expect(system).toContain('items.<实体id>.attributes.status');
    expect(system).toContain('沉没');
    expect(system).toContain('定江号');
    // 完成体门槛与判官数据源说明在位
    expect(system).toContain('是命令不是既成');
    expect(system).toContain('判官 stateDigest');
  });
});
