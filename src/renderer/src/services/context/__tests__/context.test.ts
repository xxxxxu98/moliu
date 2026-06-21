/**
 * @vitest-environment happy-dom
 *
 * L3 上下文层单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  countWords,
  getInputTokenBudget,
  PriorityPolicy,
  ContextAssembler,
  truncateToTokens,
  DEFAULT_PRIORITY_POLICY,
} from '../index';
import type { StateSnapshot } from '../../state/types';

function makeSnapshot(): StateSnapshot {
  return {
    projectId: 'test', chapter: 5,
    characters: {
      char_001: {
        entityId: 'char_001', name: '林动', powerLevel: '练气四层',
        abilities: ['九幽诀'], mentalState: '意气风发', role: '主角',
        alive: true, lastUpdatedChapter: 5,
      },
    },
    characterAppearances: {},
    relationships: {},
    characterLocations: { char_001: 'loc_001' },
    conflicts: {},
    foreshadows: {
      fs_001: {
        id: 'fs_001', hint: '断剑嗡鸣', tier: 'major', status: 'setup',
        setupChapter: 1, plannedPayoffChapter: 10, relatedEntities: [],
      },
    },
    plotNodes: [],
    locations: {
      loc_001: { id: 'loc_001', name: '青云宗', status: '正常', lastUpdatedChapter: 0 },
    },
    locationFeatures: {},
    factions: {},
    timeline: { currentTime: '修炼第三年', elapsed: '三年', currentChapter: 5, anchors: [] },
    worldRules: [
      { id: 'wr_001', name: '凡人不可飞行', rule: '未达筑基不能御空', violationConsequence: '', absolute: true },
    ],
    items: {},
    secrets: {},
    oaths: {},
    deadlines: {},
    createdAt: '', updatedAt: '',
  };
}

// ============================================================
// TokenEstimator
// ============================================================

describe('TokenEstimator', () => {
  it('中文 token 估算', () => {
    const tokens = estimateTokens('这是一段中文文本');
    expect(tokens).toBeGreaterThan(0);
    // 8 个中文字 / 1.5 ≈ 6
    expect(tokens).toBeGreaterThanOrEqual(5);
  });

  it('英文 token 估算', () => {
    const tokens = estimateTokens('hello world foo bar');
    // 4 词 / 0.75 ≈ 6
    expect(tokens).toBeGreaterThanOrEqual(5);
  });

  it('空文本返回 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('countWords 中英文混合', () => {
    expect(countWords('hello 世界')).toBe(1 + 2);
  });

  it('getInputTokenBudget 已知模型', () => {
    const budget = getInputTokenBudget('gpt-4');
    expect(budget).toBe(Math.floor(8192 * 0.7));
  });

  it('getInputTokenBudget 模糊匹配', () => {
    const budget = getInputTokenBudget('claude-3-5-sonnet-20241022');
    expect(budget).toBe(Math.floor(200000 * 0.7));
  });

  it('getInputTokenBudget 未知模型用默认', () => {
    const budget = getInputTokenBudget('unknown-model-xyz');
    expect(budget).toBe(Math.floor(32000 * 0.7));
  });
});

// ============================================================
// PriorityPolicy
// ============================================================

describe('PriorityPolicy', () => {
  it('默认策略按优先级排序', () => {
    const policy = new PriorityPolicy();
    const config = policy.getConfig();
    expect(config[0].type).toBe('state_snapshot');
    expect(config[config.length - 1].type).toBe('history');
  });

  it('allocateBudget 总和不超过预算', () => {
    const policy = new PriorityPolicy();
    const budget = 10000;
    const allocation = policy.allocateBudget(budget);
    const total = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
    // 允许小幅偏差（minTokens 约束）
    expect(total).toBeLessThanOrEqual(budget + 500);
  });

  it('groupByPosition 分三类', () => {
    const policy = new PriorityPolicy();
    const groups = policy.groupByPosition();
    expect(groups.head.length).toBeGreaterThan(0);
    expect(groups.middle.length).toBeGreaterThan(0);
    expect(groups.tail.length).toBeGreaterThan(0);
    // 状态快照应该在 head
    expect(groups.head.some(b => b.type === 'state_snapshot')).toBe(true);
    // 检索片段应该在 middle
    expect(groups.middle.some(b => b.type === 'retrieved_fragments')).toBe(true);
    // CHANGES 协议在 tail
    expect(groups.tail.some(b => b.type === 'changes_protocol')).toBe(true);
  });

  it('小预算下低优先级块被压缩', () => {
    const policy = new PriorityPolicy();
    const allocation = policy.allocateBudget(1000);  // 很小的预算
    // 状态快照至少保留 minTokens (500)
    expect(allocation.get('state_snapshot')).toBeGreaterThanOrEqual(500);
    // 历史块（最低优先）应该被压到很小
    expect(allocation.get('history')).toBeLessThan(200);
  });
});

// ============================================================
// truncateToTokens
// ============================================================

describe('truncateToTokens', () => {
  it('不超限直接返回', () => {
    const text = '短文本';
    expect(truncateToTokens(text, 100)).toBe(text);
  });

  it('超限按段落截断', () => {
    const text = '第一段内容。\n\n第二段内容。\n\n第三段很长的内容描述。';
    const result = truncateToTokens(text, 5);
    expect(result.length).toBeLessThan(text.length);
  });

  it('单个超长段落按字符截断', () => {
    const text = '这是一个非常非常长的段落没有句号也没有分段就是一直说下去'.repeat(10);
    const result = truncateToTokens(text, 10);
    expect(result.length).toBeLessThan(text.length);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ============================================================
// ContextAssembler
// ============================================================

describe('ContextAssembler', () => {
  it('组装最小输入', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '本章主角突破练气四层',
    });
    expect(result.prompt).toContain('权威事实快照');
    expect(result.prompt).toContain('林动');
    expect(result.prompt).toContain('CHANGES');
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.budget).toBeGreaterThan(0);
  });

  it('状态快照出现在 prompt 开头', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '大纲',
      writingRules: '写作规范',
    });
    const snapshotIdx = result.prompt.indexOf('权威事实快照');
    const rulesIdx = result.prompt.indexOf('写作规范');
    expect(snapshotIdx).toBeLessThan(rulesIdx);
  });

  it('CHANGES 协议出现在 prompt 结尾', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '大纲',
      writingRules: '规范',
    });
    const changesIdx = result.prompt.lastIndexOf('CHANGES');
    const snapshotIdx = result.prompt.indexOf('权威事实快照');
    expect(changesIdx).toBeGreaterThan(snapshotIdx);
  });

  it('检索片段注入到 middle', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '大纲',
      retrievedFragments: [
        { text: '林动曾在第3章与反派对决', chapter: 3, score: 0.85 },
      ],
    });
    expect(result.prompt).toContain('历史相关片段');
    expect(result.prompt).toContain('林动曾在第3章');
  });

  it('活跃伏笔注入', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '大纲',
    });
    expect(result.prompt).toContain('断剑嗡鸣');
  });

  it('blockStats 记录各块使用', () => {
    const assembler = new ContextAssembler();
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '大纲',
    });
    expect(result.blockStats.length).toBe(DEFAULT_PRIORITY_POLICY.length);
    const snapshotStat = result.blockStats.find(s => s.type === 'state_snapshot');
    expect(snapshotStat?.actualTokens).toBeGreaterThan(0);
  });

  it('大输入下触发截断', () => {
    const assembler = new ContextAssembler();
    // 极大的检索片段
    const bigFragments = Array.from({ length: 50 }, (_, i) => ({
      text: '很长很长的历史片段内容'.repeat(100) + `编号${i}`,
      chapter: i + 1,
      score: 0.7,
    }));
    const result = assembler.assemble({
      chapter: 5,
      snapshot: makeSnapshot(),
      currentChapterOutline: '大纲',
      retrievedFragments: bigFragments,
      modelName: 'gpt-3.5-turbo',  // 小窗口
    });
    expect(result.truncated).toBe(true);
    // 总 token 不超预算太多
    expect(result.totalTokens).toBeLessThan(result.budget * 1.2);
  });
});
