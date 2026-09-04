export interface StoryPositioning {
  /** 纯题材标签，如古言、悬疑、玄幻；不得混入读者或情绪描述 */
  genreTags?: string[];
  targetReaders: string[];
  coreEmotions: string[];
  sellingPoints: string[];
  styleKeywords: string[];
}

export interface StoryActPlan {
  name: 'act1' | 'act2a' | 'act2b' | 'act3';
  label: string;
  objective: string;
  keyTurn: string;
  endingState: string;
}

export interface WorldLocationPlan {
  name: string;
  level: 'world' | 'continent' | 'country' | 'city' | 'district' | 'special';
  functionInStory: string;
  parentName?: string;
  relatedConflict?: string;
}

export interface WorldFactionPlan {
  name: string;
  positioning: string;
  objective: string;
  allies: string[];
  enemies: string[];
  relationToProtagonist: string;
  parentName?: string;
}

export interface WorldRulePlan {
  name: string;
  category: 'cultivation' | 'magic' | 'social' | 'physics' | 'custom';
  content: string;
  limitation?: string;
  relatedRules: string[];
}

export interface SubplotPlan {
  title: string;
  functionInStory: string;
  relatedCharacters: string[];
  startChapter: number | null;
  endChapter: number | null;
  relationToMainPlot: string;
}

export interface StoryLinePlan {
  map: string;
  faction: string;
  character: string;
  goldenfinger: string;
  worldRules: string;
  conflict: string;
  collection: string;
  romance: string;
}

/**
 * 金手指设定模块（独立顶层模块，与八线中的 goldenfinger 字段区分）。
 *
 * 八线的 goldenfinger 是单段文案概述；这里是结构化的爽点引擎设定，
 * 含升级路径 / 限制 / 代价 / 首次兑现章节，是玄幻/系统/重生品类的签约命门。
 * 续写端优先消费本模块；八线 goldenfinger 仅在缺省时兜底。
 */
export interface GoldenFingerPlan {
  /** 金手指是什么（一句话定义） */
  type: string;
  /** 触发场景（主角如何获得/觉醒） */
  trigger: string;
  /** 升级路径（初阶→进阶→终极，分阶段） */
  upgradePath: string[];
  /** 使用限制（触发条件 / 冷却 / 消耗） */
  limitation: string;
  /** 使用代价（反噬 / 暴露风险 / 道德代价） */
  cost: string;
  /** 首次兑现章节（建议 1-3 章，绑定黄金三章） */
  firstRevealChapter: number | null;
}

export interface EmotionBeatPlan {
  primary: string;
  secondary?: string;
  arc: 'rising' | 'falling' | 'wave' | 'mixed';
  highPoints: number[];
  lowPoints: number[];
  density?: number;
}

export interface CoolPointBeatPlan {
  type: string;
  description: string;
  suggestedChapter: number | null;
  relatedBlock?: string;
  /** 爽点闭环结构（P1-1 新增，向后兼容：旧数据无这些字段时仍可工作） */
  trigger?: string;       // 触发场景（谁、什么处境下触发）
  buildup?: string;       // 铺垫（轻视/压制/困境，为兑现积蓄落差）
  payoff?: string;        // 兑现（爽点爆发的具体画面）
  cost?: string;          // 代价（兑现付出的代价，避免无脑碾压）
}

export interface SellingPointPlan {
  name: string;
  description: string;
  category: 'setting' | 'character' | 'conflict' | 'emotion' | 'hook' | 'coolpoint';
  priority: number;
  payoffStage?: string;
}

export interface StoryScalePlan {
  targetWordCount: string;
  estimatedChapterCount: number;
  averageWordsPerChapter: number;
  suggestedVolumeCount: number;
  estimatedChaptersPerVolume: number;
  startupPhaseRatio: string;
  longformProgressionNote: string;
}

export interface StoryEngine {
  protagonistName: string;
  protagonistStart: string;
  protagonistGoalLongTerm: string;
  protagonistGoalShortTerm: string;
  coreConflict: string;
  escalationPath: string[];
  failureCost: string;
}

export interface VolumePlan {
  volumeIndex: number;
  /** 本卷章节区间（1-based 闭区间），由卷纲「章节区间」字段解析；缺失时下游按规模估算分卷 */
  chapterRange?: { start: number; end: number };
  title: string;
  objective: string;
  coreConflict: string;
  climax: string;
  reversal: string;
  endingHook: string;
  protagonistGrowth: string;
  keyCharacters: string[];
  setupForeshadows: string[];
  payoffForeshadows: string[];
  relationshipShifts: string[];
}

export interface StartupChapterBlock {
  range: string;
  objective: string;
  mustEvents: string[];
  coolPoints: string[];
  hookRequirement: string;
  pacing: 'fast' | 'medium';
  readerExpectation: string;
  /** 本块禁区（1-3 条），约束正文不提前摊牌/泄露关键信息，透传到章节级 forbiddenZones */
  forbiddenZones?: string[];
}

export interface StartupPack30 {
  openingHook: string;
  promiseToReader: string;
  protagonistFirstImpression: string;
  firstMajorCoolPoint: string;
  firstConflictCycle: string;
  chapterBlocks: StartupChapterBlock[];
}

export interface CharacterRelationshipPlan {
  targetName: string;
  relationType: 'ally' | 'enemy' | 'mentor' | 'family' | 'lover' | 'rival' | 'use' | 'unknown';
  dynamic: string;
}

export interface CharacterPlan {
  name: string;
  role: 'protagonist' | 'ally' | 'antagonist' | 'mentor' | 'support';
  functionInStory: string;
  keyNeed: string;
  tensionWithProtagonist: string;
  revealTiming: string;
  publicGoal: string;
  hiddenNeed: string;
  fearOrWound: string;
  secret: string;
  turningPoint: string;
  arcStart: string;
  arcMid: string;
  arcEnd: string;
  resources: string[];
  relationshipChanges: CharacterRelationshipPlan[];
}

export interface ForeshadowPlan {
  id: string;
  hint: string;
  type: 'item' | 'dialogue' | 'event' | 'mystery' | 'character' | 'ability' | 'identity' | 'relationship' | 'world-rule';
  importance: 'main' | 'subplot' | 'emotion';
  setupPhase: string;
  payoffPhase: string;
  setupChapter: number | null;
  payoffChapter: number | null;
  carrierCharacter: string;
  linkedConflict: string;
  payoffValue: string;
}

export interface ChapterBlueprint {
  orderIndex: number;
  title: string;
  summary: string;
  CBN: string;
  CPNs: string[];
  CEN: string;
  mustCover: string[];
  forbiddenZones: string[];
  hookType: string;
  /** 章尾钩子文案（给读者看的「话术感」短句），区别于 hookType（枚举） */
  hookText?: string;
  coolPointType?: string;
  involvedCharacters?: string[];
  /** 蓝图自带节奏策略（release/confront 等），未填时由下游兜底 */
  pacingStrategy?: string;
}

/**
 * 大纲修复 agent 对「未登记角色引用」的语义裁决台账。
 * 语义判定（爵位/别称/官职代称指向谁、群体泛称、真新人物）全权归 agent，
 * 本地不再维护头衔/官职/阵营正则族（2026-09-03 退役，与命运词表塔同原则）；
 * 完整性门禁只做结构记账：未裁决引用阻断，已裁决引用放行。
 */
export interface CharacterReferenceResolution {
  /** 被引用的原始字面，如「齐王」「两江河道官员」 */
  reference: string;
  /** alias=指向已登记角色的别称/爵位/官职代称；collective=群体或职务泛称，非个体人物 */
  as: 'alias' | 'collective';
  /** as=alias 时必须命中关键角色规划的某个姓名 */
  target?: string;
}

export interface ExecutableOutline {
  title: string;
  oneLiner: string;
  premise: string;
  positioning: StoryPositioning;
  storyScale: StoryScalePlan;
  storyEngine: StoryEngine;
  acts?: StoryActPlan[];
  volumePlan: VolumePlan[];
  startupPack30: StartupPack30;
  worldBuilding?: {
    locations: WorldLocationPlan[];
    factions: WorldFactionPlan[];
    rules: WorldRulePlan[];
  };
  subplots?: SubplotPlan[];
  storyLines?: StoryLinePlan;
  emotionPlan?: EmotionBeatPlan;
  coolPointPlan?: CoolPointBeatPlan[];
  sellingPointPlan?: SellingPointPlan[];
  goldenfingerPlan?: GoldenFingerPlan;
  keyCharacters: CharacterPlan[];
  foreshadowPlan: ForeshadowPlan[];
  chapterBlueprints?: ChapterBlueprint[];
  /** agent 裁决台账：仅由大纲修复 agent 的 resolve_character_references 写入 */
  characterReferenceResolutions?: CharacterReferenceResolution[];
}

export interface ExpandedOutlineResult {
  outline: ExecutableOutline | null;
  /** 重试耗尽后的残缺结果，仅供诊断/展示，禁止应用。 */
  partialOutline?: ExecutableOutline;
  rawText?: string;
  strategy?: 'structured-text' | 'json' | 'fallback';
  warnings?: string[];
  /** 是否通过生产级完整性门槛。 */
  canApply?: boolean;
  /** 阻断应用的结构化原因。 */
  blockers?: string[];
  /**
   * 是否严重残缺（角色 / 伏笔被截断）。为 true 时上层会触发重试，
   * 重试耗尽后只会通过 partialOutline 返回诊断数据，outline 保持 null，禁止应用。
   */
  severelyTruncated?: boolean;
}
