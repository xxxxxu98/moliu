/**
 * 评估系统类型定义
 * 包含追读力评分、题材Profile、钩子类型等
 */

// ============================================================
// 追读力评分
// ============================================================

/**
 * 追读力评分
 * 替代原来的五维评估
 */
export interface ReadRetentionScore {
  // 总分 0-100
  total: number;
  
  // 分项评分
  dimensions: ReadRetentionDimensions;
  
  // 风险警告
  risks: RiskWarning[];
  
  // 改进建议
  improvements: string[];
  
  // 题材匹配度
  genreMatch: GenreMatch;
}

/**
 * 追读力评分维度
 */
export interface ReadRetentionDimensions {
  // Hook力：开篇和章节结尾的钩子强度
  hookScore: HookScore;
  
  // 爽点密度：爽点的分布和强度
  coolpointScore: CoolPointScore;
  
  // 微兑现率：短期承诺的兑现速度
  microFulfillment: MicroFulfillmentScore;
  
  // 悬念债务：长期悬念的积累程度
  suspenseDebt: SuspenseDebtScore;
  
  // 节奏健康度
  rhythmHealth: RhythmHealthScore;
  
  // 原创性
  originality: OriginalityScore;
}

/**
 * Hook评分
 */
export interface HookScore {
  score: number;        // 0-100
  analysis: HookAnalysis;
  suggestions: string[];
}

/**
 * Hook分析
 */
export interface HookAnalysis {
  openingHook: {
    type: HookType;
    strength: number;  // 0-1
    executed: boolean;
  };
  chapterEndHooks: ChapterEndHookAnalysis[];
  avgHookStrength: number;
  weakChapters: number[];
}

/**
 * 章尾钩子分析
 */
export interface ChapterEndHookAnalysis {
  chapter: number;
  type: HookType;
  strength: number;
  executed: boolean;
}

/**
 * 爽点评分
 */
export interface CoolPointScore {
  score: number;
  analysis: CoolPointAnalysis;
  suggestions: string[];
}

/**
 * 爽点分析
 */
export interface CoolPointAnalysis {
  byType: Record<CoolPointType, CoolPointTypeAnalysis>;
  density: number;           // 每章平均爽点数
  variety: number;          // 类型多样性 0-1
  climaxDistribution: number[]; // 高潮章节列表
  drySpells: number[];     // 干涸期章节
}

/**
 * 爽点类型分析
 */
export interface CoolPointTypeAnalysis {
  count: number;
  chapters: number[];
  avgIntensity: number;
}

/**
 * 微兑现评分
 */
export interface MicroFulfillmentScore {
  score: number;
  rate: number;              // 百分比
  avgPromiseCount: number;
  avgFulfillChapter: number;
  analysis: string;
  suggestions: string[];
}

/**
 * 悬念债务评分
 */
export interface SuspenseDebtScore {
  score: number;
  pendingCount: number;
  maxDebtChapters: number;
  riskLevel: RiskLevel;
  analysis: string;
  suggestions: string[];
}

/**
 * 节奏健康度评分
 */
export interface RhythmHealthScore {
  score: number;
  questContinuity: number;      // Quest连续性 0-1
  fireConsistency: number;      // Fire线稳定性 0-1
  constellationPacing: number; // Constellation揭示节奏 0-1
  analysis: string;
  suggestions: string[];
}

/**
 * 原创性评分
 */
export interface OriginalityScore {
  score: number;
  tropeCount: number;
  uniqueElements: string[];
  genericPatterns: string[];
  analysis: string;
  suggestions: string[];
}

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * 风险警告
 */
export interface RiskWarning {
  level: RiskLevel;
  type: string;
  description: string;
  affectedChapters: number[];
  suggestion: string;
}

/**
 * 题材匹配
 */
export interface GenreMatch {
  score: number;
  expectedProfile: string;
  actualCharacteristics: string[];
  gap: string;
}

// ============================================================
// 题材Profile
// ============================================================

/**
 * 题材Profile
 */
export interface GenreProfile {
  id: string;
  name: string;
  
  // Hook配置
  hooks: {
    opening: HookType[];
    chapterEnd: HookType[];
    recommendedDensity: number;
  };
  
  // 爽点配置
  coolpoints: {
    primary: CoolPointType[];
    secondary: CoolPointType[];
    comboInterval: number;
    density: { min: number; optimal: number; max: number };
  };
  
  // 节奏红线
  pacing: {
    questContinuityMax: number;
    fireBreakMax: number;
    constellationInterval: { min: number; max: number };
    actBreakpoint: number[];
  };
  
  // 典型模式
  typicalPatterns: TypicalPattern[];
  
  // 风险提示
  commonRisks: CommonRisk[];
}

/**
 * 典型模式
 */
export interface TypicalPattern {
  name: string;
  description: string;
  chapters: number[];
}

/**
 * 常见风险
 */
export interface CommonRisk {
  type: string;
  description: string;
  prevention: string;
}

// ============================================================
// 钩子类型
// ============================================================

/**
 * 钩子类型
 */
export type HookType = 
  | 'cliffhanger'     // 悬崖式悬念
  | 'question'         // 疑问式钩子
  | 'revelation'      // 揭示式钩子
  | 'conflict'        // 冲突式钩子
  | 'tension'         // 紧张式钩子
  | 'choice'          // 选择式钩子
  | 'mystery'         // 神秘式钩子
  | 'emotional'       // 情感式钩子
  | 'action';         // 动作式钩子

/**
 * 钩子技法
 */
export interface HookTechnique {
  type: HookType;
  name: string;
  description: string;
  examples: string[];
  usageTips: string[];
  genrePreferences: string[];
}

// ============================================================
// 爽点类型
// ============================================================

/**
 * 爽点类型
 */
export type CoolPointType = 
  | 'face-slapping'      // 打脸
  | 'show-off'          // 装逼
  | 'identity-reveal'     // 身份掉马
  | 'growth'            // 成长
  | 'rescue'            // 英雄救美
  | 'treasure'          // 获得宝物
  | 'breakthrough'       // 突破
  | 'romance'           // 感情进展
  | 'revenge'           // 复仇
  | 'mystery-reveal'    // 真相揭示
  | 'comedy'            // 搞笑
  | 'justice';           // 正义伸张

/**
 * 爽点公式
 */
export interface CoolPointFormula {
  type: CoolPointType;
  name: string;
  description: string;
  trigger: string[];
  execution: string[];
  payoff: string[];
}

// ============================================================
// 五维评估（保留兼容）
// ============================================================

/**
 * 五维潜力评估（保留，与追读力评分共存）
 */
export interface FiveDimensionEvaluation {
  originality: number;      // 原创性 (1-5)
  marketPotential: number;   // 市场潜力 (1-5)
  expandability: number;     // 扩展性 (1-5)
  difficulty: number;        // 创作难度 (1-5, 反向)
  personalMatch: number;     // 个人匹配 (1-5)
}

/**
 * 评估维度
 */
export interface EvaluationDimension {
  id: keyof FiveDimensionEvaluation;
  name: string;
  icon: string;
  description: string;
  color: string;
  gradient: string;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建空追读力评分
 */
export function createEmptyReadRetentionScore(): ReadRetentionScore {
  return {
    total: 0,
    dimensions: {
      hookScore: {
        score: 0,
        analysis: {
          openingHook: { type: 'conflict', strength: 0, executed: false },
          chapterEndHooks: [],
          avgHookStrength: 0,
          weakChapters: [],
        },
        suggestions: [],
      },
      coolpointScore: {
        score: 0,
        analysis: {
          byType: {} as Record<CoolPointType, CoolPointTypeAnalysis>,
          density: 0,
          variety: 0,
          climaxDistribution: [],
          drySpells: [],
        },
        suggestions: [],
      },
      microFulfillment: {
        score: 0,
        rate: 0,
        avgPromiseCount: 0,
        avgFulfillChapter: 0,
        analysis: '',
        suggestions: [],
      },
      suspenseDebt: {
        score: 0,
        pendingCount: 0,
        maxDebtChapters: 0,
        riskLevel: 'low',
        analysis: '',
        suggestions: [],
      },
      rhythmHealth: {
        score: 0,
        questContinuity: 0,
        fireConsistency: 0,
        constellationPacing: 0,
        analysis: '',
        suggestions: [],
      },
      originality: {
        score: 0,
        tropeCount: 0,
        uniqueElements: [],
        genericPatterns: [],
        analysis: '',
        suggestions: [],
      },
    },
    risks: [],
    improvements: [],
    genreMatch: {
      score: 0,
      expectedProfile: '',
      actualCharacteristics: [],
      gap: '',
    },
  };
}

/**
 * Hook类型中文名
 */
export function getHookTypeName(type: HookType): string {
  const names: Record<HookType, string> = {
    cliffhanger: '悬崖式悬念',
    question: '疑问式钩子',
    revelation: '揭示式钩子',
    conflict: '冲突式钩子',
    tension: '紧张式钩子',
    choice: '选择式钩子',
    mystery: '神秘式钩子',
    emotional: '情感式钩子',
    action: '动作式钩子',
  };
  return names[type] || type;
}

/**
 * 爽点类型中文名
 */
export function getCoolPointTypeName(type: CoolPointType): string {
  const names: Record<CoolPointType, string> = {
    'face-slapping': '打脸',
    'show-off': '装逼',
    'identity-reveal': '身份掉马',
    'growth': '成长',
    'rescue': '英雄救美',
    'treasure': '获得宝物',
    'breakthrough': '突破',
    'romance': '感情进展',
    'revenge': '复仇',
    'mystery-reveal': '真相揭示',
    'comedy': '搞笑',
    'justice': '正义伸张',
  };
  return names[type] || type;
}
