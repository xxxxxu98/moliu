/**
 * Story Contract Definitions
 * 故事契约 - 整个故事的顶层约束
 */

import { z } from 'zod';

// ====== 基础枚举 ======

/** 情绪类型 */
export type EmotionType = 
  | '热血'
  | '甜蜜'
  | '虐心'
  | '紧张'
  | '悬疑'
  | '治愈'
  | '搞笑'
  | '悲壮';

/** 情绪弧线 */
export type EmotionArc = 'rising' | 'falling' | 'wave' | 'mixed' | 'm_shape' | 'n_shape';

/** 故事线类型 */
export type StrandType = 'quest' | 'fire' | 'constellation';

/** 冲突来源 */
export type ConflictSource = 
  | '资源/利益'
  | '阵营/种族'
  | '超凡途径'
  | '信仰/宗教'
  | '派系之争'
  | '理念/三观';

/** 爽点类型 */
export type CoolPointType = 'combat' | 'romance' | 'mystery' | 'growth' | 'revenge' | 'power' | 'revelation';

/** 契约类型 */
export type ContractType = 'story' | 'volume' | 'chapter';

/** 验证严重性 */
export type ViolationSeverity = 'blocking' | 'warning';

/** 伏笔状态 */
export type ForeshadowStatus = 'active' | 'fulfilled' | 'abandoned';

/** 伏笔层级 */
export type ForeshadowLevel = 'chapter' | 'volume' | 'story';

// ====== 契约元数据 ======

export const ContractMetaSchema = z.object({
  schemaVersion: z.string().default('story-system/v2'),
  contractType: z.enum(['story', 'volume', 'chapter']).default('story'),
  generatorVersion: z.string().default('2.0.0'),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContractMeta = z.infer<typeof ContractMetaSchema>;

// ====== 情绪目标 ======

export const EmotionGoalSchema = z.object({
  primary: z.string().describe('主要情绪'),
  secondary: z.string().optional().describe('次要情绪'),
  arc: z.enum(['rising', 'falling', 'wave', 'mixed', 'm_shape', 'n_shape']).default('rising').describe('情绪弧线'),
  density: z.number().default(3000).describe('情绪波动间隔（字）'),
  highPoints: z.array(z.number()).default([]).describe('情绪高点章节'),
  lowPoints: z.array(z.number()).default([]).describe('情绪低点章节'),
});
export type EmotionGoal = z.infer<typeof EmotionGoalSchema>;

// ====== 世界观约束 ======

export const WorldConstraintsSchema = z.object({
  timeBaseline: z.string().optional().describe('时间基准'),
  timeDirection: z.enum(['forward', 'backward', 'mixed']).default('forward').describe('时间方向'),
  timeMonotonic: z.boolean().default(true).describe('是否单调递增'),
  maxTimeGaps: z.number().default(1).describe('最大时间跳跃'),
  forbiddenTimeLoops: z.boolean().default(true).describe('禁止时间循环'),
  abilitySources: z.array(z.string()).default([]).describe('能力来源'),
  maxLevelReached: z.string().optional().describe('最高等级'),
  forbiddenCombinations: z.array(z.array(z.string())).default([]).describe('禁止组合'),
  maxMajorCharacters: z.number().default(20).describe('最大主要角色数'),
  maxMinorCharacters: z.number().default(50).describe('最大次要角色数'),
  forbiddenDeaths: z.array(z.string()).default([]).describe('禁止死亡的角色'),
});
export type WorldConstraints = z.infer<typeof WorldConstraintsSchema>;

// ====== 三线交织配置 ======

export const StrandConfigSchema = z.object({
  quest: z.object({
    ratio: z.number().default(0.6).describe('比例'),
    status: z.enum(['active', 'paused', 'completed']).default('active'),
    currentArc: z.string().optional().describe('当前弧线'),
  }),
  fire: z.object({
    ratio: z.number().default(0.25).describe('比例'),
    status: z.enum(['active', 'paused', 'completed']).default('active'),
    currentStage: z.string().optional().describe('当前阶段'),
  }),
  constellation: z.object({
    ratio: z.number().default(0.15).describe('比例'),
    status: z.enum(['active', 'paused', 'completed']).default('active'),
    revealedLocations: z.array(z.string()).default([]).describe('已揭示地点'),
  }),
});
export type StrandConfig = z.infer<typeof StrandConfigSchema>;

// ====== 矛盾递进 ======

export const ConflictLevelSchema = z.object({
  level: z.number().min(1).max(4).describe('层级'),
  name: z.string().describe('名称'),
  description: z.string().describe('描述'),
  chapters: z.array(z.number()).default([]).describe('涉及章节'),
  status: z.enum(['pending', 'active', 'resolved']).default('pending'),
});
export type ConflictLevel = z.infer<typeof ConflictLevelSchema>;

// ====== 承诺 ======

export const StoryPromisesSchema = z.object({
  coreHook: z.string().describe('核心卖点'),
  mainSatisfactions: z.array(z.string()).default([]).describe('主要满足点'),
  genreSpecificPromise: z.string().optional().describe('题材特定承诺'),
});
export type StoryPromises = z.infer<typeof StoryPromisesSchema>;

// ====== 爽点密度 ======

export const CoolPointDensitySchema = z.object({
  micro: z.number().default(3000).describe('微爽点间隔（字）'),
  small: z.number().default(9000).describe('小爽点间隔（字）'),
  big: z.number().default(21000).describe('大爽点间隔（字）'),
});
export type CoolPointDensity = z.infer<typeof CoolPointDensitySchema>;

// ====== 伏笔记录 ======

export const ForeshadowRecordSchema = z.object({
  id: z.string().describe('伏笔ID'),
  content: z.string().describe('伏笔内容'),
  buriedChapter: z.number().describe('埋设章节'),
  payoffChapter: z.number().describe('回收章节'),
  level: z.enum(['chapter', 'volume', 'story']).default('story').describe('层级'),
  status: z.enum(['active', 'fulfilled', 'abandoned']).default('active'),
  type: z.enum(['item', 'dialogue', 'event', 'mystery', 'character', 'ability']).default('mystery'),
});
export type ForeshadowRecord = z.infer<typeof ForeshadowRecordSchema>;

// ====== 爽点安排 ======

export const CoolPointArrangementSchema = z.object({
  chapter: z.number().describe('章节'),
  type: z.enum(['micro', 'small', 'big']).describe('爽点类型'),
  description: z.string().describe('描述'),
  storyCard?: z.string().optional().describe('应用的故事卡'),
});
export type CoolPointArrangement = z.infer<typeof CoolPointArrangementSchema>;

// ====== 故事卡记录 ======

export const StoryCardUsageSchema = z.object({
  cardId: z.string().describe('故事卡ID'),
  cardName: z.string().describe('故事卡名称'),
  chapters: z.array(z.number()).describe('应用的章节'),
  variation: z.string().optional().describe('变体描述'),
});
export type StoryCardUsage = z.infer<typeof StoryCardUsageSchema>;

// ====== 基本信息 ======

export const StoryBasicSchema = z.object({
  title: z.string().describe('书名'),
  genre: z.string().describe('题材'),
  subGenres: z.array(z.string()).default([]).describe('子题材'),
  tone: z.array(z.string()).default([]).describe('文风'),
  targetWordCount: z.number().default(500000).describe('目标字数'),
  platform: z.string().optional().describe('目标平台'),
  targetAudience: z.string().optional().describe('目标读者'),
  oneLineSummary: z.string().describe('一句话概括'),
});
export type StoryBasic = z.infer<typeof StoryBasicSchema>;

// ====== 爽点设计 ======

export const StoryCoolPointDesignSchema = z.object({
  density: CoolPointDensitySchema.default({}),
  patterns: z.array(z.string()).default([]).describe('爽点类型'),
  arranged: z.array(CoolPointArrangementSchema).default([]).describe('已安排爽点'),
  storyCardUsage: z.array(StoryCardUsageSchema).default([]).describe('故事卡使用'),
});
export type StoryCoolPointDesign = z.infer<typeof StoryCoolPointDesignSchema>;

// ====== 世界观设定 ======

export const WorldSettingSchema = z.object({
  type: z.string().describe('世界类型'),
  description: z.string().optional().describe('描述'),
  locations: z.array(z.string()).default([]).describe('主要地点'),
  factions: z.array(z.string()).default([]).describe('主要势力'),
  rules: z.array(z.string()).default([]).describe('核心规则'),
  powerSystem: z.object({
    name: z.string().optional().describe('力量体系名称'),
    levels: z.array(z.string()).default([]).describe('等级列表'),
  }).optional(),
});
export type WorldSetting = z.infer<typeof WorldSettingSchema>;

// ====== 主角设定 ======

export const ProtagonistSchema = z.object({
  name: z.string().describe('姓名'),
  tags: z.array(z.string()).default([]).describe('标签'),
  identity: z.string().describe('身份'),
  goldenFinger: z.string().optional().describe('金手指'),
  strengths: z.array(z.string()).default([]).describe('优势'),
  weaknesses: z.array(z.string()).default([]).describe('短板'),
  motivation: z.string().describe('核心动机'),
  currentDilemma: z.string().describe('当前困境'),
  growthArc: z.string().optional().describe('成长弧线'),
});
export type Protagonist = z.infer<typeof ProtagonistSchema>;

// ====== 卷划分 ======

export const VolumePlanSchema = z.object({
  volumeId: z.number().describe('卷ID'),
  title: z.string().describe('卷名'),
  chapterRange: z.tuple([z.number(), z.number()]).describe('章节范围'),
  coreConflict: z.string().describe('核心冲突'),
  climax: z.string().describe('高潮'),
  function: z.string().optional().describe('功能'),
});
export type VolumePlan = z.infer<typeof VolumePlanSchema>;

// ====== 完整故事契约 ======

export const StoryContractSchema = z.object({
  meta: ContractMetaSchema,
  
  basic: StoryBasicSchema,
  
  emotionGoal: EmotionGoalSchema,
  
  worldSetting: WorldSettingSchema,
  
  protagonist: ProtagonistSchema,
  
  worldConstraints: WorldConstraintsSchema.default({}),
  
  strands: StrandConfigSchema.default({}),
  
  conflictEscalation: z.array(ConflictLevelSchema).default([]),
  
  promises: StoryPromisesSchema,
  
  coolPointDesign: StoryCoolPointDesignSchema.default({}),
  
  foreshadowTable: z.array(ForeshadowRecordSchema).default([]),
  
  volumes: z.array(VolumePlanSchema).default([]),
  
  // 扩展字段
  extensions: z.record(z.any()).optional().describe('扩展数据'),
});
export type StoryContract = z.infer<typeof StoryContractSchema>;

// ====== 验证结果 ======

export const ViolationSchema = z.object({
  type: z.string().describe('违规类型'),
  description: z.string().describe('描述'),
  severity: z.enum(['blocking', 'warning']).default('warning'),
  location: z.object({
    contract: z.string().optional(),
    path: z.string().optional(),
  }).optional(),
  suggestion: z.string().optional().describe('建议'),
});
export type Violation = z.infer<typeof ViolationSchema>;

export const WarningSchema = z.object({
  type: z.string().describe('警告类型'),
  description: z.string().describe('描述'),
  location: z.object({
    contract: z.string().optional(),
    path: z.string().optional(),
  }).optional(),
});
export type Warning = z.infer<typeof WarningSchema>;

export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  violations: z.array(ViolationSchema).default([]),
  warnings: z.array(WarningSchema).default([]),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

// ====== 工厂函数 ======

/**
 * 创建故事契约元数据
 */
export function createContractMeta(contractType: ContractType = 'story'): ContractMeta {
  const now = new Date().toISOString();
  return {
    schemaVersion: 'story-system/v2',
    contractType,
    generatorVersion: '2.0.0',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建默认故事契约
 */
export function createDefaultStoryContract(seed: {
  title?: string;
  genre?: string;
  oneLineSummary?: string;
}): StoryContract {
  const meta = createContractMeta('story');
  
  return {
    meta,
    basic: {
      title: seed.title || '未命名作品',
      genre: seed.genre || '玄幻',
      subGenres: [],
      tone: [],
      targetWordCount: 500000,
      oneLineSummary: seed.oneLineSummary || '',
    },
    emotionGoal: {
      primary: '热血',
      arc: 'rising',
      density: 3000,
      highPoints: [],
      lowPoints: [],
    },
    worldSetting: {
      type: '玄幻',
      locations: [],
      factions: [],
      rules: [],
    },
    protagonist: {
      name: '',
      identity: '',
      tags: [],
      strengths: [],
      weaknesses: [],
      motivation: '',
      currentDilemma: '',
    },
    worldConstraints: {
      timeBaseline: '未设定',
      timeDirection: 'forward',
      timeMonotonic: true,
      maxTimeGaps: 1,
      forbiddenTimeLoops: true,
      abilitySources: [],
      maxMajorCharacters: 20,
      maxMinorCharacters: 50,
      forbiddenDeaths: [],
    },
    strands: {
      quest: { ratio: 0.6, status: 'active' },
      fire: { ratio: 0.25, status: 'active' },
      constellation: { ratio: 0.15, status: 'active' },
    },
    conflictEscalation: [],
    promises: {
      coreHook: '',
      mainSatisfactions: [],
    },
    coolPointDesign: {
      density: { micro: 3000, small: 9000, big: 21000 },
      patterns: [],
      arranged: [],
      storyCardUsage: [],
    },
    foreshadowTable: [],
    volumes: [],
  };
}

/**
 * 创建验证结果
 */
export function createValidationResult(params: {
  isValid: boolean;
  violations?: Violation[];
  warnings?: Warning[];
}): ValidationResult {
  return {
    isValid: params.isValid,
    violations: params.violations || [],
    warnings: params.warnings || [],
  };
}

/**
 * 创建违规记录
 */
export function createViolation(params: {
  type: string;
  description: string;
  severity?: ViolationSeverity;
  location?: { contract?: string; path?: string };
  suggestion?: string;
}): Violation {
  return {
    type: params.type,
    description: params.description,
    severity: params.severity || 'warning',
    location: params.location,
    suggestion: params.suggestion,
  };
}

/**
 * 创建警告记录
 */
export function createWarning(params: {
  type: string;
  description: string;
  location?: { contract?: string; path?: string };
}): Warning {
  return {
    type: params.type,
    description: params.description,
    location: params.location,
  };
}

/**
 * 验证三线比例
 */
export function validateStrandRatio(strands: StrandConfig): { valid: boolean; total: number } {
  const total = strands.quest.ratio + strands.fire.ratio + strands.constellation.ratio;
  return {
    valid: Math.abs(total - 1.0) <= 0.01,
    total,
  };
}

/**
 * 获取三线汇总
 */
export function getStrandSummary(strands: StrandConfig): string {
  return `Quest: ${(strands.quest.ratio * 100).toFixed(0)}% / Fire: ${(strands.fire.ratio * 100).toFixed(0)}% / Constellation: ${(strands.constellation.ratio * 100).toFixed(0)}%`;
}
