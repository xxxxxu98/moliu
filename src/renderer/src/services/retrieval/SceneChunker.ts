/**
 * L2 检索层 - 场景切片器
 *
 * 把章节正文切成"场景级"片段（一次地点变换/一次对话回合）。
 * 一个 3000 字章节能切成 5-8 个场景，每个自包含，
 * 召回粒度精细，token 利用率高。
 *
 * 切片策略（按优先级）：
 * 1. 显式场景标记：`【场景】`、`---` 分隔
 * 2. 地点/时间词变化："此时在..."、"片刻后..."
 * 3. 段落聚类：连续的对话回合归为一个场景
 * 4. 长度兜底：超过 maxChars 强制切
 */

// ============================================================
// 类型
// ============================================================

export interface SceneChunk {
  /** 切片 ID */
  id: string;
  /** 来源章节号 */
  chapter: number;
  /** 切片序号（章内） */
  index: number;
  /** 切片文本 */
  text: string;
  /** 字数 */
  wordCount: number;
  /** 推断的场景地点（若能识别） */
  location?: string;
  /** 推断的参与角色（从对话提取） */
  speakers: string[];
  /** 切片依据 */
  splitReason: 'explicit_marker' | 'location_change' | 'time_change' | 'dialogue_cluster' | 'length_limit';
}

export interface ChunkOptions {
  /** 单个切片最大字符数（默认 800） */
  maxChars?: number;
  /** 单个切片最小字符数（默认 100，低于则合并到上一片） */
  minChars?: number;
  /** 是否提取角色名 */
  extractSpeakers?: boolean;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxChars: 800,
  minChars: 40,  // 网文段落常很短，过小阈值避免把多场景合并成一片
  extractSpeakers: true,
};

// ============================================================
// 切片器
// ============================================================

export class SceneChunker {
  /**
   * 把章节正文切成场景切片。
   */
  chunk(chapter: number, content: string, options: ChunkOptions = {}): SceneChunk[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    if (!content || !content.trim()) return [];

    // 1. 先按显式标记/空行分段
    //    注意：显式标记是"强切片信号"，标记之间的内容不应被合并。
    const explicitMarkerCount = (content.match(/(?:^|\n)\s*(?:【场景[^】]*】|---+)\s*\n?/gm) || []).length;
    const rawSegments = this.splitIntoSegments(content);
    const hasExplicitMarkers = explicitMarkerCount > 0;

    // 2. 合并过短段、拆分过长段
    //    显式标记切出来的段不合并（用户用标记就是要分场景）；
    //    段落数 > 1 时也尽量保留段落边界（避免把多场景合并成一片）。
    const adjusted = this.adjustSegmentSizes(rawSegments, opts, hasExplicitMarkers);

    // 3. 为每段推断元数据并构建 SceneChunk
    const chunks: SceneChunk[] = [];
    adjusted.forEach((segment, i) => {
      const location = this.detectLocation(segment);
      const speakers = opts.extractSpeakers ? this.extractSpeakers(segment) : [];
      chunks.push({
        id: `ch${chapter}_s${i}`,
        chapter,
        index: i,
        text: segment.trim(),
        wordCount: countWords(segment),
        location: location ?? undefined,
        speakers,
        splitReason: 'dialogue_cluster',
      });
    });

    return chunks;
  }

  // ============================================================
  // 分段
  // ============================================================

  private splitIntoSegments(content: string): string[] {
    // 检测是否有显式场景标记
    const hasExplicitMarker = /(?:^|\n)\s*(?:【场景[^】]*】|---+)\s*\n?/m.test(content);

    if (hasExplicitMarker) {
      // 按显式标记切，每段内部再按空行细分
      const explicitParts = content.split(/(?:^|\n)\s*(?:【场景[^】]*】|---+)\s*\n?/m);
      const segments: string[] = [];
      for (const part of explicitParts) {
        if (!part.trim()) continue;
        const subParts = part.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        for (const sub of subParts) segments.push(sub);
      }
      return segments;
    }

    // 无显式标记：按空行优先切，空行无效时按单换行切
    let parts = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1 && /\n/.test(content.trim())) {
      parts = content.split(/\n/).map(p => p.trim()).filter(Boolean);
    }
    return parts;
  }

  /** 拆分过长段（不合并过短段——短段作为独立片保留，提高检索粒度）。 */
  private adjustSegmentSizes(
    segments: string[],
    opts: Required<ChunkOptions>,
    _preserveBoundaries: boolean,
  ): string[] {
    const result: string[] = [];

    for (const seg of segments) {
      if (seg.length <= opts.maxChars) {
        // 不过长：直接作为独立片（即使很短也保留，便于精确检索）
        result.push(seg);
        continue;
      }

      // 过长：按句子拆分
      const sentences = this.splitBySentence(seg);
      let current = '';
      for (const sentence of sentences) {
        if ((current + sentence).length > opts.maxChars && current) {
          result.push(current);
          current = sentence;
        } else {
          current += sentence;
        }
      }
      if (current) result.push(current);
    }

    return result;
  }

  private splitBySentence(text: string): string[] {
    // 中文句号、问号、感叹号、省略号
    const sentences = text.split(/(?<=[。！？…])\s*/);
    return sentences.filter(s => s.trim());
  }

  // ============================================================
  // 元数据推断
  // ============================================================

  private detectLocation(text: string): string | null {
    // 简化：匹配"在XXX"、"来到XXX"、"XXX里/中"等模式
    const patterns = [
      /(?:在|来到|回到|离开|进入)([\u4e00-\u9fa5]{2,8})(?:里|中|内|前|后|时)/,
      /(?:位于|身处)([\u4e00-\u9fa5]{2,8})/,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1]) return m[1];
    }
    return null;
  }

  private extractSpeakers(text: string): string[] {
    const speakers = new Set<string>();
    // 匹配"XX说道/笑道"等。关键：动词词组必须是双字（说道/笑道），不能是单字"道"，
    // 否则贪婪量词 {2,3} 会把人名末字当动词吃掉（"林动说"+"道"）。
    // 用非贪婪 {2,3}? + 明确双字动词，保证捕获组只取人名。
    const verbs = '说道|笑道|喊道|叫道|问道|答道|怒道|冷笑|沉声|低声|轻笑|大笑|冷哼';
    const pattern = new RegExp(`([\\u4e00-\\u9fa5]{2,3}?)((?:${verbs})[：:！？])`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      speakers.add(match[1]);
    }
    return Array.from(speakers);
  }
}

// ============================================================
// 辅助
// ============================================================

function countWords(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}
