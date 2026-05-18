/**
 * 记忆系统类型定义
 * 基于 webnovel-writer-master 的记忆架构
 * 
 * 记忆系统包含：
 * - state.json: 项目快照
 * - index.db: SQLite索引
 * - summaries/: 章节摘要
 * - memory_scratchpad/: 临时记忆
 */

// ============================================================
// 项目状态
// ============================================================

/**
 * 项目状态文件 - state.json
 * 项目的"快照"，记录当前进度
 */
export interface ProjectState {
  meta: StateMeta;
  
  // 已解锁的设定
  unlockedSettings: UnlockedSettings;
  
  // 伏笔状态
  foreshadowStatus: ForeshadowStatusMap;
  
  // 角色状态
  characterStatus: CharacterStatusMap;
  
  // 情节进度
  plotProgress: PlotProgress;
}

/**
 * 状态元信息
 */
export interface StateMeta {
  projectId: string;
  currentChapter: number;
  currentVolume: number;
  totalWordCount: number;
  lastUpdated: string;
}

/**
 * 已解锁的设定
 */
export interface UnlockedSettings {
  worldRules: string[];   // 已揭示的世界规则
  locations: string[];     // 已到达的地点
  factions: string[];      // 已出现的势力
  characters: string[];    // 已出场的角色
  items: string[];        // 已出现的道具
}

/**
 * 伏笔状态映射
 */
export interface ForeshadowStatusMap {
  [foreshadowId: string]: ForeshadowStatus;
}

/**
 * 单个伏笔状态
 */
export interface ForeshadowStatus {
  status: 'buried' | 'developed' | 'revealed' | 'forgotten';
  chapters: number[];      // 涉及的章节
  lastMention: number;     // 最后提及章节
  buriedChapter: number;   // 埋设章节
  revealChapter?: number;  // 揭示章节
}

/**
 * 角色状态映射
 */
export interface CharacterStatusMap {
  [characterId: string]: CharacterState;
}

/**
 * 单个角色状态
 */
export interface CharacterState {
  growthStage: number;
  relationships: Relationship[];
  currentLocation: string;
  currentGoal: string;
  arcProgress: number;    // 0-1
  lastAppearedChapter: number;
  status: 'active' | 'inactive' | 'deceased';
}

/**
 * 关系
 */
export interface Relationship {
  targetId: string;
  type: RelationshipType;
  description: string;
  lastUpdated: number;
  strength: number;  // 0-1
}

/**
 * 关系类型
 */
export type RelationshipType = 
  | 'friend' 
  | 'enemy' 
  | 'family' 
  | 'lover' 
  | 'rival' 
  | 'mentor' 
  | 'alliance' 
  | 'neutral';

// ============================================================
// 情节进度
// ============================================================

/**
 * 情节进度
 */
export interface PlotProgress {
  quest: QuestProgress;
  fire: FireProgress;
  constellation: ConstellationProgress;
}

/**
 * Quest进度
 */
export interface QuestProgress {
  currentStage: number;
  stages: QuestStage[];
  conflicts: QuestConflict[];
}

/**
 * Quest阶段
 */
export interface QuestStage {
  stage: number;
  name: string;
  startChapter: number;
  endChapter: number;
  status: 'pending' | 'active' | 'completed';
}

/**
 * Quest冲突
 */
export interface QuestConflict {
  id: string;
  description: string;
  status: 'active' | 'resolved';
  chapters: number[];
}

/**
 * Fire进度（感情线）
 */
export interface FireProgress {
  romanceType: 'unrequited' | 'mutual' | 'secret' | 'bittersweet' | 'sweet';
  currentStage: number;
  milestones: FireMilestone[];
}

/**
 * Fire里程碑
 */
export interface FireMilestone {
  chapter: number;
  type: 'confession' | 'kiss' | 'conflict' | 'breakup' | 'reunion' | 'marriage';
  description: string;
  status: 'pending' | 'completed';
}

/**
 * Constellation进度（世界观线）
 */
export interface ConstellationProgress {
  revealedRules: string[];
  revealedMysteries: string[];
  nextReveal: NextReveal | null;
}

/**
 * 下一个揭示
 */
export interface NextReveal {
  rule: string;
  expectedChapter: number;
  teaser: string;
}

// ============================================================
// 实体索引
// ============================================================

/**
 * 实体索引 - index.db
 */
export interface EntityIndex {
  entities: Entity[];
  relations: Relation[];
  events: Event[];
}

/**
 * 实体
 */
export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  description: string;
  firstAppearance: number;  // 首次出现章节
  mentions: number;          // 提及次数
  lastMention: number;      // 最后提及章节
  tags: string[];
  // 额外属性
  attributes?: Record<string, any>;
}

/**
 * 实体类型
 */
export type EntityType = 
  | 'character' 
  | 'location' 
  | 'faction' 
  | 'item' 
  | 'event' 
  | 'rule' 
  | 'ability' 
  | 'species';

/**
 * 关系
 */
export interface Relation {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  description: string;
  establishedChapter: number;
  strength: number;  // 0-1
  // 关系变化历史
  history?: RelationHistory[];
}

/**
 * 关系历史
 */
export interface RelationHistory {
  chapter: number;
  change: 'strengthened' | 'weakened' | 'changed' | 'broken';
  description: string;
}

/**
 * 事件
 */
export interface Event {
  id: string;
  chapter: number;
  description: string;
  participants: string[];  // 参与者ID列表
  consequences: string[];
  importance: 'minor' | 'major' | 'critical';
}

// ============================================================
// 记忆草稿
// ============================================================

/**
 * 记忆草稿 - memory_scratchpad
 */
export interface MemoryScratchpad {
  // 自动生成的摘要
  summaries: ChapterSummary[];
  
  // 临时记录
  tempNotes: TempNote[];
  
  // 写作上下文缓存
  writingContextCache: WritingContextCache[];
  
  // 待处理事项
  pendingTasks: PendingTask[];
}

/**
 * 章节摘要
 * 支持两种格式：完整版和简化版
 */
export interface ChapterSummary {
  chapter: number;
  summary: string;
  // 简化版字段（composables 使用）
  wordCount?: number;
  coolPoints?: string[];
  foreshadows?: string[];
  // 完整版字段
  keyEvents?: string[];
  newCharacters?: string[];
  locationsVisited?: string[];
  itemsObtained?: string[];
  relationshipsChanged?: RelationshipChange[];
  timestamp: string;
}

/**
 * 关系变化
 */
export interface RelationshipChange {
  character1: string;
  character2: string;
  changeType: 'met' | 'befriended' | 'enemied' | 'strengthened' | 'weakened';
  description: string;
}

/**
 * 临时笔记
 */
export interface TempNote {
  id: string;
  content: string;
  createdAt: string;
  createdChapter: number;
  type: 'idea' | 'reminder' | 'question' | 'todo';
  resolved: boolean;
}

/**
 * 写作上下文缓存
 */
export interface WritingContextCache {
  chapter: number;
  context: string;
  tokens: number;
  createdAt: string;
}

/**
 * 待处理事项
 */
export interface PendingTask {
  id: string;
  type: 'foreshadow' | 'callback' | 'relationship' | 'custom';
  description: string;
  targetChapter: number;
  status: 'pending' | 'done' | 'cancelled';
  createdAt: string;
  resolvedAt?: string;
}

// ============================================================
// 记忆操作
// ============================================================

/**
 * 记忆查询参数
 */
export interface MemoryQuery {
  entityType?: EntityType;
  entityName?: string;
  chapterRange?: [number, number];
  tags?: string[];
}

/**
 * 记忆更新
 */
export interface MemoryUpdate {
  type: 'entity' | 'relation' | 'event' | 'foreshadow' | 'character_status';
  data: any;
  chapter: number;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建默认项目状态
 */
export function createDefaultProjectState(projectId: string): ProjectState {
  return {
    meta: {
      projectId,
      currentChapter: 1,
      currentVolume: 1,
      totalWordCount: 0,
      lastUpdated: new Date().toISOString(),
    },
    unlockedSettings: {
      worldRules: [],
      locations: [],
      factions: [],
      characters: [],
      items: [],
    },
    foreshadowStatus: {},
    characterStatus: {},
    plotProgress: {
      quest: {
        currentStage: 1,
        stages: [],
        conflicts: [],
      },
      fire: {
        romanceType: 'sweet',
        currentStage: 1,
        milestones: [],
      },
      constellation: {
        revealedRules: [],
        revealedMysteries: [],
        nextReveal: null,
      },
    },
  };
}

/**
 * 创建空实体索引
 */
export function createEmptyEntityIndex(): EntityIndex {
  return {
    entities: [],
    relations: [],
    events: [],
  };
}

/**
 * 创建空记忆草稿
 */
export function createEmptyScratchpad(): MemoryScratchpad {
  return {
    summaries: [],
    tempNotes: [],
    writingContextCache: [],
    pendingTasks: [],
  };
}

/**
 * 创建章节摘要
 */
export function createChapterSummary(chapter: number): ChapterSummary {
  return {
    chapter,
    summary: '',
    keyEvents: [],
    newCharacters: [],
    foreshadowUpdates: [],
    locationsVisited: [],
    itemsObtained: [],
    relationshipsChanged: [],
    timestamp: new Date().toISOString(),
  };
}
