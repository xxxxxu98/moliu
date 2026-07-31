import { describe, expect, it } from 'vitest';

import {
  compactStateForDraft,
  ContextBudgetError,
  ContextPackBuilder,
  stripStateForChapterRewrite,
} from '../ContextPackBuilder';
import { ContractPackBuilder } from '../ContractPackBuilder';
import { SceneBeatPlanner } from '../SceneBeatPlanner';
import { makeBootstrap, makeContracts, makeState } from './testFixtures';

describe('ContractPackBuilder', () => {
  it('构建 master/volume/chapter/review 并继承禁区与锁定规则', () => {
    const pack = new ContractPackBuilder().build({
      bootstrap: makeBootstrap(),
      volume: {
        number: 1,
        title: '入城卷',
        objective: '站稳脚跟',
        conflict: '守卫盘查',
        forbidden: ['提前揭露幕后人'],
      },
      chapter: {
        number: 2,
        title: '破局',
        outlineNode: {
          id: 'node-2',
          title: '盘查',
          CBN: '抵达城门',
          CPNs: ['守卫盘查'],
          CEN: '通过城门',
          mustCover: ['守卫盘查'],
          forbiddenZones: ['御剑入城'],
        },
      },
      forbidden: ['主角突然降智'],
    });

    expect(pack.master.immutableRules).toContain('禁飞：城内不可御剑');
    expect(pack.chapter.forbidden).toEqual([
      '主角突然降智',
      '提前揭露幕后人',
      '御剑入城',
    ]);
    expect(pack.review.mustCheck).toContain('守卫盘查');
  });
});

describe('SceneBeatPlanner', () => {
  it('按 CBN/CPN/CEN 生成确定性 DAG，并对 overlay 做候选事件预检', () => {
    const contracts = makeContracts();
    const planner = new SceneBeatPlanner();
    const cpnId = 'chapter-2:CPN-1';
    const result = planner.plan({
      chapter: contracts.chapter,
      state: makeState(),
      overlay: {
        baseChapter: 1,
        deltas: [
          {
            operation: 'set',
            path: 'entities.guard',
            value: {
              id: 'guard',
              kind: 'character',
              name: '守卫',
              aliases: [],
              attributes: {},
              knownBy: [],
              sourceTrace: [],
            },
            evidence: '守卫出现',
          },
        ],
        events: [],
      },
      candidatesByBeat: {
        [cpnId]: [
          {
            id: 'event-check',
            summary: '守卫盘查',
            participants: ['hero', 'guard'],
            prerequisites: ['entity:guard', 'item:hero:sword:1'],
            effects: ['完成盘查'],
          },
          {
            id: 'event-impossible',
            summary: '陌生人介入',
            participants: ['stranger'],
            prerequisites: ['event:not-happened'],
            effects: [],
          },
        ],
      },
    });

    expect(result.beats.map(beat => beat.kind)).toEqual(['CBN', 'CPN', 'CEN']);
    expect(result.beats[2].dependsOn).toEqual([cpnId]);
    expect(result.prechecks).toContainEqual({
      candidateId: 'event-check',
      accepted: true,
      reasons: [],
    });
    expect(result.prechecks.find(item => item.candidateId === 'event-impossible')?.accepted).toBe(
      false
    );
  });
});

describe('ContextPackBuilder', () => {
  it('保留关键块并显式报告被预算淘汰的非关键块', () => {
    const builder = new ContextPackBuilder();
    const base = builder.build({
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: [],
      maxTokens: 10_000,
    });
    const criticalTokens = base.blocks
      .filter(block => block.critical)
      .reduce((total, block) => total + block.tokenEstimate, 0);
    const constrained = builder.build({
      contracts: makeContracts(),
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: ['短句', '避免总结'],
      maxTokens: criticalTokens,
    });

    expect(constrained.blocks.map(block => block.kind)).toEqual([
      'locked-contracts',
      'current-state',
    ]);
    expect(constrained.omitted).toEqual(['recent-scenes', 'retrieval', 'style']);
  });

  it('预算装不下关键块时抛错而不是静默截断', () => {
    expect(() =>
      new ContextPackBuilder().build({
        contracts: makeContracts(),
        state: makeState(),
        recentScenes: [],
        retrievedScenes: [],
        styleGuidance: [],
        maxTokens: 1,
      })
    ).toThrow(ContextBudgetError);
  });

  it('合同已含 style 时不再重复塞 style 块，且压缩 current-state', () => {
    const contracts = makeContracts();
    const pack = new ContextPackBuilder().build({
      contracts,
      state: makeState(),
      recentScenes: [],
      retrievedScenes: [],
      styleGuidance: contracts.master.style,
      maxTokens: 10_000,
    });

    expect(pack.blocks.map(block => block.kind)).toEqual([
      'locked-contracts',
      'current-state',
      'recent-scenes',
      'retrieval',
    ]);
    const contractsPayload = JSON.parse(
      pack.blocks.find(block => block.kind === 'locked-contracts')!.content
    ) as { master: { style: string[] } };
    expect(contractsPayload.master.style.length).toBeGreaterThan(0);

    const statePayload = JSON.parse(
      pack.blocks.find(block => block.kind === 'current-state')!.content
    ) as { events: unknown[]; entities: Record<string, unknown> };
    expect(Array.isArray(statePayload.events)).toBe(true);
    expect(statePayload.entities).toBeTruthy();
  });

  it('compactStateForDraft 不灌入本章及之后事件', () => {
    const contracts = makeContracts();
    const state = makeState();
    state.events.push({
      id: 'evt-ch2',
      chapter: 2,
      type: 'checkpoint',
      summary: '本章旧事件不应进 compact 的近期列表作为历史',
      participants: ['hero'],
      causes: [],
      effects: [],
      evidence: [],
    });
    const compact = compactStateForDraft(state, contracts) as {
      events: Array<{ chapter: number }>;
    };
    expect(compact.events.every(event => event.chapter < contracts.chapter.chapterNumber)).toBe(
      true
    );
  });
});

describe('stripStateForChapterRewrite', () => {
  it('剥离本章及之后事件与 intro 实体', () => {
    const state = makeState();
    state.chapter = 2;
    state.entities['char:intro:ghost'] = {
      id: 'char:intro:ghost',
      kind: 'character',
      name: '鬼影',
      aliases: [],
      attributes: {},
      knownBy: [],
      sourceTrace: [],
    };
    state.events.push({
      id: 'evt-2',
      chapter: 2,
      type: 'reveal',
      summary: '旧第二章事件',
      participants: ['char:intro:ghost'],
      causes: [],
      effects: [],
      evidence: [],
    });

    const stripped = stripStateForChapterRewrite(state, 2);
    expect(stripped.events.every(event => event.chapter < 2)).toBe(true);
    expect(stripped.entities['char:intro:ghost']).toBeUndefined();
    expect(stripped.chapter).toBeLessThan(2);
  });
});
