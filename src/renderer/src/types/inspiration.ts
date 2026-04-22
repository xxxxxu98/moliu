export interface GenreTag {
  id: string;
  name: string;
  color: string;
}

export interface SettingElement {
  id: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface StoryNucleus {
  id: string;
  title: string;
  premise: string;
  conflict: string;
  characters: {
    role: string;
    name: string;
    traits: string[];
  }[];
  foreshadows: string[];
  genreTags: string[];
}

export interface GeneratedOutline {
  id: string;
  title: string;
  synopsis: string;
  structure: {
    act1: string;
    act2a: string;
    act2b: string;
    act3: string;
  };
  characters: {
    name: string;
    role: string;
    description: string;
  }[];
  foreshadows: string[];
  estimatedWordCount: number;
}

export interface InspirationPack {
  tags: GenreTag[];
  elements: SettingElement[];
  storyNuclei: StoryNucleus[];
}
