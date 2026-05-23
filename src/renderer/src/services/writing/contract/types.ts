/**
 * 合同系统类型定义
 * 基于 webnovel-writer 架构
 */

// ============================================================
// 合同层级
// ============================================================

export enum ContractLevel {
  MASTER = 'master',
  VOLUME = 'volume',
  CHAPTER = 'chapter',
  REVIEW = 'review',
}

// ============================================================
// 主合同 (Master Contract)
// ============================================================

export interface MasterContract {
  id: string;
  level: ContractLevel.MASTER;
  
  // 项目信息
  projectTitle: string;
  genre: string;
  subGenres: string[];
  targetWordCount: number;
  estimatedWordCount: number;
  
  // 核心设定
  synopsis: string;
  coreConflict: string;
  worldSetting: WorldSetting;
  powerSystem?: PowerSystem;
  
  // 角色
  protagonist: Character;
  antagonists: Character[];
  supportingCharacters: Character[];
  
  // 主线
  mainQuest: Quest;
  romanceLine?: Quest;
  
  // 禁忌
  antiPatterns: string[];
  forbiddenContent: string[];
  
  // 风格
  writingStyle: WritingStyle;
  
  // 时间
  createdAt: string;
  updatedAt: string;
}

export interface WorldSetting {
  type: string;
  locations: Location[];
  factions: Faction[];
  rules: WorldRule[];
  timeline: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  level: 'world' | 'continent' | 'country' | 'city' | 'town' | 'other';
}

export interface Faction {
  id: string;
  name: string;
  description: string;
  alignment: 'good' | 'evil' | 'neutral';
}

export interface WorldRule {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface PowerSystem {
  name: string;
  levels: string[];
  description?: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  personality: string[];
  appearance?: string;
  background?: string;
  abilities?: string[];
  relationships: Relationship[];
  motivation?: string;
  speakingStyle?: string;
}

export interface Relationship {
  targetId: string;
  targetName: string;
  type: 'ally' | 'enemy' | 'family' | 'romantic' | 'neutral';
  description: string;
}

export interface Quest {
  title: string;
  description: string;
  milestones: string[];
  rewards: string[];
}

export interface WritingStyle {
  tone: string;
  pacing: 'slow' | 'normal' | 'fast';
  dialogueRatio: number;
  descriptionDensity: 'light' | 'medium' | 'heavy';
}

// ============================================================
// 卷合同 (Volume Contract)
// ============================================================

export interface VolumeContract {
  id: string;
  level: ContractLevel.VOLUME;
  volumeNumber: number;
  volumeTitle: string;
  
  // 内容
  volumeOutline: string;
  coreEvents: string[];
  plannedChapters: number;
  
  // 角色（本章涉及的）
  involvedCharacters: string[];
  
  // 风格
  styleNotes: string;
  tensionLevel: 'low' | 'medium' | 'high';
  
  // 约束
  mustInclude: string[];
  mustNotInclude: string[];
  
  // 承接
  previousVolumeId?: string;
  nextVolumeId?: string;
  
  // 时间
  startChapter: number;
  endChapter: number;
}

// ============================================================
// 章节合同 (Chapter Contract)
// ============================================================

export interface ChapterContract {
  id: string;
  level: ContractLevel.CHAPTER;
  chapterNumber: number;
  
  // 基本信息
  title: string;
  chapterType: ChapterType;
  
  // 指令
  directive: ChapterDirective;
  
  // 情节节点
  nodes: PlotNodes;
  
  // 约束
  constraints: ChapterConstraints;
  
  // 推理/裁决
  reasoning: ChapterReasoning;
  
  // 时间线
  timeline: ChapterTimeline;
  
  // 来源
  source: 'outline' | 'runtime' | 'manual';
  
  // 状态
  status: 'pending' | 'locked' | 'written' | 'reviewed';
  
  // 时间
  createdAt: string;
  updatedAt: string;
}

export type ChapterType =
  | 'world_intro'      // 世界观/背景介绍
  | 'character_intro'   // 人物登场/介绍
  | 'plot_setup'        // 情节铺陈/开端
  | 'conflict'          // 冲突展开
  | 'climax'           // 高潮
  | 'resolution'        // 冲突解决
  | 'transitional'      // 过渡章节
  | 'ending'            // 结尾/收束
  | 'normal';           // 普通章节

export interface ChapterDirective {
  // 本章核心目标
  goal: string;
  
  // 时间锚点
  timeAnchor: string;
  
  // 章节跨度
  chapterSpan: string;
  
  // 倒计时（如果有）
  countdown?: Countdown;
  
  // 上章结尾锚定
  previousChapterEnding: string;
  
  // 章末开放问题
  chapterEndOpenQuestion: string;
}

export interface Countdown {
  event: string;
  remaining: string;
  chaptersUntil: number;
}

export interface PlotNodes {
  // 开始节点: 主体|动作|对象
  cbn: string;
  
  // 中间节点: 主体|动作|结果
  cpns: string[];
  
  // 结束节点: 主体|状态变化|结果
  cen: string;
}

export interface ChapterConstraints {
  // 必须覆盖的内容
  mustCover: string[];
  mustInclude: string[];
  
  // 禁区
  forbiddenZones: string[];
  mustNotInclude: string[];
  
  // 伏笔相关
  foreshadowsToBury: string[];
  foreshadowsToReveal: string[];
}

export interface ChapterReasoning {
  // 风格优先级
  stylePriority: string[];
  
  // 节奏策略
  pacingStrategy: 'build_up' | 'confront' | 'release';
  
  // 题材提示
  genreHints: string[];
  
  // 题材画像
  genreProfile?: GenreProfile;
  
  // 反面教材
  antiPatterns: string[];
}

export interface GenreProfile {
  genre: string;
  coreCoolPoints: string[];
  antiPatterns: string[];
  pacingCharacteristics: {
    opening: string;
    development: string;
    climax: string;
  };
}

export interface ChapterTimeline {
  // 时间位置
  position: string;
  
  // 与上章的时间关系
  relationToPrevious: 'same_time' | 'next_day' | 'later' | 'flashback';
  
  // 跨度
  span: string;
  
  // 时间跳跃标记
  isTimeJump: boolean;
}

// ============================================================
// 审查合同 (Review Contract)
// ============================================================

export interface ReviewContract {
  id: string;
  level: ContractLevel.REVIEW;
  chapterNumber: number;
  
  // 审查范围
  expectedNodes: PlotNodes;
  forbiddenContent: string[];
  
  // 质量阈值
  qualityThreshold: {
    overall: number;
    continuity: number;
    hookScore: number;
    coolpointScore: number;
    paceScore: number;
    antiAIScore: number;
  };
  
  // 审查重点
  reviewFocus: ReviewFocus[];
  
  // 时间
  createdAt: string;
}

export interface ReviewFocus {
  dimension: string;
  description: string;
  weight: number;
}

// ============================================================
// 合同状态
// ============================================================

export interface ContractStatus {
  chapterNumber: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  locked: boolean;
  lastUpdated: string;
}

// ============================================================
// 合同管理器接口
// ============================================================

export interface ContractManager {
  // 加载合同
  loadMasterContract(): Promise<MasterContract | null>;
  loadVolumeContract(volumeNumber: number): Promise<VolumeContract | null>;
  loadChapterContract(chapterNumber: number): Promise<ChapterContract | null>;
  
  // 保存合同
  saveMasterContract(contract: MasterContract): Promise<void>;
  saveVolumeContract(contract: VolumeContract): Promise<void>;
  saveChapterContract(contract: ChapterContract): Promise<void>;
  
  // 生成合同
  generateChapterContract(chapterNumber: number): Promise<ChapterContract>;
  generateRuntimeContract(chapterNumber: number, genre: string): Promise<ChapterContract>;
  
  // 锁定/解锁
  lockChapter(chapterNumber: number): void;
  unlockChapter(chapterNumber: number): void;
  isChapterLocked(chapterNumber: number): boolean;
  
  // 验证
  validateChapterContract(chapterNumber: number, content: string): ContractValidationResult;
}

export interface ContractValidationResult {
  valid: boolean;
  violations: ContractViolation[];
  warnings: string[];
}

export interface ContractViolation {
  type: 'must_cover' | 'forbidden' | 'node_missing' | 'timeline_error';
  description: string;
  location?: string;
  severity: 'critical' | 'warning';
}
