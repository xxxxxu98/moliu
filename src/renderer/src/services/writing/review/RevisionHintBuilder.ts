/**
 * 审查反馈转提示词构建器
 * 
 * 核心功能：
 * - 将审查结果转换为结构化的写作提示
 * - 携带审查建议重新起草
 * - 支持分级处理策略
 */

import type { ReviewResult, ReviewIssue, ReviewDimension } from '../orchestrator/types';
import type { ChapterContract } from '../contract/types';

// ============================================================
// 类型定义
// ============================================================

export interface RevisionHints {
  /** 原始问题描述 */
  issues: string[];
  /** 具体修改建议 */
  suggestions: string[];
  /** 必须修复的内容 */
  mustFix: string[];
  /** 禁止出现的内容 */
  mustAvoid: string[];
  /** 重点关注区域 */
  focusAreas: Array<{ location: string; reason: string }>;
  /** 优先级最高的 3 个问题 */
  topPriority: string[];
  /** 是否建议重新起草 */
  shouldRewrite: boolean;
  /** 重写原因 */
  rewriteReason?: string;
}

export interface RevisionContext {
  /** 审查结果 */
  reviewResult: ReviewResult;
  /** 当前章节号 */
  chapterNumber: number;
  /** 合同约束 */
  contract?: ChapterContract | null;
  /** 当前草稿 */
  currentDraft?: string;
  /** 重试次数 */
  attemptNumber: number;
}

// ============================================================
// 常量定义
// ============================================================

/** 必须重新起草的问题类型 */
const REWRITE_TRIGGERS = [
  'missing_must_cover',      // 未覆盖必须节点
  'forbidden_zone_violated', // 违反禁区
  'continuity_anchor',       // 未衔接前章
  'weak_chapter_end',        // 章尾无钩子
  'flat_pacing',            // 节奏过于平淡
  'weak_chapter_start',      // 章首无钩子
];

/** 可自动修复的问题类型 */
const AUTO_FIXABLE = [
  'ai_sentence_patterns',     // AI 句式
  'high_risk_patterns',       // 高风险模式
  'banned_content',           // 禁用内容
  'long_paragraphs',          // 长段落
];

/** AI 味相关问题类型 */
const AI_FLAVOR_TYPES = [
  'ai_sentence_patterns',
  'high_risk_patterns',
  'banned_content',
  'banned_content',
  'ai_pattern',
  'anti_ai_check',
  'ai_flavor',
];

// ============================================================
// 构建器类
// ============================================================

export class RevisionHintBuilder {
  /**
   * 从审查结果构建重写提示
   */
  build(hints: RevisionContext): RevisionHints {
    const { reviewResult, chapterNumber, contract, attemptNumber } = hints;

    // 分析问题
    const analysis = this.analyzeReviewResult(reviewResult);
    
    // 构建问题描述
    const issues = this.buildIssueDescriptions(analysis, chapterNumber);
    
    // 构建修改建议
    const suggestions = this.buildSuggestions(analysis);
    
    // 提取必须修复
    const mustFix = this.extractMustFix(analysis, contract);
    
    // 提取必须避免
    const mustAvoid = this.extractMustAvoid(analysis, contract);
    
    // 确定重点关注区域
    const focusAreas = this.extractFocusAreas(analysis);
    
    // 确定优先级
    const topPriority = this.extractTopPriority(analysis, 3);
    
    // 判断是否需要重新起草
    const shouldRewrite = this.shouldRewrite(analysis, attemptNumber);
    
    return {
      issues,
      suggestions,
      mustFix,
      mustAvoid,
      focusAreas,
      topPriority,
      shouldRewrite,
      rewriteReason: shouldRewrite ? this.getRewriteReason(analysis) : undefined,
    };
  }

  /**
   * 将提示转换为 Draft Agent 的系统提示补充
   */
  buildPromptSupplement(hints: RevisionHints): string {
    if (hints.issues.length === 0) {
      return '';
    }

    const parts: string[] = [];

    // 警告标题
    parts.push(`\n\n## ⚠️ 上次审查未通过，请务必修复以下问题\n`);

    // 优先级问题
    if (hints.topPriority.length > 0) {
      parts.push(`### 🔴 必须修复（优先级最高）`);
      hints.topPriority.forEach((issue, i) => {
        parts.push(`${i + 1}. ${issue}`);
      });
      parts.push('');
    }

    // 具体问题
    if (hints.issues.length > 0) {
      parts.push(`### 📋 发现的问题`);
      hints.issues.forEach((issue, i) => {
        parts.push(`${i + 1}. ${issue}`);
      });
      parts.push('');
    }

    // 修改建议
    if (hints.suggestions.length > 0) {
      parts.push(`### 💡 修改建议`);
      hints.suggestions.forEach((suggestion, i) => {
        parts.push(`${i + 1}. ${suggestion}`);
      });
      parts.push('');
    }

    // 必须修复
    if (hints.mustFix.length > 0) {
      parts.push(`### ✅ 本次必须覆盖`);
      hints.mustFix.forEach((item, i) => {
        parts.push(`${i + 1}. ${item}`);
      });
      parts.push('');
    }

    // 必须避免
    if (hints.mustAvoid.length > 0) {
      parts.push(`### 🚫 本次必须避免`);
      hints.mustAvoid.forEach((item, i) => {
        parts.push(`${i + 1}. ${item}`);
      });
      parts.push('');
    }

    // 重点区域
    if (hints.focusAreas.length > 0) {
      parts.push(`### 🎯 重点关注`);
      hints.focusAreas.forEach((area) => {
        parts.push(`- **${area.location}**: ${area.reason}`);
      });
      parts.push('');
    }

    // 重写说明
    if (hints.shouldRewrite && hints.rewriteReason) {
      parts.push(`### 📝 重写说明\n`);
      parts.push(`上次输出存在以下严重问题，需要重新起草：\n`);
      parts.push(`${hints.rewriteReason}\n`);
    }

    parts.push(`---\n`);
    parts.push(`请根据以上反馈，重新撰写本章内容，确保所有问题得到修复。`);

    return parts.join('\n');
  }

  /**
   * 分析审查结果，分类处理
   */
  private analyzeReviewResult(reviewResult: ReviewResult): ReviewAnalysis {
    const result: ReviewAnalysis = {
      blocking: [],
      high: [],
      medium: [],
      low: [],
      byDimension: {},
      rewriteTriggers: [],
      autoFixable: [],
      aiFlavor: [],
      canAutoPass: false,
    };

    // 收集阻断问题
    for (const issue of reviewResult.blockingIssues) {
      result.blocking.push(issue);
      if (this.isRewriteTrigger(issue)) {
        result.rewriteTriggers.push(issue);
      }
      if (this.isAutoFixable(issue)) {
        result.autoFixable.push(issue);
      }
      if (this.isAIFlavor(issue)) {
        result.aiFlavor.push(issue);
      }
    }

    // 按维度分类
    for (const [dimName, dim] of Object.entries(reviewResult.dimensions)) {
      if (dim.issues.length > 0 || dim.warnings.length > 0) {
        result.byDimension[dimName] = {
          issues: dim.issues,
          warnings: dim.warnings,
          score: dim.score,
          isBlocking: dim.isBlocking,
        };
      }
    }

    // 收集警告
    for (const warning of reviewResult.warnings) {
      if (warning.severity === 'high' || warning.severity === 'critical') {
        result.high.push(warning);
      } else if (warning.severity === 'warning') {
        result.medium.push(warning);
      } else {
        result.low.push(warning);
      }
    }

    // 判断是否可以降级通过
    result.canAutoPass = this.canAutoPass(reviewResult);

    return result;
  }

  /**
   * 构建问题描述
   */
  private buildIssueDescriptions(analysis: ReviewAnalysis, chapterNumber: number): string[] {
    const descriptions: string[] = [];

    // 阻断问题
    for (const issue of analysis.blocking) {
      descriptions.push(`[阻断] ${issue.location}: ${issue.description}`);
    }

    // 高优先级问题
    for (const issue of analysis.high) {
      descriptions.push(`[高] ${issue.location}: ${issue.description}`);
    }

    return descriptions;
  }

  /**
   * 构建修改建议
   */
  private buildSuggestions(analysis: ReviewAnalysis): string[] {
    const suggestions: string[] = [];

    // 从阻断问题提取建议
    for (const issue of analysis.blocking) {
      if (issue.suggestion) {
        suggestions.push(issue.suggestion);
      }
    }

    // 从高优先级问题提取建议
    for (const issue of analysis.high) {
      if (issue.suggestion) {
        suggestions.push(issue.suggestion);
      }
    }

    // 去重
    return [...new Set(suggestions)];
  }

  /**
   * 提取必须修复的内容
   */
  private extractMustFix(analysis: ReviewAnalysis, contract?: ChapterContract | null): string[] {
    const mustFix: string[] = [];

    // 从阻断问题提取
    for (const issue of analysis.blocking) {
      if (issue.type === 'missing_must_cover' && issue.evidence) {
        mustFix.push(`必须覆盖: ${issue.evidence}`);
      }
      if (issue.type === 'continuity_anchor' && issue.evidence) {
        mustFix.push(`必须衔接: ${issue.evidence}`);
      }
    }

    // 从合同提取必须覆盖
    if (contract?.directive?.mustCover) {
      for (const node of contract.directive.mustCover) {
        if (!mustFix.some(m => m.includes(node))) {
          mustFix.push(`合同要求: ${node}`);
        }
      }
    }

    return mustFix;
  }

  /**
   * 提取必须避免的内容
   */
  private extractMustAvoid(analysis: ReviewAnalysis, contract?: ChapterContract | null): string[] {
    const mustAvoid: string[] = [];

    // 从阻断问题提取禁区违规
    for (const issue of analysis.blocking) {
      if (issue.type === 'forbidden_zone_violated' && issue.evidence) {
        mustAvoid.push(`禁止出现: ${issue.evidence}`);
      }
    }

    // 从合同提取禁区
    if (contract?.directive?.forbiddenZones) {
      for (const zone of contract.directive.forbiddenZones) {
        if (!mustAvoid.some(m => m.includes(zone))) {
          mustAvoid.push(`合同禁区: ${zone}`);
        }
      }
    }

    // AI 味问题
    for (const issue of analysis.aiFlavor) {
      mustAvoid.push(`AI 味: ${issue.description}`);
    }

    return mustAvoid;
  }

  /**
   * 提取重点关注区域
   */
  private extractFocusAreas(analysis: ReviewAnalysis): Array<{ location: string; reason: string }> {
    const areas: Array<{ location: string; reason: string }> = [];

    for (const [dimName, dim] of Object.entries(analysis.byDimension)) {
      if (dim.isBlocking || dim.score < 60) {
        const location = this.getDimensionLocation(dimName);
        areas.push({
          location,
          reason: `该区域得分过低 (${dim.score}分)`,
        });
      }
    }

    return areas;
  }

  /**
   * 提取优先级最高的问题
   */
  private extractTopPriority(analysis: ReviewAnalysis, count: number): string[] {
    const priorities: string[] = [];

    // 阻断问题优先
    for (const issue of analysis.blocking) {
      priorities.push(`[阻断] ${issue.description} → ${issue.suggestion}`);
    }

    // 高优先级问题
    for (const issue of analysis.high) {
      priorities.push(`[高] ${issue.description} → ${issue.suggestion}`);
    }

    return priorities.slice(0, count);
  }

  /**
   * 判断是否应该重新起草
   */
  private shouldRewrite(analysis: ReviewAnalysis, attemptNumber: number): boolean {
    // 如果重试次数超过 2 次，不建议继续重新起草
    if (attemptNumber >= 2) {
      return false;
    }

    // 如果有必须重新起草的问题类型
    if (analysis.rewriteTriggers.length > 0) {
      return true;
    }

    // 如果阻断问题过多（超过 3 个）
    if (analysis.blocking.length > 3) {
      return true;
    }

    // 如果主要是 AI 味问题，可以通过润色解决
    if (analysis.aiFlavor.length > 0 && analysis.rewriteTriggers.length === 0) {
      return false;
    }

    return false;
  }

  /**
   * 获取重新起草的原因
   */
  private getRewriteReason(analysis: ReviewAnalysis): string {
    const reasons: string[] = [];

    if (analysis.rewriteTriggers.length > 0) {
      reasons.push(`${analysis.rewriteTriggers.length} 个严重问题需要重新起草`);
    }

    if (analysis.blocking.length > 0) {
      reasons.push(`${analysis.blocking.length} 个阻断问题`);
    }

    for (const issue of analysis.rewriteTriggers) {
      reasons.push(`- ${issue.description}`);
    }

    return reasons.join('\n');
  }

  /**
   * 判断是否为必须重新起草的问题类型
   */
  private isRewriteTrigger(issue: ReviewIssue): boolean {
    return REWRITE_TRIGGERS.includes(issue.type);
  }

  /**
   * 判断是否为可自动修复的问题
   */
  private isAutoFixable(issue: ReviewIssue): boolean {
    return AUTO_FIXABLE.includes(issue.type);
  }

  /**
   * 判断是否为 AI 味问题
   */
  private isAIFlavor(issue: ReviewIssue): boolean {
    return AI_FLAVOR_TYPES.includes(issue.type);
  }

  /**
   * 判断是否可以降级通过
   */
  private canAutoPass(reviewResult: ReviewResult): boolean {
    // 无阻断问题
    if (reviewResult.overall.blockingCount === 0) {
      return true;
    }

    // 全部是 AI 味问题
    const allAIFlavor = reviewResult.blockingIssues.every(issue => 
      AI_FLAVOR_TYPES.includes(issue.type)
    );

    return allAIFlavor;
  }

  /**
   * 获取维度对应的位置描述
   */
  private getDimensionLocation(dimName: string): string {
    const locationMap: Record<string, string> = {
      continuity: '章节一致性',
      hookScore: '章首/章尾钩子',
      coolpointScore: '爽点密度',
      paceScore: '节奏',
      antiAIScore: 'AI 味',
      contractScore: '合同符合度',
    };

    return locationMap[dimName] || dimName;
  }
}

// ============================================================
// 分析结果类型
// ============================================================

interface ReviewAnalysis {
  blocking: ReviewIssue[];
  high: ReviewIssue[];
  medium: ReviewIssue[];
  low: ReviewIssue[];
  byDimension: Record<string, {
    issues: ReviewIssue[];
    warnings: ReviewIssue[];
    score: number;
    isBlocking: boolean;
  }>;
  rewriteTriggers: ReviewIssue[];
  autoFixable: ReviewIssue[];
  aiFlavor: ReviewIssue[];
  canAutoPass: boolean;
}

// ============================================================
// Composable
// ============================================================

export function useRevisionHintBuilder() {
  const builder = new RevisionHintBuilder();

  return {
    builder,
    build: (context: RevisionContext) => builder.build(context),
    buildPromptSupplement: (hints: RevisionHints) => builder.buildPromptSupplement(hints),
  };
}
