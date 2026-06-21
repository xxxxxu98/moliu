/**
 * @vitest-environment happy-dom
 *
 * L2 检索层单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneChunker } from '../SceneChunker';
import { BM25Index } from '../BM25';
import { EntityGraph } from '../EntityGraph';
import { HybridRetriever } from '../HybridRetriever';

// ============================================================
// SceneChunker
// ============================================================

describe('SceneChunker', () => {
  const chunker = new SceneChunker();

  it('空内容返回空数组', () => {
    expect(chunker.chunk(1, '')).toEqual([]);
    expect(chunker.chunk(1, '   ')).toEqual([]);
  });

  it('短文本切成单片', () => {
    const chunks = chunker.chunk(1, '林动开始修炼。九幽诀运转。');
    expect(chunks.length).toBe(1);
    expect(chunks[0].wordCount).toBeGreaterThan(0);
  });

  it('多段落切成多片', () => {
    const content = [
      '林动盘膝而坐，开始运转九幽诀。',
      '',
      '此时在青云宗大殿内，师父正在品茶。',
      '',
      '林动感到灵气涌动，境界开始松动。',
    ].join('\n');
    const chunks = chunker.chunk(1, content);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('显式场景标记切片', () => {
    const content = '开场内容。\n\n【场景】\n第二场景内容。\n\n【场景二】\n第三场景。';
    const chunks = chunker.chunk(1, content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('提取说话者', () => {
    const chunks = chunker.chunk(1, '林动说道：我要变强。师父笑道：好。');
    expect(chunks[0].speakers).toContain('林动');
    expect(chunks[0].speakers).toContain('师父');
  });

  it('过长段落按句子拆分', () => {
    const longText = '这是一段很长的内容。'.repeat(100);
    const chunks = chunker.chunk(1, longText, { maxChars: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(400);  // 允许一定溢出
    }
  });
});

// ============================================================
// BM25Index
// ============================================================

describe('BM25Index', () => {
  let index: BM25Index;

  beforeEach(() => {
    index = new BM25Index();
  });

  it('空查询返回空', () => {
    index.add({ id: '1', text: '林动修炼' });
    expect(index.search('')).toEqual([]);
  });

  it('精确词匹配', () => {
    index.add({ id: '1', text: '林动开始修炼九幽诀' });
    index.add({ id: '2', text: '师父在喝茶' });
    const results = index.search('林动');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('1');
  });

  it('多文档排序', () => {
    index.add({ id: '1', text: '林动林动林动' });
    index.add({ id: '2', text: '林动' });
    index.add({ id: '3', text: '无关内容' });
    const results = index.search('林动');
    expect(results[0].id).toBe('1');  // 词频最高
  });

  it('topK 限制', () => {
    for (let i = 0; i < 5; i++) {
      index.add({ id: String(i), text: `林动第${i}次出场` });
    }
    const results = index.search('林动', 2);
    expect(results.length).toBe(2);
  });

  it('中文 bigram 提高召回', () => {
    index.add({ id: '1', text: '九幽神功' });
    const results = index.search('九幽');
    expect(results.length).toBeGreaterThan(0);
  });

  it('clear 清空', () => {
    index.add({ id: '1', text: '测试' });
    expect(index.size()).toBe(1);
    index.clear();
    expect(index.size()).toBe(0);
  });
});

// ============================================================
// EntityGraph
// ============================================================

describe('EntityGraph', () => {
  let graph: EntityGraph;

  beforeEach(() => {
    graph = new EntityGraph();
  });

  it('索引并按实体查询', () => {
    graph.indexChunk('c1', 1, '林动与师父对话', ['林动', '师父']);
    graph.indexChunk('c2', 2, '林动独自修炼', ['林动']);
    graph.indexChunk('c3', 3, '师父传授功法', ['师父']);

    const result = graph.query(['林动']);
    expect(result.chunkIds).toContain('c1');
    expect(result.chunkIds).toContain('c2');
    expect(result.matchedEntities).toContain('林动');
  });

  it('多实体 OR 查询', () => {
    graph.indexChunk('c1', 1, '林动与师父', ['林动', '师父']);
    graph.indexChunk('c2', 2, '林动独处', ['林动']);
    graph.indexChunk('c3', 3, '师父独处', ['师父']);

    const result = graph.query(['林动', '师父']);
    // 三片都应该返回（OR）
    expect(result.chunkIds.length).toBe(3);
  });

  it('多实体命中数排序', () => {
    graph.indexChunk('c1', 1, '林动与师父对话', ['林动', '师父']);
    graph.indexChunk('c2', 2, '只有林动', ['林动']);

    const result = graph.query(['林动', '师父']);
    // c1 命中两个实体，应该排前面
    expect(result.chunkIds[0]).toBe('c1');
  });

  it('别名消歧', () => {
    graph.registerAlias('动哥', '林动');
    graph.indexChunk('c1', 1, '林动修炼', ['林动']);
    // 通过别名查询
    const result = graph.query(['动哥']);
    expect(result.chunkIds).toContain('c1');
  });

  it('无匹配返回空', () => {
    graph.indexChunk('c1', 1, '林动', ['林动']);
    const result = graph.query(['不存在的人']);
    expect(result.chunkIds).toEqual([]);
  });
});

// ============================================================
// HybridRetriever（无向量服务降级模式）
// ============================================================

describe('HybridRetriever', () => {
  let retriever: HybridRetriever;

  beforeEach(() => {
    retriever = new HybridRetriever();
  });

  it('索引并检索（BM25+实体图两路）', async () => {
    await retriever.indexChapter(1, '林动在青云宗开始修炼九幽诀，师父传授功法。', ['林动', '师父', '青云宗', '九幽诀']);
    await retriever.indexChapter(2, '林动下山除妖，遇到反派。', ['林动', '反派']);
    await retriever.indexChapter(3, '师父在大殿品茶，回忆往事。', ['师父']);

    const results = await retriever.retrieve({
      query: '林动修炼',
      entities: ['林动'],
      currentChapter: 4,
    });

    expect(results.length).toBeGreaterThan(0);
    // 第 1 章应该排前面（既匹配关键词又匹配实体）
    const topChapter = results[0].chapter;
    expect([1, 2]).toContain(topChapter);
  });

  it('章节范围过滤', async () => {
    await retriever.indexChapter(1, '林动修炼', ['林动']);
    await retriever.indexChapter(2, '林动战斗', ['林动']);
    await retriever.indexChapter(3, '林动休息', ['林动']);

    // currentChapter=2，应该只检索第 1 章
    const results = await retriever.retrieve({
      query: '林动',
      entities: ['林动'],
      currentChapter: 2,
    });
    for (const r of results) {
      expect(r.chapter).toBeLessThan(2);
    }
  });

  it('无匹配返回空', async () => {
    await retriever.indexChapter(1, '林动修炼', ['林动']);
    const results = await retriever.retrieve({
      query: '完全不相关的内容xyz',
      currentChapter: 2,
    });
    expect(results).toEqual([]);
  });

  it('topK 限制', async () => {
    for (let i = 1; i <= 5; i++) {
      await retriever.indexChapter(i, `林动第${i}次出场修炼`, ['林动']);
    }
    const results = await retriever.retrieve({
      query: '林动',
      entities: ['林动'],
      currentChapter: 6,
    }, { topK: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('RRF 融合多路结果', async () => {
    await retriever.indexChapter(1, '林动与师父在青云宗修炼九幽诀', ['林动', '师父', '青云宗']);
    const results = await retriever.retrieve({
      query: '林动修炼',  // BM25 命中
      entities: ['师父'],  // 实体图命中（不同角度）
      currentChapter: 2,
    });
    expect(results.length).toBeGreaterThan(0);
    // 综合分数应该是归一化的
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].score).toBeLessThanOrEqual(1);
  });

  it('clear 清空', async () => {
    await retriever.indexChapter(1, '林动', ['林动']);
    expect(retriever.size()).toBe(1);
    retriever.clear();
    expect(retriever.size()).toBe(0);
  });
});
