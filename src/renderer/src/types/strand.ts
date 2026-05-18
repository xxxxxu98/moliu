/**
 * Strand 叙事线类型定义
 * 基于 webnovel-writer-master 的 Strand Weave 节奏系统
 * 
 * Strand = 叙事线，Webnovel写作中的核心概念
 * 三条主线：Quest（任务线）、Fire（感情线）、Constellation（世界观线）
 */

// ============================================================
// 三条叙事线
// ============================================================

/**
 * 叙事线规划
 */
export interface StrandPlan {
  quest: QuestStrand;
  fire: FireStrand;
  constellation: ConstellationStrand;
}

/**
 * Quest线（主线/任务线）
 * 占比约 60%
 * 定义故事的主线冲突和主角的目标追求
 */
export interface QuestStrand {
  // 主线冲突
  mainConflict: string;
  
  // 主角目标
  mainGoal: string;
  
  // 阶段性目标
  stages: QuestStage[];
  
  // 里程碑
  milestones: StrandMilestone[];
  
  // 当前阶段
  currentStage: number;
  
  // Quest进度 (0-1)
  progress: number;
}

/**
 * Quest阶段
 */
export interface QuestStage {
  id: string;
  name: string;
  description: string;
  
  // 章节范围
  startChapter: number;
  endChapter: number;
  
  // 状态
  status: StrandStatus;
  
  // 本阶段主要事件
  keyEvents: string[];
  
  // 本阶段冲突
  conflicts: string[];
}

/**
 * Fire线（感情线）
 * 占比约 20%
 * 定义主角与其他角色的感情发展
 */
export interface FireStrand {
  // 感情类型
  romanceType: RomanceType;
  
  // 感情对象
  loveInterest: {
    name: string;
    archetype: string;
    firstMeeting: string;
  };
  
  // 感情阶段
  stages: FireStage[];
  
  // 里程碑
  milestones: FireMilestone[];
  
  // 当前阶段
  currentStage: number;
  
  // 感情进度 (0-1)
  progress: number;
}

/**
 * 感情线类型
 */
export type RomanceType = 
  | 'unrequited'       // 单恋
  | 'mutual'           // 双箭头/两情相悦
  | 'secret'           // 暗恋
  | 'bittersweet'      // 虐恋
  | 'sweet'             // 甜宠
  | 'childhoodsweet'    // 青梅竹马
  | 'fated'             // 天定姻缘
  | 'rival'             // 欢喜冤家
  | 'revenge'           // 复仇变真爱
  | 'growth';           // 共同成长

/**
 * 感情阶段
 */
export interface FireStage {
  id: string;
  name: string;
  description: string;
  
  // 章节范围
  startChapter: number;
  endChapter: number;
  
  // 状态
  status: StrandStatus;
  
  // 本阶段核心事件
  coreEvent: string;
  
  // 感情进展描述
  progression: string;
}

/**
 * Fire里程碑
 */
export interface FireMilestone {
  chapter: number;
  type: FireMilestoneType;
  name: string;
  description: string;
  status: StrandStatus;
}

/**
 * 感情里程碑类型
 */
export type FireMilestoneType = 
  | 'first_meeting'     // 初遇
  | 'attraction'         // 吸引
  | 'conflict'           // 冲突/误会
  | 'confession'         // 表白
  | 'kiss'               // 初吻
  | 'together'          // 在一起
  | 'breakup'            // 分手/虐点
  | 'reunion'            // 重逢/复合
  | 'marriage'           // 结婚
  | 'childbirth';        // 生子

/**
 * Constellation线（世界观线）
 * 占比约 20%
 * 定义世界观设定的揭示和扩展
 */
export interface ConstellationStrand {
  // 世界观主题
  theme: string;
  
  // 核心秘密
  coreSecrets: string[];
  
  // 揭示计划
  revealPlan: ConstellationReveal[];
  
  // 已揭示的秘密
  revealedSecrets: string[];
  
  // 下一个揭示
  nextReveal: ConstellationReveal | null;
  
  // 进度 (0-1)
  progress: number;
}

/**
 * Constellation揭示计划
 */
export interface ConstellationReveal {
  id: string;
  
  // 揭示的规则/秘密
  secret: string;
  
  // 暗示/伏笔
  hint: string;
  
  // 首次暗示章节
  hintChapter: number;
  
  // 正式揭示章节
  revealChapter: number;
  
  // 揭示方式
  revealMethod: RevealMethod;
  
  // 状态
  status: StrandStatus;
  
  // 描述
  description: string;
}

/**
 * 揭示方式
 */
export type RevealMethod = 
  | 'gradual'        // 渐进式揭示
  | 'dramatic'       // 戏剧性揭示
  | 'mystery'         // 悬疑式揭示
  | 'revelation'      // 突然揭示
  | 'callback';       // 呼应式揭示

// ============================================================
// Strand 状态
// ============================================================

/**
 * 叙事线状态
 */
export type StrandStatus = 
  | 'planned'      // 计划中
  | 'active'       // 进行中
  | 'paused'       // 暂停
  | 'completed'    // 已完成
  | 'abandoned';  // 已放弃

// ============================================================
// Strand 编织
// ============================================================

/**
 * Strand编织配置
 * 定义三条线的交织方式
 */
export interface StrandWeaveConfig {
  // Quest-Fire交织
  questFireInterweave: InterweaveConfig;
  
  // Quest-Constellation交织
  questConstellationInterweave: InterweaveConfig;
  
  // Fire-Constellation交织
  fireConstellationInterweave: InterweaveConfig;
  
  // 节奏红线
  pacingRedLines: PacingRedLines;
}

/**
 * 交织配置
 */
export interface InterweaveConfig {
  enabled: boolean;
  
  // 交织频率（每N章交织一次）
  frequency: number;
  
  // 交织方式
  method: InterweaveMethod;
  
  // 描述
  description: string;
}

/**
 * 交织方式
 */
export type InterweaveMethod = 
  | 'parallel'      // 并行：两条线同时推进
  | 'alternating'   // 交替：一条线为主，一条线穿插
  | 'converging'    // 汇聚：两条线在某节点交汇
  | 'climax';       // 高潮：两条线在高潮点同时爆发

/**
 * 节奏红线
 * 定义三条线的安全边界
 */
export interface PacingRedLines {
  // Quest线：最大连续章节数（不出现感情/世界观进展）
  questContinuityMax: number;
  
  // Fire线：最大断档章节数（不推进感情线）
  fireBreakMax: number;
  
  // Constellation线：最大间隔章节数（不揭示新设定）
  constellationIntervalMax: number;
  
  // Constellation线：最小间隔（防止揭示过快）
  constellationIntervalMin: number;
  
  // Act分界线
  actBreakpoints: number[];
}

// ============================================================
// Strand 进度追踪
// ============================================================

/**
 * Strand进度
 */
export interface StrandProgress {
  quest: QuestProgress;
  fire: FireProgress;
  constellation: ConstellationProgress;
}

/**
 * Quest进度
 */
export interface QuestProgress {
  currentStage: number;
  totalStages: number;
  progress: number;  // 0-1
  activeConflicts: number;
  completedMilestones: number;
  totalMilestones: number;
}

/**
 * Fire进度
 */
export interface FireProgress {
  currentStage: number;
  totalStages: number;
  progress: number;  // 0-1
  currentMilestone: FireMilestoneType | null;
  intimacyLevel: number;  // 亲密度 0-10
}

/**
 * Constellation进度
 */
export interface ConstellationProgress {
  progress: number;  // 0-1
  revealedCount: number;
  totalCount: number;
  nextReveal: {
    secret: string;
    expectedChapter: number;
  } | null;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建空叙事线规划
 */
export function createEmptyStrandPlan(): StrandPlan {
  return {
    quest: {
      mainConflict: '',
      mainGoal: '',
      stages: [],
      milestones: [],
      currentStage: 1,
      progress: 0,
    },
    fire: {
      romanceType: 'mutual',
      loveInterest: {
        name: '',
        archetype: '',
        firstMeeting: '',
      },
      stages: [],
      milestones: [],
      currentStage: 1,
      progress: 0,
    },
    constellation: {
      theme: '',
      coreSecrets: [],
      revealPlan: [],
      revealedSecrets: [],
      nextReveal: null,
      progress: 0,
    },
  };
}

/**
 * 创建默认节奏红线
 */
export function createDefaultPacingRedLines(): PacingRedLines {
  return {
    questContinuityMax: 7,
    fireBreakMax: 15,
    constellationIntervalMax: 20,
    constellationIntervalMin: 5,
    actBreakpoints: [30, 60, 100],
  };
}

/**
 * 创建默认Strand编织配置
 */
export function createDefaultStrandWeaveConfig(): StrandWeaveConfig {
  return {
    questFireInterweave: {
      enabled: true,
      frequency: 3,
      method: 'alternating',
      description: '以Quest为主线，Fire线穿插推进',
    },
    questConstellationInterweave: {
      enabled: true,
      frequency: 5,
      method: 'parallel',
      description: '并行推进，但Constellation揭示与Quest进展配合',
    },
    fireConstellationInterweave: {
      enabled: false,
      frequency: 10,
      method: 'parallel',
      description: '感情线与世界观线独立发展',
    },
    pacingRedLines: createDefaultPacingRedLines(),
  };
}

/**
 * 获取感情线类型名称
 */
export function getRomanceTypeName(type: RomanceType): string {
  const names: Record<RomanceType, string> = {
    unrequited: '单恋',
    mutual: '两情相悦',
    secret: '暗恋',
    bittersweet: '虐恋',
    sweet: '甜宠',
    childhoodsweet: '青梅竹马',
    fated: '天定姻缘',
    rival: '欢喜冤家',
    revenge: '复仇变真爱',
    growth: '共同成长',
  };
  return names[type] || type;
}

/**
 * 获取感情里程碑名称
 */
export function getFireMilestoneName(type: FireMilestoneType): string {
  const names: Record<FireMilestoneType, string> = {
    first_meeting: '初遇',
    attraction: '吸引',
    conflict: '冲突',
    confession: '表白',
    kiss: '初吻',
    together: '在一起',
    breakup: '分手',
    reunion: '复合',
    marriage: '结婚',
    childbirth: '生子',
  };
  return names[type] || type;
}

/**
 * 验证节奏红线
 */
export function validatePacingRedLines(
  config: PacingRedLines,
  chapterCount: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  // Quest连续性检查
  if (config.questContinuityMax > 10) {
    warnings.push('Quest线连续超过10章可能影响节奏');
  }
  
  // Fire断档检查
  if (config.fireBreakMax > 20) {
    warnings.push('感情线断档超过20章可能让读者失去兴趣');
  }
  
  // Constellation间隔检查
  if (config.constellationIntervalMax > 30) {
    warnings.push('世界观揭示间隔过长可能让读者遗忘');
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}
