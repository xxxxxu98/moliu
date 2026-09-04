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

  // 2026-09-04 r5 ch76 实证：状态摘要只喂裁判侧，writer 看不到实体状态，
  // 在押角色（陆鸣，下狱×多章）被写成自由领兵的将领，fact_conflict 三轮耗尽
  // 成书空洞。修复=终态随 characterTruths 下发到写作侧合同。
  it('终态角色随 characterTruths 下发状态真相（在押不可自由活动）', () => {
    const bootstrap = makeBootstrap();
    bootstrap.entities = [
      ...bootstrap.entities,
      {
        id: 'lu-ming',
        kind: 'character',
        name: '陆鸣',
        aliases: [],
        attributes: { role: '户部主事', status: '下狱' },
        knownBy: [],
        sourceTrace: [],
      },
      {
        id: 'dead-man',
        kind: 'character',
        name: '赵寅',
        aliases: [],
        attributes: { status: '死亡' },
        knownBy: [],
        sourceTrace: [],
      },
    ];
    const pack = new ContractPackBuilder().build({
      bootstrap,
      volume: {
        number: 1,
        title: '入城卷',
        objective: '站稳脚跟',
        conflict: '守卫盘查',
        forbidden: [],
      },
      chapter: {
        number: 76,
        title: '水营军报',
        outlineNode: {
          id: 'node-76',
          title: '军报',
          CBN: '军情抵达',
          CPNs: ['汇报军情'],
          CEN: '新的危机',
          mustCover: ['汇报军情'],
        },
      },
    });

    expect(pack.master.characterTruths['lu-ming'].join('|')).toContain(
      '当前在押，仅可以提审、押解或狱中场景出场，不可自由活动或领兵任职'
    );
    expect(pack.master.characterTruths['dead-man'].join('|')).toContain('已死亡，不可出场，回忆或转述除外');
    // 无终态角色不追加空串
    expect(pack.master.characterTruths['hero']).toEqual(['林夜']);
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

  it('compactStateForDraft 注入相关角色的 knowledge/inventory 与关键 attributes', () => {
    const contracts = makeContracts();
    const state = makeState();
    // hero 命中 CBN「林夜来到城门」→ 进 relatedIds；补一个生死类 attribute
    state.entities.hero.attributes = {
      status: '重伤未愈',
      location: '城外',
      description: '主角，身负血海深仇',
      role: 'protagonist',
    };
    // 另一个未命中合同的角色，其 knowledge/inventory 不应被注入
    state.entities['npc_bystander'] = {
      id: 'npc_bystander',
      kind: 'character',
      name: '路人甲',
      aliases: [],
      attributes: {},
      knownBy: [],
      sourceTrace: [],
    };
    state.knowledge['npc_bystander'] = ['无关秘密'];
    state.inventory['npc_bystander'] = { copper: 5 };

    const compact = compactStateForDraft(state, contracts) as {
      knowledge: Record<string, string[]>;
      inventory: Record<string, Record<string, number>>;
      entities: Record<string, { attributes?: Record<string, unknown> }>;
    };

    // hero（命中合同）的 knowledge/inventory 被注入
    expect(compact.knowledge.hero).toContain('城门有埋伏');
    expect(compact.inventory.hero).toEqual({ sword: 1 });
    // 未命中合同的角色不灌入
    expect(compact.knowledge.npc_bystander).toBeUndefined();
    expect(compact.inventory.npc_bystander).toBeUndefined();
    // hero 的关键 attributes（排除 description/role）被带出
    expect(compact.entities.hero.attributes).toMatchObject({
      status: '重伤未愈',
      location: '城外',
    });
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
