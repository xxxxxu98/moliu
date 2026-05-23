/**
 * ReaderSignals 到 TaskBook 的集成层
 * 
 * 职责：
 * - 将追读力信号转换为 TaskBook 写作指引
 * - 根据历史趋势生成差异化建议
 * - 为 TaskBookBuilder 提供动态上下文
 */

import type { ReaderSignals } from './types';
import type { 
  TaskBookWritingGuidance, 
  ChapterHookType,
  TaskBook 
} from '../orchestrator/types';

// ============================================================
// 类型定义
// ============================================================

export interface ReaderSignalsIntegrationConfig {
  /** 目标章节号 */
  chapterNumber: number;
  /** 追读力信号 */
  signals: ReaderSignals;
  /** 是否启用动态指引 */
  enableDynamicGuidance: boolean;
}

export interface IntegratedGuidance {
  /** 推荐的钩子类型 */
  recommendedHookTypes: ChapterHookType[];
  /** 章首钩子建议 */
  chapterStartHookAdvice: string;
  /** 章尾钩子建议 */
  chapterEndHookAdvice: string;
  /** 写作策略建议 */
  writingStrategyAdvice: string[];
  /** 节奏建议 */
  pacingAdvice: string;
  /** 差异化提醒 */
  differentiationReminder: string;
  /** 禁忌提醒 */
  tabooReminder: string[];
}

// ============================================================
// 集成器
// ============================================================

export class ReaderSignalsTaskBookIntegrator {
  
  /**
   * 集成追读力信号到 TaskBook 写作指引
   */
  static integrate(
    config: ReaderSignalsIntegrationConfig
  ): Partial<TaskBookWritingGuidance> {
    const { signals, chapterNumber, enableDynamicGuidance } = config;
    
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
    
    // 1. 集成钩子策略
    const hookAdvice = this.integrateHookStrategy(signals, chapterNumber);
    guidance.hookStrategy = hookAdvice;
    
    // 2. 集成风格策略
    guidance.stylePriority = this.integrateStyleStrategy(signals);
    
    // 3. 集成节奏策略
    guidance.pacingStrategy = this.integratePacingStrategy(signals);
    
    // 4. 集成 Anti-Patterns
    guidance.antiPatterns = this.integrateAntiPatterns(signals);
    
    // 5. 集成爽点密度
    guidance.coolPointDensity = this.integrateCoolPointDensity(signals);
    
    // 6. 集成震惊分层
    guidance.shockLayers = this.shouldUseShockLayers(signals);
    
    return guidance;
  }
  
  /**
   * 生成完整集成指引
   */
  static generateIntegratedGuidance(
    config: ReaderSignalsIntegrationConfig
  ): IntegratedGuidance {
    const { signals, chapterNumber } = config;
    
    // 推荐钩子类型
    const recommendedHooks = this.getRecommendedHooks(signals);
    
    // 章首钩子建议
    const chapterStartHookAdvice = this.getChapterStartAdvice(signals);
    
    // 章尾钩子建议
    const chapterEndHookAdvice = this.getChapterEndAdvice(signals);
    
    // 写作策略建议
    const writingStrategyAdvice = this.getWritingStrategyAdvice(signals);
    
    // 节奏建议
    const pacingAdvice = this.getPacingAdvice(signals);
    
    // 差异化提醒
    const differentiationReminder = this.getDifferentiationReminder(signals);
    
    // 禁忌提醒
    const tabooReminder = this.getTabooReminder(signals);
    
    return {
      recommendedHookTypes: recommendedHooks,
      chapterStartHookAdvice,
      chapterEndHookAdvice,
      writingStrategyAdvice,
      pacingAdvice,
      differentiationReminder,
      tabooReminder,
    };
  }
  
  // ============================================================
  // 私有方法
  // ============================================================
  
  /**
   * 集成钩子策略
   */
  private static integrateHookStrategy(
    signals: ReaderSignals,
    chapterNumber: number
  ): TaskBookWritingGuidance['hookStrategy'] {
    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    
    // 获取使用比例
    const percentages: Record<string, number> = {};
    for (const [type, count] of Object.entries(hookUsage)) {
      percentages[type] = total > 0 ? (count / total) * 100 : 0;
    }
    
    // 推荐使用较少的钩子
    const allHooks: ChapterHookType[] = [
      'sudden_reveal', 'urgent_crisis', 'unfinished_action',
      'identity_reveal', 'tough_choice', 'mysterious_item',
      'countdown', 'promise_threat', 'strange_disappear',
      'hidden_meaning', 'imagery', 'echo', 'blank',
    ];
    
    // 优先推荐未使用或低频使用的
    const available = allHooks.filter(h => !hookUsage[h] || percentages[h] < 15);
    
    // 如果可用钩子不足3个，选择低频使用的
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
    
    // 确定张力等级
    const tensionLevel = this.determineTensionLevel(signals, chapterNumber);
    
    return {
      chapterStartHooks: recommended.slice(0, 2) as ChapterHookType[],
      chapterEndHook: recommended[2] || 'blank',
      diversifyFrom: this.getMostUsedHook(hookUsage),
      tensionLevel,
    };
  }
  
  /**
   * 集成风格策略
   */
  private static integrateStyleStrategy(signals: ReaderSignals): string[] {
    const strategies: string[] = ['保持当前风格'];
    
    // 根据审查趋势调整
    const trend = signals.reviewTrend;
    if (trend?.trend === 'declining') {
      strategies.push('近期审查趋势下降，建议保持稳定，减少冒险尝试');
    } else if (trend?.trend === 'improving') {
      strategies.push('近期质量上升，可以适当增加叙事密度');
    }
    
    // 根据低分区段调整
    const lowRanges = signals.lowScoreRanges || [];
    if (lowRanges.length > 0) {
      const recentLow = lowRanges[lowRanges.length - 1];
      if (recentLow) {
        strategies.push(`近期${recentLow.dimension}维度偏弱，加强该维度`);
      }
    }
    
    return strategies;
  }
  
  /**
   * 集成节奏策略
   */
  private static integratePacingStrategy(signals: ReaderSignals): 'build_up' | 'confront' | 'release' | 'normal' {
    const trend = signals.reviewTrend;
    
    // 根据均分调整节奏
    if (trend?.overallAvg && trend.overallAvg < 70) {
      return 'normal'; // 质量偏低时保持稳定
    }
    
    // 根据趋势调整
    if (trend?.trend === 'improving') {
      return 'build_up'; // 上升趋势可以适当加压
    }
    
    return 'normal';
  }
  
  /**
   * 集成 Anti-Patterns
   */
  private static integrateAntiPatterns(signals: ReaderSignals): string[] {
    const antiPatterns: string[] = [];
    
    // 根据历史问题添加反模式
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
  
  /**
   * 集成爽点密度
   */
  private static integrateCoolPointDensity(signals: ReaderSignals): number {
    const reviewTrend = signals.reviewTrend;
    
    // 根据爽点得分调整密度
    if (reviewTrend?.byDimension?.coolpointScore) {
      const score = reviewTrend.byDimension.coolpointScore;
      if (score < 65) {
        return 2000; // 增加爽点密度
      } else if (score > 85) {
        return 4000; // 降低爽点密度
      }
    }
    
    return 3000; // 默认密度
  }
  
  /**
   * 判断是否使用震惊分层
   */
  private static shouldUseShockLayers(signals: ReaderSignals): boolean {
    const reviewTrend = signals.reviewTrend;
    
    // 根据得分判断
    if (reviewTrend?.byDimension?.hookScore) {
      return reviewTrend.byDimension.hookScore > 75;
    }
    
    return true; // 默认使用
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  /**
   * 获取推荐钩子
   */
  private static getRecommendedHooks(signals: ReaderSignals): ChapterHookType[] {
    const hookUsage = signals.hookTypeUsage || {};
    const allHooks: ChapterHookType[] = [
      'sudden_reveal', 'urgent_crisis', 'unfinished_action',
      'identity_reveal', 'tough_choice', 'mysterious_item',
      'countdown', 'promise_threat', 'strange_disappear',
      'hidden_meaning', 'imagery', 'echo', 'blank',
    ];
    
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    if (total === 0) {
      return ['sudden_reveal', 'urgent_crisis', 'unfinished_action'];
    }
    
    const available = allHooks.filter(h => !hookUsage[h]);
    return available.length >= 3 
      ? available.slice(0, 3)
      : [...available, 'sudden_reveal', 'urgent_crisis', 'unfinished_action'].slice(0, 3);
  }
  
  /**
   * 获取章首钩子建议
   */
  private static getChapterStartAdvice(signals: ReaderSignals): string {
    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    
    if (total === 0) {
      return '使用章首钩子吸引读者进入场景';
    }
    
    const mostUsed = this.getMostUsedHook(hookUsage);
    if (mostUsed) {
      return `避免连续使用「${this.formatHookName(mostUsed)}」，尝试新的开篇方式`;
    }
    
    return '保持开篇多样性，避免重复';
  }
  
  /**
   * 获取章尾钩子建议
   */
  private static getChapterEndAdvice(signals: ReaderSignals): string {
    const reviewTrend = signals.reviewTrend;
    
    if (reviewTrend?.overallAvg && reviewTrend.overallAvg < 70) {
      return '使用已验证的章尾钩子模式，保持稳定';
    }
    
    return '可以尝试新的章尾钩子模式，增加变化';
  }
  
  /**
   * 获取写作策略建议
   */
  private static getWritingStrategyAdvice(signals: ReaderSignals): string[] {
    const advice: string[] = [];
    
    // 审查趋势
    const trend = signals.reviewTrend;
    if (trend?.trend === 'declining') {
      advice.push('近期质量下降，优先保证稳定性');
    } else if (trend?.trend === 'improving') {
      advice.push('近期质量上升，可以适当增加叙事复杂度');
    }
    
    // 低分区段
    const lowRanges = signals.lowScoreRanges || [];
    if (lowRanges.length > 0) {
      const dimensions = [...new Set(lowRanges.map(r => r.dimension))];
      advice.push(`近期${dimensions.join('、')}维度偏弱，重点加强`);
    }
    
    // 钩子使用
    const hookUsage = signals.hookTypeUsage || {};
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    if (total > 5) {
      const mostUsed = this.getMostUsedHook(hookUsage);
      const percentage = mostUsed ? (hookUsage[mostUsed] / total) * 100 : 0;
      if (percentage > 40) {
        advice.push(`钩子类型「${this.formatHookName(mostUsed)}」使用偏多(>40%)，建议做差异化`);
      }
    }
    
    return advice;
  }
  
  /**
   * 获取节奏建议
   */
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
  
  /**
   * 获取差异化提醒
   */
  private static getDifferentiationReminder(signals: ReaderSignals): string {
    const hookUsage = signals.hookTypeUsage || {};
    const patternUsage = signals.patternUsage || {};
    
    const hookReminder = this.getHookDifferentiation(hookUsage);
    const patternReminder = this.getPatternDifferentiation(patternUsage);
    
    return [hookReminder, patternReminder].filter(Boolean).join('；') || '保持叙述多样性';
  }
  
  /**
   * 获取禁忌提醒
   */
  private static getTabooReminder(signals: ReaderSignals): string[] {
    const reminders: string[] = [];
    
    const reviewTrend = signals.reviewTrend;
    if (reviewTrend?.byDimension?.antiAIScore) {
      if (reviewTrend.byDimension.antiAIScore < 70) {
        reminders.push('去AI味处理不足，避免AI惯用表达');
      }
    }
    
    if (reviewTrend?.byDimension?.paceScore) {
      if (reviewTrend.byDimension.paceScore < 70) {
        reminders.push('节奏偏慢，避免冗长描写');
      }
    }
    
    return reminders;
  }
  
  /**
   * 获取最常用的钩子
   */
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
  
  /**
   * 确定张力等级
   */
  private static determineTensionLevel(
    signals: ReaderSignals,
    chapterNumber: number
  ): 'low' | 'medium' | 'high' {
    const reviewTrend = signals.reviewTrend;
    
    // 章节位置判断
    if (chapterNumber <= 3) {
      return 'medium'; // 开头保持适中
    }
    
    // 趋势判断
    if (reviewTrend?.trend === 'improving' && reviewTrend.overallAvg > 80) {
      return 'high'; // 上升趋势可以增加张力
    }
    
    if (reviewTrend?.trend === 'declining' || reviewTrend?.overallAvg < 70) {
      return 'low'; // 下降趋势降低风险
    }
    
    return 'medium';
  }
  
  /**
   * 格式化钩子名称
   */
  private static formatHookName(hookType: string): string {
    const names: Record<string, string> = {
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
    
    return names[hookType] || hookType;
  }
  
  /**
   * 获取钩子差异化提醒
   */
  private static getHookDifferentiation(hookUsage: Record<string, number>): string {
    const total = Object.values(hookUsage).reduce((a, b) => a + b, 0);
    if (total === 0) return '';
    
    const mostUsed = this.getMostUsedHook(hookUsage);
    if (!mostUsed) return '';
    
    const percentage = (hookUsage[mostUsed] / total) * 100;
    if (percentage > 40) {
      return `钩子「${this.formatHookName(mostUsed)}」使用偏多(>40%)，建议做差异化`;
    }
    
    return '';
  }
  
  /**
   * 获取模式差异化提醒
   */
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
  
  /**
   * 获取默认指引
   */
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
