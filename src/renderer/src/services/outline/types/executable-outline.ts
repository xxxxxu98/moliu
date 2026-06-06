export interface StoryPositioning {
  targetReaders: string[];
  coreEmotions: string[];
  sellingPoints: string[];
  styleKeywords: string[];
}

export interface StoryEngine {
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

export interface CharacterPlan {
  name: string;
  role: 'protagonist' | 'ally' | 'antagonist' | 'mentor' | 'support';
  functionInStory: string;
  keyNeed: string;
  tensionWithProtagonist: string;
  revealTiming: string;
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
  storyEngine: StoryEngine;
  volumePlan: VolumePlan[];
  startupPack30: StartupPack30;
  keyCharacters: CharacterPlan[];
  chapterBlueprints?: ChapterBlueprint[];
}

export interface ExpandedOutlineResult {
  outline: ExecutableOutline | null;
  rawText?: string;
  strategy?: 'structured-text' | 'json' | 'fallback';
  warnings?: string[];
}
