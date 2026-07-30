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

  it('正文新角色可引入，自然语言因果边丢弃而非当成缺前件', () => {
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
    const report = new ContinuityValidator().validate({
      contracts,
      state: result.stateForValidation,
      drafts: [makeDraft(prose)],
      facts: result.facts,
    });

    expect(report.issues.filter(issue => issue.domain === 'entity')).toEqual([]);
    expect(report.issues.filter(issue => issue.domain === 'causality')).toEqual([]);
  });
});
