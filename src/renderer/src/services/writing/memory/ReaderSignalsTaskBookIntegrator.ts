/**
 * 追读力信号与任务书集成器
 * 将追读力信号转换为任务书写作指引
 */

import type { ReaderSignals } from './types';
import type {
  TaskBookWritingGuidance,
  ChapterHookType,
} from '../orchestrator/types';

// ============================================================
// 类型定义
// ============================================================

export interface ReaderSignalsIntegrationConfig {
  chapterNumber: number;
  signals: ReaderSignals;
  enableDynamicGuidance: boolean;
}

export interface IntegratedGuidance {
  recommendedHookTypes: ChapterHookType[];
  chapterStartHookAdvice: string;
  chapterEndHookAdvice: string;
  writingStrategyAdvice: string[];
  pacingAdvice: string;
  differentiationReminder: string;
  tabooReminder: string[];
}

// ============================================================
// 常量
// ============================================================

const ALL_HOOK_TYPES: ChapterHookType[] = [
  'sudden_reveal',
  'urgent_crisis',
  'unfinished_action',
  'identity_reveal',
  'tough_choice',
  'mysterious_item',
  'countdown',
  'promise_threat',
  'strange_disappear',
  'hidden_meaning',
  'imagery',
  'echo',
  'blank',
];

const HOOK_NAME_MAP: Record<string, string> = {
  sudden_reveal: '突然揭示',
  urgent_crisis: '紧急危机',
  unfinished_action: '未完成动作',
  identity_reveal: '身份反转',
  tough_choice: '两难抉择',
  mysterious_item: '神秘物品',
  countdown: '倒计时',
  promise_threat: '承诺/威胁',
  strange_disappear: '离奇消失',
  hidden_meaning: '隐藏含义',
  imagery: '意象钩子',
  echo: '回声钩子',
  blank: '留白钩子',
};

// ============================================================
// 集成器
// ============================================================

export class ReaderSignalsTaskBookIntegrator {
  static integrate(config: ReaderSignalsIntegrationConfig): Partial<TaskBookWritingGuidance> {
    const { signals, enableDynamicGuidance } = config;

    if (!enableDynamicGuidance) {
      return this.getDefaultGuidance();
    }

    const guidance: Partial<TaskBookWritingGuidance> = {
      stylePriority: [],
      pacingStrategy: 'normal',
      genreHint: '',
      antiPatterns: [],
      hookStrategy: {
        chapterStartHooks: [],
        chapterEndHook: 'blank',
        tensionLevel: 'medium',
      },
      shockLayers: true,
      coolPointDensity: 3000,
    };

    guidance.hookStrategy = this.integrateHookStrategy(signals, config.chapterNumber);
    guidance.stylePriority = this.integrateStyleStrategy(signals);
    guidance.pacingStrategy = this.integratePacingStrategy(signals);
    guidance.antiPatterns = this.integrateAntiPatterns(signals);
    guidance.coolPointDensity = this.integrateCoolPointDensity(signals);
    guidance.shockLayers = this.shouldUseShockLayers(signals);

    return guidance;
  }

  static generateIntegratedGuidance(config: ReaderSignalsIntegrationConfig): IntegratedGuidance {
    const { signals } = config;

    return {
      recommendedHookTypes: this.getRecommendedHooks(signals),
      chapterStartHookAdvice: this.getChapterStartAdvice(signals),
      chapterEndHookAdvice: this.getChapterEndAdvice(signals),
      writingStrategyAdvice: this.getWritingStrategyAdvice(signals),
      pacingAdvice: this.getPacingAdvice(signals),
      differentiationReminder: this.getDifferentiationReminder(signals),
      tabooReminder: this.getTabooReminder(signals),
    };
  }

  // ============================================================
  // 集成方法
  // ============================================================

  private static integrateHookStrategy(
    signals: ReaderSignals,
    chapterNumber: number
  ): TaskBookWritingGuidance['hookStrategy'] {
    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    const percentages = this.calculatePercentages(hookUsage, total);

    const available = ALL_HOOK_TYPES.filter((h) => !hookUsage[h] || percentages[h] < 15);

    let recommended: ChapterHookType[];
    if (available.length >= 3) {
      recommended = available.slice(0, 3);
    } else {
      const lowUsage = Object.entries(percentages)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3 - available.length)
        .map(([type]) => type as ChapterHookType);
      recommended = [...available, ...lowUsage];
    }

    return {
      chapterStartHooks: recommended.slice(0, 2) as ChapterHookType[],
      chapterEndHook: recommended[2] || 'blank',
      diversifyFrom: this.getMostUsedHook(hookUsage),
      tensionLevel: this.determineTensionLevel(signals, chapterNumber),
    };
  }

  private static integrateStyleStrategy(signals: ReaderSignals): string[] {
    const strategies: string[] = ['保持当前风格'];
    const trend = signals.reviewTrend;

    if (trend?.trend === 'declining') {
      strategies.push('近期审查趋势下降，建议保持稳定，减少冒险尝试');
    } else if (trend?.trend === 'improving') {
      strategies.push('近期质量上升，可以适当增加叙事密度');
    }

    const lowRanges = signals.lowScoreRanges || [];
    if (lowRanges.length > 0) {
      const recentLow = lowRanges[lowRanges.length - 1];
      if (recentLow) {
        strategies.push(`近期${recentLow.dimension}维度偏弱，加强该维度`);
      }
    }

    return strategies;
  }

  private static integratePacingStrategy(signals: ReaderSignals): 'build_up' | 'confront' | 'release' | 'normal' {
    const trend = signals.reviewTrend;

    if (trend?.overallAvg && trend.overallAvg < 70) {
      return 'normal';
    }

    if (trend?.trend === 'improving') {
      return 'build_up';
    }

    return 'normal';
  }

  private static integrateAntiPatterns(signals: ReaderSignals): string[] {
    const antiPatterns: string[] = [];
    const reviewTrend = signals.reviewTrend;

    if (reviewTrend?.byDimension) {
      const dims = reviewTrend.byDimension;

      if (dims.antiAIScore && dims.antiAIScore < 70) {
        antiPatterns.push('加强去AI味处理');
      }
      if (dims.paceScore && dims.paceScore < 70) {
        antiPatterns.push('避免节奏拖沓');
      }
      if (dims.coolpointScore && dims.coolpointScore < 70) {
        antiPatterns.push('增加爽点密度');
      }
    }

    return antiPatterns;
  }

  private static integrateCoolPointDensity(signals: ReaderSignals): number {
    const reviewTrend = signals.reviewTrend;

    if (reviewTrend?.byDimension?.coolpointScore) {
      const score = reviewTrend.byDimension.coolpointScore;
      if (score < 65) {
        return 2000;
      } else if (score > 85) {
        return 4000;
      }
    }

    return 3000;
  }

  private static shouldUseShockLayers(signals: ReaderSignals): boolean {
    const reviewTrend = signals.reviewTrend;

    if (reviewTrend?.byDimension?.hookScore) {
      return reviewTrend.byDimension.hookScore > 75;
    }

    return true;
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private static getRecommendedHooks(signals: ReaderSignals): ChapterHookType[] {
    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);

    if (total === 0) {
      return ['sudden_reveal', 'urgent_crisis', 'unfinished_action'];
    }

    const available = ALL_HOOK_TYPES.filter((h) => !hookUsage[h]);
    return available.length >= 3
      ? available.slice(0, 3)
      : [...available, 'sudden_reveal', 'urgent_crisis', 'unfinished_action'].slice(0, 3);
  }

  private static getChapterStartAdvice(signals: ReaderSignals): string {
    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);

    if (total === 0) {
      return '使用章首钩子吸引读者进入场景';
    }

    const mostUsed = this.getMostUsedHook(hookUsage);
    if (mostUsed) {
      return `避免连续使用「${HOOK_NAME_MAP[mostUsed] || mostUsed}」，尝试新的开篇方式`;
    }

    return '保持开篇多样性，避免重复';
  }

  private static getChapterEndAdvice(signals: ReaderSignals): string {
    const reviewTrend = signals.reviewTrend;

    if (reviewTrend?.overallAvg && reviewTrend.overallAvg < 70) {
      return '使用已验证的章尾钩子模式，保持稳定';
    }

    return '可以尝试新的章尾钩子模式，增加变化';
  }

  private static getWritingStrategyAdvice(signals: ReaderSignals): string[] {
    const advice: string[] = [];
    const trend = signals.reviewTrend;

    if (trend?.trend === 'declining') {
      advice.push('近期质量下降，优先保证稳定性');
    } else if (trend?.trend === 'improving') {
      advice.push('近期质量上升，可以适当增加叙事复杂度');
    }

    const lowRanges = signals.lowScoreRanges || [];
    if (lowRanges.length > 0) {
      const dimensions = [...new Set(lowRanges.map((r) => r.dimension))];
      advice.push(`近期${dimensions.join('、')}维度偏弱，重点加强`);
    }

    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    if (total > 5) {
      const mostUsed = this.getMostUsedHook(hookUsage);
      const percentage = mostUsed ? (hookUsage[mostUsed] / total) * 100 : 0;
      if (percentage > 40) {
        advice.push(`钩子类型「${HOOK_NAME_MAP[mostUsed] || mostUsed}」使用偏多(>40%)，建议做差异化`);
      }
    }

    return advice;
  }

  private static getPacingAdvice(signals: ReaderSignals): string {
    const trend = signals.reviewTrend;

    if (trend?.overallAvg && trend.overallAvg < 70) {
      return '保持稳定节奏，避免大幅波动';
    }

    if (trend?.trend === 'improving') {
      return '节奏可以适当加快，增加紧张感';
    }

    return '保持适中节奏，平衡推进与铺垫';
  }

  private static getDifferentiationReminder(signals: ReaderSignals): string {
    const hookReminder = this.getHookDifferentiation(signals.hookTypeUsage || {});
    const patternReminder = this.getPatternDifferentiation(signals.patternUsage || {});

    return [hookReminder, patternReminder].filter(Boolean).join('；') || '保持叙述多样性';
  }

  private static getTabooReminder(signals: ReaderSignals): string[] {
    const reminders: string[] = [];
    const reviewTrend = signals.reviewTrend;

    if (reviewTrend?.byDimension?.antiAIScore && reviewTrend.byDimension.antiAIScore < 70) {
      reminders.push('去AI味处理不足，避免AI惯用表达');
    }

    if (reviewTrend?.byDimension?.paceScore && reviewTrend.byDimension.paceScore < 70) {
      reminders.push('节奏偏慢，避免冗长描写');
    }

    return reminders;
  }

  private static getMostUsedHook(hookUsage: Record<string, number>): string | null {
    let maxCount = 0;
    let mostUsed: string | null = null;

    for (const [type, count] of Object.entries(hookUsage)) {
      if (count > maxCount) {
        maxCount = count;
        mostUsed = type;
      }
    }

    return mostUsed;
  }

  private static determineTensionLevel(
    signals: ReaderSignals,
    chapterNumber: number
  ): 'low' | 'medium' | 'high' {
    const reviewTrend = signals.reviewTrend;

    if (chapterNumber <= 3) {
      return 'medium';
    }

    if (reviewTrend?.trend === 'improving' && reviewTrend.overallAvg && reviewTrend.overallAvg > 80) {
      return 'high';
    }

    if (reviewTrend?.trend === 'declining' || (reviewTrend?.overallAvg && reviewTrend.overallAvg < 70)) {
      return 'low';
    }

    return 'medium';
  }

  private static getHookDifferentiation(hookUsage: Record<string, number>): string {
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    if (total === 0) return '';

    const mostUsed = this.getMostUsedHook(hookUsage);
    if (!mostUsed) return '';

    const percentage = (hookUsage[mostUsed] / total) * 100;
    if (percentage > 40) {
      return `钩子「${HOOK_NAME_MAP[mostUsed] || mostUsed}」使用偏多(>40%)，建议做差异化`;
    }

    return '';
  }

  private static getPatternDifferentiation(patternUsage: Record<string, number>): string {
    const total = Object.values(patternUsage).reduce((a, b) => a + b, 0);
    if (total === 0) return '';

    let maxCount = 0;
    let mostUsed: string | null = null;

    for (const [pattern, count] of Object.entries(patternUsage)) {
      if (count > maxCount) {
        maxCount = count;
        mostUsed = pattern;
      }
    }

    if (!mostUsed) return '';

    const percentage = (maxCount / total) * 100;
    if (percentage > 40) {
      return `爽点模式「${mostUsed}」使用偏多(>40%)，建议叠加新模式`;
    }

    return '';
  }

  private static calculatePercentages(
    hookUsage: Record<string, number>,
    total: number
  ): Record<string, number> {
    const percentages: Record<string, number> = {};
    for (const [type, count] of Object.entries(hookUsage)) {
      percentages[type] = total > 0 ? (count / total) * 100 : 0;
    }
    return percentages;
  }

  private static getDefaultGuidance(): Partial<TaskBookWritingGuidance> {
    return {
      stylePriority: ['保持当前风格'],
      pacingStrategy: 'normal',
      genreHint: '',
      antiPatterns: [],
      hookStrategy: {
        chapterStartHooks: ['sudden_reveal', 'urgent_crisis'],
        chapterEndHook: 'blank',
        tensionLevel: 'medium',
      },
      shockLayers: true,
      coolPointDensity: 3000,
    };
  }
}

// ============================================================
// 导出
// ============================================================

export { ReaderSignalsTaskBookIntegrator };
export type { ReaderSignalsIntegrationConfig, IntegratedGuidance };
