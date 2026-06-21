/**
 * L2 检索层 - 混合检索器
 *
 * 三路检索 + Reciprocal Rank Fusion 重排：
 *   向量检索（语义相关） + 实体图（精确实体召回） + BM25（关键词精确匹配）
 *
 * 向量检索复用现有 rag-service.ts 的 IVectorStoreService/IEmbeddingService 抽象。
 * 未注入向量服务时，自动降级为 BM25 + 实体图两路。
 */

import { SceneChunker } from './SceneChunker';
import type { SceneChunk, ChunkOptions } from './SceneChunker';
import { BM25Index } from './BM25';
import { EntityGraph } from './EntityGraph';
import type { IVectorStoreService, IEmbeddingService, VectorEntry, SimilarityResult } from '../writing/rag-service';
import type { StateSnapshot } from '../state/types';

// ============================================================
// 类型
// ============================================================

export interface RetrievedFragment {
  /** 切片 ID */
  chunkId: string;
  /** 来源章节号 */
  chapter: number;
  /** 切片文本 */
  text: string;
  /** 综合分数（0-1，归一化后） */
  score: number;
  /** 各路检索的原始分数 */
  scores: {
    vector?: number;
    bm25?: number;
    entity?: number;
  };
  /** 来源标签 */
  source?: string;
}

export interface RetrievalQuery {
  /** 查询文本（用于向量 + BM25） */
  query: string;
  /** 涉及的实体名/ID（用于实体图） */
  entities?: string[];
  /** 当前章节号（排除当前章及以后） */
  currentChapter: number;
  /** 章节范围限制 */
  chapterRange?: [number, number];
}

export interface RetrievalOptions {
  /** 返回的 Top-K */
  topK?: number;
  /** 是否启用向量检索 */
  enableVector?: boolean;
  /** 是否启用 BM25 */
  enableBM25?: boolean;
  /** 是否启用实体图 */
  enableEntity?: boolean;
  /** RRF 的 k 参数（默认 60） */
  rrfK?: number;
  /** 切片选项 */
  chunkOptions?: ChunkOptions;
}

const DEFAULT_OPTIONS: Required<RetrievalOptions> = {
  topK: 8,
  enableVector: true,
  enableBM25: true,
  enableEntity: true,
  rrfK: 60,
  chunkOptions: { maxChars: 800, minChars: 100, extractSpeakers: true },
};

// ============================================================
// 混合检索器
// ============================================================

export class HybridRetriever {
  private readonly chunker = new SceneChunker();
  private readonly bm25 = new BM25Index();
  private readonly entityGraph = new EntityGraph();

  /** 切片缓存：chunkId → chunk */
  private readonly chunkStore: Map<string, SceneChunk> = new Map();

  private vectorStore: IVectorStoreService | null = null;
  private embeddingService: IEmbeddingService | null = null;

  /** 注入向量服务（可选）。 */
  setVectorServices(
    vectorStore: IVectorStoreService | null,
    embeddingService: IEmbeddingService | null,
  ): void {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
  }

  /**
   * 索引一章正文。
   * 切片 → 存入 BM25 + 实体图 + 向量库。
   * @param chapter 章节号
   * @param content 章节正文
   * @param knownEntities 已知实体名列表（建议从快照提取）
   */
  async indexChapter(
    chapter: number,
    content: string,
    knownEntities: string[] = [],
  ): Promise<SceneChunk[]> {
    if (!content || !content.trim()) return [];

    // 1. 切片
    const chunks = this.chunker.chunk(chapter, content, DEFAULT_OPTIONS.chunkOptions);

    // 2. 存入 chunk store
    for (const chunk of chunks) {
      this.chunkStore.set(chunk.id, chunk);
    }

    // 3. BM25
    this.bm25.addAll(chunks.map(c => ({ id: c.id, text: c.text })));

    // 4. 实体图
    for (const chunk of chunks) {
      this.entityGraph.indexChunk(chunk.id, chapter, chunk.text, knownEntities);
    }

    // 5. 向量库
    if (this.vectorStore && this.embeddingService) {
      try {
        const entries: VectorEntry[] = [];
        for (const chunk of chunks) {
          const embedding = await this.embeddingService.generateEmbedding(chunk.text);
          entries.push({
            id: chunk.id,
            chapterId: `chapter_${chapter}`,
            chapterIndex: chapter,
            text: chunk.text,
            embedding,
            metadata: {
              type: 'plot',
              tags: chunk.speakers,
              createdAt: Date.now(),
            },
          });
        }
        await this.vectorStore.addEntries(entries);
      } catch (err) {
        // 向量索引失败不阻断，降级为两路检索
        console.warn('[HybridRetriever] 向量索引失败，降级为 BM25+实体图:', err);
      }
    }

    return chunks;
  }

  /** 注册别名表（从状态快照）。 */
  registerSnapshot(snapshot: StateSnapshot): void {
    this.entityGraph.registerFromSnapshot(snapshot);
  }

  /**
   * 执行混合检索。
   */
  async retrieve(query: RetrievalQuery, options: RetrievalOptions = {}): Promise<RetrievedFragment[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // 限制章节范围：默认排除当前章及以后
    const maxChapter = query.chapterRange?.[1] ?? query.currentChapter - 1;
    const minChapter = query.chapterRange?.[0] ?? 1;

    // 三路并行检索
    const [vectorResults, bm25Results, entityResults] = await Promise.all([
      opts.enableVector && this.vectorStore && this.embeddingService
        ? this.vectorSearch(query.query, opts.topK * 2, minChapter, maxChapter)
        : Promise.resolve([]),
      opts.enableBM25
        ? this.bm25Search(query.query, opts.topK * 2, minChapter, maxChapter)
        : Promise.resolve([]),
      opts.enableEntity && query.entities && query.entities.length > 0
        ? this.entitySearch(query.entities, opts.topK * 2, minChapter, maxChapter)
        : Promise.resolve([]),
    ]);

    // RRF 重排
    const fused = this.reciprocalRankFusion(vectorResults, bm25Results, entityResults, opts.rrfK);

    // 取 Top-K 并构建返回
    const results: RetrievedFragment[] = [];
    for (const { chunkId, score, scores } of fused.slice(0, opts.topK)) {
      const chunk = this.chunkStore.get(chunkId);
      if (!chunk) continue;
      results.push({
        chunkId,
        chapter: chunk.chapter,
        text: chunk.text,
        score,
        scores,
        source: chunk.location ? `场景：${chunk.location}` : undefined,
      });
    }

    return results;
  }

  /** 清空所有索引。 */
  clear(): void {
    this.chunkStore.clear();
    this.bm25.clear();
    this.entityGraph.clear();
  }

  /** 已索引切片数。 */
  size(): number {
    return this.chunkStore.size;
  }

  // ============================================================
  // 三路检索
  // ============================================================

  private async vectorSearch(
    query: string, topK: number, minChapter: number, maxChapter: number,
  ): Promise<Array<{ chunkId: string; score: number }>> {
    if (!this.vectorStore || !this.embeddingService) return [];
    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      const results: SimilarityResult[] = await this.vectorStore.search(queryEmbedding, topK, {
        chapterIndexRange: [minChapter, maxChapter],
      });
      return results.map(r => ({ chunkId: r.entry.id, score: r.score }));
    } catch {
      return [];
    }
  }

  private async bm25Search(
    query: string, topK: number, minChapter: number, maxChapter: number,
  ): Promise<Array<{ chunkId: string; score: number }>> {
    const results = this.bm25.search(query, topK);
    // 按章节范围过滤
    return results
      .map(r => {
        const chunk = this.chunkStore.get(r.id);
        if (!chunk) return null;
        if (chunk.chapter < minChapter || chunk.chapter > maxChapter) return null;
        return { chunkId: r.id, score: r.score };
      })
      .filter((x): x is { chunkId: string; score: number } => x !== null);
  }

  private async entitySearch(
    entities: string[], topK: number, minChapter: number, maxChapter: number,
  ): Promise<Array<{ chunkId: string; score: number }>> {
    const result = this.entityGraph.query(entities, { topKPerEntity: topK });
    return result.chunkIds
      .map(chunkId => {
        const chunk = this.chunkStore.get(chunkId);
        if (!chunk) return null;
        if (chunk.chapter < minChapter || chunk.chapter > maxChapter) return null;
        // 实体命中数作为分数
        const matchedCount = this.entityGraph.query(entities, { topKPerEntity: 100 })
          .chunkIds.filter(id => id === chunkId).length;
        return { chunkId, score: matchedCount };
      })
      .filter((x): x is { chunkId: string; score: number } => x !== null);
  }

  // ============================================================
  // Reciprocal Rank Fusion
  // ============================================================

  private reciprocalRankFusion(
    vectorResults: Array<{ chunkId: string; score: number }>,
    bm25Results: Array<{ chunkId: string; score: number }>,
    entityResults: Array<{ chunkId: string; score: number }>,
    k: number,
  ): Array<{ chunkId: string; score: number; scores: RetrievedFragment['scores'] }> {
    const fusion: Map<string, { score: number; scores: RetrievedFragment['scores'] }> = new Map();

    const addRank = (
      results: Array<{ chunkId: string; score: number }>,
      key: 'vector' | 'bm25' | 'entity',
    ) => {
      // 先按 score 降序
      const sorted = [...results].sort((a, b) => b.score - a.score);
      for (let rank = 0; rank < sorted.length; rank++) {
        const { chunkId, score } = sorted[rank];
        const rrfScore = 1 / (k + rank + 1);
        const existing = fusion.get(chunkId) ?? { score: 0, scores: {} };
        existing.score += rrfScore;
        existing.scores[key] = score;
        fusion.set(chunkId, existing);
      }
    };

    addRank(vectorResults, 'vector');
    addRank(bm25Results, 'bm25');
    addRank(entityResults, 'entity');

    // 归一化到 0-1
    const maxScore = Math.max(...Array.from(fusion.values()).map(v => v.score), 0.0001);
    const result = Array.from(fusion.entries()).map(([chunkId, { score, scores }]) => ({
      chunkId,
      score: score / maxScore,
      scores,
    }));

    return result.sort((a, b) => b.score - a.score);
  }
}
