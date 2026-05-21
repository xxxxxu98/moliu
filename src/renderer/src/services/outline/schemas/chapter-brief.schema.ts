/**
 * Chapter Brief Schema Definitions
 * Zod schemas for chapter-level outline generation
 */

import { z } from 'zod';

// ====== 章节节点类型 ======

export const ChapterNodeTypeEnum = z.enum(['CBN', 'CPN', 'CEN']);
export type ChapterNodeTypeEnum = z.infer<typeof ChapterNodeTypeEnum>;

export const NodeRoleEnum = z.enum(['start', 'progress', 'end']);
export type NodeRoleEnum = z.infer<typeof NodeRoleEnum>;

// ====== 章节节点 ======

export const ChapterNodeSchema = z.object({
  id: ChapterNodeTypeEnum,
  type: NodeRoleEnum,
  description: z.string().describe('节点描述'),
  requiredElements: z.array(z.string()).default([]).describe('必需元素'),
});
export type ChapterNode = z.infer<typeof ChapterNodeSchema>;

// ====== 章节节点序列 ======

export const ChapterNodesSchema = z.object({
  cbn: ChapterNodeSchema.describe('章节起点'),
  cpns: z.array(ChapterNodeSchema).min(2).max(4).describe('推进节点 (2-4个)'),
  cen: ChapterNodeSchema.describe('章节终点'),
});
export type ChapterNodes = z.infer<typeof ChapterNodesSchema>;

// ====== 章节承诺要求 ======

export const ChapterCommitRequirementsSchema = z.object({
  objective: z.string().describe('本章目标'),
  resistance: z.string().describe('主要阻力'),
  cost: z.string().describe('代价/风险'),
  timeAnchor: z.string().optional().describe('时间锚点'),
  countdownStatus: z.string().optional().describe('倒计时状态'),
  coolPoint: z.string().describe('爽点'),
  strand: z.enum(['quest', 'fire', 'constellation']).default('quest').describe('故事线'),
});
export type ChapterCommitRequirements = z.infer<typeof ChapterCommitRequirementsSchema>;

// ====== 禁止区域 ======

export const ForbiddenZoneSchema = z.object({
  type: z.enum([
    'character_death',
    'power_reveal',
    'relationship_change',
    'world_reveal'
  ]).describe('禁止类型'),
  target: z.string().describe('禁止目标'),
  reason: z.string().describe('禁止原因'),
});
export type ForbiddenZone = z.infer<typeof ForbiddenZoneSchema>;

// ====== 执行状态 ======

export const ChapterCommitExecutionSchema = z.object({
  plannedNodes: z.array(z.string()).default([]).describe('计划节点'),
  coveredNodes: z.array(z.string()).default([]).describe('已覆盖节点'),
  missedNodes: z.array(z.string()).default([]).describe('遗漏节点'),
  extraNodes: z.array(z.string()).default([]).describe('额外节点'),
});
export type ChapterCommitExecution = z.infer<typeof ChapterCommitExecutionSchema>;

// ====== 章节承诺 (Chapter Commit) ======

export const ChapterCommitSchema = z.object({
  meta: z.object({
    schemaVersion: z.string().default('story-system/v1'),
    contractType: z.enum(['story', 'volume', 'chapter']).default('chapter'),
    generatorVersion: z.string().default('1.0.0'),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  
  chapterId: z.number().describe('章节ID'),
  volumeId: z.number().describe('卷ID'),
  
  // 节点序列
  nodes: ChapterNodesSchema.describe('节点序列'),
  
  // 核心要素
  requirements: ChapterCommitRequirementsSchema.describe('章节要求'),
  
  // 禁止区域
  forbiddenZones: z.array(ForbiddenZoneSchema).default([]).describe('禁止区域'),
  
  // 伏笔
  foreshadowFulfilled: z.array(z.string()).default([]).describe('已兑现伏笔'),
  foreshadowSetup: z.array(z.string()).default([]).describe('新埋伏笔'),
  
  // 执行状态
  execution: ChapterCommitExecutionSchema.optional().describe('执行状态'),
});
export type ChapterCommit = z.infer<typeof ChapterCommitSchema>;

// ====== 章节简要 (Chapter Brief) ======

export const ChapterBriefSchema = z.object({
  chapterId: z.number().describe('章节ID'),
  volumeId: z.number().describe('卷ID'),
  
  // 基本信息
  title: z.string().describe('章节标题'),
  
  // 节点
  nodes: ChapterNodesSchema.describe('节点序列'),
  
  // 要点
  keyPoints: z.object({
    objective: z.string().describe('目标'),
    conflict: z.string().describe('冲突'),
    climax: z.string().describe('高潮'),
    hook: z.string().describe('钩子'),
  }).describe('关键要点'),
  
  // 时间
  timeAnchor: z.string().optional().describe('时间锚点'),
  countdownStatus: z.string().optional().describe('倒计时'),
  
  // 故事线
  strand: z.enum(['quest', 'fire', 'constellation']).default('quest').describe('故事线'),
  
  // 涉及内容
  involvedCharacters: z.array(z.string()).default([]).describe('涉及角色'),
  involvedLocations: z.array(z.string()).default([]).describe('涉及地点'),
  involvedFactions: z.array(z.string()).default([]).describe('涉及势力'),
  
  // 伏笔
  foreshadows: z.array(z.object({
    id: z.string(),
    type: z.enum(['setup', 'payoff']),
    description: z.string(),
  })).default([]).describe('伏笔'),
  
  // 爽点
  coolPoint: z.object({
    type: z.string().describe('爽点类型'),
    description: z.string().describe('爽点描述'),
    intensity: z.enum(['micro', 'small', 'big']).default('micro').describe('爽点强度'),
  }).optional().describe('爽点'),
  
  // 字数
  targetWordCount: z.number().optional().describe('目标字数'),
  
  // 状态
  status: z.enum(['outline', 'draft', 'complete']).default('outline').describe('状态'),
  
  // 元数据
  meta: z.object({
    beatType: z.string().optional().describe('所属节拍类型'),
    previousChapterSummary: z.string().optional().describe('上章摘要'),
    nextChapterHint: z.string().optional().describe('下章提示'),
  }).optional().describe('元数据'),
});
export type ChapterBrief = z.infer<typeof ChapterBriefSchema>;

// ====== 章节列表 ======

export const ChapterCommitListSchema = z.array(ChapterCommitSchema);
export const ChapterBriefListSchema = z.array(ChapterBriefSchema);
