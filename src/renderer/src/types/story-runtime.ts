export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ContractKind = 'master' | 'volume' | 'chapter' | 'review';
export type CommitStatus = 'accepted' | 'rejected';
export type ValidationSeverity = 'blocking' | 'warning';
export type ContinuityDomain =
  | 'entity'
  | 'knowledge'
  | 'inventory'
  | 'timeline'
  | 'causality'
  | 'fulfillment'
  | 'evidence';

export interface SourceTrace {
  source: string;
  sourceId?: string;
  chapter?: number;
}

export interface StoryEntity {
  id: string;
  kind: 'character' | 'location' | 'faction' | 'item' | 'rule' | 'foreshadow';
  name: string;
  aliases: string[];
  attributes: Record<string, JsonValue>;
  knownBy: string[];
  sourceTrace: SourceTrace[];
}

export interface StoryEvent {
  id: string;
  chapter: number;
  sceneId: string;
  type: string;
  summary: string;
  participants: string[];
  locationId?: string;
  causes: string[];
  effects: string[];
  evidence: string[];
  timestamp?: string;
  provisional?: boolean;
}

export interface SceneChunk {
  id: string;
  chapterId: string;
  chapterIndex: number;
  order: number;
  title: string;
  text: string;
  summary?: string;
  participants: string[];
  locations: string[];
  sourceTrace: SourceTrace[];
}

export interface StoryState {
  chapter: number;
  entities: Record<string, StoryEntity>;
  events: StoryEvent[];
  inventory: Record<string, Record<string, number>>;
  knowledge: Record<string, string[]>;
  timeline: string[];
  openForeshadows: string[];
  fulfilledNodes: string[];
}

export interface StateDelta {
  operation: 'set' | 'add' | 'remove' | 'increment';
  path: string;
  value?: JsonValue;
  evidence: string;
}

export interface ProvisionalStateOverlay {
  baseChapter: number;
  deltas: StateDelta[];
  events: StoryEvent[];
}

export interface StoryBootstrapData {
  schemaVersion: 'story-runtime/v1';
  project: {
    id: string;
    title: string;
    description: string;
    genres: string[];
  };
  entities: StoryEntity[];
  rules: StoryEntity[];
  foreshadows: StoryEntity[];
  outlineNodes: LegacyOutlineNode[];
  chapterMemories: LegacyChapterMemory[];
  sceneChunks: SceneChunk[];
  initialState: StoryState;
}

export interface LegacyCharacter {
  id: string;
  name: string;
  role?: string;
  description?: string;
  profile?: Record<string, unknown>;
}

export interface LegacyRule {
  id: string;
  name: string;
  description: string;
  locked?: boolean;
  category?: string;
}

export interface LegacyLocation {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  level?: string;
}

export interface LegacyFaction {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  relation?: unknown;
}

export interface LegacyForeshadow {
  id: string;
  hint: string;
  status: string;
  type?: string;
  createdChapter?: number;
  suggestedResolutionChapter?: number;
}

export interface LegacyOutlineNode {
  id: string;
  title: string;
  description?: string;
  chapterRange?: [number, number];
  chapterId?: string;
  keyEvents?: string[];
  CBN?: string;
  CPNs?: string[];
  CEN?: string;
  mustCover?: string[];
  forbiddenZones?: string[];
}

export interface LegacyChapterMemory {
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  corePlot: string;
  keyEvents: string[];
  locations: string[];
  timelineMark?: string;
  revealedForeshadows: string[];
  newForeshadows: string[];
}

export interface LegacyChapter {
  id: string;
  title: string;
  content: string;
  orderIndex: number;
  plotSummary?: string;
}

export interface LegacyProjectInput {
  id: string;
  name: string;
  description?: string;
  genre?: Array<{ id?: string; name: string }>;
  characters?: LegacyCharacter[];
  worldSchema?: {
    rules?: LegacyRule[];
    locations?: LegacyLocation[];
    factions?: LegacyFaction[];
  };
  foreshadows?: LegacyForeshadow[];
  plotOutline?: LegacyOutlineNode[];
  chapterMemories?: LegacyChapterMemory[];
  chapters?: LegacyChapter[];
}

export interface ContractMeta {
  schemaVersion: 'story-runtime/v1';
  kind: ContractKind;
  id: string;
  projectId: string;
  sourceTrace: SourceTrace[];
}

export interface MasterContract {
  meta: ContractMeta & { kind: 'master' };
  premise: string;
  genres: string[];
  immutableRules: string[];
  characterTruths: Record<string, string[]>;
  style: string[];
  forbidden: string[];
}

export interface VolumeContract {
  meta: ContractMeta & { kind: 'volume' };
  volumeNumber: number;
  title: string;
  objective: string;
  conflict: string;
  pacing: string[];
  requiredPayoffs: string[];
  forbidden: string[];
}

export interface ChapterContract {
  meta: ContractMeta & { kind: 'chapter' };
  chapterNumber: number;
  title: string;
  goal: string;
  CBN: string;
  CPNs: string[];
  CEN: string;
  mustCover: string[];
  forbidden: string[];
  timeAnchor?: string;
  /** 本章允许实际出场/说话的已登记角色名；空数组表示沿用旧逻辑不限制 */
  allowedCharacterNames?: string[];
  /** 尚未到揭示章节的事实，正文只能铺垫，不得明确说破 */
  futureReveals?: FutureRevealConstraint[];
}

export interface FutureRevealConstraint {
  description: string;
  notBeforeChapter: number;
}

export interface ReviewContract {
  meta: ContractMeta & { kind: 'review' };
  blockingDomains: ContinuityDomain[];
  requiredEvidence: boolean;
  maxWarnings: number;
  mustCheck: string[];
}

export interface ContractPack {
  master: MasterContract;
  volume: VolumeContract;
  chapter: ChapterContract;
  review: ReviewContract;
}

export interface CandidateEvent {
  id: string;
  summary: string;
  participants: string[];
  locationId?: string;
  prerequisites: string[];
  effects: string[];
}

export interface SceneBeat {
  id: string;
  kind: 'CBN' | 'CPN' | 'CEN';
  order: number;
  summary: string;
  dependsOn: string[];
  candidateEvents: CandidateEvent[];
}

export interface CandidatePrecheck {
  candidateId: string;
  accepted: boolean;
  reasons: string[];
}

export interface ScenePlan {
  chapterNumber: number;
  beats: SceneBeat[];
  prechecks: CandidatePrecheck[];
}

export type ContextBlockKind =
  | 'locked-contracts'
  | 'current-state'
  | 'recent-scenes'
  | 'retrieval'
  | 'style';

export interface ContextBlock {
  kind: ContextBlockKind;
  content: string;
  critical: boolean;
  tokenEstimate: number;
}

export interface ContextPack {
  blocks: ContextBlock[];
  totalTokenEstimate: number;
  omitted: ContextBlockKind[];
}

export interface ContextPackInput {
  contracts: ContractPack;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  recentScenes: SceneChunk[];
  retrievedScenes: SceneChunk[];
  styleGuidance: string[];
  maxTokens: number;
}

export interface StructuredAIRequest<T> {
  purpose:
    | 'scene-plan'
    | 'scene-draft'
    | 'chapter-review'
    | 'fact-extraction'
    | 'fulfillment-check'
    | 'chapter-judge';
  system: string;
  prompt: string;
  schemaName: string;
  parse: (value: unknown) => T;
}

/** 单个 mustCover 节点的 AI 语义履约判定 */
export interface FulfillmentNodeJudgment {
  node: string;
  fulfilled: boolean;
  evidence: string[];
  reason: string;
}

export interface FulfillmentCheckResult {
  results: FulfillmentNodeJudgment[];
}

/** @deprecated 请使用 ChapterJudge；保留作薄适配 */
export interface FulfillmentJudge {
  judge(input: {
    mustCover: string[];
    chapterText: string;
    facts: ExtractedFacts;
  }): Promise<FulfillmentCheckResult>;
}

export interface ForbiddenZoneJudgment {
  zone: string;
  violated: boolean;
  evidence: string[];
  reason: string;
}

export type ChapterJudgeIssueType =
  | 'fact_conflict'
  | 'logic_gap'
  | 'ooc'
  | 'timeline'
  | 'power'
  | 'foreshadow';

export interface ChapterJudgeIssue {
  type: ChapterJudgeIssueType;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: string;
  description: string;
  evidence: string[];
}

/** 统一语义审查包：履约 + 禁区 + 连贯性（一次 AI 请求） */
export interface ChapterJudgeResult {
  fulfillment: FulfillmentNodeJudgment[];
  forbidden: ForbiddenZoneJudgment[];
  issues: ChapterJudgeIssue[];
}

export interface ChapterJudgeStateDigest {
  entities?: Array<{ id: string; name: string; kind: string; attributes?: Record<string, unknown> }>;
  knowledge?: Record<string, string[]>;
  /** 各角色持有物（ownerId → itemName → 数量），用于判定「上章已赠出/销毁的物品本章再次出现」类冲突 */
  inventory?: Record<string, Record<string, number>>;
  openForeshadows?: string[];
}

export interface ChapterJudgeInput {
  mustCover: string[];
  forbiddenZones: string[];
  chapterText: string;
  facts?: ExtractedFacts;
  stateDigest?: ChapterJudgeStateDigest;
  chapterNumber?: number;
  allowedCharacterNames?: string[];
  futureReveals?: FutureRevealConstraint[];
  /** 是否审查事实/逻辑/OOC/时间线/战力/伏笔（默认 true） */
  checkDeepSemantic?: boolean;
}

export interface ChapterJudge {
  judge(input: ChapterJudgeInput): Promise<ChapterJudgeResult>;
}

export interface StructuredAI {
  generate<T>(request: StructuredAIRequest<T>): Promise<unknown>;
}

/**
 * 章节结尾闭合判断结果：用于补写决策，避免正文已充分收尾时仍硬塞注水段。
 */
export interface EndingClosureResult {
  /** 正文是否已闭合（CEN 已兑现 + 有明确章尾钩子/收束感） */
  closed: boolean;
  /** 判断理由（简短，供调试/日志） */
  reason: string;
}

export interface SceneDraft {
  sceneId: string;
  beatId: string;
  paragraphs: string[];
  candidateEvents: CandidateEvent[];
  /**
   * 本章吸引人的短标题（不含「第X章」前缀）。
   * 整章单次起草时由模型顺带生成；补字/压缩轮次可缺省。
   */
  chapterTitle?: string;
}

export interface ExtractedFacts {
  events: StoryEvent[];
  deltas: StateDelta[];
  evidence: string[];
}

export interface FactExtractor {
  extract(input: {
    projectId: string;
    chapterNumber: number;
    sceneDrafts: SceneDraft[];
    state: StoryState;
    overlay?: ProvisionalStateOverlay;
  }): Promise<ExtractedFacts>;
}

export interface ContinuityIssue {
  id: string;
  domain: ContinuityDomain;
  severity: ValidationSeverity;
  message: string;
  evidence: string[];
  sceneId?: string;
}

export interface ContinuityReport {
  accepted: boolean;
  issues: ContinuityIssue[];
  checkedDomains: ContinuityDomain[];
}

export interface ChapterCommit {
  id: string;
  projectId: string;
  chapterNumber: number;
  status: CommitStatus;
  /** accepted 事务应用 overlay 时使用的不可变基线。 */
  baseState: StoryState;
  contractPack: ContractPack;
  sceneDrafts: SceneDraft[];
  extractedFacts: ExtractedFacts;
  validation: ContinuityReport;
  overlay: ProvisionalStateOverlay;
  reasons: string[];
}

export interface ChapterCommitReceipt {
  commitId: string;
  revision: number;
  acceptedAt: string;
  /**
   * 本次 accepted commit 同事务创建的派生投影任务。
   * 调用方完成对应投影后，必须用 id 精确确认，避免误领历史任务。
   */
  projectionOutbox?: Array<{
    id: number;
    projectionType: 'summary' | 'memory';
  }>;
}

export type RevisionMode = 'expand' | 'compress' | 'repair';

/**
 * 正文重写计划。模式必须显式，避免“字数超限”与“禁止压缩”同时进入提示词。
 */
export interface RevisionPlan {
  mode: RevisionMode;
  hints: string[];
  minWords?: number;
  maxWords?: number;
}

export interface StoryRuntimeIPC {
  bootstrap(data: StoryBootstrapData): Promise<unknown>;
  loadState(projectId: string): Promise<unknown>;
  searchScenes(input: { projectId: string; query: string; limit: number }): Promise<unknown>;
  commitChapter(commit: ChapterCommit): Promise<unknown>;
  applyPatch(patch: StoryPatch): Promise<unknown>;
}

export interface ScenePatch {
  kind: 'scene';
  projectId: string;
  chapterNumber: number;
  sceneId: string;
  expectedRevision: number;
  replacement: SceneDraft;
  reason: string;
}

export interface ParagraphPatch {
  kind: 'paragraph';
  projectId: string;
  chapterNumber: number;
  sceneId: string;
  paragraphIndex: number;
  expectedRevision: number;
  replacement: string;
  reason: string;
}

export type StoryPatch = ScenePatch | ParagraphPatch;

export interface LongFormWriteInput {
  projectId: string;
  contracts: ContractPack;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  recentScenes: SceneChunk[];
  retrievedScenes: SceneChunk[];
  styleGuidance: string[];
  maxContextTokens: number;
  /** 目标字数；场景起草与提交前补字会尽量逼近该值 */
  targetWordCount?: number;
  /**
   * 审核未通过后的最大重写次数（不含初稿）。
   * 默认 2：最多 初稿 + 2 次重写；用尽后仍失败则 rejected。
   */
  maxRewriteRounds?: number;
  /**
   * 批量层重试时传入的「上一轮失败教训」种子。
   * 起草前注入到 revisionHints，让重试不是盲目重跑而是带反馈的定向重写——
   * 模型能据此规避上次的门禁问题（未履约节点 / fact_conflict / 禁区触发等）。
   * 引擎内部重写循环仍会在此基础上追加新问题的 hints。
   */
  seedRevisionHints?: string[];
}

export interface LongFormWriteResult {
  plan: ScenePlan;
  context: ContextPack;
  drafts: SceneDraft[];
  facts: ExtractedFacts;
  report: ContinuityReport;
  commit: ChapterCommit;
  receipt?: ChapterCommitReceipt;
  /** 实际发生的重写次数（0 = 初稿即通过） */
  rewriteRounds: number;
}
