/**
 * Volume Contract Definitions
 * 卷契约 - 单卷的约束，必须符合故事契约
 */

import { z } from 'zod';
import { ContractMetaSchema, type ContractMeta } from './story-contract';

// ====== 节拍类型 ======

export type BeatNodeType = 
  | 'Opening'
  | 'Development'
  | 'Twist1'
  | 'Twist2'
  | 'Climax'
  | 'ConflictResolution'
  | 'Twist3'
  | 'Ending';

// 八节点顺序
export const BEAT_NODE_ORDER: BeatNodeType[] = [
  'Opening',
  'Development',
  'Twist1',
  'Twist2',
  'Climax',
  'ConflictResolution',
  'Twist3',
  'Ending',
];

// ====== 时间锚点 ======

export const TimeAnchorSchema = z.object({
  chapter: z.number().describe('章节号'),
  absoluteTime: z.string().describe('绝对时间'),
  relativeTime: z.string().optional().describe('相对时间'),
  duration: z.string().default('约3000字').describe('章内跨度'),
  gapFromPrevious: z.string().optional().describe('与上章间隔'),
  countdown: z.object({
    active: z.boolean().default(false),
    event: z.string().optional(),
    daysRemaining: z.number().optional(),
  }).default({ active: false }),
});
export type TimeAnchor = z.infer<typeof TimeAnchorSchema>;

// ====== 时间线 ======

export const TimelineSchema = z.object({
  baseline: z.string().describe('时间基准'),
  span: z.string().describe('时间跨度'),
  direction: z.enum(['forward', 'backward', 'mixed']).default('forward'),
  monotonic: z.boolean().default(true),
  anchors: z.array(TimeAnchorSchema).default([]),
  countdownEvents: z.array(z.object({
    event: z.string(),
    targetChapter: z.number(),
    daysRemaining: z.number(),
  })).default([]),
});
export type Timeline = z.infer<typeof TimelineSchema>;

// ====== 节拍 ======

export const BeatSchema = z.object({
  node: z.enum([
    'Opening',
    'Development',
    'Twist1',
    'Twist2',
    'Climax',
    'ConflictResolution',
    'Twist3',
    'Ending',
  ]).describe('节点类型'),
  chapterRange: z.tuple([z.number(), z.number()]).describe('章节范围'),
  description: z.string().describe('节拍描述'),
  promise: z.string().optional().describe('承诺内容'),
  events: z.array(z.string()).default([]).describe('涉及事件'),
  coolPoints: z.array(z.string()).default([]).describe('爽点'),
  foreshadows: z.array(z.string()).default([]).describe('伏笔'),
  consequences: z.array(z.string()).default([]).describe('后果'),
  hookType: z.enum(['悬念', '冲突', '信息差', '情感']).optional().describe('钩子类型'),
});
export type Beat = z.infer<typeof BeatSchema>;

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

// ====== 伏笔追踪 ======

export const ForeshadowTrackingSchema = z.object({
  new: z.array(z.object({
    id: z.string(),
    content: z.string(),
    payoffChapter: z.number().optional(),
  })).default([]),
  fulfilled: z.array(z.string()).default([]),
});
export type ForeshadowTracking = z.infer<typeof ForeshadowTrackingSchema>;

// ====== 卷验证 ======

export const VolumeValidationSchema = z.object({
  timeConsistency: z.boolean().describe('时间一致性'),
  conflictEscalation: z.boolean().describe('冲突递进'),
  strandBalance: z.boolean().describe('三线平衡'),
  beatIntegrity: z.boolean().describe('节拍完整性'),
});
export type VolumeValidation = z.infer<typeof VolumeValidationSchema>;

// ====== 完整卷契约 ======

export const VolumeContractSchema = z.object({
  meta: ContractMetaSchema,
  
  volumeId: z.number().describe('卷ID'),
  volumeTitle: z.string().describe('卷标题'),
  
  chapterRange: z.tuple([z.number(), z.number()]).describe('章节范围'),
  targetWordCount: z.number().optional().describe('目标字数'),
  outlineId: z.string().optional().describe('关联大纲ID'),
  
  // 八节点节拍
  beats: z.array(BeatSchema).default([]).describe('节拍列表'),
  
  // 时间线
  timeline: TimelineSchema.describe('时间线'),
  
  // 三线状态
  strandStatus: StrandStatusSchema.describe('三线状态'),
  
  // 承诺
  promises: VolumePromisesSchema.describe('卷承诺'),
  
  // 伏笔追踪
  foreshadowTracking: ForeshadowTrackingSchema.default({}),
  
  // 验证
  validation: VolumeValidationSchema.describe('验证结果'),
  
  // 扩展
  extensions: z.record(z.any()).optional(),
});
export type VolumeContract = z.infer<typeof VolumeContractSchema>;

// ====== 工厂函数 ======

/**
 * 创建默认卷契约
 */
export function createDefaultVolumeContract(params: {
  volumeId: number;
  volumeTitle: string;
  chapterStart: number;
  chapterEnd: number;
  outlineId?: string;
}): VolumeContract {
  const now = new Date().toISOString();
  
  return {
    meta: {
      schemaVersion: 'story-system/v2',
      contractType: 'volume',
      generatorVersion: '2.0.0',
      createdAt: now,
      updatedAt: now,
    },
    volumeId: params.volumeId,
    volumeTitle: params.volumeTitle,
    chapterRange: [params.chapterStart, params.chapterEnd],
    outlineId: params.outlineId,
    beats: [],
    timeline: {
      baseline: '未设定',
      span: '待设定',
      direction: 'forward',
      monotonic: true,
      anchors: [],
      countdownEvents: [],
    },
    strandStatus: {
      quest: {
        mainObjective: '待设定',
        obstacles: [],
        status: 'active',
      },
      fire: {
        relationshipStage: 'introduction',
        keyMoments: [],
        status: 'active',
      },
      constellation: {
        newRevelations: [],
        locationsIntroduced: [],
        status: 'active',
      },
    },
    promises: {
      mainPromise: '待设定',
      subPromises: [],
      hookForNext: '待设定',
    },
    foreshadowTracking: {
      new: [],
      fulfilled: [],
    },
    validation: {
      timeConsistency: true,
      conflictEscalation: true,
      strandBalance: true,
      beatIntegrity: true,
    },
  };
}

/**
 * 从节拍表生成默认时间线
 */
export function generateTimelineFromBeats(beats: Beat[], baseline: string = '未设定'): Timeline {
  const anchors: TimeAnchor[] = [];
  
  for (const beat of beats) {
    for (let ch = beat.chapterRange[0]; ch <= beat.chapterRange[1]; ch++) {
      anchors.push({
        chapter: ch,
        absoluteTime: `第${ch}章`,
        duration: '约3000字',
        gapFromPrevious: ch > beat.chapterRange[0] ? '无' : '-',
        countdown: { active: false },
      });
    }
  }
  
  return {
    baseline,
    span: `第${anchors[0]?.chapter || 1}章 - 第${anchors[anchors.length - 1]?.chapter || 1}章`,
    direction: 'forward',
    monotonic: true,
    anchors: anchors.sort((a, b) => a.chapter - b.chapter),
    countdownEvents: [],
  };
}

/**
 * 计算节拍的章节范围
 */
export function calculateBeatChapterRange(
  totalChapters: number,
  nodeType: BeatNodeType
): [number, number] {
  const ratioMap: Record<BeatNodeType, [number, number]> = {
    Opening: [0, 0.10],
    Development: [0.10, 0.45],
    Twist1: [0.45, 0.52],
    Twist2: [0.52, 0.60],
    Climax: [0.60, 0.75],
    ConflictResolution: [0.75, 0.85],
    Twist3: [0.85, 0.92],
    Ending: [0.92, 1.0],
  };
  
  const [startRatio, endRatio] = ratioMap[nodeType];
  const start = Math.ceil(totalChapters * startRatio);
  const end = Math.floor(totalChapters * endRatio);
  
  return [Math.max(1, start), Math.min(totalChapters, end)];
}

/**
 * 生成默认节拍表
 */
export function generateDefaultBeatTable(
  volumeId: number,
  chapterStart: number,
  chapterEnd: number
): Beat[] {
  const totalChapters = chapterEnd - chapterStart + 1;
  
  return BEAT_NODE_ORDER.map(node => ({
    node,
    chapterRange: calculateBeatChapterRange(totalChapters, node),
    description: `第${volumeId}卷${node}节拍`,
    events: [],
    coolPoints: [],
    foreshadows: [],
    consequences: [],
  }));
}
