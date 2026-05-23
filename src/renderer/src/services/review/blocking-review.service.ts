/**
 * 增强版审查服务 - Blocking 闸门机制
 * 参考 webnovel-writer 的审查设计
 * 
 * 核心改进：
 * 1. 引入 blocking 闸门机制
 * 2. blocking=true 时强制阻断后续流程
 * 3. 严格输出问题分类和严重度
 */

import type { ReviewIssue, ReviewSeverity, ReviewCategory } from '@/types/writing-task';
import type { Project, Chapter } from '@/types/project';
import { ReviewService, type ReviewContext, type ReviewOptions } from './review-service';
import type { SixDimensionReview } from '@/types/writing-task';

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
 * 增强版审查服务 - 支持 blocking 闸门
 */
export class BlockingReviewService {
  private reviewService: ReviewService;
  private context: ReviewContext;
  private options: ReviewOptions;

  constructor(context: ReviewContext, options: ReviewOptions = {}) {
    this.context = context;
    this.options = {
      ...options,
      strictMode: true, // 强制启用严格模式
    };
    this.reviewService = new ReviewService(context, this.options);
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
   * 分析审查结果，判断 blocking 状态
   */
  private analyzeBlockingResult(detail: SixDimensionReview): BlockingReviewResult {
    const issues = detail.overall.issues;
    
    // 统计各类问题
    const categoryStats: Record<ReviewCategory, { total: number; blocking: number }> = {
      setting: { total: 0, blocking: 0 },
      timeline: { total: 0, blocking: 0 },
      continuity: { total: 0, blocking: 0 },
      character: { total: 0, blocking: 0 },
      logic: { total: 0, blocking: 0 },
      ai_flavor: { total: 0, blocking: 0 },
      pacing: { total: 0, blocking: 0 },
      other: { total: 0, blocking: 0 },
    };

    let blockingCount = 0;
    let highPriorityCount = 0;

    for (const issue of issues) {
      const category = issue.category as ReviewCategory;
      if (!categoryStats[category]) {
        categoryStats[category] = { total: 0, blocking: 0 };
      }
      categoryStats[category].total++;

      if (issue.blocking) {
        categoryStats[category].blocking++;
        blockingCount++;
      }

      if (issue.severity === 'high' || issue.severity === 'critical') {
        highPriorityCount++;
      }
    }

    const hasBlocking = blockingCount > 0;
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
      return `审查通过（${stats.totalIssues}个问题，均非阻断）`;
    }

    const parts: string[] = [];
    
    if (stats.blockingCount > 0) {
      parts.push(`⚠️ ${stats.blockingCount}个阻断问题`);
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
  options?: ReviewOptions
): Promise<BlockingReviewResult> {
  const service = new BlockingReviewService(context, options);
  return await service.reviewWithBlocking();
}

/**
 * 快速检查 blocking 状态
 */
export function canProceedToPolish(result: BlockingReviewResult): boolean {
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
