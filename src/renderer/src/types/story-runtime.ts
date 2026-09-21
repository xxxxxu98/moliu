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
  /** 称呼变体（本名/称号互通），迁移时透传给 StoryEntity.aliases */
  aliases?: string[];
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
  /** 大纲规划的埋设章（全书章号，未必已写到）；归一化见 foreshadowLifecycle */
  setupChapter?: number;
  /** 正文实际埋设章号（确认埋设后回填） */
  actualPlantedChapter?: number;
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
  | 'research-dossier'
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

/** 检索回合(agent research loop)显式记录的信息缺口：写作时须模糊化或绕开，不得虚构 */
export interface ResearchGap {
  topic: string;
  reason: string;
}

/** 模型收尾时的完成自审清单（AgentLoopRunner 交叉核对后并入 dossier） */
export interface CoverageSelfAudit {
  castStatesConfirmed?: string[];
  foreshadowsChecked?: string[];
  priorEventsVerified?: string[];
  gaps?: ResearchGap[];
}

export type ResearchFinishReason = 'model-finish' | 'stall' | 'budget' | 'protocol-error';

export interface ResearchRunSummary {
  rounds: number;
  toolCalls: number;
  byTool: Record<string, number>;
  ms: number;
  finishReason: ResearchFinishReason;
}

/** 改稿 agent 回合摘要（初稿即通过时不存在） */
export interface WriterRunSummary extends ResearchRunSummary {
  /** 消耗的完整审查次数（旧 rewriteRounds 口径） */
  checksUsed: number;
  /** 模型改稿后未复检、最终稿回退到上一已审查 revision */
  revertedUnchecked: boolean;
}

/**
 * 检索回合蒸馏出的研究档案：agent 循环与写作上下文之间的唯一桥。
 * 写作 prompt 只渲染本档案（紧凑文本形态），不渲染循环的原始对话记录，
 * 防止多轮工具结果稀释注意力污染文风（docs/agent-loop-refactor.md §6）。
 */
export interface ResearchDossier {
  entitySnapshots: Array<{
    id: string;
    name: string;
    kind: string;
    statusLine: string;
    sourceRounds: number[];
  }>;
  foreshadowChecks: Array<{ id: string; hint: string; status: string; note?: string }>;
  priorSceneRefs: Array<{ chapter: number; summary: string }>;
  timelineFacts: string[];
  gaps: ResearchGap[];
  coverage?: CoverageSelfAudit;
  stats: ResearchRunSummary;
}

export interface ContextPackInput {
  contracts: ContractPack;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  recentScenes: SceneChunk[];
  retrievedScenes: SceneChunk[];
  styleGuidance: string[];
  maxTokens: number;
  /** 检索回合产出（启用 agent research 时传入）；缺省时行为与旧版完全一致 */
  dossier?: ResearchDossier;
}

export interface StructuredAIRequest<T> {
  purpose:
    | 'scene-plan'
    | 'scene-draft'
    | 'chapter-review'
    | 'fact-extraction'
    | 'fulfillment-check'
    | 'chapter-judge'
    | 'reader-outline-judge'
    | 'reader-chapter-judge'
    | 'reader-window-judge'
    | 'agent-research';
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
  /**
   * 本章已实际回收的伏笔 id 列表（须有正文证据原句支撑）。
   * 仅当输入给了 payoffCandidates 且判官能在正文中找到回收证据时非空；
   * 无 payoffCandidates 输入的旧调用方此字段恒为空数组。
   */
  resolvedForeshadowIds?: string[];
}

export interface ChapterJudgeStateDigest {
  entities?: Array<{
    id: string;
    name: string;
    kind: string;
    attributes?: Record<string, unknown>;
  }>;
  knowledge?: Record<string, string[]>;
  /** 各角色持有物（ownerId → itemName → 数量），用于判定「上章已赠出/销毁的物品本章再次出现」类冲突 */
  inventory?: Record<string, Record<string, number>>;
  openForeshadows?: string[];
}

export interface ChapterJudgeInput {
  mustCover: string[];
  forbiddenZones: string[];
  chapterText: string;
  /** 上章结尾原文（截取尾部）：用于判定「上章已登场角色本章被重置登场」类断裂 */
  prevChapterTail?: string;
  facts?: ExtractedFacts;
  stateDigest?: ChapterJudgeStateDigest;
  chapterNumber?: number;
  allowedCharacterNames?: string[];
  futureReveals?: FutureRevealConstraint[];
  /** 是否审查事实/逻辑/OOC/时间线/战力/伏笔（默认 true） */
  checkDeepSemantic?: boolean;
  /**
   * 本章到达回收时点的伏笔候选（id + hint 文案）。
   * 传入后判官额外判定哪些伏笔已在正文实际回收（resolvedForeshadowIds），
   * 用于驱动进度面板的 buried→resolved 流转。未传则不做回收判定。
   */
  payoffCandidates?: Array<{ id: string; hint: string }>;
  /** 全书既成纪年锚（写作侧同源）：正文中出现锚外年号即自创年号，判官报 logic_gap */
  eraAnchors?: string[];
  /** 近章既成数字叙述：同一笔数额/编制/数量无勘误剧情改写，判官报 fact_conflict */
  numericFacts?: string[];
  /** 假死在册角色名单（假死=活着隐匿中，非死亡）：其活体活动不报 fact_conflict */
  fakedDeathNames?: string[];
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
  /**
   * 本章经判官证据确认已实际回收的伏笔 id（来自 chapterJudge 的
   * resolvedForeshadowIds，无 payoffCandidates 时为空数组）。
   * 消费方据此做 buried→resolved 流转；判官未列出的伏笔保持原状态。
   */
  resolvedForeshadowIds?: string[];
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
  /**
   * 本章到达回收时点的伏笔候选（id + hint）。透传给语义审查判官，
   * 证据确认已回收的 id 会出现在 result.report.resolvedForeshadowIds。
   */
  eraAnchors?: string[];
  /**
   * 近章既成数字叙述（确定性原文抽取：金额/编制/数量句）。写作侧【数字锚】与
   * 判官【数字一致】校验的共源输入（2026-09-17 g38f r6 实证：同一笔盐税五套口径、
   * 存粮四万石无解释改四十万石——长程数字漂移是书审最大 S1 簇）。
   */
  numericFacts?: string[];
  /**
   * 本章出场角色的角色卡身份首句（r6 实证：角色表赵宣=三皇子恭王，写手自行
   * 发明「刑部主事姻亲」降格身份）。写作侧【身份锚】注入。
   */
  characterIdentityAnchors?: Array<{ name: string; identity: string }>;
  /**
   * 假死在册角色（r8 实证：假死被登「死亡」后三道防线锁死主角 48 章）。
   * 假死=活着的隐匿状态，不进终态禁令；写作侧注入【假死纪律】。
   */
  fakedDeathCharacters?: Array<{ name: string; chapterIndex: number }>;
  payoffCandidates?: Array<{ id: string; hint: string }>;
  /**
   * 上一章实际写出的结尾原文（批量续写链路传入）。
   * 用于起草时的「上章衔接」仲裁指令：大纲 CBN 与上章正文事实冲突时
   * 以后者为准向前推进，防止开场状态回退（2026-08-26 实测：第 9 章花海已怒放、
   * 第 10 章 CBN 写含苞待放，模型照 CBN 字面把状态回退了）。
   */
  previousChapterEnding?: string;
  /**
   * 全书已提交章节的场景块（检索回合 read_chapter/search_scenes 的内存数据源）。
   * 启用 agent research 时由管线传入；缺省时检索回合的这两个工具退化为
   * recentScenes 范围。
   */
  sceneChunks?: SceneChunk[];
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
  /** 检索回合摘要（未启用/失败降级时为 undefined） */
  research?: ResearchRunSummary;
  /** 改稿 agent 回合摘要（未注入 writerAgent 或初稿即通过时为 undefined） */
  writer?: WriterRunSummary;
}
