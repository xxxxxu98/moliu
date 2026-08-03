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
