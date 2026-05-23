/**
 * 完结感知与进度管理类型定义
 * 参考 oh-story-claudecode 和 webnovel-writer 的设计
 */

// ============================================
// 完结感知引擎类型
// ============================================

/**
 * 完结阶段
 */
export type EndingPhase = 'normal' | 'pre_ending' | 'ending' | 'conclusion';

/**
 * 完结准备度分析结果
 */
export interface EndingReadiness {
  /** 当前阶段 */
  isInEndingPhase: EndingPhase;
  /** 阶段名称 */
  phaseName: string;
  /** 剩余章节数 */
  remainingChapters: number;
  /** 待解决伏笔数 */
  unresolvedForeshadows: UnresolvedForeshadow[];
  /** 高潮是否临近 */
  climaxApproaching: boolean;
  /** 完结信号 */
  endingSignals: EndingSignal[];
  /** 完结建议 */
  recommendation: string;
  /** 整体进度百分比 */
  overallProgress: number;
  /** 大纲进度百分比 */
  outlineProgress: number;
  /** 伏笔完成率 */
  foreshadowCompletionRate: number;
  /** 章节进度百分比 */
  chapterProgress: number;
}

/**
 * 未解决伏笔
 */
export interface UnresolvedForeshadow {
  id: string;
  hint: string;
  plantedChapter: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  difficulty: 'easy' | 'medium' | 'hard';
  reason: string;
}

/**
 * 完结信号
 */
export interface EndingSignal {
  type: 'emotional' | 'plot' | 'foreshadow' | 'character';
  title: string;
  description: string;
  chapter: number;
}

/**
 * 章节节点标记
 */
export interface ChapterNode {
  /** 节点ID */
  id: string;
  /** 节点标题 */
  title: string;
  /** 节点类型 */
  nodeType: ChapterNodeType;
  /** 章节范围 [起始章节, 结束章节] */
  chapterRange?: [number, number];
  /** 预估章节索引 */
  estimatedChapterIndex?: number;
  /** 重要性 */
  importance: 'critical' | 'major' | 'minor';
  /** 描述 */
  description?: string;
}

/**
 * 章节节点类型
 */
export type ChapterNodeType = 
  | 'opening'           // 开篇
  | 'development'       // 发展
  | 'twist_1'         // 转折1
  | 'twist_2'         // 转折2
  | 'climax'          // 高潮
  | 'conflict_resolution' // 矛盾结果
  | 'twist_3'         // 转折3
  | 'ending';          // 结局

/**
 * 项目完结元数据
 */
export interface ProjectEndingMeta {
  /** 计划总章节数 */
  plannedChapterCount: number;
  /** 计划总字数 */
  plannedWordCount: number;
  /** 高潮章节索引 */
  climaxChapterIndex?: number;
  /** 结局章节索引 */
  endingChapterIndex?: number;
  /** 大纲完成度百分比 */
  outlineProgress: number;
  /** 章节节点列表 */
  chapterNodes: ChapterNode[];
  /** 是否已设置完结元数据 */
  isConfigured: boolean;
}

// ============================================
// 五级主线竹子法类型
// ============================================

/**
 * 五级主线体系（竹子法）
 * 参考 oh-story-claudecode 的大纲排布方法论
 */
export interface FiveLevelStoryline {
  /** 第1级主线 = 竹身（全书级）*/
  level1: Level1Storyline;
  /** 第2级主线 = 竹节（卷级）*/
  level2: Level2Storyline[];
  /** 第3级主线 = 竹色（桥段级）*/
  level3: Level3Storyline[];
  /** 第4级主线（单元剧情）*/
  level4: Level4Storyline[];
  /** 第5级主线（场景级）*/
  level5: Level5Storyline[];
}

/**
 * 第1级主线 = 竹身
 */
export interface Level1Storyline {
  /** 主线名称 */
  name: string;
  /** 起点状态 */
  startState: string;
  /** 终点状态 */
  endState: string;
  /** 核心目标 */
  coreGoal: string;
  /** 描述 */
  description?: string;
}

/**
 * 第2级主线 = 竹节（卷级）
 */
export interface Level2Storyline {
  /** 卷号/编号 */
  id: string;
  /** 卷名称 */
  name: string;
  /** 章节范围 */
  chapterRange: [number, number];
  /** 本卷目标 */
  goals: string[];
  /** 核心冲突 */
  coreConflict: string;
  /** 涉及角色 */
  involvedCharacters: string[];
  /** 高潮节点索引 */
  climaxChapterIndex?: number;
  /** 是否已完成 */
  isCompleted: boolean;
}

/**
 * 第3级主线 = 竹色（桥段级）
 */
export interface Level3Storyline {
  /** 编号 */
  id: string;
  /** 桥段名称 */
  name: string;
  /** 章节范围 */
  chapterRange: [number, number];
  /** 铺垫内容 */
  foreshadow?: string;
  /** 回收内容 */
  payoff?: string;
  /** 使用故事卡 */
  storyCards: string[];
  /** 情绪基调 */
  emotionalTone: string;
}

/**
 * 第4级主线（单元剧情）
 */
export interface Level4Storyline {
  /** 编号 */
  id: string;
  /** 单元名称 */
  name: string;
  /** 章节范围 */
  chapterRange: [number, number];
  /** 起始状态 */
  startState: string;
  /** 结束状态 */
  endState: string;
  /** 核心爽点类型 */
  coreCoolPointType: string;
}

/**
 * 第5级主线（场景级）
 */
export interface Level5Storyline {
  /** 编号 */
  id: string;
  /** 场景名称 */
  name: string;
  /** 所属章节 */
  chapter: number;
  /** 场景描述 */
  description: string;
  /** 涉及角色 */
  characters: string[];
}

// ============================================
// 八条故事线类型（已存在于 project.ts，此处补充增强字段）
// ============================================

/**
 * 故事线进度状态
 */
export interface StorylineProgress {
  /** 故事线类型 */
  type: StorylineType;
  /** 当前进度 */
  current: string;
  /** 下一步目标 */
  next?: string;
  /** 完成度百分比 */
  completion: number;
  /** 相关章节 */
  relatedChapters: number[];
}

/**
 * 故事线类型
 */
export type StorylineType = 
  | 'map'           // 地图线
  | 'faction'       // 阵营线
  | 'character'     // 人物线
  | 'goldenfinger'  // 金手指线
  | 'worldRules'    // 世界观线
  | 'conflict'      // 矛盾线
  | 'collection'    // 收集线
  | 'romance';     // 感情线

/**
 * 故事线进度报告
 */
export interface StorylineProgressReport {
  /** 各条线进度 */
  progress: StorylineProgress[];
  /** 主线完成度 */
  mainLineCompletion: number;
  /** 支线完成度 */
  subplotCompletion: number;
  /** 整体进度 */
  overallCompletion: number;
  /** 建议 */
  suggestions: string[];
}

// ============================================
// 章节进度追踪类型
// ============================================

/**
 * 章节进度信息
 */
export interface ChapterProgress {
  /** 章节索引 */
  chapterIndex: number;
  /** 章节标题 */
  title: string;
  /** 字数 */
  wordCount: number;
  /** 目标字数 */
  targetWordCount: number;
  /** 完成度百分比 */
  completion: number;
  /** 情节阶段 */
  plotPhase: PlotPhase;
  /** 情绪强度 0-10 */
  emotionalIntensity: number;
  /** 悬念强度 0-10 */
  tensionLevel: number;
  /** 是否为关键章节 */
  isKeyChapter: boolean;
}

/**
 * 情节阶段
 */
export type PlotPhase = 'setup' | 'rising' | 'climax' | 'falling' | 'resolution';

/**
 * 情节阶段信息
 */
export interface PlotPhaseInfo {
  phase: PlotPhase;
  phaseName: string;
  description: string;
  recommendedStrategy: string;
}

/**
 * 生成情节阶段信息
 * 根据章节进度确定当前所处情节阶段
 */
export function generatePlotPhaseInfo(chapterIndex: number, totalChapters: number): PlotPhaseInfo {
  const progress = totalChapters > 0 ? chapterIndex / totalChapters : 0;
  const phaseConfig: Record<PlotPhase, { phaseName: string; description: string; recommendedStrategy: string }> = {
    setup: {
      phaseName: '开篇铺垫',
      description: '建立世界观、主角背景和故事基础',
      recommendedStrategy: '快速引入冲突，吸引读者注意力，为后续发展埋下伏笔',
    },
    rising: {
      phaseName: '矛盾升级',
      description: '冲突逐步升级，主角面临挑战',
      recommendedStrategy: '逐步增加张力，引入新角色和支线，保持节奏紧凑',
    },
    climax: {
      phaseName: '高潮迭起',
      description: '核心冲突爆发，故事达到最紧张时刻',
      recommendedStrategy: '集中爆发核心冲突，给主角最大考验，揭示关键真相',
    },
    falling: {
      phaseName: '余波荡漾',
      description: '高潮后的缓冲，收拾残局',
      recommendedStrategy: '处理高潮后果，逐步解决次要冲突，为结局做铺垫',
    },
    resolution: {
      phaseName: '圆满收束',
      description: '所有线索收拢，结局呈现',
      recommendedStrategy: '回收伏笔，解决剩余冲突，给读者情感满足',
    },
  };

  let phase: PlotPhase;
  if (progress < 0.2) {
    phase = 'setup';
  } else if (progress < 0.5) {
    phase = 'rising';
  } else if (progress < 0.7) {
    phase = 'climax';
  } else if (progress < 0.85) {
    phase = 'falling';
  } else {
    phase = 'resolution';
  }

  const config = phaseConfig[phase];
  return {
    phase,
    phaseName: config.phaseName,
    description: config.description,
    recommendedStrategy: config.recommendedStrategy,
  };
}

// ============================================
// 完结指引类型
// ============================================

/**
 * 完结指引
 */
export interface EndingGuidance {
  /** 是否为最后一章/卷 */
  isFinalChapter: boolean;
  /** 结局类型 */
  endingType: EndingType;
  /** 必须解决的伏笔 */
  mustResolveForeshadows: string[];
  /** 必须完成的冲突 */
  mustResolveConflicts: string[];
  /** 情感收束要点 */
  emotionalClosure: string[];
  /** 彩蛋/续集提示 */
  sequelHints?: string[];
  /** 章节建议 */
  chapterSuggestion: string;
}

/**
 * 结局类型
 */
export type EndingType = 
  | 'bittersweet'      // 苦尽甘来
  | 'triumphant'        // 大团圆
  | 'tragic'            // 悲剧
  | 'open_ending'      // 开放式结局
  | 'cycle'            // 循环结局
  | 'mystery';          // 悬念结局

/**
 * 结局类型配置
 */
export const ENDING_TYPE_CONFIG: Record<EndingType, { label: string; description: string }> = {
  bittersweet: { 
    label: '苦尽甘来', 
    description: '主角经历磨难，最终获得幸福但带有遗憾' 
  },
  triumphant: { 
    label: '大团圆', 
    description: '所有问题解决，主角获得完满结局' 
  },
  tragic: { 
    label: '悲剧', 
    description: '主角或重要角色牺牲，令人唏嘘' 
  },
  open_ending: { 
    label: '开放式结局', 
    description: '留有余韵，读者自行想象' 
  },
  cycle: { 
    label: '循环结局', 
    description: '首尾呼应，形成闭环' 
  },
  mystery: { 
    label: '悬念结局', 
    description: '留下未解之谜' 
  },
};

// ============================================
// 伏笔揭示任务类型
// ============================================

/**
 * 伏笔揭示任务
 */
export interface PayoffMission {
  /** 伏笔ID */
  foreshadowId: string;
  /** 伏笔提示 */
  hint: string;
  /** 紧急度 */
  urgency: 'critical' | 'high' | 'medium' | 'low';
  /** 建议揭示章节 */
  suggestedChapter: number;
  /** 揭示难度 */
  difficulty: 'easy' | 'medium' | 'hard';
  /** 适用的故事卡 */
  compatibleStoryCards: string[];
  /** 关联冲突线 */
  relatedConflicts: string[];
  /** 揭示方式建议 */
  payoffMethod: string;
}

// ============================================
// 写作策略调整类型
// ============================================

/**
 * 写作策略调整
 */
export interface WritingStrategyAdjustment {
  /** 当前阶段 */
  currentPhase: EndingPhase;
  /** 节奏策略 */
  pacingStrategy: string;
  /** 冲突密度 */
  conflictDensity: 'low' | 'medium' | 'high' | 'critical';
  /** 爽点密度 */
  coolPointDensity: 'low' | 'medium' | 'high';
  /** 情感基调建议 */
  emotionalToneSuggestion: string;
  /** 结尾处理方式 */
  endingSuggestion: string;
  /** 伏笔处理优先级 */
  foreshadowPriority: string[];
}
