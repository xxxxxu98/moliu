/**
 * 写作流水线类型定义
 * 基于 webnovel-writer 架构
 */

// ============================================================
// 流水线状态
// ============================================================

export enum WritingStep {
  TASK_BOOK = 'task_book',
  DRAFT = 'draft',
  REVIEW = 'review',
  POLISH = 'polish',
  COMMIT = 'commit',
  BACKUP = 'backup',
}

export enum PipelineStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// ============================================================
// 流水线配置
// ============================================================

export interface PipelineConfig {
  mode: 'default' | 'fast' | 'minimal';
  enableTaskBook: boolean;
  enableReview: boolean;
  enablePolish: boolean;
  enableCommit: boolean;
  enableBackup: boolean;
  maxRetries: number;
  qualityThreshold: number;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  mode: 'default',
  enableTaskBook: true,
  enableReview: true,
  enablePolish: true,
  enableCommit: true,
  enableBackup: true,
  maxRetries: 3,
  qualityThreshold: 70,
};

// ============================================================
// 流水线步骤结果
// ============================================================

export interface StepResult {
  step: WritingStep;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export interface TaskBookStepResult extends StepResult {
  step: WritingStep.TASK_BOOK;
  data: TaskBook;
}

export interface DraftStepResult extends StepResult {
  step: WritingStep.DRAFT;
  data: {
    content: string;
    wordCount: number;
  };
}

export interface ReviewStepResult extends StepResult {
  step: WritingStep.REVIEW;
  data: ReviewResult;
  blocked: boolean;
}

export interface PolishStepResult extends StepResult {
  step: WritingStep.POLISH;
  data: {
    content: string;
    antiAIResult: AntiAIResult;
  };
}

export interface CommitStepResult extends StepResult {
  step: WritingStep.COMMIT;
  data: CommitResult;
}

export interface BackupStepResult extends StepResult {
  step: WritingStep.BACKUP;
  data: {
    commitHash: string;
    files: string[];
  };
}

// ============================================================
// 流水线执行结果
// ============================================================

export interface PipelineResult {
  chapterNumber: number;
  status: PipelineStatus;
  steps: StepResult[];
  finalContent?: string;
  finalWordCount: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ============================================================
// 任务书 (TaskBook)
// 基于 webnovel-writer 五段式任务书
// ============================================================

export interface TaskBook {
  // 第一段：开篇委托
  opening: TaskBookOpening;
  
  // 第二段：故事
  story: TaskBookStory;
  
  // 第三段：人物
  characters: TaskBookCharacter[];
  
  // 第四段：怎么写
  writingGuidance: TaskBookWritingGuidance;
  
  // 第五段：收在哪里
  ending: TaskBookEnding;
  
  // Anti-AI 提醒
  antiAIReminders: string[];
  
  // 元数据
  meta: {
    chapterNumber: number;
    genre: string;
    createdAt: string;
    source: 'outline' | 'contract' | 'runtime';
  };
}

export interface TaskBookOpening {
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  oneLineGoal: string;
}

export interface TaskBookStory {
  previousSummary: string;
  previousChapterEnding: string;
  goal: string;
  obstacles: string[];
  cbn: string;  // 开始节点: 主体|动作|对象
  cpns: string[];  // 中间节点
  cen: string;   // 结束节点
  mustCover: string[];
  forbiddenZones: string[];
  crossChapterClues: string[];
  timeAnchor: string;
  chapterSpan: string;
}

export interface TaskBookCharacter {
  name: string;
  role: string;
  state: string;
  motivation: string;
  chapterRole: string;
  speakingStyle: string;
  appearance?: string;
}

export interface TaskBookWritingGuidance {
  stylePriority: string[];
  pacingStrategy: 'build_up' | 'confront' | 'release' | 'normal';
  genreHint: string;
  antiPatterns: string[];
  // oh-story 核心技法
  hookStrategy: HookStrategy;
  shockLayers: boolean;
  coolPointDensity: number;  // 每 N 字一个爽点
  emotionWavePattern?: string;
  // 写作铁律
  writingRules: string[];
}

export interface HookStrategy {
  chapterStartHooks: ChapterHookType[];
  chapterEndHook: ChapterHookType;
  diversifyFrom?: string;
  tensionLevel: 'low' | 'medium' | 'high';
}

export type ChapterHookType =
  | 'sudden_reveal'      // 突然揭示
  | 'urgent_crisis'      // 紧急危机
  | 'unfinished_action'  // 未完成动作
  | 'identity_reveal'    // 身份反转
  | 'tough_choice'       // 两难抉择
  | 'mysterious_item'    // 神秘物品
  | 'countdown'          // 倒计时
  | 'promise_threat'     // 承诺/威胁
  | 'strange_disappear'  // 离奇消失
  | 'hidden_meaning'      // 隐藏含义
  | 'imagery'            // 意象钩子
  | 'echo'               // 回声钩子
  | 'blank';            // 留白钩子

export interface TaskBookEnding {
  target: string;
  unfinishedQuestions: string[];
  hookType: ChapterHookType;
  tensionLevel: 'low' | 'medium' | 'high';
}

// ============================================================
// 审查结果 (Review)
// ============================================================

export interface ReviewResult {
  overall: {
    pass: boolean;
    blockingCount: number;
    warningCount: number;
    score: number;
    summary: string;
  };
  dimensions: ReviewDimensions;
  blockingIssues: ReviewIssue[];
  warnings: ReviewIssue[];
  suggestions: ReviewSuggestion[];
}

export interface ReviewDimensions {
  continuity: ReviewDimension;      // 一致性
  hookScore: ReviewDimension;      // 钩子得分
  coolpointScore: ReviewDimension; // 爽点得分
  paceScore: ReviewDimension;     // 节奏得分
  antiAIScore: ReviewDimension;    // 去AI味得分
  contractScore: ReviewDimension;  // 合同符合度
}

export interface ReviewDimension {
  score: number;
  issues: ReviewIssue[];
  warnings: ReviewIssue[];
  isBlocking: boolean;
}

export interface ReviewIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  location: string;
  description: string;
  suggestion: string;
}

export interface ReviewSuggestion {
  dimension: string;
  type: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

// ============================================================
// 润色结果
// ============================================================

export interface PolishResult {
  originalContent: string;
  polishedContent: string;
  passes: {
    stripGeneric: boolean;
    cutProfessionalDiction: boolean;
    restoreHumanPresence: boolean;
    styleAdapt: boolean;
  };
  antiAIResult: AntiAIResult;
  changes: PolishChange[];
}

export interface AntiAIResult {
  pass: boolean;
  score: number;
  issues: string[];
  suggestions: string[];
}

export interface PolishChange {
  type: 'replacement' | 'deletion' | 'addition';
  location: string;
  original: string;
  changed: string;
  reason: string;
}

// ============================================================
// Commit 结果
// ============================================================

export interface CommitResult {
  status: 'accepted' | 'rejected';
  chapter: number;
  timestamp: string;
  fulfillment: FulfillmentResult;
  disambiguation: DisambiguationResult;
  extraction: ExtractionResult;
  projection: ProjectionStatus;
  reasons: string[];
}

export interface FulfillmentResult {
  plannedNodes: string[];
  coveredNodes: string[];
  missedNodes: string[];
  extraNodes: string[];
}

export interface DisambiguationResult {
  pending: DisambiguationItem[];
  resolved: DisambiguationItem[];
}

export interface DisambiguationItem {
  id: string;
  question: string;
  resolution?: string;
  status: 'pending' | 'resolved' | 'ignored';
}

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
  event_type: string;
  subject: string;
  payload: {
    action: string;
    result: string;
  };
}

export interface StateDelta {
  entity_id: string;
  field: string;
  from: string;
  to: string;
}

export interface EntityDelta {
  entity_id: string;
  change_type: 'appeared' | 'disappeared' | 'changed';
  details: string;
}

export interface Scene {
  location: string;
  time: string;
  participants: string[];
}

export interface ProjectionStatus {
  state: 'done' | 'pending' | 'failed' | 'skipped';
  index: 'done' | 'pending' | 'failed' | 'skipped';
  summary: 'done' | 'pending' | 'failed' | 'skipped';
  memory: 'done' | 'pending' | 'failed' | 'skipped';
  vector: 'done' | 'pending' | 'failed' | 'skipped';
}

// ============================================================
// 流水线事件
// ============================================================

export interface PipelineEvent {
  type: 'step_start' | 'step_complete' | 'step_error' | 'step_retry' | 'pipeline_complete' | 'pipeline_error';
  chapterNumber: number;
  step?: WritingStep;
  data?: any;
  error?: string;
  timestamp: string;
}

// ============================================================
// 流水线监听器
// ============================================================

export type PipelineListener = (event: PipelineEvent) => void | Promise<void>;
