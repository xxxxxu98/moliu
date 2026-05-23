/**
 * 记忆系统类型定义
 * 基于 webnovel-writer 架构
 */

// ============================================================
// 记忆层级
// ============================================================

export enum MemoryLayer {
  WORKING = 'working',       // 工作记忆：当前正在处理的上下文
  EPISODIC = 'episodic',   // 情景记忆：近期章节的摘要和变化
  SEMANTIC = 'semantic',    // 语义记忆：长期存储的世界观、人物、关系等
}

// ============================================================
// 记忆项
// ============================================================

export interface MemoryItem {
  id: string;
  layer: MemoryLayer;
  category: MemoryCategory;
  
  // 内容
  subject: string;          // 主体（角色/物品/地点等）
  field?: string;           // 字段（状态/关系等）
  value: string;           // 值
  
  // 来源
  sourceChapter: number;
  source: string;           // 'outline' | 'chapter' | 'memory' | 'user'
  
  // 状态
  status: 'active' | 'archived' | 'resolved';
  updatedAt: string;
  createdAt: string;
  
  // 优先级
  priority: number;
}

export type MemoryCategory =
  | 'world_rule'           // 世界规则
  | 'character_state'       // 角色状态
  | 'relationship'          // 关系
  | 'story_fact'            // 故事事实
  | 'open_loop'            // 开放线索
  | 'reader_promise'       // 读者承诺
  | 'timeline';             // 时间线

// ============================================================
// 记忆包 (Memory Pack)
// ============================================================

export interface MemoryPack {
  // 三层记忆
  workingMemory: WorkingMemoryItem[];
  episodicMemory: EpisodicMemoryItem[];
  semanticMemory: SemanticMemoryItem[];
  
  // 活跃约束
  activeConstraints: Constraint[];
  
  // 近期变化
  recentChanges: StateChange[];
  
  // 警告
  warnings: Warning[];
  
  // 统计
  stats: MemoryStats;
}

export interface WorkingMemoryItem {
  layer: MemoryLayer.WORKING;
  source: 'outline' | 'previous_summary' | 'state_export';
  chapter: number;
  content: string | object;
}

export interface EpisodicMemoryItem {
  layer: MemoryLayer.EPISODIC;
  source: 'state_change' | 'relationship' | 'appearance';
  chapter: number;
  entityId?: string;
  field?: string;
  content: object;
}

export interface SemanticMemoryItem {
  layer: MemoryLayer.SEMANTIC;
  category: MemoryCategory;
  subject: string;
  field?: string;
  value: string;
  sourceChapter: number;
  source: string;
  priority: number;
  status: 'active' | 'resolved';
}

// ============================================================
// 约束
// ============================================================

export interface Constraint {
  id: string;
  type: 'world_rule' | 'foreshadow';
  description: string;
  sourceChapter?: number;
  targetChapter?: number;
  status: 'active' | 'satisfied' | 'violated';
}

// ============================================================
// 状态变化
// ============================================================

export interface StateChange {
  id: string;
  chapter: number;
  entityId: string;
  entityName: string;
  field: string;
  from: string;
  to: string;
  timestamp: string;
}

export interface Relationship {
  id: string;
  fromEntity: string;
  toEntity: string;
  type: 'ally' | 'enemy' | 'family' | 'romantic' | 'neutral';
  description: string;
  establishedChapter?: number;
  status: 'active' | 'changed' | 'ended';
}

export interface EntityAppearance {
  entityId: string;
  entityName: string;
  chapter: number;
  location: string;
  firstAppearance: boolean;
}

// ============================================================
// 追读力信号 (Reader Signals)
// ============================================================

export interface ReaderSignals {
  // 钩子使用统计
  hookTypeUsage: Record<string, number>;
  
  // 爽点模式使用统计
  patternUsage: Record<string, number>;
  
  // 审查趋势
  reviewTrend: ReviewTrend;
  
  // 低分区段
  lowScoreRanges: LowScoreRange[];
  
  // 总体评分
  overallScore: number;
}

export interface ReviewTrend {
  overallAvg: number;
  byDimension: Record<string, number>;
  trend: 'rising' | 'stable' | 'declining';
}

export interface LowScoreRange {
  startChapter: number;
  endChapter: number;
  overallScore: number;
  dimension: string;
  reasons: string[];
}

// ============================================================
// 记忆预算
// ============================================================

export interface MemoryBudget {
  semantic: number;
  working: number;
  episodic: number;
}

export interface MemoryStats {
  total: number;
  workingTotal: number;
  episodicTotal: number;
  semanticTotal: number;
  injected: number;
  layeredTotalInjected: number;
  filtered: number;
  conflicts: number;
}

// ============================================================
// 警告
// ============================================================

export interface Warning {
  type: 'memory_conflict' | 'timeline_gap' | 'foreshadow_unresolved';
  count: number;
  details: string[];
}

// ============================================================
// 记忆查询
// ============================================================

export interface MemoryQuery {
  chapter: number;
  keywords?: string[];
  categories?: MemoryCategory[];
  layers?: MemoryLayer[];
  limit?: number;
  includeArchived?: boolean;
}

export interface MemoryQueryResult {
  items: MemoryItem[];
  total: number;
  matchedBy: 'subject' | 'field' | 'value' | 'chapter';
}

// ============================================================
// 记忆存储接口
// ============================================================

export interface MemoryStore {
  // 查询
  query(query: MemoryQuery): MemoryItem[];
  
  // 添加
  add(item: Omit<MemoryItem, 'id' | 'createdAt'>): MemoryItem;
  
  // 更新
  update(id: string, updates: Partial<MemoryItem>): void;
  
  // 删除
  delete(id: string): void;
  
  // 状态管理
  archive(id: string): void;
  resolve(id: string): void;
  
  // 统计
  getStats(): MemoryStats;
  getConflicts(): MemoryItem[];
}

// ============================================================
// 记忆编排器接口
// ============================================================

export interface MemoryOrchestrator {
  // 构建记忆包
  buildMemoryPack(chapter: number, taskType?: string): Promise<MemoryPack>;
  
  // 添加章节摘要
  addChapterSummary(summary: ChapterSummary): Promise<void>;
  
  // 更新记忆
  updateFromChapter(chapter: number, content: string): Promise<void>;
  
  // 查询
  query(query: MemoryQuery): MemoryQueryResult;
  
  // 状态
  getConflicts(): MemoryItem[];
  getActiveConstraints(): Constraint[];
}

// ============================================================
// 章节摘要
// ============================================================

export interface ChapterSummary {
  chapter: number;
  title: string;
  summary: string;
  wordCount: number;
  coolPoints: string[];
  foreshadows: ForeshadowUpdate[];
  keyEvents: string[];
  charactersInScene: string[];
  location: string;
  timeSpan: string;
}

export interface ForeshadowUpdate {
  id: string;
  hint: string;
  status: 'buried' | 'hinted' | 'foreshadowed' | 'revealed';
  chapter: number;
}
