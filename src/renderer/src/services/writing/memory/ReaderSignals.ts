/**
 * 追读力信号系统
 * 基于 webnovel-writer 架构
 * 
 * 负责：
 * - 追踪钩子使用情况
 * - 追踪爽点模式使用情况
 * - 追踪审查趋势
 * - 生成写作指导
 */

import { ref, computed } from 'vue';
import type {
  ReaderSignals,
  ReviewTrend,
  LowScoreRange,
  ChapterHookType,
} from './types';
import type { ReviewResult } from '../review/types';

export class ReaderSignalsManager {
  // 钩子使用统计
  private hookTypeUsage = ref<Record<string, number>>({});
  
  // 爽点模式使用统计
  private patternUsage = ref<Record<string, number>>({});
  
  // 审查历史
  private reviewHistory = ref<ReviewResult[]>([]);
  
  // 审查趋势
  private reviewTrend = ref<ReviewTrend>({
    overallAvg: 75,
    byDimension: {},
    trend: 'stable',
  });
  
  // 低分区段
  private lowScoreRanges = ref<LowScoreRange[]>([]);
  
  // ============================================================
  // 核心 API
  // ============================================================
  
  /**
   * 获取当前追读力信号
   */
  getSignals(): ReaderSignals {
    return {
      hookTypeUsage: { ...this.hookTypeUsage.value },
      patternUsage: { ...this.patternUsage.value },
      reviewTrend: { ...this.reviewTrend.value },
      lowScoreRanges: [...this.lowScoreRanges.value],
      overallScore: this.reviewTrend.value.overallAvg,
    };
  }
  
  /**
   * 记录审查结果
   */
  recordReview(reviewResult: ReviewResult): void {
    // 保存历史
    this.reviewHistory.value.push(reviewResult);
    
    // 限制历史长度
    if (this.reviewHistory.value.length > 100) {
      this.reviewHistory.value = this.reviewHistory.value.slice(-100);
    }
    
    // 更新趋势
    this.updateTrend();
    
    // 更新低分区段
    this.updateLowScoreRanges(reviewResult);
  }
  
  /**
   * 记录钩子使用
   */
  recordHookUsage(hookType: ChapterHookType): void {
    const current = this.hookTypeUsage.value[hookType] || 0;
    this.hookTypeUsage.value = {
      ...this.hookTypeUsage.value,
      [hookType]: current + 1,
    };
  }
  
  /**
   * 记录爽点模式使用
   */
  recordPatternUsage(pattern: string): void {
    const current = this.patternUsage.value[pattern] || 0;
    this.patternUsage.value = {
      ...this.patternUsage.value,
      [pattern]: current + 1,
    };
  }
  
  /**
   * 生成写作指导
   */
  generateGuidance(chapter: number): string[] {
    const guidance: string[] = [];
    
    // 1. 低分区修复
    const worstRange = this.getWorstLowScoreRange();
    if (worstRange) {
      guidance.push(
        `优先修复近期低分问题：参考第${worstRange.startChapter}-${worstRange.endChapter}章，` +
        `加强${worstRange.dimension}维度的质量`
      );
    }
    
    // 2. 钩子差异化
    const dominantHook = this.getMostUsed(this.hookTypeUsage.value);
    if (dominantHook) {
      const hookCount = Object.values(this.hookTypeUsage.value).reduce((a, b) => a + b, 0);
      const hookPercentage = (this.hookTypeUsage.value[dominantHook] / hookCount) * 100;
      
      if (hookPercentage > 40) {
        guidance.push(
          `近期钩子类型"${this.formatHookName(dominantHook)}"使用偏多(${hookPercentage.toFixed(0)}%)，` +
          `建议做差异化，避免连续同构`
        );
      }
    }
    
    // 3. 爽点模式
    const topPattern = this.getMostUsed(this.patternUsage.value);
    if (topPattern) {
      const patternCount = Object.values(this.patternUsage.value).reduce((a, b) => a + b, 0);
      const patternPercentage = (this.patternUsage.value[topPattern] / patternCount) * 100;
      
      if (patternPercentage > 40) {
        guidance.push(
          `爽点模式"${topPattern}"近期高频(${patternPercentage.toFixed(0)}%)，` +
          `可叠加新爽点副轴`
        );
      }
    }
    
    // 4. 审查均分
    if (this.reviewTrend.value.overallAvg < 75) {
      guidance.push(
        `近期审查均分${this.reviewTrend.value.overallAvg.toFixed(1)}低于阈值75，` +
        `建议先保稳：减少跳场、每段补动作结果闭环`
      );
    }
    
    // 5. 题材锚定
    const lowDims = this.getLowDimensions();
    if (lowDims.length > 0) {
      guidance.push(
        `近期${lowDims.join('、')}维度得分偏低，` +
        `优先保证这些维度的质量`
      );
    }
    
    return guidance;
  }
  
  /**
   * 获取推荐钩子类型
   */
  getRecommendedHookTypes(chapter: number): ChapterHookType[] {
    const used = this.hookTypeUsage.value;
    const total = Object.values(used).reduce((a, b) => a + b, 0);
    
    if (total === 0) {
      return ['sudden_reveal', 'urgent_crisis', 'unfinished_action'];
    }
    
    // 计算使用比例
    const percentages: Record<string, number> = {};
    for (const [type, count] of Object.entries(used)) {
      percentages[type] = (count / total) * 100;
    }
    
    // 推荐使用较少的钩子类型
    const allHooks: ChapterHookType[] = [
      'sudden_reveal', 'urgent_crisis', 'unfinished_action',
      'identity_reveal', 'tough_choice', 'mysterious_item',
      'countdown', 'promise_threat', 'strange_disappear',
      'hidden_meaning', 'imagery', 'echo', 'blank',
    ];
    
    const available = allHooks.filter(h => !used[h] || percentages[h] < 15);
    
    // 优先推荐未使用的
    if (available.length >= 3) {
      return available.slice(0, 3);
    }
    
    // 补充一些低频使用的
    const lowUsage = Object.entries(percentages)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3 - available.length)
      .map(([type]) => type as ChapterHookType);
    
    return [...available, ...lowUsage];
  }
  
  // ============================================================
  // 私有方法
  // ============================================================
  
  private updateTrend(): void {
    const recent = this.reviewHistory.value.slice(-20);
    if (recent.length === 0) {
      this.reviewTrend.value = {
        overallAvg: 75,
        byDimension: {},
        trend: 'stable',
      };
      return;
    }
    
    // 计算平均分
    const overallAvg = recent.reduce((sum, r) => sum + r.overall.score, 0) / recent.length;
    
    // 计算各维度平均
    const dimensions = ['continuity', 'hookScore', 'coolpointScore', 'paceScore', 'antiAIScore'];
    const byDimension: Record<string, number> = {};
    
    for (const dim of dimensions) {
      const dimKey = dim as keyof typeof recent[0]['dimensions'];
      const dimSum = recent.reduce(
        (sum, r) => sum + (r.dimensions[dimKey]?.score || 75),
        0
      );
      byDimension[dim] = dimSum / recent.length;
    }
    
    // 判断趋势
    let trend: 'rising' | 'stable' | 'declining' = 'stable';
    if (recent.length >= 10) {
      const firstHalf = recent.slice(0, recent.length / 2);
      const secondHalf = recent.slice(recent.length / 2);
      
      const firstAvg = firstHalf.reduce((s, r) => s + r.overall.score, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((s, r) => s + r.overall.score, 0) / secondHalf.length;
      
      if (secondAvg - firstAvg > 3) {
        trend = 'rising';
      } else if (firstAvg - secondAvg > 3) {
        trend = 'declining';
      }
    }
    
    this.reviewTrend.value = {
      overallAvg,
      byDimension,
      trend,
    };
  }
  
  private updateLowScoreRanges(reviewResult: ReviewResult): void {
    // 检查是否有低分区
    const dimensions = reviewResult.dimensions;
    const lowDims: string[] = [];
    
    for (const [dim, dimResult] of Object.entries(dimensions)) {
      if (dimResult.score < 70) {
        lowDims.push(dim);
      }
    }
    
    if (lowDims.length > 0 || reviewResult.overall.score < 70) {
      const chapter = this.estimateChapterFromReview(reviewResult);
      
      // 检查是否需要合并到现有低分区
      const existingRange = this.lowScoreRanges.value.find(
        r => r.endChapter >= chapter - 5 && r.startChapter <= chapter + 5
      );
      
      if (existingRange) {
        // 合并
        existingRange.startChapter = Math.min(existingRange.startChapter, chapter);
        existingRange.endChapter = Math.max(existingRange.endChapter, chapter);
        
        if (reviewResult.overall.score < existingRange.overallScore) {
          existingRange.overallScore = reviewResult.overall.score;
          existingRange.dimension = lowDims[0] || 'overall';
        }
      } else {
        // 新增
        this.lowScoreRanges.value.push({
          startChapter: chapter,
          endChapter: chapter,
          overallScore: reviewResult.overall.score,
          dimension: lowDims[0] || 'overall',
          reasons: reviewResult.blockingIssues.map(i => i.description),
        });
      }
    }
    
    // 清理旧的低分区
    this.lowScoreRanges.value = this.lowScoreRanges.value.filter(
      r => r.endChapter >= this.estimateCurrentChapter() - 20
    );
  }
  
  private getMostUsed(usage: Record<string, number>): string | undefined {
    const entries = Object.entries(usage);
    if (entries.length === 0) return undefined;
    
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }
  
  private getWorstLowScoreRange(): LowScoreRange | undefined {
    if (this.lowScoreRanges.value.length === 0) return undefined;
    
    return this.lowScoreRanges.value.reduce((worst, range) =>
      range.overallScore < worst.overallScore ? range : worst
    );
  }
  
  private getLowDimensions(): string[] {
    const thresholds: Record<string, number> = {
      continuity: 70,
      hookScore: 70,
      coolpointScore: 70,
      paceScore: 70,
      antiAIScore: 75,
    };
    
    return Object.entries(this.reviewTrend.value.byDimension)
      .filter(([dim, score]) => score < (thresholds[dim] || 70))
      .map(([dim]) => dim);
  }
  
  private estimateChapterFromReview(review: ReviewResult): number {
    // 简单实现：从历史中推断章节号
    return this.reviewHistory.value.indexOf(review) + 1;
  }
  
  private estimateCurrentChapter(): number {
    return this.reviewHistory.value.length;
  }
  
  private formatHookName(hookType: string): string {
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
}

// ============================================================
// Composable 导出
// ============================================================

let signalsManager: ReaderSignalsManager | null = null;

export function useReaderSignals(): ReaderSignalsManager {
  if (!signalsManager) {
    signalsManager = new ReaderSignalsManager();
  }
  return signalsManager;
}

export function createReaderSignalsManager(): ReaderSignalsManager {
  return new ReaderSignalsManager();
}
