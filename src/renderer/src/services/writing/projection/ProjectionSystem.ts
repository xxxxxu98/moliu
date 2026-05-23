/**
 * 投影系统
 * 参考 webnovel-writer 的五级投影设计
 * 
 * 投影层级：
 * 1. State Projection - 状态投影（角色状态、世界状态）
 * 2. Index Projection - 索引投影（实体索引）
 * 3. Summary Projection - 摘要投影（章节摘要）
 * 4. Memory Projection - 记忆投影（情节记忆）
 * 5. Vector Projection - 向量投影（RAG 向量）
 */

import { ref, computed } from 'vue';
import type { ChapterMemory } from '@/types/project';

// ============================================================
// 类型定义
// ============================================================

/**
 * 投影系统配置
 */
export interface ProjectionConfig {
  /** 是否启用状态投影 */
  enableStateProjection: boolean;
  /** 是否启用索引投影 */
  enableIndexProjection: boolean;
  /** 是否启用摘要投影 */
  enableSummaryProjection: boolean;
  /** 是否启用记忆投影 */
  enableMemoryProjection: boolean;
  /** 是否启用向量投影 */
  enableVectorProjection: boolean;
  
  /** 状态投影配置 */
  stateProjection?: {
    maxHistoryLength: number;
  };
  
  /** 摘要投影配置 */
  summaryProjection?: {
    maxChapterSummaryLength: number;
    maxRecentChapters: number;
  };
  
  /** 记忆投影配置 */
  memoryProjection?: {
    extractionThreshold: number;
    enableAIEnhancement: boolean;
  };
  
  /** 向量投影配置 */
  vectorProjection?: {
    model: string;
    dimension: number;
    topK: number;
  };
}

/**
 * 投影结果
 */
export interface ProjectionResult {
  /** 状态投影 */
  state?: StateProjection;
  /** 索引投影 */
  index?: IndexProjection;
  /** 摘要投影 */
  summary?: SummaryProjection;
  /** 记忆投影 */
  memory?: MemoryProjection;
  /** 向量投影 */
  vector?: VectorProjection;
}

// ============================================================
// 1. 状态投影
// ============================================================

/**
 * 角色状态
 */
export interface CharacterState {
  id: string;
  name: string;
  state: string;
  emotion: string;
  location: string;
  relationships: Array<{
    targetId: string;
    targetName: string;
    type: string;
    status: string;
  }>;
  appearance?: string;
  speechStyle?: string;
}

/**
 * 世界状态
 */
export interface WorldState {
  id: string;
  type: 'location' | 'faction' | 'item' | 'rule' | 'event';
  name: string;
  state: string;
  changes: string[];
  lastMentionedChapter?: number;
}

/**
 * 时间线事件
 */
export interface TimelineEvent {
  chapter: number;
  time: string;
  description: string;
  importance: 'critical' | 'major' | 'minor';
}

/**
 * 状态投影
 */
export interface StateProjection {
  characterStates: CharacterState[];
  worldStates: WorldState[];
  timeline: TimelineEvent[];
  lastUpdatedChapter: number;
}

// ============================================================
// 2. 索引投影
// ============================================================

/**
 * 角色索引条目
 */
export interface CharacterIndexEntry {
  id: string;
  name: string;
  aliases: string[];
  chapters: number[];
  firstAppearance: number;
  lastAppearance: number;
  appearanceCount: number;
}

/**
 * 物品索引条目
 */
export interface ItemIndexEntry {
  id: string;
  name: string;
  aliases: string[];
  owner?: string;
  location?: string;
  chapters: number[];
  description: string;
}

/**
 * 地点索引条目
 */
export interface LocationIndexEntry {
  id: string;
  name: string;
  aliases: string[];
  characters: string[];
  events: string[];
  chapters: number[];
}

/**
 * 索引投影
 */
export interface IndexProjection {
  characterIndex: Map<string, CharacterIndexEntry>;
  itemIndex: Map<string, ItemIndexEntry>;
  locationIndex: Map<string, LocationIndexEntry>;
  lastUpdatedChapter: number;
}

// ============================================================
// 3. 摘要投影
// ============================================================

/**
 * 章节摘要
 */
export interface ChapterSummary {
  /** 300字摘要 */
  summary: string;
  /** 核心情节 */
  corePlot: string;
  /** 关键事件 */
  keyEvents: string[];
  /** 角色变化 */
  characterChanges: string[];
  /** 情节推进 */
  plotAdvances: string[];
  /** 出场角色 */
  charactersAppeared: string[];
  /** 涉及地点 */
  locationsVisited: string[];
  /** 伏笔埋设 */
  foreshadowsPlanted: string[];
  /** 伏笔回收 */
  foreshadowsResolved: string[];
  /** 章尾状态 */
  endingState: string;
  /** 下一章预告 */
  nextChapterHint?: string;
}

/**
 * 卷摘要
 */
export interface VolumeSummary {
  volumeId: string;
  volumeName: string;
  summary: string;
  chapterRange: [number, number];
  mainPlotThreads: string[];
  coreConflicts: string[];
  characterArcs: string[];
}

/**
 * 摘要投影
 */
export interface SummaryProjection {
  chapterSummaries: Map<number, ChapterSummary>;
  volumeSummaries: Map<string, VolumeSummary>;
  lastUpdatedChapter: number;
}

// ============================================================
// 4. 记忆投影
// ============================================================

/**
 * 记忆类型
 */
export type MemoryType = 'event' | 'revelation' | 'character_change' | 'world_change' | 'relationship_change' | 'item_obtained' | 'location_discovered';

/**
 * 情节记忆
 */
export interface PlotMemory {
  id: string;
  content: string;
  type: MemoryType;
  importance: 'critical' | 'major' | 'minor';
  relatedChapters: number[];
  relatedCharacters: string[];
  relatedLocations: string[];
  tags: string[];
  createdAt: string;
}

/**
 * 关系记忆
 */
export interface RelationshipMemory {
  character1: string;
  character2: string;
  relationshipType: string;
  history: Array<{
    chapter: number;
    event: string;
    outcome: string;
  }>;
}

/**
 * 记忆投影
 */
export interface MemoryProjection {
  plotMemories: PlotMemory[];
  relationshipMemories: RelationshipMemory[];
  unresolvedForeshadows: Array<{
    content: string;
    plantedChapter: number;
    expectedPayoff: number;
  }>;
  lastUpdatedChapter: number;
}

// ============================================================
// 5. 向量投影
// ============================================================

/**
 * 段落向量
 */
export interface ParagraphVector {
  id: string;
  chapter: number;
  paragraphIndex: number;
  startPosition: number;
  endPosition: number;
  content: string;
  vector: number[];
  metadata: {
    characters: string[];
    locations: string[];
    hasDialogue: boolean;
    emotion: string;
  };
}

/**
 * 角色向量
 */
export interface CharacterVector {
  characterId: string;
  characterName: string;
  description: string;
  vector: number[];
}

/**
 * 向量投影
 */
export interface VectorProjection {
  paragraphVectors: ParagraphVector[];
  characterVectors: Map<string, CharacterVector>;
  lastUpdatedChapter: number;
}

// ============================================================
// 检索结果
// ============================================================

/**
 * 检索结果
 */
export interface RetrievedContext {
  chapter: number;
  paragraphIndex: number;
  content: string;
  similarity: number;
  metadata: {
    characters: string[];
    locations: string[];
  };
}

// ============================================================
// 投影系统
// ============================================================

export class ProjectionSystem {
  private config: ProjectionConfig;
  
  // 投影存储
  private stateProjection: StateProjection = {
    characterStates: [],
    worldStates: [],
    timeline: [],
    lastUpdatedChapter: 0,
  };
  
  private indexProjection: IndexProjection = {
    characterIndex: new Map(),
    itemIndex: new Map(),
    locationIndex: new Map(),
    lastUpdatedChapter: 0,
  };
  
  private summaryProjection: SummaryProjection = {
    chapterSummaries: new Map(),
    volumeSummaries: new Map(),
    lastUpdatedChapter: 0,
  };
  
  private memoryProjection: MemoryProjection = {
    plotMemories: [],
    relationshipMemories: [],
    unresolvedForeshadows: [],
    lastUpdatedChapter: 0,
  };
  
  private vectorProjection: VectorProjection = {
    paragraphVectors: [],
    characterVectors: new Map(),
    lastUpdatedChapter: 0,
  };

  constructor(config: Partial<ProjectionConfig> = {}) {
    this.config = {
      enableStateProjection: true,
      enableIndexProjection: true,
      enableSummaryProjection: true,
      enableMemoryProjection: true,
      enableVectorProjection: true,
      ...config,
    };
  }

  /**
   * 执行完整投影
   */
  async project(
    chapterNumber: number,
    content: string,
    options?: {
      aiEnhance?: boolean;
      generateVectors?: boolean;
    }
  ): Promise<ProjectionResult> {
    const results: ProjectionResult = {};
    
    // 1. 状态投影
    if (this.config.enableStateProjection) {
      results.state = await this.projectState(chapterNumber, content);
    }
    
    // 2. 索引投影
    if (this.config.enableIndexProjection) {
      results.index = await this.projectIndex(chapterNumber, content);
    }
    
    // 3. 摘要投影
    if (this.config.enableSummaryProjection) {
      results.summary = await this.projectSummary(chapterNumber, content);
    }
    
    // 4. 记忆投影
    if (this.config.enableMemoryProjection) {
      results.memory = await this.projectMemory(chapterNumber, content);
    }
    
    // 5. 向量投影
    if (this.config.enableVectorProjection && options?.generateVectors) {
      results.vector = await this.projectVector(chapterNumber, content);
    }
    
    return results;
  }

  /**
   * 状态投影
   */
  private async projectState(chapterNumber: number, content: string): Promise<StateProjection> {
    // 提取角色状态
    const characterStates = this.extractCharacterStates(content);
    
    // 提取世界状态
    const worldStates = this.extractWorldStates(content);
    
    // 更新时间线
    const timeline = this.updateTimeline(chapterNumber, content);
    
    return {
      characterStates,
      worldStates,
      timeline,
      lastUpdatedChapter: chapterNumber,
    };
  }

  /**
   * 提取角色状态
   */
  private extractCharacterStates(content: string): CharacterState[] {
    const states: CharacterState[] = [];
    
    // 简化实现：基于关键词提取
    // 实际应该调用 AI 分析
    
    // 匹配角色状态描述
    const statePatterns = [
      /(?:他|她|主角|[\u4e00-\u9fa5]{2,4})(?:看起来|显得|感觉|仿佛)(?:很?|像是)([\u4e00-\u9fa5]+)/g,
      /(?:他|她)的([\u4e00-\u9fa5]+)([\u4e00-\u9fa5]{0,4})(?:地|地)(?:说|道|问|喊|笑|哭|怒|道)/g,
    ];
    
    // 匹配对话中的情绪
    const emotionPatterns = [
      /[："]([^"]+)[""'].*?[?！？!]/g,  // 疑问句
      /[："]([^"]+)[""'].*?[!！]/g,    // 感叹句
    ];
    
    // 简化实现：返回空数组
    // 实际应该调用 AI 提取
    return states;
  }

  /**
   * 提取世界状态
   */
  private extractWorldStates(content: string): WorldState[] {
    const states: WorldState[] = [];
    
    // 简化实现
    return states;
  }

  /**
   * 更新时间线
   */
  private updateTimeline(chapterNumber: number, content: string): TimelineEvent[] {
    const events: TimelineEvent[] = [];
    
    // 匹配时间描述
    const timePatterns = [
      /([一二三四五六七八九十百千万\d]+)(?:天|日|月|年|分钟后|小时后|秒后)/g,
      /(?:翌日|次日|当天|当天晚上|第二天下午)/g,
    ];
    
    // 简化实现：返回空数组
    // 实际应该调用 AI 提取
    return events;
  }

  /**
   * 索引投影
   */
  private async projectIndex(chapterNumber: number, content: string): Promise<IndexProjection> {
    // 实体识别
    const entities = await this.extractEntities(content);
    
    // 更新角色索引
    for (const char of entities.characters) {
      this.updateCharacterIndex(char, chapterNumber);
    }
    
    // 更新物品索引
    for (const item of entities.items) {
      this.updateItemIndex(item, chapterNumber);
    }
    
    // 更新地点索引
    for (const location of entities.locations) {
      this.updateLocationIndex(location, chapterNumber);
    }
    
    return {
      characterIndex: this.indexProjection.characterIndex,
      itemIndex: this.indexProjection.itemIndex,
      locationIndex: this.indexProjection.locationIndex,
      lastUpdatedChapter: chapterNumber,
    };
  }

  /**
   * 提取实体
   */
  private async extractEntities(content: string): Promise<{
    characters: Array<{ id: string; name: string; aliases: string[] }>;
    items: Array<{ id: string; name: string; aliases: string[]; owner?: string }>;
    locations: Array<{ id: string; name: string; aliases: string[] }>;
  }> {
    // 简化实现
    // 实际应该调用 NLP 或 AI 提取
    
    return {
      characters: [],
      items: [],
      locations: [],
    };
  }

  /**
   * 更新角色索引
   */
  private updateCharacterIndex(
    char: { id: string; name: string; aliases: string[] },
    chapter: number
  ): void {
    const existing = this.indexProjection.characterIndex.get(char.id);
    
    if (existing) {
      existing.chapters.push(chapter);
      existing.lastAppearance = chapter;
      existing.appearanceCount++;
      // 合并别名
      for (const alias of char.aliases) {
        if (!existing.aliases.includes(alias)) {
          existing.aliases.push(alias);
        }
      }
    } else {
      this.indexProjection.characterIndex.set(char.id, {
        id: char.id,
        name: char.name,
        aliases: char.aliases,
        chapters: [chapter],
        firstAppearance: chapter,
        lastAppearance: chapter,
        appearanceCount: 1,
      });
    }
  }

  /**
   * 更新物品索引
   */
  private updateItemIndex(
    item: { id: string; name: string; aliases: string[]; owner?: string },
    chapter: number
  ): void {
    const existing = this.indexProjection.itemIndex.get(item.id);
    
    if (existing) {
      existing.chapters.push(chapter);
      if (item.owner) existing.owner = item.owner;
    } else {
      this.indexProjection.itemIndex.set(item.id, {
        id: item.id,
        name: item.name,
        aliases: item.aliases,
        owner: item.owner,
        chapters: [chapter],
        description: '',
      });
    }
  }

  /**
   * 更新地点索引
   */
  private updateLocationIndex(
    location: { id: string; name: string; aliases: string[] },
    chapter: number
  ): void {
    const existing = this.indexProjection.locationIndex.get(location.id);
    
    if (existing) {
      existing.chapters.push(chapter);
    } else {
      this.indexProjection.locationIndex.set(location.id, {
        id: location.id,
        name: location.name,
        aliases: location.aliases,
        characters: [],
        events: [],
        chapters: [chapter],
      });
    }
  }

  /**
   * 摘要投影
   */
  private async projectSummary(chapterNumber: number, content: string): Promise<SummaryProjection> {
    const summary = await this.generateChapterSummary(chapterNumber, content);
    
    this.summaryProjection.chapterSummaries.set(chapterNumber, summary);
    
    return {
      chapterSummaries: this.summaryProjection.chapterSummaries,
      volumeSummaries: this.summaryProjection.volumeSummaries,
      lastUpdatedChapter: chapterNumber,
    };
  }

  /**
   * 生成章节摘要
   */
  private async generateChapterSummary(chapterNumber: number, content: string): Promise<ChapterSummary> {
    // 简化实现
    // 实际应该调用 AI 生成摘要
    
    const paragraphs = content.split(/\n\n+/);
    
    return {
      summary: content.slice(0, 300),
      corePlot: '',
      keyEvents: [],
      characterChanges: [],
      plotAdvances: [],
      charactersAppeared: [],
      locationsVisited: [],
      foreshadowsPlanted: [],
      foreshadowsResolved: [],
      endingState: paragraphs[paragraphs.length - 1]?.slice(0, 200) || '',
    };
  }

  /**
   * 记忆投影
   */
  private async projectMemory(chapterNumber: number, content: string): Promise<MemoryProjection> {
    const memories = await this.extractPlotMemories(content);
    
    this.memoryProjection.plotMemories.push(...memories);
    
    return {
      plotMemories: this.memoryProjection.plotMemories,
      relationshipMemories: this.memoryProjection.relationshipMemories,
      unresolvedForeshadows: this.memoryProjection.unresolvedForeshadows,
      lastUpdatedChapter: chapterNumber,
    };
  }

  /**
   * 提取情节记忆
   */
  private async extractPlotMemories(content: string): Promise<PlotMemory[]> {
    const memories: PlotMemory[] = [];
    
    // 匹配关键事件模式
    const eventPatterns = [
      { pattern: /(突破|进阶|升级|提升|增长)/, type: 'event' as MemoryType, importance: 'major' as const },
      { pattern: /(获得|得到|捡到|发现)(?:了)?([^，。！？]+)/, type: 'item_obtained' as MemoryType, importance: 'minor' as const },
      { pattern: /(原来|真相|揭秘)/, type: 'revelation' as MemoryType, importance: 'major' as const },
      { pattern: /(发现|来到|进入)/, type: 'location_discovered' as MemoryType, importance: 'minor' as const },
    ];
    
    return memories;
  }

  /**
   * 向量投影
   */
  private async projectVector(chapterNumber: number, content: string): Promise<VectorProjection> {
    // 分段
    const paragraphs = content.split(/\n\n+/).filter(p => p.length > 50);
    
    for (let i = 0; i < paragraphs.length; i++) {
      const vector = await this.generateEmbedding(paragraphs[i]);
      
      this.vectorProjection.paragraphVectors.push({
        id: `vec_${chapterNumber}_${i}`,
        chapter: chapterNumber,
        paragraphIndex: i,
        startPosition: content.indexOf(paragraphs[i]),
        endPosition: content.indexOf(paragraphs[i]) + paragraphs[i].length,
        content: paragraphs[i],
        vector,
        metadata: {
          characters: [],
          locations: [],
          hasDialogue: paragraphs[i].includes('"') || paragraphs[i].includes('"'),
          emotion: 'neutral',
        },
      });
    }
    
    return {
      paragraphVectors: this.vectorProjection.paragraphVectors,
      characterVectors: this.vectorProjection.characterVectors,
      lastUpdatedChapter: chapterNumber,
    };
  }

  /**
   * 生成文本向量（简化实现）
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // 简化实现：返回随机向量
    // 实际应该调用向量模型（如 text-embedding-3-small）
    const dimension = this.config.vectorProjection?.dimension || 1536;
    return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
  }

  // ============================================================
  // 检索方法
  // ============================================================

  /**
   * 相似内容检索（RAG）
   */
  async retrieve(query: string, topK: number = 5): Promise<RetrievedContext[]> {
    if (this.vectorProjection.paragraphVectors.length === 0) {
      return [];
    }

    const queryVector = await this.generateEmbedding(query);

    // 计算余弦相似度
    const similarities = this.vectorProjection.paragraphVectors.map(v => ({
      ...v,
      similarity: this.cosineSimilarity(queryVector, v.vector),
    }));

    // 排序并返回 topK
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(v => ({
        chapter: v.chapter,
        paragraphIndex: v.paragraphIndex,
        content: v.content,
        similarity: v.similarity,
        metadata: v.metadata,
      }));
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ============================================================
  // 状态访问方法
  // ============================================================

  /**
   * 获取状态投影
   */
  getStateProjection(): StateProjection {
    return this.stateProjection;
  }

  /**
   * 获取索引投影
   */
  getIndexProjection(): IndexProjection {
    return this.indexProjection;
  }

  /**
   * 获取摘要投影
   */
  getSummaryProjection(): SummaryProjection {
    return this.summaryProjection;
  }

  /**
   * 获取记忆投影
   */
  getMemoryProjection(): MemoryProjection {
    return this.memoryProjection;
  }

  /**
   * 获取向量投影
   */
  getVectorProjection(): VectorProjection {
    return this.vectorProjection;
  }

  /**
   * 获取章节摘要
   */
  getChapterSummary(chapterNumber: number): ChapterSummary | undefined {
    return this.summaryProjection.chapterSummaries.get(chapterNumber);
  }

  /**
   * 获取角色索引
   */
  getCharacterIndex(characterId: string): CharacterIndexEntry | undefined {
    return this.indexProjection.characterIndex.get(characterId);
  }

  /**
   * 获取角色所有出现位置
   */
  getCharacterAppearances(characterId: string): number[] {
    const entry = this.indexProjection.characterIndex.get(characterId);
    return entry?.chapters || [];
  }

  /**
   * 获取角色关系
   */
  getCharacterRelationships(characterId: string): Array<{ character: string; type: string; status: string }> {
    const state = this.stateProjection.characterStates.find(c => c.id === characterId);
    return state?.relationships || [];
  }

  /**
   * 获取活跃记忆
   */
  getActiveMemories(type?: MemoryType): PlotMemory[] {
    if (type) {
      return this.memoryProjection.plotMemories.filter(m => m.type === type);
    }
    return this.memoryProjection.plotMemories;
  }

  // ============================================================
  // 管理方法
  // ============================================================

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ProjectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 清除所有投影数据
   */
  clear(): void {
    this.stateProjection = {
      characterStates: [],
      worldStates: [],
      timeline: [],
      lastUpdatedChapter: 0,
    };
    this.indexProjection = {
      characterIndex: new Map(),
      itemIndex: new Map(),
      locationIndex: new Map(),
      lastUpdatedChapter: 0,
    };
    this.summaryProjection = {
      chapterSummaries: new Map(),
      volumeSummaries: new Map(),
      lastUpdatedChapter: 0,
    };
    this.memoryProjection = {
      plotMemories: [],
      relationshipMemories: [],
      unresolvedForeshadows: [],
      lastUpdatedChapter: 0,
    };
    this.vectorProjection = {
      paragraphVectors: [],
      characterVectors: new Map(),
      lastUpdatedChapter: 0,
    };
  }

  /**
   * 导出数据
   */
  export(): {
    state: StateProjection;
    index: { characters: CharacterIndexEntry[]; items: ItemIndexEntry[]; locations: LocationIndexEntry[] };
    summary: { chapters: [number, ChapterSummary][]; volumes: [string, VolumeSummary][] };
    memory: MemoryProjection;
  } {
    return {
      state: this.stateProjection,
      index: {
        characters: Array.from(this.indexProjection.characterIndex.values()),
        items: Array.from(this.indexProjection.itemIndex.values()),
        locations: Array.from(this.indexProjection.locationIndex.values()),
      },
      summary: {
        chapters: Array.from(this.summaryProjection.chapterSummaries.entries()),
        volumes: Array.from(this.summaryProjection.volumeSummaries.entries()),
      },
      memory: this.memoryProjection,
    };
  }

  /**
   * 导入数据
   */
  import(data: ReturnType<ProjectionSystem['export']>): void {
    this.stateProjection = data.state;
    this.indexProjection = {
      characterIndex: new Map(data.index.characters.map(c => [c.id, c])),
      itemIndex: new Map(data.index.items.map(i => [i.id, i])),
      locationIndex: new Map(data.index.locations.map(l => [l.id, l])),
      lastUpdatedChapter: Math.max(
        ...data.index.characters.map(c => c.lastAppearance),
        ...data.index.items.map(i => i.chapters[i.chapters.length - 1] || 0),
        ...data.index.locations.map(l => l.chapters[l.chapters.length - 1] || 0),
      ),
    };
    this.summaryProjection = {
      chapterSummaries: new Map(data.summary.chapters),
      volumeSummaries: new Map(data.summary.volumes),
      lastUpdatedChapter: Math.max(...data.summary.chapters.map(([n]) => n), 0),
    };
    this.memoryProjection = data.memory;
  }
}

// ============================================================
// 单例
// ============================================================

let projectionSystemInstance: ProjectionSystem | null = null;

export function getProjectionSystem(): ProjectionSystem {
  if (!projectionSystemInstance) {
    projectionSystemInstance = new ProjectionSystem();
  }
  return projectionSystemInstance;
}

export function createProjectionSystem(config?: Partial<ProjectionConfig>): ProjectionSystem {
  projectionSystemInstance = new ProjectionSystem(config);
  return projectionSystemInstance;
}

// ============================================================
// Composable
// ============================================================

export function useProjectionSystem() {
  const system = getProjectionSystem();

  return {
    system,
    project: (chapter: number, content: string, options?: { aiEnhance?: boolean; generateVectors?: boolean }) =>
      system.project(chapter, content, options),
    retrieve: (query: string, topK?: number) => system.retrieve(query, topK),
    getChapterSummary: (chapter: number) => system.getChapterSummary(chapter),
    getCharacterRelationships: (characterId: string) => system.getCharacterRelationships(characterId),
    getActiveMemories: (type?: MemoryType) => system.getActiveMemories(type),
    export: () => system.export(),
    import: (data: ReturnType<ProjectionSystem['export']>) => system.import(data),
    clear: () => system.clear(),
  };
}
