/**
 * Enhanced Outline Schema
 * Comprehensive Zod schemas for the new outline generation system
 */

import { z } from 'zod';

// ====== 题材标签 ======

export const GenreTagSchema = z.enum([
  '玄幻', '仙侠', '都市', '言情', '悬疑', '科幻', '历史', '游戏', '轻小说'
]);
export type GenreTag = z.infer<typeof GenreTagSchema>;

// ====== 基础类型 ======

/** ID 生成器 */
export const IdSchema = z.string().describe('唯一标识');

// ====== 角色关系 ======

export const RelationshipSchema = z.object({
  targetName: z.string().describe('关联的角色名称'),
  type: z.enum(['friend', 'enemy', 'family', 'lover', 'rival', 'mentor', 'student', 'alliance', 'neutral']).describe('关系类型'),
  description: z.string().optional().describe('关系描述'),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

// ====== 增强的角色 Schema ======

export const CharacterSchema = z.object({
  id: IdSchema.optional().describe('角色ID'),
  name: z.string().describe('角色姓名'),
  role: z.enum(['protagonist', 'antagonist', 'mentor', 'supporting', 'minor']).describe('角色定位'),
  identity: z.string().describe('身份背景'),
  personality: z.array(z.string()).optional().default([]).describe('性格标签'),
  goldenFinger: z.string().optional().describe('金手指/独特优势'),
  strengths: z.array(z.string()).optional().default([]).describe('优势'),
  weaknesses: z.array(z.string()).optional().default([]).describe('短板'),
  goals: z.array(z.string()).optional().default([]).describe('目标'),
  currentDilemma: z.string().describe('当前困境'),
  appearance: z.string().optional().describe('外貌特征'),
  speechStyle: z.string().optional().describe('说话风格'),
  relationships: z.array(RelationshipSchema).optional().default([]).describe('角色关系'),
});
export type Character = z.infer<typeof CharacterSchema>;

// ====== 地点 ======

export const LocationSchema = z.object({
  id: IdSchema.optional().describe('地点ID'),
  name: z.string().describe('地点名称'),
  description: z.string().optional().describe('地点描述'),
  importance: z.enum(['major', 'minor']).default('minor').describe('重要性'),
  level: z.string().optional().describe('地点层级'),
  parentName: z.string().optional().describe('上级地点名称'),
});
export type Location = z.infer<typeof LocationSchema>;

// ====== 势力 ======

export const FactionSchema = z.object({
  id: IdSchema.optional().describe('势力ID'),
  name: z.string().describe('势力名称'),
  description: z.string().optional().describe('势力描述'),
  alignment: z.enum(['ally', 'enemy', 'neutral']).default('neutral').describe('阵营倾向'),
  parentName: z.string().optional().describe('上级势力名称'),
  allies: z.array(z.string()).optional().default([]).describe('友好势力'),
  enemies: z.array(z.string()).optional().default([]).describe('敌对势力'),
});
export type Faction = z.infer<typeof FactionSchema>;

// ====== 规则 ======

export const WorldRuleSchema = z.object({
  id: IdSchema.optional().describe('规则ID'),
  name: z.string().describe('规则名称'),
  description: z.string().optional().describe('规则描述'),
  category: z.enum(['cultivation', 'magic', 'social', 'physics', 'custom']).optional().describe('规则类别'),
  relatedRuleNames: z.array(z.string()).optional().default([]).describe('关联规则名称'),
});
export type WorldRule = z.infer<typeof WorldRuleSchema>;

// ====== 世界观设定 ======

export const WorldSettingSchema = z.object({
  type: z.string().optional().describe('世界类型'),
  locations: z.array(LocationSchema).optional().default([]).describe('地点列表'),
  factions: z.array(FactionSchema).optional().default([]).describe('势力列表'),
  rules: z.array(WorldRuleSchema).optional().default([]).describe('规则列表'),
  timeBaseline: z.string().optional().describe('时间基准'),
});
export type WorldSetting = z.infer<typeof WorldSettingSchema>;

// ====== 四幕结构 ======

const ActSchema = z.object({
  title: z.string().describe('幕标题'),
  content: z.string().describe('幕内容描述'),
  chapters: z.number().optional().describe('章节数'),
  wordCountRatio: z.number().optional().default(0.2).describe('字数占比'),
});

export const StructureSchema = z.object({
  act1: ActSchema.extend({ chapters: z.number(), wordCountRatio: z.number().default(0.2) }).describe('第一幕'),
  act2a: ActSchema.extend({ chapters: z.number(), wordCountRatio: z.number().default(0.25) }).describe('第二幕A'),
  act2b: ActSchema.extend({ chapters: z.number(), wordCountRatio: z.number().default(0.25) }).describe('第二幕B'),
  act3: ActSchema.extend({ chapters: z.number(), wordCountRatio: z.number().default(0.3) }).describe('第三幕'),
});
export type Structure = z.infer<typeof StructureSchema>;

// ====== 伏笔 ======

export const ForeshadowSchema = z.object({
  id: IdSchema.optional().describe('伏笔ID'),
  hint: z.string().describe('伏笔内容'),
  type: z.enum(['item', 'dialogue', 'event', 'mystery']).default('mystery').describe('伏笔类型'),
  suggestedChapter: z.number().optional().describe('建议揭晓章节'),
  status: z.enum(['active', 'fulfilled', 'abandoned']).default('active').describe('状态'),
  // 新增：伏笔分期
  phase: z.enum(['early', 'mid', 'late']).optional().describe('伏笔分期：早期(1-10章)、中期(11-30章)、长期(30章后或全篇)'),
});
export type Foreshadow = z.infer<typeof ForeshadowSchema>;

// ====== 章节 ======

export const ChapterSchema = z.object({
  id: IdSchema.optional().describe('章节ID'),
  number: z.number().describe('章节序号'),
  title: z.string().describe('章节标题'),
  summary: z.string().describe('一句话概括'),
  objectives: z.array(z.string()).optional().default([]).describe('本章目标'),
  coolPoints: z.array(z.string()).optional().default([]).describe('爽点'),
  foreshadows: z.array(z.string()).optional().default([]).describe('涉及伏笔'),
  strand: z.enum(['quest', 'fire', 'constellation']).default('quest').describe('故事线'),
  timeAnchor: z.string().optional().describe('时间锚点'),
  status: z.enum(['outline', 'draft', 'complete']).default('outline').describe('状态'),
  keyEvents: z.array(z.string()).optional().default([]).describe('关键事件'),
  involvedCharacters: z.array(z.string()).optional().default([]).describe('涉及角色'),
  // 新增：章节核心元素
  coreEvent: z.string().optional().describe('核心事件'),
  hook: z.string().optional().describe('章尾钩子'),
});
export type Chapter = z.infer<typeof ChapterSchema>;

// ====== 子情节 ======

export const SubplotSchema = z.object({
  id: IdSchema.optional().describe('子情节ID'),
  title: z.string().describe('子情节标题'),
  description: z.string().describe('子情节描述'),
  relatedCharacters: z.array(z.string()).optional().default([]).describe('涉及的角色名称'),
  chapterRange: z.tuple([z.number(), z.number()]).optional().describe('章节范围'),
  purpose: z.string().optional().describe('子情节的目的/主题'),
  status: z.enum(['setup', 'development', 'resolution']).default('setup').describe('状态'),
});
export type Subplot = z.infer<typeof SubplotSchema>;

// ====== 情绪目标 ======

export const EmotionGoalSchema = z.object({
  primary: z.string().describe('主要情绪'),
  secondary: z.string().optional().describe('次要情绪'),
  arc: z.enum(['rising', 'falling', 'wave', 'mixed']).default('rising').describe('情绪弧线'),
  density: z.number().default(3000).describe('情绪波动间隔(字)'),
  highPoints: z.array(z.number()).optional().default([]).describe('情绪高点章节'),
  lowPoints: z.array(z.number()).optional().default([]).describe('情绪低点章节'),
});
export type EmotionGoal = z.infer<typeof EmotionGoalSchema>;

// ====== 八条故事线 ======

const MapLineSchema = z.object({
  planned: z.array(z.string()).default([]).describe('规划地点'),
  introduced: z.array(z.string()).default([]).describe('已引入'),
  current: z.string().optional().describe('当前地点'),
  chaptersPerLocation: z.number().default(50).describe('每地点章节数'),
});

const FactionLineSchema = z.object({
  planned: z.array(z.string()).default([]).describe('规划势力'),
  introduced: z.array(z.string()).default([]).describe('已引入'),
  currentLevel: z.number().default(1).describe('当前等级'),
  escalationChapters: z.array(z.number()).default([]).describe('升级章节'),
});

const CharacterLineSchema = z.object({
  planned: z.array(z.object({ id: z.string(), role: z.string() })).default([]).describe('规划角色'),
  introduced: z.array(z.string()).default([]).describe('已引入'),
  keyRelationships: z.array(z.object({ from: z.string(), to: z.string(), type: z.string() })).default([]).describe('关键关系'),
});

const GoldenFingerLineSchema = z.object({
  type: z.string().describe('金手指类型'),
  currentStage: z.number().default(1).describe('当前阶段'),
  upgrades: z.array(z.object({ chapter: z.number(), description: z.string() })).default([]).describe('升级节点'),
  nextUpgrade: z.object({ chapter: z.number(), description: z.string() }).optional().describe('下次升级'),
});

const WorldRulesLineSchema = z.object({
  revealed: z.array(z.string()).default([]).describe('已揭示规则'),
  pending: z.array(z.string()).default([]).describe('待揭示规则'),
  nextReveal: z.object({ chapter: z.number(), rule: z.string() }).optional().describe('下次揭示'),
});

const ConflictLineSchema = z.object({
  chains: z.array(z.object({
    level: z.number().min(1).max(4),
    name: z.string(),
    description: z.string(),
    chapters: z.array(z.number()),
    status: z.enum(['pending', 'active', 'resolved']).default('pending'),
  })).default([]).describe('冲突链'),
  activeConflict: z.string().optional().describe('当前冲突'),
});

const CollectionLineSchema = z.object({
  target: z.array(z.string()).default([]).describe('收集目标'),
  progress: z.array(z.object({
    item: z.string(),
    acquired: z.boolean().default(false),
    chapter: z.number().optional(),
  })).default([]).describe('收集进度'),
});

const RomanceLineSchema = z.object({
  currentStage: z.enum(['cold', 'warm', 'hot', 'climax']).default('cold').describe('当前阶段'),
  progression: z.array(z.object({
    chapter: z.number(),
    stage: z.enum(['cold', 'warm', 'hot', 'climax']),
    description: z.string(),
  })).default([]).describe('感情进展'),
});

export const StoryLinesSchema = z.object({
  map: MapLineSchema,
  faction: FactionLineSchema,
  character: CharacterLineSchema,
  goldenfinger: GoldenFingerLineSchema,
  worldRules: WorldRulesLineSchema,
  conflict: ConflictLineSchema,
  collection: CollectionLineSchema,
  romance: RomanceLineSchema,
});
export type StoryLines = z.infer<typeof StoryLinesSchema>;

// ====== 矛盾设计 ======

const ConflictLevelSchema = z.object({
  level: z.number().min(1).max(4).describe('层级'),
  name: z.string().describe('名称'),
  description: z.string().describe('描述'),
  examples: z.array(z.string()).default([]).describe('示例'),
});

const MajorConflictSchema = z.object({
  id: IdSchema.optional().describe('冲突ID'),
  title: z.string().describe('标题'),
  type: z.enum(['S', 'A', 'B', 'C']).describe('强度级别'),
  status: z.enum(['pending', 'active', 'resolved']).default('pending').describe('状态'),
  chapters: z.array(z.number()).default([]).describe('涉及章节'),
  stakes: z.string().describe('赌注/风险'),
  resolution: z.string().optional().describe('解决方式'),
});

export const ConflictDesignSchema = z.object({
  source: z.enum([
    '资源/利益', '阵营/种族', '超凡途径',
    '信仰/宗教', '派系之争', '理念/三观'
  ]).default('资源/利益').describe('冲突来源'),
  escalation: z.array(ConflictLevelSchema).default([]).describe('矛盾递进'),
  majorConflicts: z.array(MajorConflictSchema).default([]).describe('主要冲突'),
});
export type ConflictDesign = z.infer<typeof ConflictDesignSchema>;

// ====== 爽点设计 ======

const CoolPointDensitySchema = z.object({
  micro: z.number().default(3000).describe('微爽点间隔(字)'),
  small: z.number().default(9000).describe('小爽点间隔(字)'),
  big: z.number().default(21000).describe('大爽点间隔(字)'),
});

export const CoolPointDesignSchema = z.object({
  density: CoolPointDensitySchema,
  patterns: z.array(z.string()).default([]).describe('爽点类型'),
  arranged: z.array(z.object({
    chapter: z.number(),
    type: z.string(),
    description: z.string(),
  })).default([]).describe('已安排爽点'),
});
export type CoolPointDesign = z.infer<typeof CoolPointDesignSchema>;

// ====== 完整大纲 (增强版) ======

export const OutlineSchema = z.object({
  // 基础信息
  id: IdSchema.optional().describe('唯一标识'),
  title: z.string().describe('故事标题'),
  synopsis: z.string().describe('故事简介 60-80字'),
  genres: z.array(z.string()).optional().default([]).describe('题材标签'),
  
  // 核心设定
  worldSetting: WorldSettingSchema.optional().describe('世界观设定'),
  characters: z.array(CharacterSchema).optional().default([]).describe('角色列表'),
  structure: StructureSchema.optional().describe('四幕结构'),
  
  // 章节
  chapters: z.array(ChapterSchema).optional().default([]).describe('章节大纲'),
  
  // 伏笔和子情节
  foreshadows: z.array(ForeshadowSchema).optional().default([]).describe('伏笔'),
  subplots: z.array(SubplotSchema).optional().default([]).describe('子情节'),
  
  // ====== 新增增强字段 ======
  
  // 核心卖点
  coreSellingPoints: z.array(z.string()).optional().default([]).describe('核心卖点'),
  
  // 情绪目标
  emotionGoal: EmotionGoalSchema.optional().describe('情绪目标'),
  
  // 八条故事线
  storyLines: StoryLinesSchema.optional().describe('八条故事线'),
  
  // 矛盾设计
  conflictDesign: ConflictDesignSchema.optional().describe('矛盾设计'),
  
  // 爽点设计
  coolPointDesign: CoolPointDesignSchema.optional().describe('爽点设计'),
  
  // ====== 元数据 ======
  estimatedWordCount: z.number().optional().default(300000).describe('预估字数'),
  targetWordCount: z.number().optional().describe('目标字数'),
  wordCountRange: z.string().optional().describe('字数区间'),
  
  // 卷信息
  volumes: z.number().optional().default(1).describe('卷数'),
  
  // 契约信息
  contractId: z.string().optional().describe('关联契约ID'),
});
export type Outline = z.infer<typeof OutlineSchema>;

// ====== 大纲列表 ======

export const OutlineListSchema = z.array(OutlineSchema);

// ====== 兼容旧版 Schema ======

/** @deprecated 使用新版 OutlineSchema */
export const LegacyOutlineSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  synopsis: z.string(),
  genres: z.array(z.string()).optional().default([]),
  worldSetting: z.any().optional(),
  structure: z.any().optional(),
  subplots: z.array(z.any()).optional().default([]),
  chapters: z.array(z.any()).optional().default([]),
  characters: z.array(z.any()).optional().default([]),
  foreshadows: z.array(z.any()).optional().default([]),
  estimatedWordCount: z.number().optional().default(300000),
});

/**
 * 迁移旧版大纲到新版
 * @deprecated 请使用新版大纲生成器
 */
export function migrateLegacyOutline(legacy: z.infer<typeof LegacyOutlineSchema>): Outline {
  return {
    id: legacy.id,
    title: legacy.title,
    synopsis: legacy.synopsis,
    genres: legacy.genres,
    worldSetting: legacy.worldSetting,
    structure: legacy.structure,
    chapters: legacy.chapters,
    foreshadows: legacy.foreshadows,
    subplots: legacy.subplots,
    characters: legacy.characters,
    estimatedWordCount: legacy.estimatedWordCount,
  };
}
