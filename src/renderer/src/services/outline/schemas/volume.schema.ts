/**
 * Volume Schema Definitions
 * Zod schemas for volume-level outline generation
 */

import { z } from 'zod';

// ====== 节拍 ======

export const BeatSchema = z.object({
  id: z.string().describe('节拍ID'),
  type: z.enum([
    'promise',      // 开卷承诺
    'catalyst',     // 催化事件
    'crisis',       // 危机节点
    'midpoint',     // 中段反转
    'all_is_lost',  // 最低谷
    'climax',       // 高潮
    'resolution',   // 解决
  ]).describe('节拍类型'),
  chapterRange: z.object({
    start: z.number().describe('起始章节'),
    end: z.number().describe('结束章节'),
  }).describe('章节范围'),
  description: z.string().describe('节拍描述'),
  promise: z.string().optional().describe('承诺内容'),
  consequences: z.array(z.string()).default([]).describe('后果'),
  climax: z.string().optional().describe('高潮描述'),
});
export type Beat = z.infer<typeof BeatSchema>;

// ====== 时间锚点 ======

export const TimeAnchorSchema = z.object({
  chapter: z.number().describe('章节号'),
  absoluteTime: z.string().describe('绝对时间'),
  relativeTime: z.string().optional().describe('相对时间'),
  duration: z.string().describe('章内跨度'),
  gapFromPrevious: z.string().optional().describe('与上章间隔'),
  countdown: z.object({
    active: z.boolean().default(false),
    event: z.string().optional(),
    daysRemaining: z.number().optional(),
  }).describe('倒计时状态'),
});
export type TimeAnchor = z.infer<typeof TimeAnchorSchema>;

// ====== 卷节拍表 ======

export const BeatTableSchema = z.object({
  volumeId: z.number().describe('卷ID'),
  beats: z.array(BeatSchema).describe('节拍列表'),
  openingPromise: z.string().describe('开卷承诺'),
  climaxBeat: z.string().describe('高潮节拍'),
  resolutionBeat: z.string().describe('解决节拍'),
  hookForNext: z.string().describe('为下卷留的钩子'),
});
export type BeatTable = z.infer<typeof BeatTableSchema>;

// ====== 时间线 ======

export const TimelineSchema = z.object({
  baseline: z.string().describe('时间基准'),
  span: z.string().describe('时间跨度'),
  direction: z.enum(['forward', 'backward', 'mixed']).default('forward').describe('时间方向'),
  monotonic: z.boolean().default(true).describe('是否单调递增'),
  anchors: z.array(TimeAnchorSchema).default([]).describe('时间锚点'),
  countdownEvents: z.array(z.object({
    event: z.string(),
    targetChapter: z.number(),
    daysRemaining: z.number(),
  })).default([]).describe('倒计时事件'),
});
export type Timeline = z.infer<typeof TimelineSchema>;

// ====== 三线状态 ======

export const StrandStatusSchema = z.object({
  quest: z.object({
    mainObjective: z.string().describe('主要目标'),
    obstacles: z.array(z.string()).default([]).describe('障碍'),
    status: z.enum(['active', 'paused', 'completed']).default('active'),
  }),
  fire: z.object({
    relationshipStage: z.enum(['introduction', 'development', 'tension', 'breakthrough', 'climax']).describe('感情阶段'),
    keyMoments: z.array(z.string()).default([]).describe('关键时刻'),
    status: z.enum(['active', 'paused', 'completed']).default('active'),
  }),
  constellation: z.object({
    newRevelations: z.array(z.string()).default([]).describe('新揭示'),
    locationsIntroduced: z.array(z.string()).default([]).describe('新地点'),
    status: z.enum(['active', 'paused', 'completed']).default('active'),
  }),
});
export type StrandStatus = z.infer<typeof StrandStatusSchema>;

// ====== 卷承诺 ======

export const VolumePromisesSchema = z.object({
  mainPromise: z.string().describe('主要承诺'),
  subPromises: z.array(z.string()).default([]).describe('子承诺'),
  hookForNext: z.string().describe('为下卷留的钩子'),
});
export type VolumePromises = z.infer<typeof VolumePromisesSchema>;

// ====== 卷验证 ======

export const VolumeValidationSchema = z.object({
  timeConsistency: z.boolean().describe('时间一致性'),
  conflictEscalation: z.boolean().describe('冲突递进'),
  strandBalance: z.boolean().describe('三线平衡'),
});
export type VolumeValidation = z.infer<typeof VolumeValidationSchema>;

// ====== 卷完整 Schema ======

export const VolumeSchema = z.object({
  meta: z.object({
    schemaVersion: z.string().default('story-system/v1'),
    contractType: z.enum(['story', 'volume', 'chapter']).default('volume'),
    generatorVersion: z.string().default('1.0.0'),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  
  volumeId: z.number().describe('卷ID'),
  volumeTitle: z.string().describe('卷标题'),
  
  // 节拍表
  beats: z.array(BeatSchema).default([]).describe('节拍列表'),
  
  // 时间线
  timeline: TimelineSchema.describe('时间线'),
  
  // 三线状态
  strandStatus: StrandStatusSchema.describe('三线状态'),
  
  // 承诺
  promises: VolumePromisesSchema.describe('卷承诺'),
  
  // 验证
  validation: VolumeValidationSchema.describe('验证结果'),
  
  // 章节范围
  chapterRange: z.object({
    start: z.number(),
    end: z.number(),
  }).describe('章节范围'),
  
  // 目标字数
  targetWordCount: z.number().optional().describe('目标字数'),
  
  // 关联的大纲ID
  outlineId: z.string().optional().describe('关联大纲ID'),
});
export type Volume = z.infer<typeof VolumeSchema>;

// ====== 卷列表 ======

export const VolumeListSchema = z.array(VolumeSchema);
