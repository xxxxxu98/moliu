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
 * 大纲中生成的世界观信息 - 层级化版本
 */
export interface GeneratedWorldSetting {
  locations: GeneratedLocation[];
  factions: GeneratedFaction[];
  rules: GeneratedWorldRule[];
}

export interface GeneratedLocation {
  name: string;           // 地点名称
  description?: string;   // 地点描述
  level?: string;         // 地点层级：world/continent/country/city/district/special
  parentName?: string;    // 上级地点名称（用于建立层级关系）
}

export interface GeneratedFaction {
  name: string;           // 势力名称
  description?: string;   // 势力描述
  parentName?: string;    // 上级势力名称
  allies?: string[];      // 友好势力
  enemies?: string[];     // 敌对势力
}

export interface GeneratedWorldRule {
  name: string;           // 规则名称（如修炼体系、社会法则等）
  description?: string;   // 规则描述
  category?: string;      // 规则类别：cultivation/magic/social/physics/custom
  relatedRuleNames?: string[]; // 关联规则名称
}

/**
 * 大纲中生成的角色信息 - 结构化关系版本
 */
export interface GeneratedCharacter {
  name: string;           // 角色名字
  role: string;           // 角色定位，如"主角"、"反派"、"导师"等
  description: string;    // 角色描述
  personality?: string[]; // 性格特点
  appearance?: string;    // 外貌特征
  abilities?: string[];   // 特殊能力
  background?: string;    // 背景故事
  // 结构化关系
  relationships?: GeneratedRelationship[];
}

export interface GeneratedRelationship {
  targetName: string;      // 关联的角色名称
  type: string;           // 关系类型：friend/enemy/family/lover/rival/mentor/student/alliance/neutral
  description?: string;    // 关系描述
}

/**
 * 子情节信息
 */
export interface GeneratedSubplot {
  title: string;          // 子情节标题
  description: string;    // 子情节描述
  relatedCharacters?: string[]; // 涉及的角色名称
  chapterRange?: [number, number]; // 章节范围
  purpose?: string;      // 子情节的目的/主题
}

/**
 * 章节级大纲
 */
export interface GeneratedChapter {
  title: string;           // 章节标题
  summary: string;        // 章节摘要/大纲
  keyEvents?: string[];   // 关键事件
  involvedCharacters?: string[]; // 涉及角色
}

/**
 * 完整的大纲输出
 */
export interface GeneratedOutline {
  id: string;
  title: string;
  synopsis: string;
  // 题材标签
  genres?: string[];
  // 世界观设定
  worldSetting?: GeneratedWorldSetting;
  // 四幕结构
  structure: {
    act1: string;
    act2a: string;
    act2b: string;
    act3: string;
  };
  // 子情节
  subplots?: GeneratedSubplot[];
  // 章节级大纲（可选，根据字数范围决定生成数量）
  chapters?: GeneratedChapter[];
  // 角色
  characters: GeneratedCharacter[];
  // 伏笔
  foreshadows: GeneratedForeshadow[];
  // 预估字数
  estimatedWordCount: number;
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
