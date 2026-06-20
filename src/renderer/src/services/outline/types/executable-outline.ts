export interface StoryPositioning {
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
  coolPointType?: string;
  involvedCharacters?: string[];
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
  keyCharacters: CharacterPlan[];
  foreshadowPlan: ForeshadowPlan[];
  chapterBlueprints?: ChapterBlueprint[];
}

export interface ExpandedOutlineResult {
  outline: ExecutableOutline | null;
  rawText?: string;
  strategy?: 'structured-text' | 'json' | 'fallback';
  warnings?: string[];
  /**
   * 是否严重残缺（角色 / 伏笔被截断）。为 true 时上层会触发重试，
   * 但若重试耗尽仍会连同最后一次结果返回，由 UI 提示用户手动重新生成。
   */
  severelyTruncated?: boolean;
}
