/**
 * RAG（检索增强生成）服务
 * 参考 webnovel-writer 的设计
 * - 向量检索：使用语义相似度检索相关记忆
 * - 上下文增强：为AI生成提供相关背景信息
 *
 * v2.1 增强：可选接入 HybridRetriever（向量+实体图+BM25 三路混合）。
 *   - setHybridRetriever() 注入混合检索器（由 StateDrivenWritingOrchestrator 内部管理）
 *   - searchHybrid() 走三路 + RRF 重排，召回质量显著高于纯向量
 *   - 未注入时回退到原 retrieveContext（向后兼容）
 */

import { getMemoryManager } from './memory-manager';
import type { ChapterMemory } from '@/types/project';
import type { HybridRetriever, RetrievedFragment } from '@/services/retrieval';

// ============================================
// 向量嵌入接口
// ============================================

/**
 * 文本嵌入请求
 */
export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

/**
 * 文本嵌入结果
 */
export interface EmbeddingResult {
  embedding: number[];
  index: number;
  text: string;
}

/**
 * 嵌入向量存储
 */
export interface VectorEntry {
  id: string;
  chapterId: string;
  chapterIndex: number;
  text: string;
  embedding: number[];
  metadata: {
    type: 'character' | 'plot' | 'foreshadow' | 'world' | 'dialogue';
    tags: string[];
    createdAt: number;
  };
}

/**
 * 相似度搜索结果
 */
export interface SimilarityResult {
  entry: VectorEntry;
  score: number;
}

/**
 * RAG 检索上下文
 */
export interface RAGContext {
  relevantMemories: ChapterMemory[];
  relevantVectors: SimilarityResult[];
  generatedPrompt: string;
}

// ============================================
// 向量检索服务接口
// ============================================

/**
 * 向量检索服务
 * 定义向量存储和检索的接口
 */
export interface IVectorStoreService {
  /**
   * 初始化向量存储
   */
  initialize(): Promise<void>;

  /**
   * 添加向量条目
   */
  addEntry(entry: VectorEntry): Promise<void>;

  /**
   * 批量添加向量条目
   */
  addEntries(entries: VectorEntry[]): Promise<void>;

  /**
   * 删除向量条目
   */
  deleteEntry(id: string): Promise<void>;

  /**
   * 搜索相似向量
   * @param queryEmbedding 查询向量
   * @param topK 返回数量
   * @param filterFilters 过滤条件
   */
  search(
    queryEmbedding: number[],
    topK: number,
    filter?: {
      chapterId?: string;
      chapterIndexRange?: [number, number];
      type?: VectorEntry['metadata']['type'];
      tags?: string[];
    }
  ): Promise<SimilarityResult[]>;

  /**
   * 获取指定章节的所有向量
   */
  getChapterVectors(chapterId: string): Promise<VectorEntry[]>;

  /**
   * 清除所有向量
   */
  clear(): Promise<void>;
}

/**
 * 嵌入生成服务接口
 */
export interface IEmbeddingService {
  /**
   * 生成文本嵌入
   */
  generateEmbedding(text: string, model?: string): Promise<number[]>;

  /**
   * 批量生成嵌入
   */
  generateEmbeddings(texts: string[], model?: string): Promise<number[][]>;
}

// ============================================
// RAG 服务类
// ============================================

/**
 * RAG 服务
 * 提供检索增强生成功能
 */
export class RAGService {
  private vectorStore: IVectorStoreService | null = null;
  private embeddingService: IEmbeddingService | null = null;
  private isInitialized = false;
  // v2.1: 可选混合检索器
  private hybridRetriever: HybridRetriever | null = null;

  /**
   * v2.1: 注入混合检索器
   */
  setHybridRetriever(retriever: HybridRetriever | null): void {
    this.hybridRetriever = retriever;
  }

  /**
   * v2.1: 是否启用了混合检索
   */
  isHybridEnabled(): boolean {
    return this.hybridRetriever !== null;
  }

  /**
   * 初始化 RAG 服务
   */
  async initialize(vectorStore: IVectorStoreService, embeddingService: IEmbeddingService): Promise<void> {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    await this.vectorStore.initialize();
    this.isInitialized = true;
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.vectorStore !== null && this.embeddingService !== null;
  }

  /**
   * 为章节生成嵌入向量
   */
  async indexChapterMemory(memory: ChapterMemory): Promise<void> {
    if (!this.vectorStore || !this.embeddingService) {
      throw new Error('RAG 服务未初始化');
    }

    const entries: VectorEntry[] = [];

    // 1. 角色状态变化
    for (const change of memory.characterStateChanges) {
      const text = `角色状态变化：${change.characterName} - ${change.stateType} - ${change.state} - ${change.detail}`;
      const embedding = await this.embeddingService.generateEmbedding(text);
      entries.push({
        id: `${memory.chapterId}-character-${change.characterName}`,
        chapterId: memory.chapterId,
        chapterIndex: memory.chapterIndex,
        text,
        embedding,
        metadata: {
          type: 'character',
          tags: [change.stateType, change.characterName],
          createdAt: Date.now(),
        },
      });
    }

    // 2. 核心情节
    if (memory.corePlot) {
      const text = `核心情节：${memory.corePlot}`;
      const embedding = await this.embeddingService.generateEmbedding(text);
      entries.push({
        id: `${memory.chapterId}-plot`,
        chapterId: memory.chapterId,
        chapterIndex: memory.chapterIndex,
        text,
        embedding,
        metadata: {
          type: 'plot',
          tags: ['corePlot'],
          createdAt: Date.now(),
        },
      });
    }

    // 3. 伏笔
    for (let i = 0; i < memory.newForeshadows.length; i++) {
      const foreshadow = memory.newForeshadows[i];
      const text = `伏笔：${foreshadow}`;
      const embedding = await this.embeddingService.generateEmbedding(text);
      entries.push({
        id: `${memory.chapterId}-foreshadow-${i}`,
        chapterId: memory.chapterId,
        chapterIndex: memory.chapterIndex,
        text,
        embedding,
        metadata: {
          type: 'foreshadow',
          tags: ['newForeshadow'],
          createdAt: Date.now(),
        },
      });
    }

    // 4. 关键事件
    for (let i = 0; i < memory.keyEvents.length; i++) {
      const event = memory.keyEvents[i];
      const text = `关键事件：${event}`;
      const embedding = await this.embeddingService.generateEmbedding(text);
      entries.push({
        id: `${memory.chapterId}-event-${i}`,
        chapterId: memory.chapterId,
        chapterIndex: memory.chapterIndex,
        text,
        embedding,
        metadata: {
          type: 'plot',
          tags: ['keyEvent'],
          createdAt: Date.now(),
        },
      });
    }

    // 5. 世界观信息
    for (let i = 0; i < memory.worldBuildingInfo.length; i++) {
      const info = memory.worldBuildingInfo[i];
      const text = `世界观：${info}`;
      const embedding = await this.embeddingService.generateEmbedding(text);
      entries.push({
        id: `${memory.chapterId}-world-${i}`,
        chapterId: memory.chapterId,
        chapterIndex: memory.chapterIndex,
        text,
        embedding,
        metadata: {
          type: 'world',
          tags: ['worldBuilding'],
          createdAt: Date.now(),
        },
      });
    }

    // 批量添加
    await this.vectorStore.addEntries(entries);
  }

  /**
   * 检索相关上下文
   */
  async retrieveContext(
    query: string,
    options?: {
      topK?: number;
      chapterId?: string;
      chapterIndexRange?: [number, number];
      type?: VectorEntry['metadata']['type'];
      includeMemories?: boolean;
    }
  ): Promise<RAGContext> {
    if (!this.vectorStore || !this.embeddingService) {
      throw new Error('RAG 服务未初始化');
    }

    const topK = options?.topK || 5;

    // 生成查询向量
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // 搜索相似向量
    const results = await this.vectorStore.search(queryEmbedding, topK, {
      chapterId: options?.chapterId,
      chapterIndexRange: options?.chapterIndexRange,
      type: options?.type,
    });

    // 如果需要包含记忆，获取完整的 ChapterMemory
    let relevantMemories: ChapterMemory[] = [];
    if (options?.includeMemories !== false) {
      const memoryManager = getMemoryManager();
      const chapterIds = [...new Set(results.map(r => r.entry.chapterId))];
      for (const chapterId of chapterIds) {
        const memory = await memoryManager.getMemory(chapterId);
        if (memory) {
          relevantMemories.push(memory);
        }
      }
    }

    // 生成提示词
    const generatedPrompt = this.generatePromptFromResults(query, results, relevantMemories);

    return {
      relevantMemories,
      relevantVectors: results,
      generatedPrompt,
    };
  }

  /**
   * 从搜索结果生成增强提示词
   */
  private generatePromptFromResults(
    query: string,
    results: SimilarityResult[],
    memories: ChapterMemory[]
  ): string {
    if (results.length === 0) {
      return '';
    }

    const sections: string[] = ['## 相关背景信息', ''];

    // 按类型分组
    const byType = new Map<string, SimilarityResult[]>();
    for (const result of results) {
      const type = result.entry.metadata.type;
      if (!byType.has(type)) {
        byType.set(type, []);
      }
      byType.get(type)!.push(result);
    }

    // 生成各类型摘要
    for (const [type, typeResults] of byType) {
      sections.push(`### ${this.getTypeName(type)}`);
      for (const result of typeResults) {
        const relevanceNote = result.score > 0.9 ? '（高度相关）' : result.score > 0.7 ? '（相关）' : '';
        sections.push(`- ${result.entry.text}${relevanceNote}`);
      }
      sections.push('');
    }

    // 来自章节摘要
    if (memories.length > 0) {
      sections.push('### 相关章节');
      for (const memory of memories.slice(0, 3)) {
        sections.push(`**第${memory.chapterIndex + 1}章 · ${memory.chapterTitle}**`);
        sections.push(`> ${memory.corePlot.slice(0, 200)}...`);
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * 获取类型名称
   */
  private getTypeName(type: VectorEntry['metadata']['type']): string {
    const names: Record<string, string> = {
      character: '角色信息',
      plot: '情节信息',
      foreshadow: '伏笔信息',
      world: '世界观信息',
      dialogue: '对话信息',
    };
    return names[type] || type;
  }

  /**
   * v2.1: 混合检索（向量 + 实体图 + BM25 + RRF 重排）
   *
   * 替代 retrieveContext 的更高质量版本。
   * 若未注入 hybridRetriever，回退到原 retrieveContext。
   */
  async searchHybrid(
    query: string,
    options?: {
      topK?: number;
      currentChapter?: number;
      entities?: string[];
    }
  ): Promise<RetrievedFragment[]> {
    if (this.hybridRetriever) {
      return await this.hybridRetriever.retrieve(
        {
          query,
          entities: options?.entities,
          currentChapter: options?.currentChapter ?? 9999,
        },
        { topK: options?.topK ?? 8 },
      );
    }
    // 降级：调用老 retrieveContext 并把 VectorEntry[] 转成 RetrievedFragment
    const ctx = await this.retrieveContext(query, { topK: options?.topK });
    return ctx.relevantVectors.map(r => ({
      chunkId: r.entry.id,
      chapter: r.entry.chapterIndex,
      text: r.entry.text,
      score: r.score,
      scores: { vector: r.score },
    }));
  }

  /**
   * 清除章节的向量索引
   */
  async clearChapterVectors(chapterId: string): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('RAG 服务未初始化');
    }

    const entries = await this.vectorStore.getChapterVectors(chapterId);
    for (const entry of entries) {
      await this.vectorStore.deleteEntry(entry.id);
    }
  }
}

// ============================================
// 简单向量存储实现（内存版本）
// ============================================

/**
 * 简单的内存向量存储实现
 * 用于开发和测试
 * 生产环境应使用专门的向量数据库（如 Milvus、Pinecone 等）
 */
export class InMemoryVectorStore implements IVectorStoreService {
  private vectors: VectorEntry[] = [];

  async initialize(): Promise<void> {
    this.vectors = [];
  }

  async addEntry(entry: VectorEntry): Promise<void> {
    this.vectors.push(entry);
  }

  async addEntries(entries: VectorEntry[]): Promise<void> {
    this.vectors.push(...entries);
  }

  async deleteEntry(id: string): Promise<void> {
    this.vectors = this.vectors.filter(v => v.id !== id);
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    filter?: {
      chapterId?: string;
      chapterIndexRange?: [number, number];
      type?: VectorEntry['metadata']['type'];
      tags?: string[];
    }
  ): Promise<SimilarityResult[]> {
    let candidates = this.vectors;

    // 应用过滤
    if (filter) {
      if (filter.chapterId) {
        candidates = candidates.filter(v => v.chapterId === filter.chapterId);
      }
      if (filter.chapterIndexRange) {
        const [min, max] = filter.chapterIndexRange;
        candidates = candidates.filter(v => v.chapterIndex >= min && v.chapterIndex <= max);
      }
      if (filter.type) {
        candidates = candidates.filter(v => v.metadata.type === filter.type);
      }
      if (filter.tags && filter.tags.length > 0) {
        candidates = candidates.filter(v =>
          filter.tags!.some(tag => v.metadata.tags.includes(tag))
        );
      }
    }

    // 计算余弦相似度
    const scored = candidates.map(entry => ({
      entry,
      score: this.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    // 排序并返回 topK
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async getChapterVectors(chapterId: string): Promise<VectorEntry[]> {
    return this.vectors.filter(v => v.chapterId === chapterId);
  }

  async clear(): Promise<void> {
    this.vectors = [];
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// ============================================
// 简单嵌入服务实现（使用 TF-IDF 模拟）
// ============================================

/**
 * 简单的 TF-IDF 向量化实现
 * 用于开发和测试
 * 生产环境应使用专门的嵌入模型（如 OpenAI text-embedding-ada-002）
 */
export class SimpleEmbeddingService implements IEmbeddingService {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private documents: string[][] = [];
  private dimension = 384; // 固定维度

  async generateEmbedding(text: string): Promise<number[]> {
    // 简单分词
    const words = this.tokenize(text);
    
    // 计算 TF
    const tf = new Map<string, number>();
    for (const word of words) {
      tf.set(word, (tf.get(word) || 0) + 1);
    }
    for (const [word, count] of tf) {
      tf.set(word, count / words.length);
    }

    // 生成固定维度向量（使用哈希模拟嵌入）
    const embedding = new Array(this.dimension).fill(0);
    let index = 0;
    for (const word of words.slice(0, this.dimension)) {
      const hash = this.hashString(word);
      embedding[index % this.dimension] += (tf.get(word) || 0) * (hash % 100) / 100;
      index++;
    }

    // L2 归一化
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.generateEmbedding(text)));
  }

  /**
   * 简单分词
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1);
  }

  /**
   * 字符串哈希
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

// ============================================
// 单例导出
// ============================================

let ragService: RAGService | null = null;

/**
 * 获取 RAG 服务单例
 */
export function getRAGService(): RAGService {
  if (!ragService) {
    ragService = new RAGService();
  }
  return ragService;
}

/**
 * 初始化 RAG 服务
 */
export async function initializeRAGService(): Promise<RAGService> {
  const service = getRAGService();
  const vectorStore = new InMemoryVectorStore();
  const embeddingService = new SimpleEmbeddingService();
  await service.initialize(vectorStore, embeddingService);
  return service;
}
