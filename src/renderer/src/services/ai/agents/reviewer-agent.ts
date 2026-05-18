/**
 * Reviewer Agent - 审查 Agent
 * Moliu v2.0 - 负责审查和评估生成内容
 * 
 * 职责：
 * 1. 质量检查
 * 2. 合同合规性验证
 * 3. 追读力评分
 * 4. 问题识别和建议
 */

import { useQualityChecker } from "@/composables/new/useQualityChecker";
import { useInspirationEvaluation } from "@/composables/new/useInspirationEvaluation";
import type { ReadRetentionScore } from "@/types/evaluation";

// ============================================================
// Types
// ============================================================

export interface ReviewQuery {
  /** 内容 */
  content: string;
  /** 项目 ID */
  projectId?: string;
  /** 章节号 */
  chapterNumber?: number;
  /** 审查类型 */
  type: "full" | "quick" | "hook" | "coolpoint" | "consistency";
}

export interface ReviewResult {
  /** 是否通过 */
  passed: boolean;
  /** 追读力评分 */
  retentionScore?: ReadRetentionScore;
  /** 问题列表 */
  issues: ReviewIssue[];
  /** 建议 */
  suggestions: string[];
  /** 详细评分 */
  scores?: {
    hook?: number;
    coolpoint?: number;
    rhythm?: number;
    consistency?: number;
    originality?: number;
  };
}

export interface ReviewIssue {
  /** 问题类型 */
  type: "error" | "warning" | "suggestion";
  /** 问题分类 */
  category: "contract" | "quality" | "style" | "consistency" | "grammar";
  /** 描述 */
  description: string;
  /** 位置 */
  position?: string;
  /** 严重程度 */
  severity: "low" | "medium" | "high";
  /** 修复建议 */
  fixSuggestion?: string;
}

// ============================================================
// Agent
// ============================================================

export class ReviewerAgent {
  private qualityChecker: ReturnType<typeof useQualityChecker>;
  private inspirationEvaluator: ReturnType<typeof useInspirationEvaluation>;

  constructor() {
    this.qualityChecker = useQualityChecker();
    this.inspirationEvaluator = useInspirationEvaluation();
  }

  /**
   * 审查内容
   */
  async review(query: ReviewQuery): Promise<ReviewResult> {
    switch (query.type) {
      case "full":
        return this.fullReview(query);
      case "quick":
        return this.quickReview(query);
      case "hook":
        return this.hookReview(query);
      case "coolpoint":
        return this.coolpointReview(query);
      case "consistency":
        return this.consistencyReview(query);
      default:
        return this.quickReview(query);
    }
  }

  /**
   * 全面审查
   */
  private async fullReview(query: ReviewQuery): Promise<ReviewResult> {
    const issues: ReviewIssue[] = [];

    // 1. 质量检查
    const qualityResult = await this.qualityChecker.checkQuality(query.content);
    issues.push(...this.convertQualityIssues(qualityResult.issues));

    // 2. 计算追读力评分
    const retentionScore = await this.inspirationEvaluator.evaluate(query.content);

    // 3. 检查风格问题
    const styleIssues = await this.checkStyleIssues(query.content);
    issues.push(...styleIssues);

    // 4. 检查一致性
    const consistencyIssues = await this.checkConsistencyIssues(query.content);
    issues.push(...consistencyIssues);

    // 生成建议
    const suggestions = this.generateSuggestions(issues, retentionScore);

    // 判断是否通过
    const passed = this.evaluatePass(issues, retentionScore);

    return {
      passed,
      retentionScore,
      issues,
      suggestions,
      scores: {
        hook: retentionScore.hookScore,
        coolpoint: retentionScore.coolpointScore,
        rhythm: retentionScore.rhythmHealth,
        consistency: 5 - issues.filter(i => i.category === "consistency").length,
        originality: retentionScore.originality,
      },
    };
  }

  /**
   * 快速审查
   */
  private async quickReview(query: ReviewQuery): Promise<ReviewResult> {
    // 快速检查基本问题
    const basicIssues = this.checkBasicIssues(query.content);
    const hookScore = this.quickHookScore(query.content);
    const coolpointScore = this.quickCoolpointScore(query.content);

    return {
      passed: basicIssues.length === 0,
      issues: basicIssues,
      suggestions: this.quickSuggestions(basicIssues),
      scores: {
        hook: hookScore,
        coolpoint: coolpointScore,
      },
    };
  }

  /**
   * 钩子审查
   */
  private async hookReview(query: ReviewQuery): Promise<ReviewResult> {
    const hookScore = this.evaluateHook(query.content);
    const issues = hookScore < 3 ? [
      {
        type: "warning" as const,
        category: "quality" as const,
        description: "开篇钩子较弱",
        severity: "medium" as const,
        fixSuggestion: "建议增加冲突、疑问或悬念开头",
      },
    ] : [];

    return {
      passed: hookScore >= 3,
      retentionScore: {
        hookScore,
        coolpointScore: 0,
        microFulfillment: 0,
        suspenseDebt: 0,
        rhythmHealth: 0,
        originality: 0,
      },
      issues,
      suggestions: hookScore < 3 ? ["增强开篇吸引力"] : [],
      scores: { hook: hookScore },
    };
  }

  /**
   * 爽点审查
   */
  private async coolpointReview(query: ReviewQuery): Promise<ReviewResult> {
    const coolpointScore = this.evaluateCoolpoint(query.content);
    const issues = coolpointScore < 3 ? [
      {
        type: "warning" as const,
        category: "quality" as const,
        description: "爽点密度不足",
        severity: "medium" as const,
        fixSuggestion: "建议增加打脸、逆袭等爽点情节",
      },
    ] : [];

    return {
      passed: coolpointScore >= 3,
      issues,
      suggestions: coolpointScore < 3 ? ["增加核心爽点"] : [],
      scores: { coolpoint: coolpointScore },
    };
  }

  /**
   * 一致性审查
   */
  private async consistencyReview(query: ReviewQuery): Promise<ReviewResult> {
    // 检查角色名一致性
    const nameIssues = this.checkNameConsistency(query.content);
    // 检查设定一致性
    const settingIssues = this.checkSettingConsistency(query.content);

    const issues = [...nameIssues, ...settingIssues];

    return {
      passed: issues.filter(i => i.severity === "high").length === 0,
      issues,
      suggestions: issues.length > 0
        ? ["检查并修正一致性错误"]
        : [],
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private convertQualityIssues(
    issues: any[]
  ): ReviewIssue[] {
    return issues.map((issue: any) => ({
      type: issue.severity === "high" ? "error" : issue.severity === "medium" ? "warning" : "suggestion",
      category: "quality" as const,
      description: issue.description,
      position: issue.position,
      severity: issue.severity,
      fixSuggestion: issue.suggestion,
    }));
  }

  private checkBasicIssues(content: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // 检查长度
    if (content.length < 500) {
      issues.push({
        type: "warning",
        category: "quality",
        description: "内容过短",
        severity: "low",
        fixSuggestion: "建议至少 2000 字",
      });
    }

    // 检查重复句
    const lines = content.split(/[。！？\n]/);
    const seen = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10) {
        if (seen.has(trimmed)) {
          issues.push({
            type: "warning",
            category: "style",
            description: `检测到重复句: "${trimmed.slice(0, 20)}..."`,
            severity: "medium",
          });
        }
        seen.add(trimmed);
      }
    }

    return issues;
  }

  private quickHookScore(content: string): number {
    const firstParagraph = content.split(/[。！？\n]/)[0] || "";

    // 检查是否有强钩子
    const hasQuestion = /？|\?/.test(firstParagraph);
    const hasConflict = /突然|但是|然而|没想到/.test(firstParagraph);
    const hasMystery = /原来|竟然|秘密/.test(firstParagraph);

    let score = 3;
    if (hasQuestion) score += 0.5;
    if (hasConflict) score += 0.5;
    if (hasMystery) score += 0.5;

    return Math.min(5, score);
  }

  private quickCoolpointScore(content: string): number {
    const coolpointIndicators = [
      "击败", "打败", "逆袭", "打脸", "反转", "震惊",
      "突破", "升级", "觉醒", "复仇", "逆天", "碾压",
    ];

    let count = 0;
    for (const indicator of coolpointIndicators) {
      if (content.includes(indicator)) count++;
    }

    return Math.min(5, 2 + count * 0.3);
  }

  private async evaluateHook(content: string): Promise<number> {
    return this.quickHookScore(content);
  }

  private async evaluateCoolpoint(content: string): Promise<number> {
    return this.quickCoolpointScore(content);
  }

  private checkStyleIssues(content: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // 检查 AI 模式
    const aiPatterns = [
      { pattern: /她.*?的.*?眼神/, desc: "AI惯用描写" },
      { pattern: /他.*?的.*?嘴角/, desc: "AI惯用描写" },
      { pattern: /就在这时/, desc: "过渡句过于机械" },
    ];

    for (const { pattern, desc } of aiPatterns) {
      if (pattern.test(content)) {
        issues.push({
          type: "suggestion",
          category: "style",
          description: `检测到 ${desc}`,
          severity: "low",
        });
      }
    }

    return issues;
  }

  private async checkConsistencyIssues(content: string): Promise<ReviewIssue[]> {
    // 简化版本
    return [];
  }

  private checkNameConsistency(content: string): ReviewIssue[] {
    // 简化版本
    return [];
  }

  private checkSettingConsistency(content: string): ReviewIssue[] {
    // 简化版本
    return [];
  }

  private generateSuggestions(issues: ReviewIssue[], score: ReadRetentionScore): string[] {
    const suggestions: string[] = [];

    if (score.hookScore < 3) {
      suggestions.push("增强开篇钩子，添加冲突或疑问");
    }
    if (score.coolpointScore < 3) {
      suggestions.push("增加爽点情节，提升阅读愉悦感");
    }
    if (score.rhythmHealth < 3) {
      suggestions.push("调整叙事节奏，避免拖沓");
    }

    const highSeverityIssues = issues.filter(i => i.severity === "high");
    if (highSeverityIssues.length > 0) {
      suggestions.push(`修复 ${highSeverityIssues.length} 个高优先级问题`);
    }

    return suggestions;
  }

  private quickSuggestions(issues: ReviewIssue[]): string[] {
    if (issues.length === 0) return ["内容质量良好"];
    return issues.map(i => i.fixSuggestion || i.description);
  }

  private evaluatePass(issues: ReviewIssue[], score: ReadRetentionScore): boolean {
    const highIssues = issues.filter(i => i.severity === "high").length;
    const avgScore = (
      score.hookScore +
      score.coolpointScore +
      score.microFulfillment +
      score.rhythmHealth +
      score.originality
    ) / 5;

    return highIssues === 0 && avgScore >= 3;
  }
}

// ============================================================
// Export singleton
// ============================================================

let reviewerAgentInstance: ReviewerAgent | null = null;

export function getReviewerAgent(): ReviewerAgent {
  if (!reviewerAgentInstance) {
    reviewerAgentInstance = new ReviewerAgent();
  }
  return reviewerAgentInstance;
}
