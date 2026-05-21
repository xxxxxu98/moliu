/**
 * Priority Management System
 * 优先级管理系统 - 统一的优先级决策、排序和裁决
 */

import type {
  PriorityLevel,
  PriorityConfig,
  PriorityRule,
  PriorityDecision,
  Violation,
  Warning,
} from '../types';
import {
  PRIORITY_LEVELS,
  comparePriority,
  isBlocking,
} from '../types';

/**
 * 优先级上下文
 */
export interface PriorityContext {
  /** 契约类型 */
  contractType?: 'story' | 'volume' | 'chapter';
  /** 当前生成阶段 */
  generationPhase?: 'init' | 'plan' | 'write' | 'validate';
  /** 题材 */
  genre?: string;
  /** 目标字数 */
  targetWordCount?: number;
  /** 已验证通过的章节数 */
  validatedChapters?: number;
  /** 错误计数 */
  errorCount?: number;
}

/**
 * 优先级管理器
 */
export class PriorityManager {
  /** 规则列表 */
  private rules: Map<string, PriorityRule[]> = new Map();

  /** 自定义优先级映射 */
  private customMappings: Map<string, PriorityLevel> = new Map();

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * 初始化默认规则
   */
  private initializeDefaultRules(): void {
    // 故事契约规则
    this.rules.set('story', [
      {
        conditionType: 'field_missing',
        condition: 'basic.title',
        priority: 'critical',
        blocking: true,
      },
      {
        conditionType: 'field_missing',
        condition: 'basic.genre',
        priority: 'critical',
        blocking: true,
      },
      {
        conditionType: 'field_missing',
        condition: 'protagonist.name',
        priority: 'critical',
        blocking: true,
      },
      {
        conditionType: 'field_missing',
        condition: 'protagonist.motivation',
        priority: 'high',
        blocking: false,
      },
      {
        conditionType: 'field_present',
        condition: 'worldSetting.locations',
        priority: 'medium',
        blocking: false,
      },
    ]);

    // 卷契约规则
    this.rules.set('volume', [
      {
        conditionType: 'field_missing',
        condition: 'volumeTitle',
        priority: 'critical',
        blocking: true,
      },
      {
        conditionType: 'field_missing',
        condition: 'beats',
        priority: 'high',
        blocking: false,
      },
      {
        conditionType: 'field_missing',
        condition: 'timeline.anchors',
        priority: 'medium',
        blocking: false,
      },
    ]);

    // 章节契约规则
    this.rules.set('chapter', [
      {
        conditionType: 'field_missing',
        condition: 'nodes.cbn.statement',
        priority: 'critical',
        blocking: true,
      },
      {
        conditionType: 'field_missing',
        condition: 'nodes.cen.statement',
        priority: 'critical',
        blocking: true,
      },
      {
        conditionType: 'field_missing',
        condition: 'requirements.objective',
        priority: 'high',
        blocking: false,
      },
      {
        conditionType: 'field_missing',
        condition: 'requirements.coolPoint',
        priority: 'medium',
        blocking: false,
      },
    ]);
  }

  /**
   * 添加自定义规则
   */
  addRule(contractType: string, rule: PriorityRule): void {
    const existing = this.rules.get(contractType) || [];
    this.rules.set(contractType, [...existing, rule]);
  }

  /**
   * 设置自定义优先级映射
   */
  setCustomPriority(violationType: string, priority: PriorityLevel): void {
    this.customMappings.set(violationType, priority);
  }

  /**
   * 评估优先级
   */
  evaluate(
    violationType: string,
    context: PriorityContext = {}
  ): PriorityDecision {
    // 1. 检查自定义映射
    const customPriority = this.customMappings.get(violationType);
    if (customPriority) {
      return {
        level: customPriority,
        reason: '来自自定义优先级映射',
        blocking: isBlocking(customPriority),
        suggestions: [],
      };
    }

    // 2. 检查规则
    const contractRules = this.rules.get(context.contractType || '') || [];
    for (const rule of contractRules) {
      if (rule.condition === violationType) {
        return {
          level: rule.priority,
          reason: `匹配规则: ${rule.conditionType}:${rule.condition}`,
          blocking: rule.blocking,
          suggestions: [],
        };
      }
    }

    // 3. 默认优先级
    return {
      level: 'medium',
      reason: '使用默认优先级',
      blocking: false,
      suggestions: [],
    };
  }

  /**
   * 排序验证结果
   */
  sortValidationResults(
    violations: Violation[],
    warnings: Warning[]
  ): {
    sortedViolations: Violation[];
    sortedWarnings: Warning[];
    blockingCount: number;
    highPriorityCount: number;
  } {
    // 排序违规
    const sortedViolations = [...violations].sort((a, b) => {
      const priorityA = a.priority || this.inferPriority(a.severity);
      const priorityB = b.priority || this.inferPriority(b.severity);
      return comparePriority(priorityA, priorityB);
    });

    // 排序警告
    const sortedWarnings = [...warnings].sort((a, b) =>
      comparePriority(a.priority, b.priority)
    );

    // 统计
    const blockingCount = sortedViolations.filter(v =>
      v.severity === 'blocking' || isBlocking(v.priority || 'medium')
    ).length;
    const highPriorityCount = sortedViolations.filter(v =>
      (v.priority === 'critical' || v.priority === 'high')
    ).length;

    return {
      sortedViolations,
      sortedWarnings,
      blockingCount,
      highPriorityCount,
    };
  }

  /**
   * 从严重性推断优先级
   */
  private inferPriority(severity: string): PriorityLevel {
    switch (severity) {
      case 'blocking':
        return 'critical';
      default:
        return 'medium';
    }
  }

  /**
   * 获取优先级标签
   */
  getPriorityLabel(level: PriorityLevel): string {
    return PRIORITY_LEVELS[level]?.label || '未知';
  }

  /**
   * 获取优先级颜色
   */
  getPriorityColor(level: PriorityLevel): string {
    return PRIORITY_LEVELS[level]?.color || '#999999';
  }

  /**
   * 生成优先级摘要
   */
  generateSummary(
    violations: Violation[],
    warnings: Warning[]
  ): PrioritySummary {
    const { sortedViolations, sortedWarnings, blockingCount, highPriorityCount } =
      this.sortValidationResults(violations, warnings);

    const byPriority = {
      critical: { violations: 0, warnings: 0 },
      high: { violations: 0, warnings: 0 },
      medium: { violations: 0, warnings: 0 },
      low: { violations: 0, warnings: 0 },
    };

    for (const v of violations) {
      const p = v.priority || this.inferPriority(v.severity);
      byPriority[p].violations++;
    }

    for (const w of warnings) {
      byPriority[w.priority].warnings++;
    }

    return {
      total: {
        violations: violations.length,
        warnings: warnings.length,
      },
      byPriority,
      blockingCount,
      highPriorityCount,
      canProceed: blockingCount === 0,
      sortedViolations,
      sortedWarnings,
    };
  }

  /**
   * 创建优先级决策树
   */
  createDecisionTree(
    violations: Violation[]
  ): PriorityDecisionNode {
    const root: PriorityDecisionNode = {
      id: 'root',
      label: '优先级决策',
      priority: 'medium',
      children: [],
    };

    // 按类型分组
    const byType = new Map<string, Violation[]>();
    for (const v of violations) {
      const list = byType.get(v.type) || [];
      list.push(v);
      byType.set(v.type, list);
    }

    // 构建树
    for (const [type, items] of byType) {
      const priority = items[0]?.priority || this.inferPriority(items[0]?.severity || 'warning');
      const child: PriorityDecisionNode = {
        id: type,
        label: type,
        priority,
        count: items.length,
        children: items.map((v, i) => ({
          id: `${type}-${i}`,
          label: v.description.slice(0, 50),
          priority: v.priority || this.inferPriority(v.severity),
          location: v.location,
          suggestion: v.suggestion,
          quickFixes: v.quickFixes,
        })),
      };
      root.children.push(child);
    }

    // 排序子节点
    root.children.sort((a, b) => comparePriority(a.priority, b.priority));

    return root;
  }

  /**
   * 导出规则
   */
  exportRules(): Record<string, PriorityRule[]> {
    return Object.fromEntries(this.rules);
  }

  /**
   * 导入规则
   */
  importRules(rules: Record<string, PriorityRule[]>): void {
    this.rules = new Map(Object.entries(rules));
  }
}

/**
 * 优先级摘要
 */
export interface PrioritySummary {
  total: {
    violations: number;
    warnings: number;
  };
  byPriority: Record<
    PriorityLevel,
    { violations: number; warnings: number }
  >;
  blockingCount: number;
  highPriorityCount: number;
  canProceed: boolean;
  sortedViolations: Violation[];
  sortedWarnings: Warning[];
}

/**
 * 优先级决策节点
 */
export interface PriorityDecisionNode {
  id: string;
  label: string;
  priority: PriorityLevel;
  count?: number;
  location?: Violation['location'];
  suggestion?: string;
  quickFixes?: Violation['quickFixes'];
  children: PriorityDecisionNode[];
}

// 导出单例
export const priorityManager = new PriorityManager();
