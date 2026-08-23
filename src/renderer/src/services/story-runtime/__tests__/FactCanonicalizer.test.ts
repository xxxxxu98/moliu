import { describe, expect, it } from 'vitest';

import type { ExtractedFacts, SceneDraft } from '@/types/story-runtime';

import { canonicalizeExtractedFacts } from '../FactCanonicalizer';
import { ContinuityValidator } from '../ContinuityValidator';
import { makeContracts, makeState } from './testFixtures';

function makeDraft(text: string): SceneDraft {
  return {
    sceneId: 'scene-1',
    beatId: 'chapter-1:CBN',
    paragraphs: [text],
    candidateEvents: [],
  };
}

describe('FactCanonicalizer', () => {
  it('将人名解析为已有实体 ID', () => {
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'evt-1',
          chapter: 1,
          sceneId: 'scene-1',
          type: 'arrival',
          summary: '林夜到城门',
          participants: ['林夜'],
          causes: [],
          effects: [],
          evidence: ['林夜来到城门'],
        },
      ],
      deltas: [],
      evidence: ['林夜来到城门'],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('林夜来到城门，守卫盘查。')],
    });

    expect(result.facts.events[0].participants).toEqual(['hero']);
    expect(result.introductionDeltas).toEqual([]);
  });

  it('姓氏+称谓消歧归并到同姓唯一实体并持久化别名（宋教授→宋怀远）', () => {
    const state = makeState();
    state.entities['char-song'] = {
      id: 'char-song',
      kind: 'character',
      name: '宋怀远',
      aliases: [],
      attributes: {},
      knownBy: [],
      sourceTrace: [],
    };
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'evt-1',
          chapter: 5,
          sceneId: 'scene-1',
          type: 'dialogue',
          summary: '宋教授讲解尸骨',
          participants: ['宋教授'],
          causes: [],
          effects: [],
          evidence: ['宋教授讲解尸骨'],
        },
      ],
      deltas: [],
      evidence: ['宋教授讲解尸骨'],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state,
      drafts: [makeDraft('宋教授站在讲台前讲解尸骨的钝器伤。')],
      chapterNumber: 5,
    });

    // 不新建 char:intro 卡，归并到既有宋怀远
    expect(result.facts.events[0].participants).toEqual(['char-song']);
    expect(result.introductionDeltas).toEqual([]);
    // 别名以 delta 持久化，下一章走别名表直接命中
    const aliasDelta = result.facts.deltas.find(
      delta =>
        delta.path === 'entities.char-song' &&
        (delta.value as { aliases?: string[] }).aliases?.includes('宋教授')
    );
    expect(aliasDelta).toBeDefined();
  });

  it('新角色实体的 introducedInChapter 记录实际章号', () => {
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'evt-1',
          chapter: 7,
          sceneId: 'scene-1',
          type: 'arrival',
          summary: '王铁柱登场',
          participants: ['王铁柱'],
          causes: [],
          effects: [],
          evidence: ['王铁柱推门进来'],
        },
      ],
      deltas: [],
      evidence: ['王铁柱推门进来'],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('王铁柱推门进来。')],
      chapterNumber: 7,
    });

    const introDelta = result.introductionDeltas[0];
    const entity = introDelta.value as { attributes?: { introducedInChapter?: unknown } };
    expect(entity.attributes?.introducedInChapter).toBe(7);
  });

  it('正文新角色可引入，自然语言因果边丢弃而非当成缺前件', async () => {
    const prose =
      '陈渡看见周远身上标注，张宏盛在旁冷笑。周远被执行死刑的传闻让全场一静。';
    const facts: ExtractedFacts = {
      events: [
        {
          id: 'evt-1',
          chapter: 1,
          sceneId: 'scene-1',
          type: 'reveal',
          summary: '陈渡看见标注',
          participants: ['陈渡', '周远', '张宏盛'],
          causes: ['周远被执行死刑'],
          effects: [],
          evidence: ['陈渡看见周远身上标注'],
        },
      ],
      deltas: [],
      evidence: ['陈渡看见周远身上标注'],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft(prose)],
    });

    expect(result.facts.events[0].participants).toHaveLength(3);
    expect(result.facts.events[0].participants.every(id => id.startsWith('char:intro:'))).toBe(
      true
    );
    expect(result.facts.events[0].causes).toEqual([]);
    expect(result.droppedCauses).toEqual([
      { eventId: 'evt-1', cause: '周远被执行死刑' },
    ]);
    expect(result.introductionDeltas).toHaveLength(3);

    const contracts = makeContracts();
    contracts.chapter.chapterNumber = 1;
    contracts.chapter.mustCover = ['陈渡看见周远身上“冤罪-10000点”标注'];
    const report = await new ContinuityValidator().validate({
      contracts,
      state: result.stateForValidation,
      drafts: [makeDraft(prose)],
      facts: result.facts,
    });

    expect(report.issues.filter(issue => issue.domain === 'entity')).toEqual([]);
    expect(report.issues.filter(issue => issue.domain === 'causality')).toEqual([]);
  });

  it('inventory delta 的字符串 value 被归一/丢弃（Bug 9：证据类字符串不污染契约）', () => {
    const facts: ExtractedFacts = {
      events: [],
      deltas: [
        {
          operation: 'set',
          path: 'inventory.hero.证据',
          value: '一封染血的供词',
          evidence: '主角搜到证据',
        },
        {
          operation: 'set',
          path: 'inventory.hero.银两',
          value: '3',
          evidence: '清点银两',
        },
        {
          operation: 'set',
          path: 'inventory.hero.兵刃',
          value: 1,
          evidence: '检视兵刃',
        },
      ],
      evidence: [],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('主角搜到一封染血的供词。')],
    });

    const inventoryDeltas = result.facts.deltas.filter(delta =>
      delta.path.startsWith('inventory.')
    );
    // 字符串"证据"被丢弃；数字字符串"3"转 number；数字原样保留
    expect(inventoryDeltas).toHaveLength(2);
    expect(inventoryDeltas.some(delta => delta.path.includes('证据'))).toBe(false);
    const silver = inventoryDeltas.find(delta => delta.path.includes('银两'));
    expect(silver?.value).toBe(3);
  });

  it('inventory 严格数字校验：空串/十六进制/科学计数被丢弃（security_review 低危项）', () => {
    const facts: ExtractedFacts = {
      events: [],
      deltas: [
        {
          operation: 'set',
          path: 'inventory.hero.空串',
          value: '',
          evidence: '空串',
        },
        {
          operation: 'set',
          path: 'inventory.hero.十六进制',
          value: '0x10',
          evidence: '十六进制',
        },
        {
          operation: 'set',
          path: 'inventory.hero.科学计数',
          value: '1e3',
          evidence: '科学计数',
        },
        {
          operation: 'set',
          path: 'inventory.hero.小数',
          value: '3.5',
          evidence: '小数',
        },
        {
          operation: 'set',
          path: 'inventory.hero.布尔',
          value: true,
          evidence: '布尔',
        },
        {
          operation: 'set',
          path: 'inventory.hero.对象',
          value: { 描述: '一把剑' },
          evidence: '对象',
        },
      ],
      evidence: [],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('主角清点物品。')],
    });

    const inventoryDeltas = result.facts.deltas.filter(delta =>
      delta.path.startsWith('inventory.')
    );
    expect(inventoryDeltas).toHaveLength(1);
    expect(inventoryDeltas[0].path).toContain('小数');
    expect(inventoryDeltas[0].value).toBe(3.5);
  });

  it('inventory.<owner>.<item> 三段路径 value 为对象时提取数字字段（救回 {quantity,...}）', () => {
    const facts: ExtractedFacts = {
      events: [],
      deltas: [
        {
          operation: 'set',
          path: 'inventory.hero.晶核',
          // 报错日志里的真实形态：unit/note 是字符串，模型误把物品写成描述对象
          value: { unit: '颗', note: '灵力结晶', quantity: 7 },
          evidence: '主角获得晶核',
        },
        {
          operation: 'set',
          path: 'inventory.hero.银两',
          value: { count: '12', extra: '忽略我' },
          evidence: '清点银两',
        },
      ],
      evidence: [],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('主角获得晶核。')],
    });

    const inventoryDeltas = result.facts.deltas.filter(delta =>
      delta.path.startsWith('inventory.')
    );
    // 两个 item 的数字字段都被提取出来
    expect(inventoryDeltas).toHaveLength(2);
    const crystal = inventoryDeltas.find(delta => delta.path.endsWith('.晶核'));
    expect(crystal?.value).toBe(7);
    const silver = inventoryDeltas.find(delta => delta.path.endsWith('.银两'));
    expect(silver?.value).toBe(12);
  });

  it('inventory.<owner> 两段路径 set 整个物品表对象时展开为逐 item delta', () => {
    const facts: ExtractedFacts = {
      events: [],
      deltas: [
        {
          operation: 'set',
          path: 'inventory.hero',
          // 模型把整个背包当对象 set：晶核纯描述（丢弃）、银两带 quantity（提取）、丹药纯数字（保留）
          value: {
            晶核: { unit: '颗', note: '灵力结晶' },
            银两: { quantity: 5, unit: '两' },
            丹药: 3,
            空串: '',
          },
          evidence: '主角清点背包',
        },
      ],
      evidence: [],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('主角清点背包。')],
    });

    const inventoryDeltas = result.facts.deltas.filter(delta =>
      delta.path.startsWith('inventory.')
    );
    // 晶核/空串被丢弃，银两/丹药保留
    expect(inventoryDeltas).toHaveLength(2);
    const silver = inventoryDeltas.find(delta => delta.path.endsWith('.银两'));
    expect(silver?.value).toBe(5);
    const pill = inventoryDeltas.find(delta => delta.path.endsWith('.丹药'));
    expect(pill?.value).toBe(3);
    expect(inventoryDeltas.some(delta => delta.path.endsWith('.晶核'))).toBe(false);
    // 两段展开后路径都是规范的三段形式
    expect(inventoryDeltas.every(delta => delta.path.split('.').length === 3)).toBe(true);
  });

  it('inventory.<owner> 两段路径 value 非对象时安全丢弃（不崩）', () => {
    const facts: ExtractedFacts = {
      events: [],
      deltas: [
        { operation: 'set', path: 'inventory.hero', value: '一段描述', evidence: 'x' },
        { operation: 'set', path: 'inventory.hero', value: 42, evidence: 'y' },
        { operation: 'set', path: 'inventory.hero', value: null, evidence: 'z' },
      ],
      evidence: [],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state: makeState(),
      drafts: [makeDraft('主角。')],
    });

    const inventoryDeltas = result.facts.deltas.filter(delta =>
      delta.path.startsWith('inventory.')
    );
    expect(inventoryDeltas).toEqual([]);
  });

  it('通用主角称呼（hero）归一化到主角实体，不产生未知实体', () => {
    // 真实项目：主角 id 是 char-xxx 而非 hero（实体表无 hero 这个 id）
    const state = makeState();
    delete state.entities.hero;
    state.entities['char-protagonist'] = {
      id: 'char-protagonist',
      kind: 'character',
      name: '林夜',
      aliases: [],
      attributes: { role: 'protagonist' },
      knownBy: ['char-protagonist'],
      sourceTrace: [],
    };

    const facts: ExtractedFacts = {
      events: [
        {
          id: 'evt-1',
          chapter: 1,
          sceneId: 'scene-1',
          type: 'arrival',
          summary: 'hero 到达城门',
          participants: ['hero'],
          causes: [],
          effects: [],
          evidence: ['主角来到城门'],
        },
      ],
      deltas: [],
      evidence: ['主角来到城门'],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state,
      drafts: [makeDraft('主角来到城门，守卫盘查。')],
    });

    // hero（不在实体表、不在正文中）兜底归一化到主角实体，且不引入新实体
    expect(result.facts.events[0].participants).toEqual(['char-protagonist']);
    expect(result.introductionDeltas).toEqual([]);
  });

  it('“主角”称呼即使出现在正文中也归一化到主角实体，不引入僵尸实体', () => {
    // 模型最常用“主角”占位，正文几乎必然含该词——必须归一化而非引入新实体
    const state = makeState();
    delete state.entities.hero;
    state.entities['char-protagonist'] = {
      id: 'char-protagonist',
      kind: 'character',
      name: '林夜',
      aliases: [],
      attributes: { role: 'protagonist' },
      knownBy: ['char-protagonist'],
      sourceTrace: [],
    };

    const facts: ExtractedFacts = {
      events: [
        {
          id: 'evt-1',
          chapter: 1,
          sceneId: 'scene-1',
          type: 'arrival',
          summary: '主角到达城门',
          participants: ['主角'],
          causes: [],
          effects: [],
          evidence: ['主角来到城门'],
        },
      ],
      deltas: [],
      evidence: ['主角来到城门'],
    };

    const result = canonicalizeExtractedFacts({
      facts,
      state,
      drafts: [makeDraft('主角来到城门，守卫盘查。')],
    });

    expect(result.facts.events[0].participants).toEqual(['char-protagonist']);
    expect(result.introductionDeltas).toEqual([]);
  });
});
