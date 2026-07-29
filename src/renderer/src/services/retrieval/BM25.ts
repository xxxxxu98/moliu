/**
 * L2 检索层 - BM25 关键词检索
 *
 * 纯 JS 实现的 BM25，无外部依赖。
 * 用于混合检索的"精确匹配"路（专有名词、人名、功法名不漏）。
 */

// ============================================================
// BM25
// ============================================================

export interface BM25Document {
  id: string;
  text: string;
  /** 预提取的 token（可选，不提供则内部提取） */
  tokens?: string[];
}

export interface BM25ScoredDoc {
  id: string;
  score: number;
}

export class BM25Index {
  private k1 = 1.5;
  private b = 0.75;
  private documents: BM25Document[] = [];
  private docTokens: Map<string, string[]> = new Map();
  private docFreq: Map<string, number> = new Map();  // token → 出现在多少文档
  private docLengths: Map<string, number> = new Map();
  private avgDocLength = 0;

  /** 添加文档。 */
  add(doc: BM25Document): void {
    // 相同 ID 代表同一切片的重建，先移除旧统计，避免重写后词频重复累加。
    this.remove(doc.id);
    this.documents.push(doc);
    const tokens = doc.tokens ?? this.tokenize(doc.text);
    this.docTokens.set(doc.id, tokens);
    this.docLengths.set(doc.id, tokens.length);

    // 更新文档频率
    const uniqueTokens = new Set(tokens);
    for (const t of uniqueTokens) {
      this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
    }

    // 更新平均文档长度
    this.recomputeAvgLength();
  }

  /** 批量添加。 */
  addAll(docs: BM25Document[]): void {
    for (const d of docs) this.add(d);
  }

  /** 按 ID 删除文档及其统计。 */
  remove(id: string): boolean {
    const index = this.documents.findIndex(doc => doc.id === id);
    if (index < 0) return false;

    const tokens = this.docTokens.get(id) ?? [];
    for (const token of new Set(tokens)) {
      const nextFrequency = (this.docFreq.get(token) ?? 0) - 1;
      if (nextFrequency > 0) {
        this.docFreq.set(token, nextFrequency);
      } else {
        this.docFreq.delete(token);
      }
    }

    this.documents.splice(index, 1);
    this.docTokens.delete(id);
    this.docLengths.delete(id);
    this.recomputeAvgLength();
    return true;
  }

  /** 搜索。 */
  search(query: string, topK: number = 10): BM25ScoredDoc[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores: BM25ScoredDoc[] = [];
    const N = this.documents.length;

    for (const doc of this.documents) {
      const docTokens = this.docTokens.get(doc.id)!;
      const docLen = this.docLengths.get(doc.id)!;
      let score = 0;

      // 统计查询 token 在文档中的频率
      const termFreq: Map<string, number> = new Map();
      for (const t of docTokens) {
        if (queryTokens.includes(t)) {
          termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
        }
      }

      for (const [term, tf] of termFreq) {
        const df = this.docFreq.get(term) ?? 0;
        // IDF
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        // TF 饱和
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength)));
        score += idf * tfNorm;
      }

      if (score > 0) {
        scores.push({ id: doc.id, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /** 清空索引。 */
  clear(): void {
    this.documents = [];
    this.docTokens.clear();
    this.docFreq.clear();
    this.docLengths.clear();
    this.avgDocLength = 0;
  }

  /** 文档数量。 */
  size(): number {
    return this.documents.length;
  }

  /** 获取文档原文。 */
  getDocument(id: string): BM25Document | undefined {
    return this.documents.find(d => d.id === id);
  }

  // ============================================================
  // 分词
  // ============================================================

  /**
   * 简化分词：中文按字/双字，英文按词。
   * 中文用 bigram（双字）提高召回，单字也保留。
   */
  private tokenize(text: string): string[] {
    const tokens: string[] = [];
    // 提取中文连续段
    const chineseSegments = text.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const seg of chineseSegments) {
      // 单字
      for (const ch of seg) tokens.push(ch);
      // 双字 bigram
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
    }
    // 英文词
    const englishWords = text.match(/[a-zA-Z]+/g) || [];
    tokens.push(...englishWords.map(w => w.toLowerCase()));
    return tokens;
  }

  private recomputeAvgLength(): void {
    if (this.documents.length === 0) {
      this.avgDocLength = 0;
      return;
    }
    const total = Array.from(this.docLengths.values()).reduce((a, b) => a + b, 0);
    this.avgDocLength = total / this.documents.length;
  }
}
