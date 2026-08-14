import { describe, expect, it } from 'vitest';

import type { ExtractedFacts, ProvisionalStateOverlay } from '@/types/story-runtime';

import { canonicalizeExtractedFacts } from '../FactCanonicalizer';
import { applyProvisionalOverlay } from '../stateOverlay';
import { parseSchema, storyStateSchema } from '../schemas';
import { makeState } from './testFixtures';

function emptyFacts(deltas: ExtractedFacts['deltas']): ExtractedFacts {
  return { events: [], deltas, evidence: [] };
}

describe('knowledge 契约防线（真实冒烟故障：value:true 污染 canonical snapshot）', () => {
  it('FactCanonicalizer：knowledge.<char>.<fact> + value:true 归一为 add fact 字符串', () => {
    // 冒烟真实案例：{"operation":"set","path":"knowledge.char-x.火焰纹与史书印记一致","value":true}
    const result = canonicalizeExtractedFacts({
      facts: emptyFacts([
        {
          operation: 'set',
          path: 'knowledge.hero.火焰纹与史书印记一致',
          value: true,
          evidence: '两道纹路严丝合缝地叠在一起',
        },
      ]),
      state: makeState(),
      drafts: [],
    });

    expect(result.facts.deltas).toEqual([
      {
        operation: 'add',
        path: 'knowledge.hero',
        value: '火焰纹与史书印记一致',
        evidence: '两道纹路严丝合缝地叠在一起',
      },
    ]);
  });

  it('FactCanonicalizer：knowledge.<char> 的对象 value 展开为逐 fact 的 add delta', () => {
    const result = canonicalizeExtractedFacts({
      facts: emptyFacts([
        {
          operation: 'set',
          path: 'knowledge.hero',
          value: { 火焰纹一致: true, 县衙密信: '第三章得知' },
          evidence: 'x',
        },
      ]),
      state: makeState(),
      drafts: [],
    });

    expect(result.facts.deltas).toHaveLength(2);
    for (const delta of result.facts.deltas) {
      expect(delta.operation).toBe('add');
      expect(delta.path).toBe('knowledge.hero');
    }
    const values = result.facts.deltas.map(delta => delta.value);
    expect(values).toContain('火焰纹一致');
    expect(values).toContain('县衙密信');
  });

  it('FactCanonicalizer：knowledge.<char> 的裸字符串 value 包装为 add delta', () => {
    const result = canonicalizeExtractedFacts({
      facts: emptyFacts([
        { operation: 'add', path: 'knowledge.hero', value: '城门换防', evidence: 'x' },
      ]),
      state: makeState(),
      drafts: [],
    });

    expect(result.facts.deltas).toEqual([
      { operation: 'add', path: 'knowledge.hero', value: '城门换防', evidence: 'x' },
    ]);
  });

  it('FactCanonicalizer：knowledge 路径 fact 为空时丢弃 delta', () => {
    const result = canonicalizeExtractedFacts({
      facts: emptyFacts([
        { operation: 'set', path: 'knowledge.hero.', value: true, evidence: 'x' },
        { operation: 'add', path: 'knowledge.hero', value: '   ', evidence: 'x' },
      ]),
      state: makeState(),
      drafts: [],
    });

    expect(result.facts.deltas).toEqual([]);
  });

  it('stateOverlay：add 到未初始化的 knowledge owner 生成 string[] 而非标量', () => {
    const state = makeState();
    // makeState 的 hero 已有 knowledge；删掉模拟未初始化
    delete state.knowledge.hero;

    const overlay: ProvisionalStateOverlay = {
      baseChapter: state.chapter,
      deltas: [
        { operation: 'add', path: 'knowledge.hero', value: '火焰纹与史书印记一致', evidence: 'x' },
      ],
      events: [],
    };

    const next = applyProvisionalOverlay(state, overlay);
    expect(next.knowledge.hero).toEqual(['火焰纹与史书印记一致']);
    // 落库后 loadState 的严格 schema 必须能通过
    expect(() => parseSchema(storyStateSchema, next, 'Story Runtime 状态')).not.toThrow();
  });

  it('stateOverlay：knowledge 三段路径 + 对象 value 折叠为事实追加', () => {
    const state = makeState(); // hero 已有 ['城门有埋伏']

    const overlay: ProvisionalStateOverlay = {
      baseChapter: state.chapter,
      deltas: [
        {
          operation: 'set',
          path: 'knowledge.hero.火焰纹与史书印记一致',
          value: { confirmed: true, chapter: 3 },
          evidence: 'x',
        },
      ],
      events: [],
    };

    const next = applyProvisionalOverlay(state, overlay);
    expect(next.knowledge.hero).toEqual(
      expect.arrayContaining(['城门有埋伏', '火焰纹与史书印记一致']),
    );
    expect(() => parseSchema(storyStateSchema, next, 'Story Runtime 状态')).not.toThrow();
  });

  it('stateOverlay：knowledge set string[]（合法形态）原样生效', () => {
    const state = makeState();

    const overlay: ProvisionalStateOverlay = {
      baseChapter: state.chapter,
      deltas: [
        {
          operation: 'set',
          path: 'knowledge.hero',
          value: ['事实A', '事实B'],
          evidence: 'x',
        },
      ],
      events: [],
    };

    const next = applyProvisionalOverlay(state, overlay);
    expect(next.knowledge.hero).toEqual(['事实A', '事实B']);
  });

  it('stateOverlay：knowledge remove 三段路径移除单条事实', () => {
    const state = makeState();

    const overlay: ProvisionalStateOverlay = {
      baseChapter: state.chapter,
      deltas: [
        { operation: 'remove', path: 'knowledge.hero.城门有埋伏', evidence: 'x' },
      ],
      events: [],
    };

    const next = applyProvisionalOverlay(state, overlay);
    expect(next.knowledge.hero ?? []).not.toContain('城门有埋伏');
  });

  it('schema：已污染的存量 knowledge 软归一化回 string[]，loadState 不再整章崩', () => {
    // 模拟已落库的污染 snapshot（修复前真实形态）
    const polluted = makeState() as unknown as Record<string, unknown>;
    (polluted as { knowledge: Record<string, unknown> }).knowledge = {
      hero: ['城门有埋伏'],
      'char-1786691126724-0': { 火焰纹与史书印记一致: true },
    };

    const parsed = parseSchema(
      storyStateSchema,
      polluted,
      'Story Runtime 状态',
    );

    expect(parsed.knowledge.hero).toEqual(['城门有埋伏']);
    // object 的 key 被视为「知道了的事实」救回
    expect(parsed.knowledge['char-1786691126724-0']).toEqual(['火焰纹与史书印记一致']);
  });

  it('schema：无法归一化的 knowledge owner（如裸布尔）被丢弃而非整章崩', () => {
    const polluted = makeState() as unknown as { knowledge: Record<string, unknown> };
    polluted.knowledge = {
      hero: ['城门有埋伏'],
      'char-bad': true,
    };

    const parsed = parseSchema(storyStateSchema, polluted, 'Story Runtime 状态');
    expect(parsed.knowledge.hero).toEqual(['城门有埋伏']);
    expect(parsed.knowledge['char-bad']).toBeUndefined();
  });
});
