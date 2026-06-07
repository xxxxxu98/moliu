export interface StoryPositioning {
  targetReaders: string[];
  coreEmotions: string[];
  sellingPoints: string[];
  styleKeywords: string[];
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
  volumePlan: VolumePlan[];
  startupPack30: StartupPack30;
  keyCharacters: CharacterPlan[];
  foreshadowPlan: ForeshadowPlan[];
  chapterBlueprints?: ChapterBlueprint[];
}

export interface ExpandedOutlineResult {
  outline: ExecutableOutline | null;
  rawText?: string;
  strategy?: 'structured-text' | 'json' | 'fallback';
  warnings?: string[];
}
