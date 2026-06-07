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
  stage?: string;          // 关系所处阶段/变化节点
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
  number?: number;         // 章节编号
  status?: 'outline' | 'draft' | 'complete'; // 状态
  keyEvents?: string[];   // 关键事件
  involvedCharacters?: string[]; // 涉及角色
  coreEvent?: string;     // 核心事件
  coolPoints?: string[];   // 爽点
  hook?: string;          // 章尾钩子
  strand?: 'quest' | 'fire' | 'constellation'; // 故事线
}

/**
 * 情绪目标
 */
export interface GeneratedEmotionGoal {
  primary: string;           // 核心情绪
  secondary?: string;        // 次要情绪
  arc: 'rising' | 'falling' | 'wave' | 'mixed';  // 情绪弧线
  density?: number;           // 情绪波动间隔（字）
  highPoints?: number[];     // 情绪高点章节
  lowPoints?: number[];      // 情绪低点章节
}

/**
 * 爽点规划
 */
export interface GeneratedCoolPoint {
  type: string;              // 爽点类型：打脸爽/装逼爽/身份揭秘等
  description: string;        // 爽点描述
  suggestedChapter?: number;  // 建议章节
}

export interface GeneratedCoolPointDesign {
  patterns: string[];         // 爽点类型列表
  arranged: GeneratedCoolPoint[];  // 已安排的爽点
}

/**
 * 核心卖点
 */
export interface GeneratedCoreSellingPoint {
  name: string;              // 卖点名称
  description: string;        // 卖点描述
  priority: number;          // 优先级 1-5
}

/**
 * 矛盾设计（简化版）
 */
export interface GeneratedConflictDesign {
  source: string;             // 冲突来源
  escalation: string[];      // 矛盾递进描述
  majorConflicts: string[];   // 主要冲突列表
}

/**
 * 八条故事线（简化版）
 */
export interface GeneratedStoryLines {
  map: string;               // 地图线规划
  faction: string;           // 阵营线规划
  character: string;         // 人物线规划
  goldenfinger: string;      // 金手指线规划
  worldRules: string;        // 世界观线规划
  conflict: string;          // 矛盾线规划
  collection: string;         // 收集线规划
  romance: string;           // 感情线规划
}

/**
 * 故事规模规划
 */
export interface GeneratedStoryScale {
  targetWordCount: string;
  estimatedChapterCount: number;
  averageWordsPerChapter: number;
  suggestedVolumeCount: number;
  estimatedChaptersPerVolume: number;
  startupPhaseRatio: string;
  longformProgressionNote: string;
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
  // 故事规模规划
  storyScale?: GeneratedStoryScale;

  // ====== 新增增强字段 ======
  // 情绪目标
  emotionGoal?: GeneratedEmotionGoal;
  // 爽点设计
  coolPointDesign?: GeneratedCoolPointDesign;
  // 核心卖点
  coreSellingPoints?: GeneratedCoreSellingPoint[];
  // 矛盾设计（简化版）
  conflictDesign?: GeneratedConflictDesign;
  // 八条故事线（简化版）
  storyLines?: GeneratedStoryLines;

  // ====== 元数据 ======
  /** 卷数（兼容 OutlineSchema） */
  volumes?: number;
}

/**
 * 大纲中生成的伏笔信息
 */
export interface GeneratedForeshadow {
  hint: string;           // 伏笔内容
  type?: 'item' | 'dialogue' | 'event' | 'mystery' | 'character' | 'ability' | 'identity' | 'relationship' | 'world-rule';  // 伏笔类型
  suggestedChapter?: number; // 建议揭晓的章节
  setupChapter?: number;     // 建议埋设章节
  payoffChapter?: number;    // 建议回收章节
  payoffValue?: string;      // 回收收益
  carrierCharacter?: string; // 伏笔载体角色
  linkedConflict?: string;   // 关联冲突
  importance?: 'main' | 'subplot' | 'emotion';
}

export interface InspirationPack {
  tags: GenreTag[];
  elements: SettingElement[];
  storyNuclei: StoryNucleus[];
}

/**
 * 五维潜力评估
 */
export interface FiveDimensionEvaluation {
  originality: number;      // 原创性 (1-5)
  marketPotential: number;  // 市场潜力 (1-5)
  expandability: number;    // 扩展性 (1-5)
  difficulty: number;        // 创作难度 (1-5, 反向)
  personalMatch: number;    // 个人匹配 (1-5)
}

export interface EvaluationDimension {
  id: keyof FiveDimensionEvaluation;
  name: string;
  icon: string;
  description: string;
  color: string;
  gradient: string;
}
