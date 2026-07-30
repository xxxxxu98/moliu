/**
 * 增强版审查服务 - Blocking 闸门机制
 * 参考 webnovel-writer 的审查设计
 * 
 * 核心改进：
 * 1. 引入 blocking 闸门机制
 * 2. blocking=true 时强制阻断后续流程
 * 3. 严格输出问题分类和严重度
 * 4. 自适应审查 - 根据问题类型和严重度智能判断是否阻断
 */

import type { ReviewIssue, ReviewSeverity, ReviewCategory } from '@/types/writing-task';
import type { Project, Chapter } from '@/types/project';
import { ReviewService, type ReviewContext, type ReviewOptions } from './review-service';
import type { SixDimensionReview } from '@/types/writing-task';
import {
  performSpecialChecks,
  type SpecialCheckResult,
} from './special-checks.service';

// ============================================
// 问题类型与阻断策略
// ============================================

/** 不应该阻断的问题类型 - 润色阶段会处理 */
const NON_BLOCKING_ISSUE_TYPES: Record<string, boolean> = {
  'ai_flavor': true,
  'show_dont_tell': true,
  'pacing': true,
  'excitement': true,
  'chapter_ending': true,
};

/**
 * 严重问题类型 - 命中且判定应阻断时，忽略严格度阈值强制阻断
 * 键必须与 ReviewCategory 对齐（旧版 character_consistency 等从未匹配真实分类）
 */
const ALWAYS_BLOCKING_TYPES: Partial<Record<ReviewCategory, boolean>> = {
  character: true,
  logic: true,
  setting: true,
  timeline: true,
  continuity: true,
};

/** 问题严重度到阻断的映射 */
const SEVERITY_TO_BLOCKING: Record<ReviewSeverity, boolean> = {
  critical: true,
  high: true,
  medium: false,
  low: false,
};

export type ReviewStrictness = 'relaxed' | 'normal' | 'strict';

/** 严格度配置 */
const STRICTNESS_CONFIG: Record<ReviewStrictness, {
  blockingThreshold: number;
  requireAllCriticalPass: boolean;
  autoFixAIFlavor: boolean;
}> = {
  relaxed: {
    blockingThreshold: 2,     // 只有2个以上 blocking 才阻断
    requireAllCriticalPass: false,  // 不要求所有 critical 通过
    autoFixAIFlavor: true,   // 自动修复 AI 味
  },
  normal: {
    blockingThreshold: 1,    // 1个 blocking 就阻断
    requireAllCriticalPass: true,   // 要求所有 critical 通过
    autoFixAIFlavor: true,   // 自动修复 AI 味
  },
  strict: {
    blockingThreshold: 1,    // 1个 blocking 就阻断
    requireAllCriticalPass: true,   // 要求所有 critical 通过
    autoFixAIFlavor: false,  // 不自动修复，让用户决定
  },
};

export interface BlockingReviewResult {
  /** 是否通过审查 */
  passed: boolean;
  /** 是否有阻断问题 */
  hasBlocking: boolean;
  /** blocking 问题数量 */
  blockingCount: number;
  /** 高优先级问题数量 */
  highPriorityCount: number;
  /** 总问题数量 */
  totalIssues: number;
  /** 所有问题列表 */
  issues: ReviewIssue[];
  /** 按分类统计 */
  categoryStats: Record<ReviewCategory, { total: number; blocking: number }>;
  /** 审查摘要 */
  summary: string;
  /** 详细审查结果 */
  detail: SixDimensionReview;
  /** 审查严格度 */
  strictness: ReviewStrictness;
  /** 智能决策信息 */
  decision?: {
    shouldBlock: boolean;
    reason: string;
    canAutoFix: boolean;
  };
}

export interface ReviewStage {
  /** 阶段名称 */
  name: string;
  /** 是否通过 */
  passed: boolean;
  /** blocking 数量 */
  blockingCount: number;
  /** 问题数量 */
  issues: number;
}

/**
 * 增强版审查服务 - 支持 blocking 闸门和自适应审查
 */
export class BlockingReviewService {
  private reviewService: ReviewService;
  private context: ReviewContext;
  private options: ReviewOptions;
  private strictness: ReviewStrictness;

  constructor(context: ReviewContext, options: ReviewOptions = {}, strictness: ReviewStrictness = 'normal') {
    this.context = context;
    this.options = {
      ...options,
      strictMode: strictness === 'strict', // 只有 strict 模式才强制启用严格模式
    };
    this.strictness = strictness;
    this.reviewService = new ReviewService(context, this.options);
  }

  /**
   * 设置审查严格度
   */
  setStrictness(strictness: ReviewStrictness): void {
    this.strictness = strictness;
    this.options.strictMode = strictness === 'strict';
  }

  /**
   * 执行带 blocking 闸门的审查
   *
   * @returns 完整的审查结果，包含是否阻断的信息
   */
  async reviewWithBlocking(): Promise<BlockingReviewResult> {
    // 执行六维审查
    const detail = await this.reviewService.review();

    // 分析结果
    return this.analyzeBlockingResult(detail);
  }

  /**
   * 执行带专项检查的增强审查（oh-story 规范）
   * 
   * 集成章尾钩子、爽点密度、Show Don't Tell 等专项检查
   */
  async reviewWithSpecialChecks(chapterNumber: number): Promise<{
    blockingResult: BlockingReviewResult;
    specialResult: SpecialCheckResult;
  }> {
    // 1. 执行六维审查
    const detail = await this.reviewService.review();
    const blockingResult = this.analyzeBlockingResult(detail);

    // 2. 执行专项检查（oh-story 规范）
    const content = this.context.chapter?.content || '';
    const specialResult = performSpecialChecks(content, chapterNumber);

    // 3. 合并问题后整表重算（含 decision），避免 blockingCount=0 但旧 decision 仍阻断
    const allIssues = [...blockingResult.issues, ...specialResult.allIssues];
    const mergedBlockingResult = this.analyzeBlockingResult({
      ...detail,
      overall: {
        ...detail.overall,
        issues: allIssues,
      },
    });

    return {
      blockingResult: mergedBlockingResult,
      specialResult,
    };
  }

  /**
   * 分析审查结果，判断 blocking 状态（自适应版本）
   */
  private analyzeBlockingResult(detail: SixDimensionReview): BlockingReviewResult {
    const issues = detail.overall.issues;
    const config = STRICTNESS_CONFIG[this.strictness];
    
    // 统计各类问题
    const categoryStats: Record<ReviewCategory, { total: number; blocking: number }> = {
      setting: { total: 0, blocking: 0 },
      timeline: { total: 0, blocking: 0 },
      continuity: { total: 0, blocking: 0 },
      character: { total: 0, blocking: 0 },
      logic: { total: 0, blocking: 0 },
      ai_flavor: { total: 0, blocking: 0 },
      pacing: { total: 0, blocking: 0 },
      chapter_ending: { total: 0, blocking: 0 },
      excitement: { total: 0, blocking: 0 },
      show_dont_tell: { total: 0, blocking: 0 },
      other: { total: 0, blocking: 0 },
    };

    let blockingCount = 0;
    let highPriorityCount = 0;
    let autoFixableCount = 0;
    let alwaysBlockCount = 0;

    for (const issue of issues) {
      const category = issue.category as ReviewCategory;
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, blocking: 0 };
      }
      categoryStats[category].total++;

      // 根据严格度和问题类型判断是否阻断
      const shouldBlock = this.shouldBlockIssue(issue);
      
      if (shouldBlock) {
        categoryStats[category].blocking++;
        blockingCount++;
      }

      if (issue.severity === 'high' || issue.severity === 'critical') {
        highPriorityCount++;
      }

      // 统计可自动修复的问题
      if (NON_BLOCKING_ISSUE_TYPES[category] || 
          (config.autoFixAIFlavor && category === 'ai_flavor')) {
        autoFixableCount++;
      }

      // 仅统计「严重类别且实际应阻断」的项，避免低/中严重度却强制 shouldBlock
      if (ALWAYS_BLOCKING_TYPES[category] && shouldBlock) {
        alwaysBlockCount++;
      }
    }

    // 自适应判断是否阻断
    const decision = this.makeBlockingDecision({
      issues,
      blockingCount,
      highPriorityCount,
      autoFixableCount,
      alwaysBlockCount,
      totalIssues: issues.length,
      config,
    });

    const hasBlocking = decision.shouldBlock;
    const passed = !hasBlocking;

    // 生成摘要
    const summary = this.generateSummary({
      passed,
      hasBlocking,
      blockingCount,
      highPriorityCount,
      totalIssues: issues.length,
    });

    return {
      passed,
      hasBlocking,
      blockingCount,
      highPriorityCount,
      totalIssues: issues.length,
      issues,
      categoryStats,
      summary,
      detail,
      strictness: this.strictness,
      decision,
    };
  }

  /**
   * 判断单个问题是否应该阻断
   */
  private shouldBlockIssue(issue: ReviewIssue): boolean {
    const category = issue.category;
    
    // 严重类别：按严格度抬门槛，critical 即使漏标 blocking 也阻断
    if (ALWAYS_BLOCKING_TYPES[category]) {
      if (this.strictness === 'relaxed') {
        return issue.severity === 'critical';
      }
      return (
        issue.blocking ||
        issue.severity === 'critical' ||
        issue.severity === 'high'
      );
    }

    // 如果是不应该阻断的类型，根据严格度判断
    if (NON_BLOCKING_ISSUE_TYPES[category]) {
      // relaxed 模式：非阻断
      // normal 模式：只有 high/critical 才阻断
      // strict 模式：medium 及以上都阻断
      if (this.strictness === 'relaxed') {
        return false;
      } else if (this.strictness === 'normal') {
        return issue.severity === 'critical' || issue.severity === 'high';
      } else {
        return SEVERITY_TO_BLOCKING[issue.severity] || false;
      }
    }

    // 默认：根据 issue.blocking 字段和严重度判断
    if (this.strictness === 'relaxed') {
      // relaxed 模式：只有 critical 才阻断
      return issue.severity === 'critical' && issue.blocking;
    }

    return issue.blocking || SEVERITY_TO_BLOCKING[issue.severity] || false;
  }

  /**
   * 做出阻断决策
   */
  private makeBlockingDecision(params: {
    issues: ReviewIssue[];
    blockingCount: number;
    highPriorityCount: number;
    autoFixableCount: number;
    alwaysBlockCount: number;
    totalIssues: number;
    config: typeof STRICTNESS_CONFIG['normal'];
  }): {
    shouldBlock: boolean;
    reason: string;
    canAutoFix: boolean;
  } {
    const { blockingCount, autoFixableCount, alwaysBlockCount, config } = params;

    // 1. 如果有必须阻断的问题，直接阻断
    if (alwaysBlockCount > 0) {
      return {
        shouldBlock: true,
        reason: `存在 ${alwaysBlockCount} 个必须阻断的严重问题（人物一致性/逻辑漏洞/设定冲突/时间线）`,
        canAutoFix: false,
      };
    }

    // 2. 根据严格度判断
    if (this.strictness === 'relaxed') {
      // relaxed 模式：只有超过阈值才阻断
      if (blockingCount >= config.blockingThreshold) {
        // 但如果都是可自动修复的，不阻断
        if (autoFixableCount === blockingCount) {
          return {
            shouldBlock: false,
            reason: `发现 ${blockingCount} 个问题，但都是可自动修复的（润色阶段会处理）`,
            canAutoFix: true,
          };
        }
        return {
          shouldBlock: true,
          reason: `存在 ${blockingCount} 个阻断问题（relaxed 模式阈值：${config.blockingThreshold}）`,
          canAutoFix: autoFixableCount > 0,
        };
      }
      return {
        shouldBlock: false,
        reason: '审查通过（relaxed 模式）',
        canAutoFix: true,
      };
    }

    // 3. normal/strict 模式
    if (blockingCount >= config.blockingThreshold) {
      // 检查是否可以自动修复
      if (autoFixableCount > 0 && autoFixableCount === blockingCount) {
        return {
          shouldBlock: false,
          reason: `发现 ${blockingCount} 个问题，但都是可自动修复的（润色阶段会处理）`,
          canAutoFix: true,
        };
      }
      return {
        shouldBlock: true,
        reason: `存在 ${blockingCount} 个阻断问题`,
        canAutoFix: autoFixableCount > 0,
      };
    }

    return {
      shouldBlock: false,
      reason: '审查通过',
      canAutoFix: autoFixableCount > 0,
    };
  }

  /**
   * 生成审查摘要
   */
  private generateSummary(stats: {
    passed: boolean;
    hasBlocking: boolean;
    blockingCount: number;
    highPriorityCount: number;
    totalIssues: number;
  }): string {
    if (stats.passed) {
      return `审查通过（${stats.totalIssues}个问题，均已处理）`;
    }

    const parts: string[] = [];
    
    if (stats.blockingCount > 0) {
      parts.push(`${stats.blockingCount}个阻断问题`);
    }
    
    if (stats.highPriorityCount > 0) {
      parts.push(`${stats.highPriorityCount}个高优先级`);
    }

    return `审查未通过：${parts.join('，')}`;
  }

  /**
   * 检查是否可以进入下一阶段
   * 
   * 这是 blocking 闸门的核心方法
   * 
   * @param result 审查结果
   * @returns 是否可以通过闸门
   */
  static canProceed(result: BlockingReviewResult): boolean {
    return result.passed && !result.hasBlocking;
  }

  /**
   * 获取需要修复的问题列表
   * 
   * @param result 审查结果
   * @param maxCount 最大返回数量
   * @returns 按优先级排序的问题列表
   */
  static getBlockingIssues(
    result: BlockingReviewResult,
    maxCount: number = 10
  ): ReviewIssue[] {
    return result.issues
      .filter(issue => issue.blocking || issue.severity === 'critical' || issue.severity === 'high')
      .sort((a, b) => {
        // blocking 优先
        if (a.blocking !== b.blocking) {
          return a.blocking ? -1 : 1;
        }
        // 然后按严重度
        const severityOrder: Record<ReviewSeverity, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, maxCount);
  }

  /**
   * 生成修复建议
   */
  static generateFixSuggestions(issues: ReviewIssue[]): string[] {
    return issues.map((issue, index) => {
      const priority = issue.blocking ? '[阻断]' : issue.severity === 'critical' ? '[严重]' : '';
      return `${index + 1}. ${priority} ${issue.category}: ${issue.description}\n   位置: ${issue.location}\n   修复: ${issue.fixHint || '请根据问题描述修复'}`;
    });
  }
}

// ============================================
// 流水线式审查（参考 webnovel-writer）
// ============================================

export interface WritingPipelineStage {
  /** 阶段名称 */
  name: string;
  /** 阶段编号 */
  order: number;
  /** 是否已完成 */
  completed: boolean;
  /** 是否阻断 */
  blocked: boolean;
  /** 问题数量 */
  issues: number;
  /** blocking 数量 */
  blockingCount: number;
  /** 备注 */
  note?: string;
}

export interface WritingPipelineResult {
  /** 整体是否通过 */
  passed: boolean;
  /** 当前阶段 */
  currentStage: number;
  /** 各阶段状态 */
  stages: WritingPipelineStage[];
  /** 最新审查结果 */
  latestReview?: BlockingReviewResult;
  /** 下一步建议 */
  nextStep: string;
}

/**
 * 写作流水线管理器
 * 
 * 管理：起草 → 审查 → 润色 → 提交 的完整流程
 */
export class WritingPipelineManager {
  private stages: WritingPipelineStage[] = [
    { name: '起草', order: 1, completed: false, blocked: false, issues: 0, blockingCount: 0 },
    { name: '审查', order: 2, completed: false, blocked: false, issues: 0, blockingCount: 0 },
    { name: '润色', order: 3, completed: false, blocked: false, issues: 0, blockingCount: 0 },
    { name: '提交', order: 4, completed: false, blocked: false, issues: 0, blockingCount: 0 },
  ];

  private currentStage = 0;
  private reviewHistory: BlockingReviewResult[] = [];

  /**
   * 推进到下一阶段
   */
  advance(): WritingPipelineStage | null {
    // 如果当前阶段被阻断，不能推进
    const current = this.stages[this.currentStage];
    if (current && current.blocked) {
      return null;
    }

    // 标记当前阶段完成
    if (current) {
      current.completed = true;
    }

    // 推进到下一阶段
    if (this.currentStage < this.stages.length - 1) {
      this.currentStage++;
      return this.stages[this.currentStage];
    }

    return null; // 已完成所有阶段
  }

  /**
   * 设置当前阶段的审查结果
   */
  setReviewResult(result: BlockingReviewResult): void {
    const stage = this.stages[this.currentStage];
    if (!stage) return;

    this.reviewHistory.push(result);

    stage.issues = result.totalIssues;
    stage.blockingCount = result.blockingCount;
    stage.blocked = result.hasBlocking;
    stage.completed = !result.hasBlocking;
    stage.note = result.summary;
  }

  /**
   * 获取当前状态
   */
  getStatus(): WritingPipelineResult {
    const latestReview = this.reviewHistory[this.reviewHistory.length - 1];
    
    return {
      passed: !this.stages.some(s => s.blocked),
      currentStage: this.currentStage,
      stages: [...this.stages],
      latestReview,
      nextStep: this.getNextStepSuggestion(),
    };
  }

  /**
   * 获取下一步建议
   */
  private getNextStepSuggestion(): string {
    const current = this.stages[this.currentStage];

    if (!current) {
      return '所有阶段已完成';
    }

    if (current.blocked) {
      return `需要修复 ${current.blockingCount} 个阻断问题后才能继续`;
    }

    switch (current.name) {
      case '起草':
        return '开始起草正文';
      case '审查':
        return '提交审查（blocking 闸门）';
      case '润色':
        return '进行润色处理';
      case '提交':
        return '完成提交';
      default:
        return '继续';
    }
  }

  /**
   * 重置流水线
   */
  reset(): void {
    this.stages = [
      { name: '起草', order: 1, completed: false, blocked: false, issues: 0, blockingCount: 0 },
      { name: '审查', order: 2, completed: false, blocked: false, issues: 0, blockingCount: 0 },
      { name: '润色', order: 3, completed: false, blocked: false, issues: 0, blockingCount: 0 },
      { name: '提交', order: 4, completed: false, blocked: false, issues: 0, blockingCount: 0 },
    ];
    this.currentStage = 0;
    this.reviewHistory = [];
  }

  /**
   * 获取审查历史
   */
  getReviewHistory(): BlockingReviewResult[] {
    return [...this.reviewHistory];
  }
}

// ============================================
// 便捷函数
// ============================================

/**
 * 执行带 blocking 闸门的审查
 */
export async function blockingReview(
  context: ReviewContext,
  options?: ReviewOptions,
  strictness: ReviewStrictness = 'normal'
): Promise<BlockingReviewResult> {
  const service = new BlockingReviewService(context, options, strictness);
  return await service.reviewWithBlocking();
}

/**
 * 快速检查 blocking 状态
 */
export function canProceedToPolish(result: BlockingReviewResult): boolean {
  // 防御：decision 与 blockingCount 不一致时以 blockingCount 为准（历史口径漂移）
  if (result.decision?.shouldBlock && result.blockingCount === 0) {
    return true;
  }
  if (result.decision) {
    return !result.decision.shouldBlock;
  }
  return BlockingReviewService.canProceed(result);
}

/**
 * 获取需要修复的问题
 */
export function getBlockingIssuesToFix(
  result: BlockingReviewResult,
  maxCount?: number
): ReviewIssue[] {
  return BlockingReviewService.getBlockingIssues(result, maxCount);
}

/**
 * 执行带专项检查的增强审查（oh-story 规范）
 * 
 * 便捷函数
 */
export async function enhancedReview(
  context: ReviewContext,
  chapterNumber: number,
  options?: ReviewOptions,
  strictness: ReviewStrictness = 'normal'
): Promise<{
  blockingResult: BlockingReviewResult;
  specialResult: SpecialCheckResult;
}> {
  const service = new BlockingReviewService(context, options, strictness);
  return await service.reviewWithSpecialChecks(chapterNumber);
}

/**
 * 创建带特定严格度的审查服务
 */
export function createBlockingReviewService(
  context: ReviewContext,
  options?: ReviewOptions,
  strictness: ReviewStrictness = 'normal'
): BlockingReviewService {
  return new BlockingReviewService(context, options, strictness);
}

/**
 * 智能审查 - 根据上下文自动选择严格度
 */
export async function smartBlockingReview(
  context: ReviewContext,
  options?: {
    chapterIndex?: number;
    totalChapters?: number;
    retryCount?: number;
  }
): Promise<BlockingReviewResult> {
  const { chapterIndex = 0, totalChapters = 1, retryCount = 0 } = options || {};
  
  // 智能选择严格度
  let strictness: ReviewStrictness = 'normal';
  
  // 如果是重试，降低严格度
  if (retryCount > 0) {
    strictness = retryCount >= 2 ? 'relaxed' : 'normal';
  }
  
  // 如果是开头或结尾章节，使用正常严格度
  // 中间章节可以使用 relaxed
  if (chapterIndex > 2 && chapterIndex < totalChapters - 3) {
    if (strictness === 'normal') {
      strictness = 'relaxed';
    }
  }
  
  console.log(`[智能审查] 章节 ${chapterIndex + 1}，严格度: ${strictness}，重试次数: ${retryCount}`);
  
  return await blockingReview(context, undefined, strictness);
}
