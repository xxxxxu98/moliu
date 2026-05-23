/**
 * Blocking Override 规则
 * 参考 webnovel-writer 的 blocking-override-guidelines.md
 * 
 * 核心原则：
 * - 禁止 override 的问题会破坏故事逻辑，不可绕过
 * - 可以 override 的问题由用户自行判断风险
 */

import type { ReviewIssue, ReviewCategory, ReviewSeverity } from '@/types/writing-task';

// ============================================
// 规则定义
// ============================================

export interface OverrideRule {
  /** 规则名称 */
  name: string;
  /** 匹配的分类 */
  category: ReviewCategory | 'all';
  /** 匹配的严重度 */
  severity?: ReviewSeverity;
  /** 是否可 override */
  allowed: boolean;
  /** 原因 */
  reason: string;
  /** 警告信息 */
  warning?: string;
}

/**
 * 禁止 override 的规则
 * 这些问题会破坏故事逻辑，不能绕过
 */
export const FORBIDDEN_OVERRIDE_RULES: OverrideRule[] = [
  {
    name: 'setting_conflict',
    category: 'setting',
    severity: 'critical',
    allowed: false,
    reason: '设置冲突会破坏世界观一致性',
    warning: '此问题不可 override，建议修复后继续',
  },
  {
    name: 'timeline_conflict',
    category: 'timeline',
    severity: 'critical',
    allowed: false,
    reason: '时间线冲突会导致故事逻辑混乱',
    warning: '此问题不可 override，建议修复后继续',
  },
  {
    name: 'character_core_conflict',
    category: 'character',
    severity: 'critical',
    allowed: false,
    reason: '角色核心设定冲突会破坏人物可信度',
    warning: '此问题不可 override，建议修复后继续',
  },
  {
    name: 'logic_gap_critical',
    category: 'logic',
    severity: 'critical',
    allowed: false,
    reason: '严重逻辑漏洞会破坏故事可信度',
    warning: '此问题不可 override，建议修复后继续',
  },
  {
    name: 'setting_any_critical',
    category: 'setting',
    severity: 'high',
    allowed: false,
    reason: '设定问题影响世界观一致性',
    warning: '此问题不可 override，建议修复后继续',
  },
  {
    name: 'timeline_any_critical',
    category: 'timeline',
    severity: 'high',
    allowed: false,
    reason: '时间线问题会导致故事混乱',
    warning: '此问题不可 override，建议修复后继续',
  },
];

/**
 * 允许 override 的规则
 * 这些问题可以由用户自行判断风险后决定是否 override
 */
export const ALLOWED_OVERRIDE_RULES: OverrideRule[] = [
  {
    name: 'pacing_slow',
    category: 'pacing',
    severity: 'high',
    allowed: true,
    reason: '节奏偏慢可以通过后续章节调整',
    warning: '节奏问题可能影响阅读体验，但可后续优化',
  },
  {
    name: 'pacing_fast',
    category: 'pacing',
    severity: 'medium',
    allowed: true,
    reason: '节奏偏快可以通过增加过渡场景优化',
    warning: '节奏过快可能导致情节跳跃，但可后续补充',
  },
  {
    name: 'ai_flavor_strong',
    category: 'ai_flavor',
    severity: 'high',
    allowed: true,
    reason: 'AI味问题可以通过润色处理',
    warning: 'AI味较重可能影响阅读体验，建议润色后再检查',
  },
  {
    name: 'ai_flavor_medium',
    category: 'ai_flavor',
    severity: 'medium',
    allowed: true,
    reason: 'AI味中等可以通过手动润色改善',
    warning: '建议后续进行 DeAI 润色',
  },
  {
    name: 'chapter_ending_no_hook',
    category: 'chapter_ending',
    severity: 'medium',
    allowed: true,
    reason: '章尾缺少钩子可以在下一章开头补救',
    warning: '缺少钩子可能影响追读率，但可通过后续情节补救',
  },
  {
    name: 'chapter_ending_summary',
    category: 'chapter_ending',
    severity: 'high',
    allowed: true,
    reason: '总结式结尾可以通过增加悬念补救',
    warning: '总结式结尾可能影响读者继续阅读的欲望',
  },
  {
    name: 'excitement_sparse',
    category: 'excitement',
    severity: 'medium',
    allowed: true,
    reason: '爽点密度偏低可以通过后续情节补充',
    warning: '爽点不足可能影响读者"爽感"，但可通过后续补救',
  },
  {
    name: 'show_dont_tell_excessive',
    category: 'show_dont_tell',
    severity: 'low',
    allowed: true,
    reason: 'Tell 偏多可以通过改写改善',
    warning: '建议后续进行展示式改写',
  },
  {
    name: 'continuity_minor',
    category: 'continuity',
    severity: 'low',
    allowed: true,
    reason: '轻微的连续性问题影响较小',
    warning: '轻微的连续性问题可以在后续章节自然补救',
  },
  {
    name: 'logic_minor',
    category: 'logic',
    severity: 'low',
    allowed: true,
    reason: '轻微的逻辑问题可以忽略或后续补救',
    warning: '轻微的逻辑问题可能不会影响阅读体验',
  },
  {
    name: 'other_suggestions',
    category: 'other',
    severity: 'low',
    allowed: true,
    reason: '其他低优先级建议可以由用户自行判断',
    warning: '这是低优先级建议，不影响整体质量',
  },
];

// ============================================
// 判断函数
// ============================================

/**
 * 判断某个问题是否可以被 override
 */
export function canOverrideIssue(issue: ReviewIssue): {
  allowed: boolean;
  reason: string;
  warning?: string;
} {
  // 首先检查禁止规则
  for (const rule of FORBIDDEN_OVERRIDE_RULES) {
    if (rule.category === issue.category) {
      if (!rule.severity || rule.severity === issue.severity) {
        return {
          allowed: false,
          reason: rule.reason,
          warning: rule.warning,
        };
      }
    }
  }

  // 然后检查允许规则
  for (const rule of ALLOWED_OVERRIDE_RULES) {
    if (rule.category === issue.category) {
      if (!rule.severity || rule.severity === issue.severity) {
        return {
          allowed: true,
          reason: rule.reason,
          warning: rule.warning,
        };
      }
    }
  }

  // 默认不允许 critical 问题
  if (issue.severity === 'critical') {
    return {
      allowed: false,
      reason: '严重问题不建议 override',
    };
  }

  // high 问题需要额外确认
  if (issue.severity === 'high') {
    return {
      allowed: true,
      reason: '高优先级问题可由用户自行判断是否 override',
      warning: '这是高优先级问题，override 可能影响质量',
    };
  }

  // medium 和 low 问题默认允许
  return {
    allowed: true,
    reason: '此问题可以由用户自行判断是否 override',
  };
}

/**
 * 批量判断多个问题是否可以被 override
 */
export function canOverrideIssues(issues: ReviewIssue[]): Map<string, {
  allowed: boolean;
  reason: string;
  warning?: string;
}> {
  const results = new Map<string, {
    allowed: boolean;
    reason: string;
    warning?: string;
  }>();

  for (const issue of issues) {
    results.set(issue.id, canOverrideIssue(issue));
  }

  return results;
}

/**
 * 过滤出可以被 override 的问题
 */
export function filterOverridableIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return issues.filter(issue => canOverrideIssue(issue).allowed);
}

/**
 * 过滤出不可被 override 的问题
 */
export function filterNonOverridableIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return issues.filter(issue => !canOverrideIssue(issue).allowed);
}

/**
 * 获取 override 统计信息
 */
export function getOverrideStats(issues: ReviewIssue[]): {
  total: number;
  overridable: number;
  nonOverridable: number;
  byCategory: Record<ReviewCategory, { overridable: number; nonOverridable: number }>;
} {
  const stats = {
    total: issues.length,
    overridable: 0,
    nonOverridable: 0,
    byCategory: {} as Record<ReviewCategory, { overridable: number; nonOverridable: number }>,
  };

  for (const issue of issues) {
    const { allowed } = canOverrideIssue(issue);
    
    if (allowed) {
      stats.overridable++;
    } else {
      stats.nonOverridable++;
    }

    if (!stats.byCategory[issue.category]) {
      stats.byCategory[issue.category] = { overridable: 0, nonOverridable: 0 };
    }
    
    if (allowed) {
      stats.byCategory[issue.category].overridable++;
    } else {
      stats.byCategory[issue.category].nonOverridable++;
    }
  }

  return stats;
}

/**
 * 检查是否所有不可 override 的问题都已解决
 */
export function canProceedWithOverrides(issues: ReviewIssue[]): boolean {
  const nonOverridable = filterNonOverridableIssues(issues);
  return nonOverridable.length === 0;
}

/**
 * 生成 override 确认提示
 */
export function generateOverrideConfirmation(issues: ReviewIssue[]): {
  title: string;
  message: string;
  overridableIssues: ReviewIssue[];
  nonOverridableIssues: ReviewIssue[];
} {
  const overridable = issues.filter(i => canOverrideIssue(i).allowed);
  const nonOverridable = issues.filter(i => !canOverrideIssue(i).allowed);

  return {
    title: '确认 Override',
    message: nonOverridable.length > 0
      ? `存在 ${nonOverridable.length} 个不可 override 的问题，需要先修复`
      : `确认 override ${overridable.length} 个问题？`,
    overridableIssues: overridable,
    nonOverridableIssues: nonOverridable,
  };
}
