/**
 * 审查降级服务
 * 
 * 核心功能：
 * - 分析审查失败的严重程度
 * - 提供分级降级策略
 * - 支持自动修复和手动修复
 */

import type { ReviewResult, ReviewIssue } from '../orchestrator/types';
import { AntiAIService } from '../anti-ai-enhanced';
import type { AntiAIResult } from '../anti-ai-enhanced';

// ============================================================
// 类型定义
// ============================================================

export enum IssueSeverity {
  BLOCKING = 'blocking',    // 阻断 - 必须修复
  HIGH = 'high',            // 高 - 建议修复
  MEDIUM = 'medium',       // 中 - 可以接受
  LOW = 'low',             // 低 - 可忽略
}

export enum IssueCategory {
  CONTRACT = 'contract',        // 合同违规
  CONTINUITY = 'continuity',    // 连贯性问题
  HOOK = 'hook',                // 钩子问题
  COOLPOINT = 'coolpoint',      // 爽点问题
  PACING = 'pacing',            // 节奏问题
  AI_FLAVOR = 'ai_flavor',      // AI 味问题
  CHARACTER = 'character',      // 角色问题
  SETTING = 'setting',          // 设定问题
  OTHER = 'other',              // 其他
}

export interface FallbackStrategy {
  /** 策略名称 */
  name: string;
  /** 策略描述 */
  description: string;
  /** 是否需要重新起草 */
  requiresRewrite: boolean;
  /** 是否需要人工介入 */
  requiresHuman: boolean;
  /** 是否可以自动修复 */
  canAutoFix: boolean;
  /** 是否可以降级通过 */
  canDegradedPass: boolean;
  /** 建议的处理方式 */
  suggestedAction: 'rewrite' | 'auto_fix' | 'degraded_pass' | 'block' | 'human_intervention';
}

export interface FallbackResult {
  /** 是否可以通过 */
  canPass: boolean;
  /** 最终策略 */
  strategy: FallbackStrategy;
  /** 处理后的内容 */
  fixedContent?: string;
  /** 剩余问题 */
  remainingIssues: ReviewIssue[];
  /** 自动修复结果 */
  autoFixResult?: AntiAIResult;
  /** 建议 */
  suggestions: string[];
}

export interface FallbackConfig {
  /** 允许 AI 味问题降级通过 */
  allowAIFlavorDegradedPass: boolean;
  /** 允许中等严重度问题降级通过 */
  allowMediumDegradedPass: boolean;
  /** 允许低严重度问题降级通过 */
  allowLowDegradedPass: boolean;
  /** 阻断问题数量上限（超过则阻塞） */
  maxBlockingIssues: number;
  /** 最低分数阈值 */
  minScore: number;
  /** 自动修复强度 */
  autoFixIntensity: 'gentle' | 'moderate' | 'aggressive';
}

// ============================================================
// 常量定义
// ============================================================

const DEFAULT_CONFIG: FallbackConfig = {
  allowAIFlavorDegradedPass: true,
  allowMediumDegradedPass: false,
  allowLowDegradedPass: true,
  maxBlockingIssues: 2,
  minScore: 70,
  autoFixIntensity: 'moderate',
};

// 可自动修复的问题类型
const AUTO_FIXABLE_ISSUES = [
  'ai_sentence_patterns',
  'high_risk_patterns',
  'banned_content',
  'long_paragraphs',
  'low_dialogue_ratio',
  'ai_flavor',
];

// 必须重新起草的问题类型
const REWRITE_REQUIRED_ISSUES = [
  'missing_must_cover',
  'forbidden_zone_violated',
  'continuity_anchor',
  'weak_chapter_end',
  'weak_chapter_start',
  'flat_pacing',
  'timeline_issue',
];

// AI 味问题类型
const AI_FLAVOR_ISSUE_TYPES = [
  'ai_sentence_patterns',
  'high_risk_patterns',
  'banned_content',
  'ai_pattern',
  'anti_ai_check',
  'ai_flavor',
];

// 阻断问题类型
const BLOCKING_ISSUE_TYPES = [
  'missing_must_cover',
  'forbidden_zone_violated',
  'continuity_anchor',
  'banned_content',
];

// ============================================================
// 降级服务
// ============================================================

export class ReviewFallbackService {
  private config: FallbackConfig;
  private antiAIService: AntiAIService;

  constructor(config: Partial<FallbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.antiAIService = new AntiAIService({ 
      intensity: this.config.autoFixIntensity 
    });
  }

  /**
   * 执行降级分析
   */
  async analyze(
    reviewResult: ReviewResult,
    content: string
  ): Promise<FallbackResult> {
    // 1. 分类问题
    const categorized = this.categorizeIssues(reviewResult);
    
    // 2. 检查阻断问题
    if (categorized.blocking.length > this.config.maxBlockingIssues) {
      return this.createBlockingResult(categorized, '阻断问题过多');
    }
    
    // 3. 检查必须重新起草的问题
    if (this.hasRewriteRequiredIssues(categorized)) {
      return this.createRewriteRequiredResult(categorized);
    }
    
    // 4. 检查是否全为 AI 味问题
    if (this.isAIFlavorOnly(categorized)) {
      if (this.config.allowAIFlavorDegradedPass) {
        return this.createAIFlavorDegradedResult(categorized, content);
      } else {
        return this.createAIFlavorAutoFixResult(categorized, content);
      }
    }
    
    // 5. 尝试自动修复
    if (this.canAutoFix(categorized)) {
      return this.createAutoFixResult(categorized, content);
    }
    
    // 6. 中等问题处理
    if (categorized.medium.length > 0) {
      if (this.config.allowMediumDegradedPass) {
        return this.createMediumDegradedResult(categorized);
      }
    }
    
    // 7. 最终检查分数
    if (reviewResult.overall.score >= this.config.minScore) {
      return this.createPassResult(categorized);
    }
    
    // 8. 无法处理，需要人工介入
    return this.createHumanInterventionResult(categorized);
  }

  /**
   * 分类问题
   */
  private categorizeIssues(reviewResult: ReviewResult): CategorizedIssues {
    const result: CategorizedIssues = {
      blocking: [],
      high: [],
      medium: [],
      low: [],
      byCategory: {},
      autoFixable: [],
      rewriteRequired: [],
      aiFlavor: [],
    };

    // 处理阻断问题
    for (const issue of reviewResult.blockingIssues) {
      result.blocking.push(issue);
      
      if (this.isAIFlavorIssue(issue)) {
        result.aiFlavor.push(issue);
      }
      if (this.isAutoFixable(issue)) {
        result.autoFixable.push(issue);
      }
      if (this.isRewriteRequired(issue)) {
        result.rewriteRequired.push(issue);
      }
      
      const category = this.getIssueCategory(issue);
      if (!result.byCategory[category]) {
        result.byCategory[category] = [];
      }
      result.byCategory[category].push(issue);
    }

    // 处理警告
    for (const warning of reviewResult.warnings) {
      if (warning.severity === 'critical' || warning.severity === 'high') {
        result.high.push(warning);
      } else if (warning.severity === 'warning') {
        result.medium.push(warning);
      } else {
        result.low.push(warning);
      }
      
      if (this.isAIFlavorIssue(warning)) {
        result.aiFlavor.push(warning);
      }
      if (this.isAutoFixable(warning)) {
        result.autoFixable.push(warning);
      }
    }

    return result;
  }

  /**
   * 检查是否有必须重新起草的问题
   */
  private hasRewriteRequiredIssues(categorized: CategorizedIssues): boolean {
    return categorized.rewriteRequired.length > 0 || 
           categorized.blocking.some(i => REWRITE_REQUIRED_ISSUES.includes(i.type));
  }

  /**
   * 检查是否全为 AI 味问题
   */
  private isAIFlavorOnly(categorized: CategorizedIssues): boolean {
    if (categorized.blocking.length === 0 && categorized.high.length === 0) {
      return true;
    }
    return categorized.blocking.every(i => AI_FLAVOR_ISSUE_TYPES.includes(i.type)) &&
           categorized.high.every(i => AI_FLAVOR_ISSUE_TYPES.includes(i.type));
  }

  /**
   * 检查是否可以自动修复
   */
  private canAutoFix(categorized: CategorizedIssues): boolean {
    const fixableCount = categorized.autoFixable.length;
    const totalCount = categorized.blocking.length + categorized.high.length;
    
    // 至少 80% 的问题可自动修复
    return fixableCount >= totalCount * 0.8;
  }

  /**
   * 检查是否为 AI 味问题
   */
  private isAIFlavorIssue(issue: ReviewIssue): boolean {
    return AI_FLAVOR_ISSUE_TYPES.includes(issue.type);
  }

  /**
   * 检查是否可自动修复
   */
  private isAutoFixable(issue: ReviewIssue): boolean {
    return AUTO_FIXABLE_ISSUES.includes(issue.type);
  }

  /**
   * 检查是否必须重新起草
   */
  private isRewriteRequired(issue: ReviewIssue): boolean {
    return REWRITE_REQUIRED_ISSUES.includes(issue.type);
  }

  /**
   * 获取问题分类
   */
  private getIssueCategory(issue: ReviewIssue): IssueCategory {
    const type = issue.type.toLowerCase();
    
    if (type.includes('contract') || type.includes('cover') || type.includes('forbidden')) {
      return IssueCategory.CONTRACT;
    }
    if (type.includes('continuity') || type.includes('anchor')) {
      return IssueCategory.CONTINUITY;
    }
    if (type.includes('hook') || type.includes('end')) {
      return IssueCategory.HOOK;
    }
    if (type.includes('coolpoint') || type.includes('excitement')) {
      return IssueCategory.COOLPOINT;
    }
    if (type.includes('pace') || type.includes('paragraph')) {
      return IssueCategory.PACING;
    }
    if (type.includes('ai') || type.includes('flavor')) {
      return IssueCategory.AI_FLAVOR;
    }
    if (type.includes('character')) {
      return IssueCategory.CHARACTER;
    }
    if (type.includes('setting')) {
      return IssueCategory.SETTING;
    }
    
    return IssueCategory.OTHER;
  }

  /**
   * 创建阻断结果
   */
  private createBlockingResult(
    categorized: CategorizedIssues,
    reason: string
  ): FallbackResult {
    return {
      canPass: false,
      strategy: {
        name: 'BLOCKING',
        description: reason,
        requiresRewrite: true,
        requiresHuman: true,
        canAutoFix: false,
        canDegradedPass: false,
        suggestedAction: 'block',
      },
      remainingIssues: [...categorized.blocking, ...categorized.high],
      suggestions: [
        `发现 ${categorized.blocking.length} 个阻断问题`,
        '建议人工检查并修复',
      ],
    };
  }

  /**
   * 创建需要重新起草的结果
   */
  private createRewriteRequiredResult(categorized: CategorizedIssues): FallbackResult {
    return {
      canPass: false,
      strategy: {
        name: 'REWRITE_REQUIRED',
        description: '存在必须重新起草的问题',
        requiresRewrite: true,
        requiresHuman: false,
        canAutoFix: false,
        canDegradedPass: false,
        suggestedAction: 'rewrite',
      },
      remainingIssues: categorized.rewriteRequired,
      suggestions: [
        '必须覆盖节点未覆盖',
        '存在禁区违规',
        '章节衔接或钩子问题',
        '建议重新起草',
      ],
    };
  }

  /**
   * 创建 AI 味降级通过结果
   */
  private createAIFlavorDegradedResult(
    categorized: CategorizedIssues,
    content: string
  ): FallbackResult {
    return {
      canPass: true,
      strategy: {
        name: 'AI_FLAVOR_DEGRADED_PASS',
        description: 'AI 味问题降级通过',
        requiresRewrite: false,
        requiresHuman: false,
        canAutoFix: false,
        canDegradedPass: true,
        suggestedAction: 'degraded_pass',
      },
      remainingIssues: [...categorized.blocking, ...categorized.high],
      suggestions: [
        '仅 AI 味问题，配置允许降级通过',
        '建议后续手动优化',
      ],
    };
  }

  /**
   * 创建 AI 味自动修复结果
   */
  private async createAIFlavorAutoFixResult(
    categorized: CategorizedIssues,
    content: string
  ): Promise<FallbackResult> {
    const autoFixResult = await this.antiAIService.fix(content);
    
    return {
      canPass: autoFixResult.pass,
      strategy: {
        name: 'AI_FLAVOR_AUTO_FIX',
        description: '自动修复 AI 味问题',
        requiresRewrite: false,
        requiresHuman: false,
        canAutoFix: true,
        canDegradedPass: false,
        suggestedAction: 'auto_fix',
      },
      fixedContent: autoFixResult.content,
      remainingIssues: [],
      autoFixResult,
      suggestions: autoFixResult.suggestions || [],
    };
  }

  /**
   * 创建自动修复结果
   */
  private async createAutoFixResult(
    categorized: CategorizedIssues,
    content: string
  ): Promise<FallbackResult> {
    const autoFixResult = await this.antiAIService.fix(content);
    
    return {
      canPass: autoFixResult.pass || categorized.medium.length === 0,
      strategy: {
        name: 'AUTO_FIX',
        description: '自动修复问题',
        requiresRewrite: false,
        requiresHuman: false,
        canAutoFix: true,
        canDegradedPass: false,
        suggestedAction: 'auto_fix',
      },
      fixedContent: autoFixResult.content,
      remainingIssues: categorized.medium,
      autoFixResult,
      suggestions: [
        `自动修复了 ${autoFixResult.totalIssues} 处问题`,
        ...(autoFixResult.suggestions || []),
      ],
    };
  }

  /**
   * 创建中等严重度降级结果
   */
  private createMediumDegradedResult(categorized: CategorizedIssues): FallbackResult {
    return {
      canPass: true,
      strategy: {
        name: 'MEDIUM_DEGRADED_PASS',
        description: '中等严重度问题降级通过',
        requiresRewrite: false,
        requiresHuman: false,
        canAutoFix: false,
        canDegradedPass: true,
        suggestedAction: 'degraded_pass',
      },
      remainingIssues: [...categorized.medium, ...categorized.low],
      suggestions: [
        '中等严重度问题在可接受范围内',
        '建议后续手动优化',
      ],
    };
  }

  /**
   * 创建通过结果
   */
  private createPassResult(categorized: CategorizedIssues): FallbackResult {
    return {
      canPass: true,
      strategy: {
        name: 'PASS',
        description: '审查通过',
        requiresRewrite: false,
        requiresHuman: false,
        canAutoFix: false,
        canDegradedPass: false,
        suggestedAction: 'degraded_pass',
      },
      remainingIssues: categorized.low,
      suggestions: [],
    };
  }

  /**
   * 创建需要人工介入的结果
   */
  private createHumanInterventionResult(categorized: CategorizedIssues): FallbackResult {
    return {
      canPass: false,
      strategy: {
        name: 'HUMAN_INTERVENTION',
        description: '需要人工介入',
        requiresRewrite: false,
        requiresHuman: true,
        canAutoFix: false,
        canDegradedPass: false,
        suggestedAction: 'human_intervention',
      },
      remainingIssues: [...categorized.blocking, ...categorized.high, ...categorized.medium],
      suggestions: [
        '无法自动处理的问题',
        '建议人工检查并修复',
        ...categorized.blocking.map(i => `- ${i.description}`),
      ],
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ============================================================
// 分类问题
// ============================================================

interface CategorizedIssues {
  blocking: ReviewIssue[];
  high: ReviewIssue[];
  medium: ReviewIssue[];
  low: ReviewIssue[];
  byCategory: Record<IssueCategory, ReviewIssue[]>;
  autoFixable: ReviewIssue[];
  rewriteRequired: ReviewIssue[];
  aiFlavor: ReviewIssue[];
}

// ============================================================
// Composable
// ============================================================

export function useReviewFallback(config?: Partial<FallbackConfig>) {
  const service = new ReviewFallbackService(config);

  return {
    service,
    analyze: (reviewResult: ReviewResult, content: string) => 
      service.analyze(reviewResult, content),
    updateConfig: (config: Partial<FallbackConfig>) => 
      service.updateConfig(config),
  };
}
