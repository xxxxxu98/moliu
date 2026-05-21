/**
 * Type Definitions for Outline System
 * Core type definitions for the enhanced outline generation system
 */

// ====== 基础枚举 ======

/** 故事线类型 */
export type StrandType = 'quest' | 'fire' | 'constellation';

/** 角色定位 */
export type CharacterRole = 'protagonist' | 'antagonist' | 'mentor' | 'supporting' | 'minor';

/** 章节状态 */
export type ChapterStatus = 'outline' | 'draft' | 'complete';

/** 伏笔状态 */
export type ForeshadowStatus = 'active' | 'fulfilled' | 'abandoned';

// ====== 优先级系统 ======

/** 优先级级别 */
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low';

/** 优先级配置 */
export interface PriorityConfig {
  level: PriorityLevel;
  weight: number;
  label: string;
  color: string;
  description: string;
}

/** 优先级规则 */
export interface PriorityRule {
  /** 触发条件类型 */
  conditionType: 'field_present' | 'field_missing' | 'value_match' | 'custom';
  /** 条件表达式 */
  condition: string;
  /** 分配的优先级 */
  priority: PriorityLevel;
  /** 是否阻塞生成 */
  blocking: boolean;
}

/** 优先级决策结果 */
export interface PriorityDecision {
  level: PriorityLevel;
  reason: string;
  blocking: boolean;
  suggestions: string[];
}

/** 优先级排序比较器 */
export type PriorityComparator = (a: PriorityLevel, b: PriorityLevel) => number;

/** 优先级常量 */
export const PRIORITY_LEVELS: Record<PriorityLevel, PriorityConfig> = {
  critical: {
    level: 'critical',
    weight: 100,
    label: '阻塞级',
    color: '#ff4d4f',
    description: '必须修复，否则无法继续生成',
  },
  high: {
    level: 'high',
    weight: 75,
    label: '重要',
    color: '#fa8c16',
    description: '强烈建议修复',
  },
  medium: {
    level: 'medium',
    weight: 50,
    label: '一般',
    color: '#1890ff',
    description: '建议关注',
  },
  low: {
    level: 'low',
    weight: 25,
    label: '提示',
    color: '#52c41a',
    description: '可选优化',
  },
};

/** 优先级比较函数 */
export function comparePriority(a: PriorityLevel, b: PriorityLevel): number {
  return PRIORITY_LEVELS[b].weight - PRIORITY_LEVELS[a].weight;
}

/** 获取最高优先级 */
export function getHighestPriority(levels: PriorityLevel[]): PriorityLevel {
  return levels.reduce((highest, current) =>
    comparePriority(highest, current) > 0 ? highest : current
  );
}

/** 判断是否为阻塞级别 */
export function isBlocking(level: PriorityLevel): boolean {
  return level === 'critical';
}

/** 冲突来源类型 */
export type ConflictSource = 
  | '资源/利益'
  | '阵营/种族'
  | '超凡途径'
  | '信仰/宗教'
  | '派系之争'
  | '理念/三观';

/** 冲突强度级别 */
export type ConflictIntensity = 'S' | 'A' | 'B' | 'C';

/** 情绪弧线类型 */
export type EmotionArc = 'rising' | 'falling' | 'wave' | 'mixed';

/** 感情线阶段 */
export type RomanceStage = 'cold' | 'warm' | 'hot' | 'climax';

/** 契约类型 */
export type ContractType = 'story' | 'volume' | 'chapter';

/** 契约验证严重性 */
export type ViolationSeverity = 'blocking' | 'warning';

/** 节拍类型 */
export type BeatType = 
  | 'promise'
  | 'catalyst'
  | 'crisis'
  | 'midpoint'
  | 'all_is_lost'
  | 'climax'
  | 'resolution';

/** 章节节点类型 */
export type ChapterNodeType = 'CBN' | 'CPN' | 'CEN';

/** 章节节点角色 */
export type NodeRole = 'start' | 'progress' | 'end';

// ====== 生成相关类型 ======

/** 生成选项 */
export interface GenerationOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  wordCountRange?: string;
  maxRetries?: number;
  genre?: string;
}

/** 生成结果 */
export interface GenerationResult<T = any> {
  success: boolean;
  data?: T;
  warnings: string[];
  errors: string[];
  strategy: GenerationStrategy;
  rawContent?: string;
}

/** 生成策略 */
export type GenerationStrategy = 'json-mode' | 'markdown-remark' | 'markdown-regex' | 'legacy';

// ====== 情绪与卖点 ======

/** 情绪目标 */
export interface EmotionGoal {
  primary: string;
  secondary?: string;
  arc: EmotionArc;
  density: number;
  highPoints: number[];
  lowPoints: number[];
}

/** 核心卖点 */
export interface SellingPoint {
  id: string;
  type: 'combat' | 'romance' | 'mystery' | 'growth' | 'revenge' | 'power';
  description: string;
  frequency: 'high' | 'medium' | 'low';
  chapters: number[];
}

// ====== 金手指 ======

/** 金手指设计 */
export interface GoldenFinger {
  id: string;
  name: string;
  type: 'system' | 'reborn' | 'inheritance' | 'unique' | 'discovery';
  description: string;
  limitations: string[];
  upgradePath: GoldenFingerUpgrade[];
}

/** 金手指升级 */
export interface GoldenFingerUpgrade {
  chapter: number;
  description: string;
  newAbility: string;
  cost: string;
}

// ====== 八条故事线 ======

/** 地图线 */
export interface MapLine {
  planned: string[];
  introduced: string[];
  current: string;
  chaptersPerLocation: number;
}

/** 势力线 */
export interface FactionLine {
  planned: string[];
  introduced: string[];
  currentLevel: number;
  escalationChapters: number[];
}

/** 角色线 */
export interface CharacterLine {
  planned: { id: string; role: CharacterRole }[];
  introduced: string[];
  keyRelationships: { from: string; to: string; type: string }[];
}

/** 金手指线 */
export interface GoldenFingerLine {
  type: string;
  currentStage: number;
  upgrades: { chapter: number; description: string }[];
  nextUpgrade?: { chapter: number; description: string };
}

/** 世界观线 */
export interface WorldRulesLine {
  revealed: string[];
  pending: string[];
  nextReveal?: { chapter: number; rule: string };
}

/** 矛盾线 */
export interface ConflictLine {
  chains: ConflictChain[];
  activeConflict?: string;
}

/** 冲突链 */
export interface ConflictChain {
  level: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  chapters: number[];
  status: 'pending' | 'active' | 'resolved';
}

/** 收集线 */
export interface CollectionLine {
  target: string[];
  progress: { item: string; acquired: boolean; chapter?: number }[];
}

/** 感情线 */
export interface RomanceLine {
  currentStage: RomanceStage;
  progression: { chapter: number; stage: RomanceStage; description: string }[];
}

/** 八条故事线 */
export interface StoryLines {
  map: MapLine;
  faction: FactionLine;
  character: CharacterLine;
  goldenfinger: GoldenFingerLine;
  worldRules: WorldRulesLine;
  conflict: ConflictLine;
  collection: CollectionLine;
  romance: RomanceLine;
}

// ====== 矛盾设计 ======

/** 矛盾递进层级 */
export interface ConflictLevel {
  level: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  examples: string[];
}

/** 主要冲突 */
export interface MajorConflict {
  id: string;
  title: string;
  type: ConflictIntensity;
  source: ConflictSource;
  status: 'pending' | 'active' | 'resolved';
  chapters: number[];
  stakes: string;
  resolution?: string;
}

/** 矛盾设计 */
export interface ConflictDesign {
  source: ConflictSource;
  escalation: ConflictLevel[];
  majorConflicts: MajorConflict[];
}

// ====== 爽点设计 ======

/** 爽点密度 */
export interface CoolPointDensity {
  micro: number;
  small: number;
  big: number;
}

/** 爽点设计 */
export interface CoolPointDesign {
  density: CoolPointDensity;
  patterns: string[];
  arranged: { chapter: number; type: string; description: string }[];
}

// ====== 时间线 ======

/** 倒计时状态 */
export interface CountdownStatus {
  active: boolean;
  event?: string;
  daysRemaining?: number;
  targetChapter?: number;
}

/** 时间锚点 */
export interface TimeAnchor {
  chapter: number;
  absoluteTime: string;
  relativeTime?: string;
  duration: string;
  gapFromPrevious: string;
  countdown: CountdownStatus;
}

/** 时间线 */
export interface Timeline {
  baseline: string;
  span: string;
  direction: 'forward' | 'backward' | 'mixed';
  monotonic: boolean;
  anchors: TimeAnchor[];
}

// ====== 节拍表 ======

/** 节拍 */
export interface Beat {
  id: string;
  type: BeatType;
  chapterRange: { start: number; end: number };
  description: string;
  promise?: string;
  consequences: string[];
  climax?: string;
}

/** 卷节拍表 */
export interface BeatTable {
  volumeId: number;
  beats: Beat[];
  openingPromise: string;
  climaxBeat: string;
  resolutionBeat: string;
  hookForNext: string;
}

// ====== 章节节点 ======

/** 章节节点 */
export interface ChapterNode {
  id: ChapterNodeType;
  type: NodeRole;
  description: string;
  requiredElements: string[];
}

/** 章节节点序列 */
export interface ChapterNodes {
  cbn: ChapterNode;
  cpns: ChapterNode[];
  cen: ChapterNode;
}

// ====== 章节承诺 ======

/** 章节承诺要求 */
export interface ChapterCommitRequirements {
  objective: string;
  resistance: string;
  cost: string;
  timeAnchor: string;
  countdownStatus: string;
  coolPoint: string;
  strand: StrandType;
}

/** 章节承诺禁止区域 */
export interface ForbiddenZone {
  type: 'character_death' | 'power_reveal' | 'relationship_change' | 'world_reveal';
  target: string;
  reason: string;
}

/** 章节承诺执行状态 */
export interface ChapterCommitExecution {
  plannedNodes: string[];
  coveredNodes: string[];
  missedNodes: string[];
  extraNodes: string[];
}

/** 章节承诺 */
export interface ChapterCommit {
  chapterId: number;
  volumeId: number;
  nodes: ChapterNodes;
  requirements: ChapterCommitRequirements;
  forbiddenZones: ForbiddenZone[];
  foreshadowFulfilled: string[];
  execution?: ChapterCommitExecution;
}

// ====== 契约验证 ======

/** 契约违规 */
export interface Violation {
  type: string;
  description: string;
  severity: ViolationSeverity;
  /** 优先级级别（从优先级系统） */
  priority?: PriorityLevel;
  /** 违规元数据 */
  metadata?: Record<string, any>;
  location?: {
    contract: string;
    path: string;
  };
  suggestion?: string;
  /** 快速修复操作 */
  quickFixes?: QuickFix[];
}

/** 快速修复建议 */
export interface QuickFix {
  /** 修复类型 */
  type: 'auto_fix' | 'manual_input' | 'regenerate';
  /** 修复描述 */
  description: string;
  /** 修复参数 */
  params?: Record<string, any>;
}

/** 验证警告 */
export interface Warning {
  type: string;
  description: string;
  /** 优先级级别 */
  priority: PriorityLevel;
  /** 影响范围 */
  impact?: 'current' | 'downstream' | 'global';
  location?: {
    contract: string;
    path: string;
  };
  suggestion?: string;
}

/** 验证结果 */
export interface ValidationResult {
  isValid: boolean;
  violations: Violation[];
  warnings: Warning[];
}

// ====== 契约元数据 ======

/** 契约元数据 */
export interface ContractMeta {
  schemaVersion: string;
  contractType: ContractType;
  generatorVersion: string;
  createdAt: string;
  updatedAt: string;
}

/** 三线交织配置 */
export interface StrandConfig {
  quest: { ratio: number; status: 'active' | 'paused' | 'completed'; currentArc: string };
  fire: { ratio: number; status: 'active' | 'paused' | 'completed'; currentStage: RomanceStage };
  constellation: { ratio: number; status: 'active' | 'paused' | 'completed'; revealedLocations: string[] };
}

/** 故事契约 */
export interface StoryContract {
  meta: ContractMeta;
  promises: {
    genre: string;
    tone: string[];
    targetWordCount: number;
    coreHook: string;
    mainSatisfactions: string[];
  };
  constraints: {
    world: {
      timeBaseline: string;
      timeDirection: 'forward' | 'backward' | 'mixed';
      timeMonotonic: boolean;
      maxTimeGaps: number;
      forbiddenTimeLoops: boolean;
    };
    abilities: {
      maxLevelReached: number;
      abilitySources: string[];
      forbiddenCombinations: string[][];
    };
    characters: {
      maxMajor: number;
      maxMinor: number;
      forbiddenDeaths: string[];
    };
  };
  strands: StrandConfig;
  conflictEscalation: {
    level: number;
    name: string;
    status: 'pending' | 'active' | 'resolved';
    chaptersInvolved: number[];
  }[];
}

/** 卷契约 */
export interface VolumeContract {
  meta: ContractMeta;
  volumeId: number;
  volumeTitle: string;
  beats: Beat[];
  timeline: Timeline;
  strandStatus: {
    quest: { mainObjective: string; obstacles: string[] };
    fire: { relationshipStage: RomanceStage; keyMoments: string[] };
    constellation: { newRevelations: string[]; locationsIntroduced: string[] };
  };
  promises: {
    mainPromise: string;
    subPromises: string[];
    hookForNext: string;
  };
  validation: {
    timeConsistency: boolean;
    conflictEscalation: boolean;
    strandBalance: boolean;
  };
}

// ====== 知识库类型 ======

/** 爽点记录 */
export interface CoolPointRecord {
  id: string;
  skills: string[];
  category: string;
  level: string;
  keywords: string[];
  intent: string;
  applicableGenres: string[];
  instruction: string;
  summary: string;
  details: string;
  paceType: string;
  emotionTechniques: string[];
  antiPatterns: string[];
}

/** 场景写法记录 */
export interface SceneWritingRecord {
  id: string;
  skills: string[];
  category: string;
  level: string;
  keywords: string[];
  summary: string;
  details: string;
  patternName: string;
  example: string;
}

/** 金手指设定记录 */
export interface GoldenFingerRecord {
  id: string;
  skills: string[];
  category: string;
  level: string;
  keywords: string[];
  summary: string;
  details: string;
  type: string;
  limitations: string[];
  examples: string[];
}

/** 角色设定记录 */
export interface CharacterRecord {
  id: string;
  skills: string[];
  category: string;
  level: string;
  keywords: string[];
  summary: string;
  details: string;
  archetypes: string[];
  relationshipPatterns: string[];
}

/** 题材裁决规则 */
export interface GenreRuleRecord {
  id: string;
  genre: string;
  stylePriority: string[];
  coolPointPriority: string[];
  defaultPaceStrategy: string;
  antiPatterns: string[];
  tabooWeight: Record<string, number>;
}

/** 知识查询上下文 */
export interface KnowledgeQueryContext {
  genre?: string;
  sceneType?: string;
  emotion?: string;
  keywords?: string[];
  chapter?: number;
}

/** 知识查询结果 */
export interface KnowledgeResult {
  id: string;
  type: 'coolpoint' | 'scenewriting' | 'goldenfinger' | 'character' | 'genrerule';
  summary: string;
  details: string;
  relevance: number;
}
