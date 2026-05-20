/**
 * Outline Schema Definitions
 * Zod schemas for runtime validation of generated outlines
 */

import { z } from 'zod';

/**
 * 章节 Schema
 */
export const ChapterSchema = z.object({
  title: z.string().describe('章节标题'),
  summary: z.string().describe('章节摘要'),
  keyEvents: z.array(z.string()).optional().default([]).describe('关键事件'),
  involvedCharacters: z.array(z.string()).optional().default([]).describe('涉及角色'),
});

/**
 * 角色关系 Schema
 */
export const RelationshipSchema = z.object({
  targetName: z.string().describe('关联的角色名称'),
  type: z.string().describe('关系类型：friend/enemy/family/lover/rival/mentor/student/alliance/neutral'),
  description: z.string().optional().describe('关系描述'),
});

/**
 * 角色 Schema
 */
export const CharacterSchema = z.object({
  name: z.string().describe('角色姓名'),
  role: z.string().describe('角色定位（主角/反派/导师等）'),
  description: z.string().describe('角色描述'),
  personality: z.array(z.string()).optional().default([]).describe('性格特点'),
  appearance: z.string().optional().describe('外貌特征'),
  abilities: z.array(z.string()).optional().default([]).describe('特殊能力'),
  background: z.string().optional().describe('背景故事'),
  relationships: z.array(RelationshipSchema).optional().default([]).describe('角色关系'),
});

/**
 * 伏笔 Schema
 */
export const ForeshadowSchema = z.object({
  hint: z.string().describe('伏笔内容'),
  type: z.enum(['item', 'dialogue', 'event', 'mystery']).optional().default('mystery').describe('伏笔类型'),
  suggestedChapter: z.number().optional().describe('建议揭晓章节'),
});

/**
 * 四幕结构 Schema
 */
export const StructureSchema = z.object({
  act1: z.string().describe('第一幕：建置'),
  act2a: z.string().describe('第二幕A：对抗（上）'),
  act2b: z.string().describe('第二幕B：对抗（下）'),
  act3: z.string().describe('第三幕：结局'),
});

/**
 * 世界观设定 - 地点 Schema
 */
export const LocationSchema = z.object({
  name: z.string().describe('地点名称'),
  description: z.string().optional().describe('地点描述'),
  level: z.string().optional().describe('地点层级：world/continent/country/city/district/special'),
  parentName: z.string().optional().describe('上级地点名称'),
});

/**
 * 世界观设定 - 势力 Schema
 */
export const FactionSchema = z.object({
  name: z.string().describe('势力名称'),
  description: z.string().optional().describe('势力描述'),
  parentName: z.string().optional().describe('上级势力名称'),
  allies: z.array(z.string()).optional().default([]).describe('友好势力'),
  enemies: z.array(z.string()).optional().default([]).describe('敌对势力'),
});

/**
 * 世界观设定 - 规则 Schema
 */
export const WorldRuleSchema = z.object({
  name: z.string().describe('规则名称'),
  description: z.string().optional().describe('规则描述'),
  category: z.string().optional().describe('规则类别：cultivation/magic/social/physics/custom'),
  relatedRuleNames: z.array(z.string()).optional().default([]).describe('关联规则名称'),
});

/**
 * 世界观设定 Schema
 */
export const WorldSettingSchema = z.object({
  locations: z.array(LocationSchema).optional().default([]).describe('地点列表'),
  factions: z.array(FactionSchema).optional().default([]).describe('势力列表'),
  rules: z.array(WorldRuleSchema).optional().default([]).describe('规则列表'),
});

/**
 * 子情节 Schema
 */
export const SubplotSchema = z.object({
  title: z.string().describe('子情节标题'),
  description: z.string().describe('子情节描述'),
  relatedCharacters: z.array(z.string()).optional().default([]).describe('涉及的角色名称'),
  chapterRange: z.tuple([z.number(), z.number()]).optional().describe('章节范围'),
  purpose: z.string().optional().describe('子情节的目的/主题'),
});

/**
 * 大纲完整 Schema
 */
export const OutlineSchema = z.object({
  id: z.string().optional().describe('唯一标识'),
  title: z.string().describe('故事标题'),
  synopsis: z.string().describe('故事简介'),
  genres: z.array(z.string()).optional().default([]).describe('题材标签'),
  worldSetting: WorldSettingSchema.optional().describe('世界观设定'),
  structure: StructureSchema.optional().describe('四幕结构'),
  subplots: z.array(SubplotSchema).optional().default([]).describe('子情节'),
  chapters: z.array(ChapterSchema).optional().default([]).describe('章节大纲'),
  characters: z.array(CharacterSchema).optional().default([]).describe('角色列表'),
  foreshadows: z.array(ForeshadowSchema).optional().default([]).describe('伏笔列表'),
  estimatedWordCount: z.number().optional().default(300000).describe('预估字数'),
});

/**
 * 大纲列表 Schema
 */
export const OutlineListSchema = z.array(OutlineSchema);

/**
 * 类型导出
 */
export type Outline = z.infer<typeof OutlineSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Foreshadow = z.infer<typeof ForeshadowSchema>;
export type Structure = z.infer<typeof StructureSchema>;
export type WorldSetting = z.infer<typeof WorldSettingSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Faction = z.infer<typeof FactionSchema>;
export type WorldRule = z.infer<typeof WorldRuleSchema>;
export type Subplot = z.infer<typeof SubplotSchema>;
export type Relationship = z.infer<typeof RelationshipSchema>;
