/**
 * 写作任务书与结构化节点类型定义
 * 参考 webnovel-writer 的合同驱动设计
 */

/**
 * 章节结构化节点
 * 用于确保章节间逻辑承接
 */
export interface ChapterStructureNodes {
  /** 章节起点 (CBN) - 章节开始时的情境 */
  CBN: string;
  /** 推进节点 (CPNs) - 2-4个核心情节推进 */
  CPNs: string[];
  /** 章节终点 (CEN) - 章节结束时的状态 */
  CEN: string;
  /** 必须覆盖节点（≤4个）*/
  mustCover: string[];
  /** 本章禁区（≤5条）*/
  forbiddenZones: string[];
}

/**
 * 人物约束
 */
export interface CharacterConstraint {
  /** 角色名称 */
  name: string;
  /** 当前状态 */
  state: string;
  /** 驱动力/动机 */
  motivation: string;
  /** 本章作用 */
  role: string;
  /** 说话倾向 */
  dialogueTendency: string;
}

/**
 * 风格指引
 */
export interface StyleGuidance {
  /** 风格优先级 */
  stylePriority: string;
  /** 节奏策略 */
  pacingStrategy: string;
  /** 题材基调 */
  genreTone: string;
  /** writing_guidance */
  writingGuidance?: string;
  /** anti_patterns 翻为自然提醒 */
  antiPatterns: string[];
  /** 审查得分趋势 */
  reviewScoreTrend?: string;
}

/**
 * 写作任务书 - Context Agent 输出
 * 参考 webnovel-writer 的五段式任务书
 */
export interface WritingTaskBook {
  // ========== 1. 开篇委托 ==========
  /** 书名 */
  bookTitle: string;
  /** 章号 */
  chapterNumber: number;
  /** 标题 */
  chapterTitle: string;
  /** 一句话目标 */
  oneLinerGoal: string;

  // ========== 2. 这章的故事 ==========
  /** 前文摘要 */
  previousSummary: string;
  /** 本章目标 */
  chapterGoal: string;
  /** 阻力/障碍 */
  obstacles: string[];
  /** 章节起点 */
  CBN: string;
  /** 推进节点（2-4个）*/
  CPNs: string[];
  /** 章节终点 */
  CEN: string;
  /** 必须覆盖节点 */
  mustCover: string[];
  /** 本章禁区 */
  forbiddenZones: string[];
  /** 跨章约束 */
  crossChapterConstraints?: string[];
  /** RAG 线索 */
  ragClues?: string[];

  // ========== 3. 这章的人物 ==========
  /** 人物约束列表 */
  characters: CharacterConstraint[];

  // ========== 4. 怎么写更顺 ==========
  /** 风格指引 */
  styleGuidance: StyleGuidance;

  // ========== 5. 收在哪里 ==========
  /** 结尾感觉 */
  endingSensation: string;
  /** 留什么未完感 */
  openQuestion: string;
  /** 钩子提示 */
  hookHint?: string;

  // ========== 元数据 ==========
  /** 章节类型 */
  chapterType?: ChapterType;
  /** 时间锚点 */
  timeAnchor?: string;
  /** 倒计时状态 */
  countdownStatus?: string;
  /** Strand 分布 */
  strandDistribution?: StrandDistribution;
}

/**
 * 章节类型
 */
export type ChapterType =
  | 'world_intro'      // 世界观/背景介绍
  | 'character_intro'  // 人物登场/介绍
  | 'plot_setup'       // 情节铺陈
  | 'conflict'         // 冲突展开
  | 'climax'          // 高潮
  | 'resolution'       // 冲突解决
  | 'transitional'     // 过渡章节
  | 'ending'           // 结尾/收束
  | 'normal';          // 普通章节

/**
 * Strand 分布
 * 参考 webnovel-writer 的节奏系统
 */
export interface StrandDistribution {
  /** 主线剧情 (Quest) - 理想 60% */
  quest: number;
  /** 感情线 (Fire) - 理想 20% */
  fire: number;
  /** 世界观扩展 (Constellation) - 理想 20% */
  constellation: number;
}

// ============================================
// 审查系统类型定义
// ============================================

/**
 * 审查问题严重程度
 */
export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 审查问题分类 - 8+3 维
 * 基础6维 + AI味 + 节奏 + 新增3维（章尾、爽点、表达）
 */
export type ReviewCategory =
  | 'setting'        // 设定一致性
  | 'timeline'       // 时间线
  | 'continuity'      // 叙事连贯
  | 'character'       // 角色一致性
  | 'logic'          // 逻辑
  | 'ai_flavor'      // AI味
  | 'pacing'         // 节奏
  // 新增维度
  | 'chapter_ending'  // 章尾质量（oh-story）
  | 'excitement'     // 爽点密度（oh-story）
  | 'show_dont_tell' // Show Don't Tell（oh-story）
  | 'other';         // 其他

/**
 * 审查问题 - 增强版
 * 对齐 webnovel-writer 的审查 Schema
 */
export interface ReviewIssue {
  /** 唯一标识 */
  id: string;
  /** 严重程度 */
  severity: ReviewSeverity;
  /** 问题分类 */
  category: ReviewCategory;
  /** 位置 */
  location: string;
  /** 问题描述 */
  description: string;
  /** 证据 */
  evidence: string;
  /** 修复方向 */
  fixHint: string;
  /** 是否阻断（critical 或确认阻断时为 true）*/
  blocking: boolean;
  /** 是否可选节点 */
  optional?: boolean;
  /** 元数据 */
  meta?: {
    /** 章节号 */
    chapter?: number;
    /** 段落位置 */
    paragraph?: number;
    /** 行号 */
    line?: number;
    /** AI模式类型 */
    aiPatternType?: string;
  };
}

/**
 * 审查维度评分
 */
export interface ReviewDimensionScore {
  /** 维度名称 */
  dimension: ReviewCategory;
  /** 评分 0-100 */
  score: number;
  /** 权重 */
  weight: number;
  /** 是否通过 */
  passed: boolean;
  /** 问题列表 */
  issues: ReviewIssue[];
}

/**
 * 增强版审查结果
 */
export interface EnhancedReviewResult {
  /** 是否通过 */
  passed: boolean;
  /** 阻断数量 */
  blockingCount: number;
  /** 总问题数 */
  totalIssues: number;
  /** 问题列表 */
  issues: ReviewIssue[];
  /** 维度评分 */
  dimensionScores: Record<ReviewCategory, number>;
  /** 阻断问题列表 */
  blockingIssues: ReviewIssue[];
  /** 按分类统计 */
  categoryStats: Record<ReviewCategory, {
    total: number;
    blocking: number;
  }>;
  /** 摘要 */
  summary: string;
}

/**
 * 维度中文名称映射
 */
export const DIMENSION_NAMES: Record<ReviewCategory, string> = {
  setting: '设定一致性',
  timeline: '时间线',
  continuity: '叙事连贯',
  character: '角色一致性',
  logic: '逻辑',
  ai_flavor: 'AI味',
  pacing: '节奏',
  chapter_ending: '章尾质量',
  excitement: '爽点密度',
  show_dont_tell: '表达方式',
  other: '其他',
};

/**
 * 维度权重配置
 */
export const DIMENSION_WEIGHTS: Record<ReviewCategory, number> = {
  setting: 0.15,
  timeline: 0.10,
  continuity: 0.15,
  character: 0.15,
  logic: 0.15,
  ai_flavor: 0.08,
  pacing: 0.07,
  chapter_ending: 0.05,
  excitement: 0.05,
  show_dont_tell: 0.05,
  other: 0,
};

/**
 * 审查结果
 */
export interface ReviewResult {
  /** 问题列表 */
  issues: ReviewIssue[];
  /** 总结 */
  summary: string;
  /** 阻断问题数量 */
  blockingCount: number;
  /** 高优问题数量 */
  highPriorityCount: number;
}

/**
 * 六维审查结果
 */
export interface SixDimensionReview {
  /** 设定一致性审查 */
  setting: {
    passed: boolean;
    issues: ReviewIssue[];
    checkedItems: string[];
  };
  /** 时间线审查 */
  timeline: {
    passed: boolean;
    issues: ReviewIssue[];
    checkedItems: string[];
  };
  /** 叙事连贯审查 */
  continuity: {
    passed: boolean;
    issues: ReviewIssue[];
    checkedItems: string[];
  };
  /** 角色一致性审查 */
  character: {
    passed: boolean;
    issues: ReviewIssue[];
    checkedItems: string[];
  };
  /** 逻辑审查 */
  logic: {
    passed: boolean;
    issues: ReviewIssue[];
    checkedItems: string[];
  };
  /** AI味审查 */
  aiFlavor: {
    passed: boolean;
    issues: ReviewIssue[];
    checkedItems: string[];
  };
  /** 总体结果 */
  overall: ReviewResult;
}

// ============================================
// Commit 机制类型定义
// ============================================

/**
 * 章节提交状态
 */
export type CommitStatus = 'pending' | 'accepted' | 'rejected';

/**
 * 投影状态
 */
export type ProjectionStatus = 'pending' | 'done' | 'skipped' | 'failed';

/**
 * 事件类型枚举
 */
export type EventType =
  | 'character_state_changed'  // 角色状态变化
  | 'power_breakthrough'      // 境界突破
  | 'relationship_changed'     // 关系变化
  | 'world_rule_revealed'     // 世界规则揭示
  | 'world_rule_broken'       // 世界规则打破
  | 'open_loop_created'        // 开放环创建
  | 'open_loop_closed'         // 开放环关闭
  | 'promise_created'         // 承诺创建
  | 'promise_paid_off'        // 承诺兑现
  | 'artifact_obtained';      // 物品获得

/**
 * 接受的事件
 */
export interface AcceptedEvent {
  /** 事件类型 */
  eventType: EventType;
  /** 主体（entity_id） */
  subject: string;
  /** 载荷 */
  payload: Record<string, any>;
  /** 章节索引 */
  chapterIndex: number;
}

/**
 * 状态变更
 */
export interface StateDelta {
  /** 实体ID */
  entityId: string;
  /** 字段名 */
  field: string;
  /** 旧值 */
  old: string | number | boolean;
  /** 新值 */
  new: string | number | boolean;
}

/**
 * 实体变更
 */
export interface EntityDelta {
  /** 实体ID */
  entityId: string;
  /** 操作类型 */
  action: 'upsert' | 'delete';
  /** 实体类型 */
  entityType: EntityType;
  /** 层级（主角/核心配角/功能角色/路人）*/
  tier?: EntityTier;
  /** 载荷 */
  payload: Record<string, any>;
}

/**
 * 实体类型
 */
export type EntityType = '角色' | '组织' | '地点' | '物品' | '势力';

/**
 * 实体层级
 */
export type EntityTier = 'protagonist' | 'core' | 'supporting' | 'minor';

/**
 * 大纲履约结果
 */
export interface FulfillmentResult {
  /** 已覆盖节点 */
  coveredNodes: string[];
  /** 遗漏节点 */
  missedNodes: string[];
  /** 超出大纲内容 */
  extraNodes?: string[];
}

/**
 * 消歧结果
 */
export interface DisambiguationResult {
  /** 实体ID */
  entityId: string;
  /** 解析别名 */
  resolvedAlias: string;
  /** 置信度 */
  confidence: number;
  /** 是否需要人工确认 */
  needsHumanConfirmation: boolean;
}

/**
 * 提取结果
 */
export interface ExtractionResult {
  /** 接受的事件 */
  acceptedEvents: AcceptedEvent[];
  /** 状态变更 */
  stateDeltas: StateDelta[];
  /** 实体变更 */
  entityDeltas: EntityDelta[];
  /** 出场实体 */
  entitiesAppeared: string[];
  /** 场景切片 */
  scenes: SceneChunk[];
  /** 摘要文本 */
  summaryText: string;
  /** 主导情节线 */
  dominantStrand?: 'quest' | 'fire' | 'constellation';
}

/**
 * 场景切片
 */
export interface SceneChunk {
  /** 场景索引 */
  index: number;
  /** 起始行 */
  startLine: number;
  /** 结束行 */
  endLine: number;
  /** 地点 */
  location?: string;
  /** 摘要 */
  summary: string;
  /** 涉及角色 */
  characters: string[];
}

/**
 * Commit Artifacts
 * Data Agent 生成的提交产物
 */
export interface ChapterCommitArtifacts {
  /** 大纲履约 */
  fulfillment: FulfillmentResult;
  /** 消歧结果 */
  disambiguation: DisambiguationResult[];
  /** 事实提取 */
  extraction: ExtractionResult;
}

/**
 * 章节提交
 */
export interface ChapterCommit {
  /** 章节ID */
  chapterId: string;
  /** 章节号 */
  chapterNumber: number;
  /** 状态 */
  status: CommitStatus;
  /** 提交产物 */
  artifacts: ChapterCommitArtifacts;
  /** 投影状态 */
  projectionStatus: ProjectionStatusMap;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 投影状态映射
 */
export interface ProjectionStatusMap {
  /** 状态投影 */
  state: ProjectionStatus;
  /** 索引投影 */
  index: ProjectionStatus;
  /** 摘要投影 */
  summary: ProjectionStatus;
  /** 记忆投影 */
  memory: ProjectionStatus;
  /** 向量投影 */
  vector: ProjectionStatus;
}

// ============================================
// 伏笔追踪增强类型定义
// ============================================

/**
 * 悬念类型
 */
export type LoopType = 'mystery' | 'conflict' | 'promise' | 'threat' | 'question';

/**
 * 紧急度
 */
export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

/**
 * 增强版伏笔
 */
export interface EnhancedForeshadow {
  /** 伏笔ID */
  id: string;
  /** 悬念正文 */
  content: string;
  /** 悬念类型 */
  loopType: LoopType;
  /** 紧急度 */
  urgency: UrgencyLevel;
  /** 埋设章节 */
  plantedChapter: number;
  /** 预期回收章节 */
  expectedPayoffChapter?: number;
  /** 实际回收章节 */
  payoffChapter?: number;
  /** 状态 */
  status: ForeshadowStatus;
  /** 置信度 */
  confidence?: number;
  /** 备注 */
  note?: string;
}

/**
 * 伏笔状态
 */
export type ForeshadowStatus = 'buried' | 'hinted' | 'foreshadowed' | 'resolved' | 'abandoned';

// ============================================
// 卷级规划类型定义
// ============================================

/**
 * 卷节拍
 */
export interface VolumeBeat {
  /** 节拍名称 */
  name: string;
  /** 章节范围 */
  chapterRange: [number, number];
  /** 描述 */
  description: string;
  /** 节拍类型 */
  type: BeatType;
}

/**
 * 节拍类型
 */
export type BeatType =
  | 'opening'        // 开端
  | 'rising_action'  // 上升动作
  | 'midpoint'       // 中点
  | 'complication'   // 复杂化
  | 'crisis'         // 危机
  | 'climax'         // 高潮
  | 'falling_action' // 下降动作
  | 'resolution';    // 解决

/**
 * 卷时间线事件
 */
export interface TimelineEvent {
  /** 事件名称 */
  name: string;
  /** 章节号 */
  chapter: number;
  /** 时间描述 */
  timeDescription: string;
  /** 是否为倒计时 */
  isCountdown: boolean;
  /** 倒计时天数（如果是倒计时）*/
  countdownDays?: number;
  /** 描述 */
  description: string;
}

/**
 * 卷级规划
 */
export interface VolumePlan {
  /** 卷号 */
  volumeNumber: number;
  /** 卷名 */
  volumeName: string;
  /** 卷摘要 */
  summary: string;
  /** 核心冲突 */
  coreConflict: string;
  /** 卷末高潮 */
  climax: string;
  /** 节拍表 */
  beats: VolumeBeat[];
  /** 时间线 */
  timeline: TimelineEvent[];
  /** Strand 分布 */
  strandDistribution: StrandDistribution;
  /** 爽点密度规划 */
  coolPointPlan?: string[];
  /** 伏笔规划 */
  foreshadowPlan?: EnhancedForeshadow[];
  /** 涉及角色 */
  involvedCharacters?: string[];
  /** 反派层级 */
  antagonistTiers?: AntagonistTier[];
}

/**
 * 反派层级
 */
export interface AntagonistTier {
  /** 层级 */
  tier: 'minor' | 'major' | 'main';
  /** 名称 */
  name: string;
  /** 压迫类型 */
  pressureType: string;
  /** 镜像功能 */
  mirrorFunction: string;
}
