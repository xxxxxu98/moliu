/**
 * Chapter Commit Definitions
 * 章承诺 - 单章的约束，必须符合卷契约
 */

import { z } from 'zod';
import { ContractMetaSchema } from './story-contract';

// ====== 节点类型 ======

export type NodeType = 'CBN' | 'CPN' | 'CEN';

/** 故事线 */
export type Strand = 'Quest' | 'Fire' | 'Constellation';

/** 钩子类型 */
export type HookType = '冲突悬念' | '信息悬念' | '情感悬念' | '危机悬念';

/** 戏剧功能 */
export type DramaFunction = 
  | '制造冲突'
  | '推进情节'
  | '揭示信息'
  | '展示能力'
  | '建立关系'
  | '回收伏笔';

/** 禁区类型 */
export type ForbiddenZoneType = 
  | 'character_death'
  | 'power_reveal'
  | 'relationship_change'
  | 'world_reveal'
  | 'level_upgrade';

// ====== CBN - 章节起点 ======

export const ChapterNodeBeginSchema = z.object({
  id: z.literal('CBN').default('CBN'),
  type: z.literal('start').default('start'),
  statement: z.string().describe('节点陈述「主体 | 动作 | 结果」'),
  承接上文: z.string().describe('如何承接上文'),
  情绪延续: z.string().optional().describe('情绪如何延续'),
  requiredElements: z.array(z.string()).default(['时间锚点', '情绪延续']),
});
export type ChapterNodeBegin = z.infer<typeof ChapterNodeBeginSchema>;

// ====== CPN - 推进节点 ======

export const ChapterProgressNodeSchema = z.object({
  id: z.string().describe('节点ID（如CPN1）'),
  type: z.literal('progress').default('progress'),
  statement: z.string().describe('节点陈述「主体 | 动作 | 结果」'),
  戏剧功能: z.string().describe('戏剧功能'),
  coolPoint: z.string().optional().describe('爽点描述'),
  foreshadow: z.string().optional().describe('伏笔标记'),
});
export type ChapterProgressNode = z.infer<typeof ChapterProgressNodeSchema>;

// ====== CEN - 章节终点 ======

export const ChapterNodeEndSchema = z.object({
  id: z.literal('CEN').default('CEN'),
  type: z.literal('end').default('end'),
  statement: z.string().describe('节点陈述「主体 | 动作 | 结果 + 悬念」'),
  悬念: z.string().describe('悬念内容'),
  钩子类型: z.enum(['冲突悬念', '信息悬念', '情感悬念', '危机悬念']).describe('钩子类型'),
  requiredElements: z.array(z.string()).default(['悬念', '钩子']),
});
export type ChapterNodeEnd = z.infer<typeof ChapterNodeEndSchema>;

// ====== 节点结构 ======

export const ChapterNodesSchema = z.object({
  cbn: ChapterNodeBeginSchema,
  cpns: z.array(ChapterProgressNodeSchema).min(2).max(4),
  cen: ChapterNodeEndSchema,
});
export type ChapterNodes = z.infer<typeof ChapterNodesSchema>;

// ====== 章节需求 ======

export const ChapterRequirementsSchema = z.object({
  objective: z.string().describe('本章目标'),
  resistance: z.string().describe('阻碍'),
  cost: z.string().describe('代价'),
  timeAnchor: z.string().optional().describe('时间锚点'),
  countdownStatus: z.string().optional().describe('倒计时状态'),
  coolPoint: z.string().describe('爽点'),
  strand: z.enum(['Quest', 'Fire', 'Constellation']).default('Quest').describe('故事线'),
  storyCard: z.string().optional().describe('应用的故事卡'),
});
export type ChapterRequirements = z.infer<typeof ChapterRequirementsSchema>;

// ====== 伏笔追踪 ======

export const ChapterForeshadowSchema = z.object({
  new: z.array(z.object({
    id: z.string(),
    content: z.string(),
    payoffChapter: z.number().optional(),
  })).default([]),
  fulfilled: z.array(z.string()).default([]),
});
export type ChapterForeshadow = z.infer<typeof ChapterForeshadowSchema>;

// ====== 本章禁区 ======

export const ForbiddenZoneSchema = z.object({
  type: z.enum([
    'character_death',
    'power_reveal',
    'relationship_change',
    'world_reveal',
    'level_upgrade',
  ]).describe('禁区类型'),
  target: z.string().describe('目标'),
  reason: z.string().describe('原因'),
});
export type ForbiddenZone = z.infer<typeof ForbiddenZoneSchema>;

// ====== 完整章承诺 ======

export const ChapterCommitSchema = z.object({
  meta: ContractMetaSchema,
  
  chapterId: z.number().describe('章节号'),
  volumeId: z.number().describe('卷ID'),
  
  // 节点结构
  nodes: ChapterNodesSchema,
  
  // 需求
  requirements: ChapterRequirementsSchema,
  
  // 伏笔
  foreshadow: ChapterForeshadowSchema.default({}),
  
  // 禁区
  forbiddenZones: z.array(ForbiddenZoneSchema).default([]),
  
  // 字数
  wordCount: z.number().default(3000).describe('目标字数'),
  
  // 扩展
  extensions: z.record(z.any()).optional(),
});
export type ChapterCommit = z.infer<typeof ChapterCommitSchema>;

// ====== 章节简要（简化版） ======

export const KeyPointsSchema = z.object({
  objective: z.string(),
  conflict: z.string(),
  climax: z.string(),
  hook: z.string(),
});
export type KeyPoints = z.infer<typeof KeyPointsSchema>;

export const CoolPointBriefSchema = z.object({
  type: z.enum(['combat', 'romance', 'mystery', 'growth', 'revenge', 'power', 'revelation']),
  description: z.string(),
  intensity: z.enum(['micro', 'small', 'big']).default('micro'),
});
export type CoolPointBrief = z.infer<typeof CoolPointBriefSchema>;

export const ChapterBriefSchema = z.object({
  chapterId: z.number(),
  volumeId: z.number(),
  title: z.string(),
  nodes: ChapterNodesSchema,
  keyPoints: KeyPointsSchema,
  strand: z.enum(['Quest', 'Fire', 'Constellation']).default('Quest'),
  coolPoint: CoolPointBriefSchema,
  status: z.enum(['outline', 'draft', 'complete']).default('outline'),
});
export type ChapterBrief = z.infer<typeof ChapterBriefSchema>;

// ====== 工厂函数 ======

/**
 * 创建默认章承诺
 */
export function createDefaultChapterCommit(params: {
  chapterId: number;
  volumeId: number;
  strand?: Strand;
}): ChapterCommit {
  const now = new Date().toISOString();
  
  return {
    meta: {
      schemaVersion: 'story-system/v2',
      contractType: 'chapter',
      generatorVersion: '2.0.0',
      createdAt: now,
      updatedAt: now,
    },
    chapterId: params.chapterId,
    volumeId: params.volumeId,
    nodes: {
      cbn: {
        id: 'CBN',
        type: 'start',
        statement: `主角 | 待设定 | 起点`,
        承接上文: '待设定',
        情绪延续: '待设定',
        requiredElements: ['时间锚点'],
      },
      cpns: [
        {
          id: 'CPN1',
          type: 'progress',
          statement: '主体 | 动作 | 结果',
          戏剧功能: '推进情节',
          coolPoint: '待设定',
        },
        {
          id: 'CPN2',
          type: 'progress',
          statement: '主体 | 动作 | 结果',
          戏剧功能: '制造冲突',
          coolPoint: '待设定',
        },
      ],
      cen: {
        id: 'CEN',
        type: 'end',
        statement: '主体 | 动作 | 结果 + 悬念',
        悬念: '待设定',
        钩子类型: '冲突悬念',
        requiredElements: ['悬念', '钩子'],
      },
    },
    requirements: {
      objective: '待设定',
      resistance: '待设定',
      cost: '待设定',
      timeAnchor: '',
      countdownStatus: '',
      coolPoint: '待设定',
      strand: params.strand || 'Quest',
    },
    foreshadow: {
      new: [],
      fulfilled: [],
    },
    forbiddenZones: [],
    wordCount: 3000,
  };
}

/**
 * 从章承诺转换为章节简要
 */
export function commitToBrief(commit: ChapterCommit): ChapterBrief {
  return {
    chapterId: commit.chapterId,
    volumeId: commit.volumeId,
    title: `第${commit.chapterId}章`,
    nodes: commit.nodes,
    keyPoints: {
      objective: commit.requirements.objective,
      conflict: commit.requirements.resistance,
      climax: commit.requirements.cost,
      hook: commit.nodes.cen.悬念,
    },
    strand: commit.requirements.strand,
    coolPoint: {
      type: 'combat',
      description: commit.requirements.coolPoint,
      intensity: 'micro',
    },
    status: 'outline',
  };
}

/**
 * 根据节拍位置确定节点类型
 */
export function determineNodeType(
  chapterNumber: number,
  beatStart: number,
  beatEnd: number
): {
  cpnType: 'objective' | 'conflict' | 'revelation' | 'climax';
  cpnCount: number;
} {
  const totalInBeat = beatEnd - beatStart + 1;
  const positionInBeat = chapterNumber - beatStart;
  const progress = positionInBeat / totalInBeat;
  
  if (progress < 0.3) {
    return { cpnType: 'objective', cpnCount: 2 };
  } else if (progress < 0.6) {
    return { cpnType: 'conflict', cpnCount: 3 };
  } else if (progress < 0.85) {
    return { cpnType: 'revelation', cpnCount: 3 };
  } else {
    return { cpnType: 'climax', cpnCount: 4 };
  }
}

/**
 * 生成默认节点结构
 */
export function generateDefaultNodes(params: {
  cpnType: 'objective' | 'conflict' | 'revelation' | 'climax';
  cpnCount: number;
}): ChapterNodes {
  const cpnTypeMap = {
    objective: '推进情节',
    conflict: '制造冲突',
    revelation: '揭示信息',
    climax: '高潮爆发',
  };
  
  const cpns: ChapterProgressNode[] = [];
  for (let i = 0; i < params.cpnCount; i++) {
    cpns.push({
      id: `CPN${i + 1}`,
      type: 'progress',
      statement: '主体 | 动作 | 结果',
      戏剧功能: cpnTypeMap[params.cpnType],
      coolPoint: i === params.cpnCount - 1 ? '待设定' : undefined,
    });
  }
  
  return {
    cbn: {
      id: 'CBN',
      type: 'start',
      statement: '主体 | 承接上文 | 起点',
      承接上文: '待设定',
      情绪延续: '待设定',
      requiredElements: ['时间锚点'],
    },
    cpns,
    cen: {
      id: 'CEN',
      type: 'end',
      statement: '主体 | 动作 | 结果 + 悬念',
      悬念: '待设定',
      钩子类型: '冲突悬念',
      requiredElements: ['悬念', '钩子'],
    },
  };
}
