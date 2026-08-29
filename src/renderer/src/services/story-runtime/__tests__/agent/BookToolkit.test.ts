import { describe, expect, it } from 'vitest';

import type {
  ContractPack,
  SceneChunk,
  StoryState,
} from '@/types/story-runtime';

import { BookToolkit } from '../../agent/BookToolkit';

function makeState(): StoryState {
  return {
    chapter: 313,
    entities: {
      hero: {
        id: 'hero',
        kind: 'character',
        name: '林夜',
        aliases: ['夜哥'],
        attributes: { role: 'protagonist', status: 'alive', location: '北境' },
        knownBy: ['hero'],
        sourceTrace: [],
      },
      zhoumao: {
        id: 'zhoumao',
        kind: 'character',
        name: '周茂',
        aliases: ['茂公'],
        attributes: { status: 'dead', location: '皇陵', 死因: '鸩杀' },
        knownBy: [],
        sourceTrace: [],
      },
    },
    events: [
      {
        id: 'evt-death',
        chapter: 312,
        sceneId: 'scene-312',
        type: 'death',
        summary: '周茂在皇陵被鸩杀',
        participants: ['zhoumao'],
        causes: [],
        effects: [],
        evidence: ['周茂倒下'],
      },
      {
        id: 'evt-old',
        chapter: 300,
        sceneId: 'scene-300',
        type: 'battle',
        summary: '林夜夜袭敌营',
        participants: ['hero'],
        causes: [],
        effects: [],
        evidence: [],
      },
    ],
    inventory: { hero: { sword: 1 } },
    knowledge: { hero: ['城门有埋伏'] },
    timeline: ['第300章 林夜夜袭', '第312章 周茂身死'],
    openForeshadows: ['fs-ghost'],
    fulfilledNodes: [],
  };
}

function makeSceneChunks(): SceneChunk[] {
  return [
    {
      id: 'scene-311',
      chapterId: 'ch-311',
      chapterIndex: 311,
      order: 1,
      title: '密谈',
      text: '周茂对林夜说,皇陵之下埋着先帝的遗诏。当夜烛火摇曳。',
      summary: '周茂透露遗诏',
      participants: ['zhoumao', 'hero'],
      locations: ['皇陵'],
      sourceTrace: [],
    },
    {
      id: 'scene-312',
      chapterId: 'ch-312',
      chapterIndex: 312,
      order: 1,
      title: '鸩杀',
      text: '周茂饮下毒酒,倒在皇陵的石阶上。遗诏的下落从此成谜。',
      participants: ['zhoumao'],
      locations: ['皇陵'],
      sourceTrace: [],
    },
  ];
}

function makeContracts(): ContractPack {
  const meta = {
    schemaVersion: 'story-runtime/v1' as const,
    projectId: 'project-1',
    sourceTrace: [],
  };
  return {
    master: {
      meta: { ...meta, kind: 'master', id: 'master' },
      premise: '林夜追查遗诏',
      genres: ['仙侠'],
      immutableRules: [],
      characterTruths: {},
      style: [],
      forbidden: [],
    },
    volume: {
      meta: { ...meta, kind: 'volume', id: 'volume-1' },
      volumeNumber: 1,
      title: '皇陵',
      objective: '找到遗诏',
      conflict: '朝堂追杀',
      pacing: [],
      requiredPayoffs: [],
      forbidden: [],
    },
    chapter: {
      meta: { ...meta, kind: 'chapter', id: 'chapter-313' },
      chapterNumber: 313,
      title: '旧案',
      goal: '重启旧案',
      CBN: '林夜重返皇陵',
      CPNs: ['翻查遗诏下落'],
      CEN: '锁定真凶',
      mustCover: ['遗诏线索'],
      forbidden: [],
    },
    review: {
      meta: { ...meta, kind: 'review', id: 'review-313' },
      blockingDomains: [],
      requiredEvidence: true,
      maxWarnings: 0,
      mustCheck: [],
    },
  };
}

function makeToolkit(overrides?: { searchPort?: Parameters<typeof BookToolkit.prototype.call> extends never ? never : any }) {
  return new BookToolkit({
    chapterNumber: 313,
    contracts: makeContracts(),
    state: makeState(),
    sceneChunks: makeSceneChunks(),
    foreshadowCatalog: [
      {
        id: 'fs-ghost',
        hint: '遗诏下落成谜',
        status: 'buried',
        setupChapter: 310,
        payoffChapter: 313,
      },
      { id: 'fs-done', hint: '旧案真凶', status: 'resolved' },
    ],
    ...overrides,
  });
}

describe('BookToolkit', () => {
  it('query_entity:别名命中 + 属性/持有物/已知信息/最近事件', async () => {
    const toolkit = makeToolkit();
    const result = await toolkit.call('query_entity', { name: '茂公' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.result as Record<string, unknown>;
    expect(record.id).toBe('zhoumao');
    expect(record.attributes).toMatchObject({ status: 'dead' });
    expect(record.recentEvents).toEqual([
      { chapter: 312, type: 'death', summary: '周茂在皇陵被鸩杀' },
    ]);
  });

  it('query_entity:找不到时给出相近角色建议', async () => {
    const toolkit = makeToolkit();
    const result = await toolkit.call('query_entity', { name: '不存在的人' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('林夜');
    expect(result.error).toContain('周茂');
  });

  it('query_entity:缺 name 报参数错误', async () => {
    const result = await makeToolkit().call('query_entity', {});
    expect(result.ok).toBe(false);
  });

  it('search_scenes:注入 FTS 端口时走端口', async () => {
    const toolkit = makeToolkit({
      searchPort: { search: async () => makeSceneChunks().slice(0, 1) },
    });
    const result = await toolkit.call('search_scenes', { query: '遗诏', k: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hits = result.result as Array<Record<string, unknown>>;
    expect(hits).toHaveLength(1);
    expect(hits[0]?.chapterIndex).toBe(311);
  });

  it('search_scenes:无端口时内存词面降级命中', async () => {
    const result = await makeToolkit().call('search_scenes', { query: '遗诏' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const hits = result.result as Array<Record<string, unknown>>;
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(hits)).toContain('遗诏');
  });

  it('search_scenes:无命中返回 ok:false 引导换查法', async () => {
    const result = await makeToolkit().call('search_scenes', { query: '完全不存在的词组xyz' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('read_chapter');
  });

  it('read_chapter:默认章首+章尾,给 focus 时返回命中窗口', async () => {
    const toolkit = makeToolkit();
    const head = await toolkit.call('read_chapter', { chapterNumber: 312 });
    expect(head.ok).toBe(true);
    if (head.ok) {
      const excerpt = (head.result as { excerpt: string }).excerpt;
      expect(excerpt).toContain('周茂饮下毒酒');
    }
    const focused = await toolkit.call('read_chapter', {
      chapterNumber: 312,
      focus: '遗诏',
    });
    expect(focused.ok).toBe(true);
    if (focused.ok) {
      const excerpt = (focused.result as { excerpt: string }).excerpt;
      expect(excerpt).toContain('遗诏的下落');
      expect(excerpt).not.toContain('……');
    }
  });

  it('read_chapter:越界章报错并告知已提交范围', async () => {
    const result = await makeToolkit().call('read_chapter', { chapterNumber: 999 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('1..312');
  });

  it('list_foreshadows:due 过滤出已到回收时点的未回收伏笔并标注', async () => {
    const result = await makeToolkit().call('list_foreshadows', { filter: 'due' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entries = result.result as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('fs-ghost');
    expect(entries[0]?.note).toContain('第313章');
  });

  it('list_foreshadows:目录未覆盖的状态库 openForeshadows 补占位', async () => {
    const toolkit = new BookToolkit({
      chapterNumber: 313,
      contracts: makeContracts(),
      state: makeState(),
      sceneChunks: [],
    });
    const result = await toolkit.call('list_foreshadows', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entries = result.result as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('fs-ghost');
    expect(entries[0]?.hint).toContain('状态库未回收');
  });

  it('query_timeline:按角色过滤事件并格式化', async () => {
    const result = await makeToolkit().call('query_timeline', { character: '周茂' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const facts = result.result as string[];
    expect(facts).toEqual(['第312章 death:周茂在皇陵被鸩杀']);
  });

  it('query_timeline:缺省返回时间线条目', async () => {
    const result = await makeToolkit().call('query_timeline', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toEqual(['第300章 林夜夜袭', '第312章 周茂身死']);
  });

  it('get_contract:返回卷/章合同关键字段', async () => {
    const result = await makeToolkit().call('get_contract', {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.result as {
      chapter: Record<string, unknown>;
      volume: Record<string, unknown>;
    };
    expect(record.chapter.CBN).toBe('林夜重返皇陵');
    expect(record.volume.objective).toBe('找到遗诏');
  });

  it('未知工具与非对象 args 均拒绝', async () => {
    const toolkit = makeToolkit();
    const unknown = await toolkit.call('hack_tool', {});
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain('可用:');
    const badArgs = await toolkit.call('query_entity', 'not-an-object');
    expect(badArgs.ok).toBe(false);
  });
});
