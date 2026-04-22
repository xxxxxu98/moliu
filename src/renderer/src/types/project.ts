export interface Project {
  id: string;
  name: string;
  description: string;
  genre: GenreTag[];
  wordCount: number;
  status: 'planning' | 'writing' | 'paused' | 'completed';
  volumes: Volume[];
  chapters: Chapter[];
  characters: Character[];
  worldSchema: WorldSchema;
  foreshadows: Foreshadow[];
  plotOutline: PlotNode[];
  modelConfig?: ModelConfig;
  createdAt: string;
  updatedAt: string;
}

export interface GenreTag {
  id: string;
  name: string;
  color?: string;
}

export interface Volume {
  id: string;
  name: string;
  orderIndex: number;
  summary?: string;
}

export interface Chapter {
  id: string;
  volumeId?: string;
  title: string;
  content: string;
  wordCount: number;
  orderIndex: number;
  version: number;
  status: 'draft' | 'editing' | 'final';
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  name: string;
  description?: string;
  profile: CharacterProfile;
  avatarPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterProfile {
  personality: string[];
  appearance?: string;
  background?: string;
  abilities?: string[];
  relationships?: Relationship[];
}

export interface Relationship {
  characterId: string;
  type: 'friend' | 'enemy' | 'family' | 'romantic' | 'neutral';
  description?: string;
}

export interface WorldSchema {
  locations: Location[];
  rules: WorldRule[];
  factions: Faction[];
}

export interface Location {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
}

export interface WorldRule {
  id: string;
  name: string;
  description: string;
  locked: boolean;
}

export interface Faction {
  id: string;
  name: string;
  description?: string;
}

export interface Foreshadow {
  id: string;
  hint: string;
  type: 'item' | 'dialogue' | 'event' | 'mystery';
  status: 'buried' | 'hinted' | 'foreshadowed' | 'resolved';
  createdChapter: number;
  suggestedResolutionChapter?: number;
}

export interface PlotNode {
  id: string;
  title: string;
  description?: string;
  type: 'main' | 'subplot' | 'foreshadow';
  chapterRange?: [number, number];
  parentId?: string;
}

export interface ModelConfig {
  defaultProvider: string;
  defaultModel?: string;
  providers: ProviderConfig[];
}

export interface ProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'moonshot' | 'deepseek' | 'ollama';
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  priority: number;
  models: string[];
  quota?: {
    used: number;
    limit?: number;
    resetDate?: string;
  };
}
