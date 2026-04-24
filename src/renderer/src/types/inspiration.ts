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

/**
 * 大纲中生成的世界观信息
 */
export interface GeneratedWorldSetting {
  locations: GeneratedLocation[];
  factions: GeneratedFaction[];
  rules: GeneratedWorldRule[];
}

export interface GeneratedLocation {
  name: string;           // 地点名称
  description?: string;   // 地点描述
}

export interface GeneratedFaction {
  name: string;          // 势力名称
  description?: string;  // 势力描述
}

export interface GeneratedWorldRule {
  name: string;          // 规则名称（如修炼体系、社会法则等）
  description?: string; // 规则描述
}

export interface GeneratedOutline {
  id: string;
  title: string;
  synopsis: string;
  worldSetting?: GeneratedWorldSetting; // 新增：AI 生成的世界观
  structure: {
    act1: string;
    act2a: string;
    act2b: string;
    act3: string;
  };
  characters: GeneratedCharacter[];
  foreshadows: GeneratedForeshadow[];
  estimatedWordCount: number;
}

/**
 * 大纲中生成的角色信息
 */
export interface GeneratedCharacter {
  name: string;           // 角色名字
  role: string;           // 角色定位，如"主角"、"反派"、"导师"等
  description: string;    // 角色描述
  personality?: string[]; // 性格特点
  appearance?: string;    // 外貌特征
  abilities?: string[];   // 特殊能力
  background?: string;    // 背景故事
  relationships?: string; // 与其他角色的关系（描述）
}

/**
 * 大纲中生成的伏笔信息
 */
export interface GeneratedForeshadow {
  hint: string;           // 伏笔内容
  type?: 'item' | 'dialogue' | 'event' | 'mystery';  // 伏笔类型
  suggestedChapter?: number; // 建议揭晓的章节
}

export interface InspirationPack {
  tags: GenreTag[];
  elements: SettingElement[];
  storyNuclei: StoryNucleus[];
}
