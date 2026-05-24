/**
 * 写作系统 v2 类型定义
 * 基于 webnovel-writer 架构
 */

/**
 * 预检结果
 */
export interface PreflightResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  contracts: {
    genre: string;
    volume: VolumeContract | null;
    chapter: ChapterContract | null;
  };
  projectInfo: {
    id: string;
    name: string;
    chapterCount: number;
  };
}

/**
 * 硬性约束
 */
export interface HardConstraints {
  goal: string;                    // 本章核心目标
  timeAnchor?: string;             // 时间锚点
  chapterSpan?: string;            // 章节跨度
  countdown?: string;             // 倒计时
  chapterEndOpenQuestion?: string;  // 结尾开放问题
}

/**
 * 风格指引
 */
export interface StyleGuidance {
  reasoning: string[];             // 推理规则
  antiPatterns: string[];         // 避雷模式（从 anti_patterns.json 加载）
  protagonistOOCAlert: string[];   // 主角 OOC 警戒
}

/**
 * 动态上下文
 */
export interface DynamicContext {
  recentStyle: string;           // 近期风格
  characterStates: Record<string, string>;  // 角色状态
  plotProgress: string;          // 情节进度
}

/**
 * 写作任务书
 */
export interface WritingTaskBook {
  // 硬性约束（优先级最高）
  hardConstraints: HardConstraints;

  // 结构化节点
  CBN: string;                  // 开始节点
  CPNs: string[];               // 推进节点
  CEN: string;                   // 结束节点

  // 必须覆盖 / 禁区
  mustCover: string[];
  forbiddenZones: string[];

  // 风格指引
  styleGuidance: StyleGuidance;

  // 场景补充（仅作参考，不能覆盖章纲）
  dynamicContext?: DynamicContext;
}

/**
 * 卷合同
 */
export interface VolumeContract {
  id: string;
  volumeNumber: number;
  title: string;
  pacingStrategy: string;         // 节奏策略
  coolPointTarget: number;      // 爽点目标
  readerSignals: string[];       // 读者信号
  tone: string;                  // 基调
}

/**
 * 章节合同
 */
export interface ChapterContract {
  id: string;
  chapterNumber: number;
  title: string;

  // 指令
  directive: {
    goal: string;                // 章节目标
    timeAnchor?: string;
    chapterSpan?: string;
    countdown?: string;
    chapterEndOpenQuestion?: string;

    // 结构化节点
    CBN?: string;
    CPNs?: string[];
    CEN?: string;

    // 约束
    mustCoverNodes?: string[];
    forbiddenZones?: string[];
  };

  // 角色
  characters?: Array<{
    id: string;
    name: string;
    role: string;
    state: string;
    motivation: string;
    chapterRole: string;
    speakingStyle: string;
  }>;
}

/**
 * 审查输出
 */
export interface ReviewerOutput {
  blocking: boolean;              // true = 阻断
  issues: ReviewIssue[];
  metrics: ReviewMetrics;
  antiPatternIssues: AntiPatternIssue[];
}

export interface ReviewIssue {
  type: 'continuity' | 'contract' | 'anti_ai' | 'logic' | 'pace' | 'hook';
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: string;
  description: string;
  evidence: string;
  suggestion: string;
}

export interface ReviewMetrics {
  wordCount: number;
  dialogueRatio: number;
  antiAIFix: number;
  hookQuality: number;
  coolPointDensity: number;
}

export interface AntiPatternIssue {
  pattern: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
}

/**
 * 提取结果
 */
export interface ExtractionResult {
  acceptedEvents: ExtractedEvent[];
  stateDeltas: StateDelta[];
  entityDeltas: EntityDelta[];
  entitiesAppeared: string[];
  scenes: Scene[];
  summaryText: string;
}

export interface ExtractedEvent {
  event_id: string;
  chapter: number;
  event_type: 'promise' | 'threat' | 'revelation' | 'death' | 'relationship_change' | 'ability_change' | 'location_change' | 'item_change' | 'status_change';
  subject: string;
  payload: Record<string, any>;
}

export interface StateDelta {
  entity_id: string;
  field: string;
  from: string;
  to: string;
}

export interface EntityDelta {
  entity: string;
  change: string;
}

export interface Scene {
  location: string;
  time: string;
  participants: string[];
}

/**
 * 完成度结果
 */
export interface FulfillmentResult {
  plannedNodes: string[];        // 来自章纲
  coveredNodes: string[];       // 已覆盖
  missedNodes: string[];        // 遗漏
  extraNodes: string[];         // 额外增加
}

/**
 * 歧义结果
 */
export interface DisambiguationResult {
  pending: Array<{
    id: string;
    question: string;
    status: 'pending' | 'resolved' | 'ignored';
  }>;
  resolved: Array<{
    id: string;
    answer: string;
  }>;
}

/**
 * 章节提交
 */
export interface ChapterCommit {
  id: string;
  chapter: number;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: string;

  // 输入 artifacts
  reviewResult: ReviewerOutput;
  fulfillmentResult: FulfillmentResult;
  disambiguationResult: DisambiguationResult;
  extractionResult: ExtractionResult;

  // 判定结果
  reasons: string[];
  projectionStatus: ProjectionStatus;
}

/**
 * 投影状态
 */
export interface ProjectionStatus {
  state: 'done' | 'pending' | 'failed' | 'skipped';
  index: 'done' | 'pending' | 'failed' | 'skipped';
  summary: 'done' | 'pending' | 'failed' | 'skipped';
  memory: 'done' | 'pending' | 'failed' | 'skipped';
  vector: 'done' | 'pending' | 'failed' | 'skipped';
}

/**
 * anti_patterns 注册表
 */
export interface AntiPatternsRegistry {
  patterns: AntiPatternEntry[];
  lastUpdated: string;
}

export interface AntiPatternEntry {
  id: string;
  pattern: string;
  source: 'review' | 'manual';
  firstFoundChapter: number;
  frequency: number;
  severity: 'high' | 'medium' | 'low';
  autoFix?: string;
}

/**
 * 润色配置
 */
export interface PolishConfig {
  enableGateA: boolean;  // 禁用词替换
  enableGateB: boolean;  // 句式去套路
  enableGateC: boolean;  // 心理外化
  enableGateD: boolean;  // 节奏打碎
  enableGateE: boolean;  // 对话去腔调
  enableGateF: boolean;  // 结尾去升华
  autoFixNonBlocking: boolean;  // 自动修复非阻断问题
}

/**
 * 润色结果
 */
export interface PolishResult {
  content: string;
  fixes: PolishFix[];
  gatesPassed: string[];
  antiAIScore: number;
}

export interface PolishFix {
  type: 'gate_a' | 'gate_b' | 'gate_c' | 'gate_d' | 'gate_e' | 'gate_f' | 'non_blocking';
  original: string;
  replacement: string;
  reason: string;
  location?: string;
}

/**
 * 写作流程状态
 */
export type WritingStep =
  | 'idle'
  | 'preflight'
  | 'taskbook'
  | 'draft'
  | 'supplement'
  | 'review'
  | 'polish'
  | 'commit'
  | 'backup';

/**
 * 写作模式
 */
export type WritingMode =
  | 'smart_continue'    // 智能续写
  | 'polish'           // 润色
  | 'supplement';      // 补充续写

/**
 * 审查严格度
 */
export type ReviewStrictness = 'relaxed' | 'normal' | 'strict';

/**
 * 审查维度
 */
export enum ReviewDimension {
  CONTINUITY = 'continuity',        // 连续性
  CONTRACT = 'contract',           // 合同符合度
  ANTI_AI = 'anti_ai',           // 去AI味
  LOGIC = 'logic',              // 逻辑一致性
  PACE = 'pace',                   // 节奏
  HOOK = 'hook',                   // 钩子
}
