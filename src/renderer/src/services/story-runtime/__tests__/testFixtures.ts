import type {
  ContractPack,
  StoryBootstrapData,
  StoryState,
} from '@/types/story-runtime';

export function makeState(): StoryState {
  return {
    chapter: 1,
    entities: {
      hero: {
        id: 'hero',
        kind: 'character',
        name: '林夜',
        aliases: [],
        attributes: {},
        knownBy: ['hero'],
        sourceTrace: [],
      },
    },
    events: [],
    inventory: { hero: { sword: 1 } },
    knowledge: { hero: ['城门有埋伏'] },
    timeline: ['第一日'],
    openForeshadows: [],
    fulfilledNodes: [],
  };
}

export function makeBootstrap(): StoryBootstrapData {
  const state = makeState();
  return {
    schemaVersion: 'story-runtime/v1',
    project: {
      id: 'project-1',
      title: '长夜',
      description: '林夜追查真相',
      genres: ['仙侠'],
    },
    entities: [state.entities.hero],
    rules: [
      {
        id: 'rule-1',
        kind: 'rule',
        name: '禁飞',
        aliases: [],
        attributes: { description: '城内不可御剑', locked: true },
        knownBy: [],
        sourceTrace: [],
      },
    ],
    foreshadows: [],
    outlineNodes: [],
    chapterMemories: [],
    sceneChunks: [],
    initialState: state,
  };
}

export function makeContracts(): ContractPack {
  const meta = {
    schemaVersion: 'story-runtime/v1' as const,
    projectId: 'project-1',
    sourceTrace: [],
  };
  return {
    master: {
      meta: { ...meta, kind: 'master', id: 'master' },
      premise: '林夜追查真相',
      genres: ['仙侠'],
      immutableRules: ['城内不可御剑'],
      characterTruths: { hero: ['主角'] },
      style: ['克制'],
      forbidden: [],
    },
    volume: {
      meta: { ...meta, kind: 'volume', id: 'volume-1' },
      volumeNumber: 1,
      title: '入城',
      objective: '查明埋伏',
      conflict: '守卫盘查',
      pacing: ['紧凑'],
      requiredPayoffs: [],
      forbidden: [],
    },
    chapter: {
      meta: { ...meta, kind: 'chapter', id: 'chapter-2' },
      chapterNumber: 2,
      title: '破局',
      goal: '通过城门',
      CBN: '林夜来到城门',
      CPNs: ['守卫盘查'],
      CEN: '林夜通过城门',
      mustCover: ['守卫盘查'],
      forbidden: ['御剑入城'],
    },
    review: {
      meta: { ...meta, kind: 'review', id: 'review-2' },
      blockingDomains: [
        'entity',
        'knowledge',
        'inventory',
        'timeline',
        'causality',
        'fulfillment',
        'evidence',
      ],
      requiredEvidence: true,
      maxWarnings: 0,
      mustCheck: ['守卫盘查'],
    },
  };
}
