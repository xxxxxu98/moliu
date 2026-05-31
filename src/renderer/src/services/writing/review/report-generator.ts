/**
 * 结构化审查报告生成器
 * 
 * 功能：
 * 1. 从审查结果生成结构化报告
 * 2. 支持多种格式导出（JSON/Markdown/HTML）
 * 3. 报告历史追踪
 * 4. 与 EnhancedReviewAgent 集成
 */

import type { ReviewResult } from '@/services/writing/orchestrator/types';
import type { ReviewDimensions, ReviewDimension, ReviewIssue } from '@/services/writing/orchestrator/types';

// ============================================================
// 类型定义
// ============================================================

/**
 * 问题类型
 */
export type IssueType = 
  | 'setting'           // 设定一致性
  | 'timeline'         // 时间线
  | 'continuity'       // 叙事连贯
  | 'character'         // 角色一致性
  | 'logic'            // 逻辑
  | 'ai_flavor'        // AI味
  | 'pacing'           // 节奏
  | 'chapter_ending'    // 章尾质量
  | 'excitement'        // 爽点密度
  | 'show_dont_tell'    // 表达方式
  | 'other';            // 其他

/**
 * 严重程度
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 问题
 */
export interface Issue {
  id: string;
  type: IssueType;
  severity: Severity;
  title: string;
  description: string;
  evidence?: string;
  location: string;
  suggestion?: string;
  autoFixable: boolean;
  isBlocking: boolean;
}

/**
 * 维度评分
 */
export interface DimensionScore {
  dimension: IssueType;
  score: number;          // 0-100
  weight: number;          // 权重
  passed: boolean;
  issues: Issue[];
}

/**
 * 修复建议
 */
export interface FixSuggestion {
  id: string;
  type: IssueType;
  description: string;
  priority: 'high' | 'medium' | 'low';
  autoFixable: boolean;
  estimatedImpact?: 'significant' | 'moderate' | 'minimal';
}

/**
 * 审查尝试
 */
export interface ReviewAttempt {
  timestamp: string;
  strictness: 'strict' | 'normal' | 'relaxed';
  score: number;
  verdict: 'accepted' | 'needs_revision' | 'rejected';
  blockingCount: number;
}

/**
 * 结构化审查报告
 */
export interface StructuredReviewReport {
  // 报告元数据
  meta: {
    chapterId: string;
    chapterNumber: number;
    title: string;
    reviewedAt: string;
    reviewVersion: string;
    duration: number;           // 审查耗时（毫秒）
    generator: string;        // 生成器版本
  };
  
  // 总览
  overview: {
    totalIssues: number;
    blockingCount: number;
    nonBlockingCount: number;
    overallScore: number;      // 0-100
    verdict: 'accepted' | 'needs_revision' | 'rejected';
    passThreshold: number;     // 通过阈值
  };
  
  // 阻断问题
  blockingIssues: Issue[];
  
  // 非阻断问题
  nonBlockingIssues: Issue[];
  
  // 质量维度评分
  qualityDimensions: DimensionScore[];
  
  // 修复建议
  suggestedFixes: FixSuggestion[];
  
  // 审查历史
  history: ReviewAttempt[];
  
  // 原始数据（用于调试）
  rawData?: {
    reviewResult: ReviewResult;
    dimensions: ReviewDimensions;
  };
}

// ============================================================
// 常量
// ============================================================

/**
 * 维度中文名称映射
 */
export const DIMENSION_NAMES: Record<string, string> = {
  setting: '设定一致性',
  timeline: '时间线',
  continuity: '叙事连贯',
  character: '角色一致性',
  logic: '逻辑',
  ai_flavor: 'AI味',
  pacing: '节奏',
  chapter_ending: '章尾质量',
  excitement: '爽点密度',
  show_dont_tell: '表达方式',
  contractScore: '合同符合度',
  antiAIScore: '去AI味',
  hookScore: '钩子质量',
  coolpointScore: '爽点密度',
};

/**
 * 维度权重
 */
export const DIMENSION_WEIGHTS: Record<string, number> = {
  continuity: 0.20,
  hookScore: 0.15,
  coolpointScore: 0.15,
  pacing: 0.15,
  antiAIScore: 0.15,
  contractScore: 0.10,
  setting: 0.05,
  timeline: 0.05,
};

/**
 * 默认通过阈值
 */
export const DEFAULT_PASS_THRESHOLD = 70;

/**
 * 审查版本
 */
export const REVIEW_VERSION = '1.0.0';

// ============================================================
// 报告生成器
// ============================================================

export class ReportGenerator {
  private reportHistory: StructuredReviewReport[] = [];
  private maxHistorySize: number;

  constructor(options?: { maxHistorySize?: number }) {
    this.maxHistorySize = options?.maxHistorySize ?? 100;
  }

  /**
   * 从审查结果生成结构化报告
   */
  generate(
    chapterId: string,
    chapterNumber: number,
    title: string,
    reviewResult: ReviewResult,
    dimensions: ReviewDimensions,
    options?: {
      strictness?: 'strict' | 'normal' | 'relaxed';
      passThreshold?: number;
      duration?: number;
    }
  ): StructuredReviewReport {
    const passThreshold = options?.passThreshold ?? DEFAULT_PASS_THRESHOLD;
    const duration = options?.duration ?? 0;

    let overallScore: number;
    let overallBlockingCount: number;

    if ('overall' in reviewResult && reviewResult.overall) {
      // 是 SixDimensionReview 或标准 ReviewResult
      const o = reviewResult.overall as any;
      overallScore = typeof o.score === 'number' ? o.score : 0;
      overallBlockingCount = typeof o.blockingCount === 'number' ? o.blockingCount : 0;
    } else if ('passed' in reviewResult) {
      // 是 BlockingReviewResult（扁平结构，无 overall）
      const br = reviewResult as any;
      overallScore = 0; // BlockingReviewResult 没有 score
      overallBlockingCount = typeof br.blockingCount === 'number' ? br.blockingCount : 0;
    } else {
      overallScore = 0;
      overallBlockingCount = 0;
    }

    // 转换问题（优先使用 BlockingReviewResult.issues，否则使用 dimensions 中的问题）
    const issues = this.convertIssues(reviewResult, dimensions);
    
    // 分离阻断和非阻断问题
    const blockingIssues = issues.filter(i => i.isBlocking);
    const nonBlockingIssues = issues.filter(i => !i.isBlocking);
    
    // 计算维度评分
    const qualityDimensions = this.calculateDimensionScores(dimensions, reviewResult);
    
    // 生成修复建议
    const suggestedFixes = this.generateFixSuggestions(issues);
    
    // 创建审查尝试记录
    const reviewAttempt: ReviewAttempt = {
      timestamp: new Date().toISOString(),
      strictness: options?.strictness ?? 'normal',
      score: overallScore,
      verdict: this.determineVerdict(overallBlockingCount, overallScore, passThreshold),
      blockingCount: overallBlockingCount,
    };

    // 构建报告
    const report: StructuredReviewReport = {
      meta: {
        chapterId,
        chapterNumber,
        title,
        reviewedAt: new Date().toISOString(),
        reviewVersion: REVIEW_VERSION,
        duration,
        generator: 'ReportGenerator-v1',
      },
      overview: {
        totalIssues: issues.length,
        blockingCount: blockingIssues.length,
        nonBlockingCount: nonBlockingIssues.length,
        overallScore: overallScore,
        verdict: this.determineVerdict(overallBlockingCount, overallScore, passThreshold),
        passThreshold,
      },
      blockingIssues,
      nonBlockingIssues,
      qualityDimensions,
      suggestedFixes,
      history: [reviewAttempt],
      rawData: {
        reviewResult,
        dimensions,
      },
    };

    // 添加到历史
    this.addToHistory(report);

    return report;
  }

  /**
   * 转换问题格式
   */
  private convertIssues(
    reviewResult: ReviewResult,
    dimensions: ReviewDimensions
  ): Issue[] {
    const issues: Issue[] = [];
    let issueId = 1;

    // 从各个维度收集问题
    for (const [dimension, data] of Object.entries(dimensions)) {
      // 收集阻断问题
      for (const issue of data.issues || []) {
        issues.push(this.createIssue(issue, dimension, issueId++));
      }
      
      // 收集警告
      for (const warning of data.warnings || []) {
        issues.push(this.createIssue(warning, dimension, issueId++));
      }
    }

    // 从总览收集阻断问题
    for (const issue of reviewResult.blockingIssues || []) {
      issues.push(this.createIssue(issue, issue.type || 'other', issueId++));
    }

    return issues;
  }

  /**
   * 创建问题
   */
  private createIssue(
    rawIssue: ReviewIssue,
    dimension: string,
    id: number
  ): Issue {
    const severity = this.normalizeSeverity(rawIssue.severity);
    
    return {
      id: `issue-${id}`,
      type: this.normalizeIssueType(rawIssue.type || dimension),
      severity,
      title: this.generateIssueTitle(rawIssue.type || dimension, severity),
      description: rawIssue.description || '',
      evidence: rawIssue.evidence,
      location: rawIssue.location || '',
      suggestion: rawIssue.suggestion || rawIssue.fixHint || '',
      autoFixable: this.isAutoFixable(rawIssue.type || dimension),
      isBlocking: severity === 'critical' || rawIssue.blocking === true,
    };
  }

  /**
   * 规范化严重程度
   */
  private normalizeSeverity(severity?: string): Severity {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      default: return 'low';
    }
  }

  /**
   * 规范化问题类型
   */
  private normalizeIssueType(type?: string): IssueType {
    const typeMap: Record<string, IssueType> = {
      setting: 'setting',
      timeline: 'timeline',
      continuity: 'continuity',
      character: 'character',
      logic: 'logic',
      ai_flavor: 'ai_flavor',
      pacing: 'pacing',
      chapter_ending: 'chapter_ending',
      excitement: 'excitement',
      show_dont_tell: 'show_dont_tell',
      contractScore: 'contractScore',
      antiAIScore: 'ai_flavor',
      hookScore: 'chapter_ending',
      coolpointScore: 'excitement',
    };
    
    return typeMap[type || 'other'] || 'other';
  }

  /**
   * 生成问题标题
   */
  private generateIssueTitle(type: string, severity: Severity): string {
    const titleMap: Record<string, Record<Severity, string>> = {
      setting: {
        critical: '【阻断】设定严重不一致',
        high: '【高】设定存在冲突',
        medium: '【中】设定细节问题',
        low: '【低】设定轻微问题',
      },
      timeline: {
        critical: '【阻断】时间线逻辑错误',
        high: '【高】时间描述矛盾',
        medium: '【中】时间过渡不自然',
        low: '【低】时间描述可优化',
      },
      continuity: {
        critical: '【阻断】叙事严重断裂',
        high: '【高】叙事连贯性问题',
        medium: '【中】过渡略显突兀',
        low: '【低】衔接可改进',
      },
      character: {
        critical: '【阻断】角色严重OOC',
        high: '【高】角色行为不一致',
        medium: '【中】角色描写偏差',
        low: '【低】角色细节问题',
      },
      logic: {
        critical: '【阻断】逻辑严重漏洞',
        high: '【高】存在逻辑问题',
        medium: '【中】逻辑不够严密',
        low: '【低】逻辑轻微问题',
      },
      ai_flavor: {
        critical: '【阻断】AI味过于明显',
        high: '【高】存在明显AI特征',
        medium: '【中】部分AI痕迹',
        low: '【低】轻微AI味',
      },
      pacing: {
        critical: '【阻断】节奏严重失衡',
        high: '【高】节奏问题突出',
        medium: '【中】节奏有待优化',
        low: '【低】节奏轻微问题',
      },
      chapter_ending: {
        critical: '【阻断】章尾缺少悬念',
        high: '【高】章尾钩子不够强',
        medium: '【中】章尾吸引力不足',
        low: '【低】章尾可优化',
      },
      excitement: {
        critical: '【阻断】缺少核心爽点',
        high: '【高】爽点密度不足',
        medium: '【中】爽点设置可优化',
        low: '【低】爽点轻微问题',
      },
    };

    const dimension = type.replace('_score', '').replace('_', '');
    return titleMap[dimension]?.[severity] || `【${severity.toUpperCase()}】${DIMENSION_NAMES[type] || type}问题`;
  }

  /**
   * 判断问题是否可自动修复
   */
  private isAutoFixable(type: string): boolean {
    const autoFixableTypes = [
      'ai_flavor',
      'pacing',
      'chapter_ending',
    ];
    return autoFixableTypes.includes(type);
  }

  /**
   * 计算维度评分
   */
  private calculateDimensionScores(
    dimensions: ReviewDimensions,
    reviewResult: ReviewResult
  ): DimensionScore[] {
    const scores: DimensionScore[] = [];

    for (const [dimension, data] of Object.entries(dimensions)) {
      const score = data.score || 0;
      const weight = DIMENSION_WEIGHTS[dimension] || 0.1;
      
      scores.push({
        dimension: this.normalizeIssueType(dimension),
        score,
        weight,
        passed: score >= 70,
        issues: (data.issues || []).map((issue, idx) => 
          this.createIssue(issue, dimension, idx)
        ),
      });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * 生成修复建议
   */
  private generateFixSuggestions(issues: Issue[]): FixSuggestion[] {
    const suggestions: FixSuggestion[] = [];
    const groupedByType = new Map<IssueType, Issue[]>();

    // 按类型分组
    for (const issue of issues) {
      if (!groupedByType.has(issue.type)) {
        groupedByType.set(issue.type, []);
      }
      groupedByType.get(issue.type)!.push(issue);
    }

    // 为每组生成建议
    for (const [type, typeIssues] of groupedByType) {
      const criticalCount = typeIssues.filter(i => i.severity === 'critical').length;
      const highCount = typeIssues.filter(i => i.severity === 'high').length;
      const mediumCount = typeIssues.filter(i => i.severity === 'medium').length;

      const priority = criticalCount > 0 ? 'high' : highCount > 0 ? 'high' : mediumCount > 0 ? 'medium' : 'low';

      suggestions.push({
        id: `fix-${type}`,
        type,
        description: this.generateFixDescription(type, typeIssues),
        priority,
        autoFixable: typeIssues.some(i => i.autoFixable),
        estimatedImpact: criticalCount > 0 ? 'significant' : highCount > 0 ? 'moderate' : 'minimal',
      });
    }

    // 按优先级排序
    return suggestions.sort((a, b) => {
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 生成修复描述
   */
  private generateFixDescription(type: IssueType, issues: Issue[]): string {
    const count = issues.length;
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;

    const dimensionName = DIMENSION_NAMES[type] || type;

    if (criticalCount > 0) {
      return `【紧急】发现 ${criticalCount} 个阻断级 ${dimensionName} 问题，必须立即修复`;
    }

    if (highCount > 0) {
      return `发现 ${highCount} 个高优先级 ${dimensionName} 问题，建议优先处理`;
    }

    return `发现 ${count} 个 ${dimensionName} 问题，可作为后续优化参考`;
  }

  /**
   * 判断审查结论
   */
  private determineVerdict(
    blockingCount: number,
    score: number,
    passThreshold: number
  ): 'accepted' | 'needs_revision' | 'rejected' {
    if (blockingCount > 0) {
      return 'rejected';
    }
    if (score >= passThreshold) {
      return 'accepted';
    }
    return 'needs_revision';
  }

  /**
   * 添加到历史
   */
  private addToHistory(report: StructuredReviewReport): void {
    // 检查是否已有该章节的报告
    const existingIndex = this.reportHistory.findIndex(
      r => r.meta.chapterId === report.meta.chapterId
    );

    if (existingIndex >= 0) {
      // 合并历史
      const existing = this.reportHistory[existingIndex];
      report.history = [...existing.history, ...report.history];
      this.reportHistory[existingIndex] = report;
    } else {
      this.reportHistory.push(report);
    }

    // 限制历史大小
    if (this.reportHistory.length > this.maxHistorySize) {
      this.reportHistory = this.reportHistory.slice(-this.maxHistorySize);
    }
  }

  // ============================================================
  // 导出方法
  // ============================================================

  /**
   * 导出为 JSON
   */
  exportToJSON(report: StructuredReviewReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * 导出为 Markdown
   */
  exportToMarkdown(report: StructuredReviewReport): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# 审查报告：${report.meta.title}`);
    lines.push('');
    lines.push(`**章节**：第${report.meta.chapterNumber}章`);
    lines.push(`**时间**：${new Date(report.meta.reviewedAt).toLocaleString('zh-CN')}`);
    lines.push(`**审查版本**：${report.meta.reviewVersion}`);
    lines.push('');

    // 总览
    lines.push('## 总览');
    lines.push('');
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    lines.push(`| 总体评分 | ${report.overview.overallScore} |`);
    lines.push(`| 审查结论 | ${this.getVerdictLabel(report.overview.verdict)} |`);
    lines.push(`| 总问题数 | ${report.overview.totalIssues} |`);
    lines.push(`| 阻断问题 | ${report.overview.blockingCount} |`);
    lines.push(`| 非阻断问题 | ${report.overview.nonBlockingCount} |`);
    lines.push(`| 通过阈值 | ${report.overview.passThreshold} |`);
    lines.push('');

    // 阻断问题
    if (report.blockingIssues.length > 0) {
      lines.push('## 阻断问题');
      lines.push('');
      for (const issue of report.blockingIssues) {
        lines.push(`### ${issue.title}`);
        lines.push('');
        lines.push(`**位置**：${issue.location}`);
        lines.push('');
        lines.push(`**描述**：${issue.description}`);
        if (issue.evidence) {
          lines.push('');
          lines.push(`**证据**：\n\`\`\`\n${issue.evidence}\n\`\`\``);
        }
        if (issue.suggestion) {
          lines.push('');
          lines.push(`**修复建议**：${issue.suggestion}`);
        }
        lines.push('');
      }
    }

    // 非阻断问题
    if (report.nonBlockingIssues.length > 0) {
      lines.push('## 非阻断问题');
      lines.push('');
      for (const issue of report.nonBlockingIssues) {
        lines.push(`### ${issue.title}`);
        lines.push('');
        lines.push(`**位置**：${issue.location}`);
        lines.push(`**描述**：${issue.description}`);
        lines.push('');
      }
    }

    // 维度评分
    if (report.qualityDimensions.length > 0) {
      lines.push('## 质量维度');
      lines.push('');
      lines.push(`| 维度 | 评分 | 权重 | 通过 | 问题数 |`);
      lines.push(`|------|------|------|------|------|`);
      for (const dim of report.qualityDimensions) {
        const name = DIMENSION_NAMES[dim.dimension] || dim.dimension;
        lines.push(`| ${name} | ${dim.score} | ${(dim.weight * 100).toFixed(0)}% | ${dim.passed ? '✅' : '❌'} | ${dim.issues.length} |`);
      }
      lines.push('');
    }

    // 修复建议
    if (report.suggestedFixes.length > 0) {
      lines.push('## 修复建议');
      lines.push('');
      for (const fix of report.suggestedFixes) {
        const priorityIcon = fix.priority === 'high' ? '🔴' : fix.priority === 'medium' ? '🟡' : '🟢';
        lines.push(`### ${priorityIcon} ${DIMENSION_NAMES[fix.type] || fix.type}`);
        lines.push('');
        lines.push(fix.description);
        lines.push('');
        lines.push(`- 优先级：${fix.priority}`);
        lines.push(`- 可自动修复：${fix.autoFixable ? '是' : '否'}`);
        if (fix.estimatedImpact) {
          lines.push(`- 预计影响：${fix.estimatedImpact === 'significant' ? '显著' : fix.estimatedImpact === 'moderate' ? '中等' : '轻微'}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取结论标签
   */
  private getVerdictLabel(verdict: 'accepted' | 'needs_revision' | 'rejected'): string {
    switch (verdict) {
      case 'accepted': return '✅ 通过';
      case 'needs_revision': return '⚠️ 需修改';
      case 'rejected': return '❌ 拒绝';
    }
  }

  // ============================================================
  // 历史方法
  // ============================================================

  /**
   * 获取历史报告
   */
  getHistory(chapterId?: string): StructuredReviewReport[] {
    if (chapterId) {
      return this.reportHistory.filter(r => r.meta.chapterId === chapterId);
    }
    return [...this.reportHistory];
  }

  /**
   * 获取最新报告
   */
  getLatestReport(chapterId: string): StructuredReviewReport | null {
    const reports = this.getHistory(chapterId);
    return reports.length > 0 ? reports[reports.length - 1] : null;
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.reportHistory = [];
  }
}

// ============================================================
// 单例
// ============================================================

let reportGeneratorInstance: ReportGenerator | null = null;

export function getReportGenerator(): ReportGenerator {
  if (!reportGeneratorInstance) {
    reportGeneratorInstance = new ReportGenerator();
  }
  return reportGeneratorInstance;
}

export function createReportGenerator(options?: { maxHistorySize?: number }): ReportGenerator {
  reportGeneratorInstance = new ReportGenerator(options);
  return reportGeneratorInstance;
}

// ============================================================
// Composable
// ============================================================

export function useReportGenerator() {
  const generator = getReportGenerator();

  return {
    generator,
    
    generate: (
      chapterId: string,
      chapterNumber: number,
      title: string,
      reviewResult: ReviewResult,
      dimensions: ReviewDimensions,
      options?: {
        strictness?: 'strict' | 'normal' | 'relaxed';
        passThreshold?: number;
        duration?: number;
      }
    ) => generator.generate(chapterId, chapterNumber, title, reviewResult, dimensions, options),
    
    exportToJSON: (report: StructuredReviewReport) => generator.exportToJSON(report),
    exportToMarkdown: (report: StructuredReviewReport) => generator.exportToMarkdown(report),
    
    getHistory: (chapterId?: string) => generator.getHistory(chapterId),
    getLatestReport: (chapterId: string) => generator.getLatestReport(chapterId),
    clearHistory: () => generator.clearHistory(),
  };
}
