/**
 * 追读力预测服务
 * 基于 oh-story 和 webnovel-writer 的追读力评估系统
 */

import type { ReadRetentionScore, ReadRetentionDimensions } from '@/types/evaluation';
import type { CoolPointType } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

export interface RetentionPrediction {
  /** 追读力评分 */
  score: ReadRetentionScore;
  /** 风险警告 */
  risks: RiskWarning[];
  /** 改进建议 */
  improvements: string[];
  /** 章节类型建议 */
  chapterTypeAdvice: ChapterTypeAdvice;
  /** 钩子推荐 */
  recommendedHooks: string[];
  /** 爽点推荐 */
  recommendedCoolPoints: string[];
}

export interface RiskWarning {
  level: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  description: string;
  affectedChapters?: number[];
  suggestion: string;
}

export interface ChapterTypeAdvice {
  currentChapter: number;
  recommendedType: 'normal' | 'climax' | 'transition' | 'setup';
  reason: string;
  excitementTarget: number;
  cliffhangerIntensity: number;
}

export interface RetentionTrend {
  trend: 'rising' | 'stable' | 'declining';
  averageScore: number;
  changeRate: number;
  forecast: number[];
}

// ============================================================
// 追读力预测服务
// ============================================================

export class RetentionPredictor {
  private history: ReadRetentionScore[] = [];
  private config: RetentionPredictorConfig;

  constructor(config: Partial<RetentionPredictorConfig> = {}) {
    this.config = {
      warningThreshold: 70,
      dangerThreshold: 60,
      trendWindowSize: 10,
      forecastHorizon: 5,
      ...config,
    };
  }

  /**
   * 添加历史记录
   */
  addRecord(score: ReadRetentionScore): void {
    this.history.push(score);
    
    // 限制历史长度
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  /**
   * 预测下一章追读力
   */
  predictNextChapter(): RetentionPrediction {
    const lastScore = this.history[this.history.length - 1];
    const chapterNumber = lastScore?.dimensions?.hookScore ? this.history.length + 1 : 1;

    // 分析趋势
    const trend = this.analyzeTrend();
    
    // 生成风险警告
    const risks = this.generateRisks(trend);
    
    // 生成改进建议
    const improvements = this.generateImprovements(trend);
    
    // 章节类型建议
    const chapterTypeAdvice = this.generateChapterTypeAdvice(chapterNumber, trend);
    
    // 钩子推荐
    const recommendedHooks = this.recommendHooks(trend);
    
    // 爽点推荐
    const recommendedCoolPoints = this.recommendCoolPoints(trend);

    // 构建预测评分
    const predictedScore = this.buildPredictedScore(trend, chapterNumber);

    return {
      score: predictedScore,
      risks,
      improvements,
      chapterTypeAdvice,
      recommendedHooks,
      recommendedCoolPoints,
    };
  }

  /**
   * 分析趋势
   */
  private analyzeTrend(): RetentionTrend {
    if (this.history.length < 3) {
      return {
        trend: 'stable',
        averageScore: 75,
        changeRate: 0,
        forecast: [75, 75, 75, 75, 75],
      };
    }

    const recent = this.history.slice(-this.config.trendWindowSize);
    const scores = recent.map(s => s.total);
    
    // 计算平均分
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // 计算变化率
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const changeRate = (secondAvg - firstAvg) / firstAvg;
    
    // 判断趋势
    let trend: 'rising' | 'stable' | 'declining';
    if (changeRate > 0.05) {
      trend = 'rising';
    } else if (changeRate < -0.05) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }
    
    // 预测未来
    const forecast = this.forecastFuture(averageScore, changeRate);

    return { trend, averageScore, changeRate, forecast };
  }

  /**
   * 预测未来趋势
   */
  private forecastFuture(currentScore: number, changeRate: number): number[] {
    const forecast: number[] = [];
    let score = currentScore;
    
    for (let i = 0; i < this.config.forecastHorizon; i++) {
      score = score * (1 + changeRate * 0.5);
      forecast.push(Math.round(Math.max(0, Math.min(100, score))));
    }
    
    return forecast;
  }

  /**
   * 生成风险警告
   */
  private generateRisks(trend: RetentionTrend): RiskWarning[] {
    const risks: RiskWarning[] = [];
    
    // 低分警告
    if (trend.averageScore < this.config.warningThreshold) {
      risks.push({
        level: 'high',
        type: 'low-retention',
        description: `近${this.config.trendWindowSize}章平均追读力 ${trend.averageScore.toFixed(1)} 低于阈值 ${this.config.warningThreshold}`,
        suggestion: '建议优先提升爽点密度和章尾钩子质量',
      });
    }
    
    // 下降趋势警告
    if (trend.trend === 'declining') {
      risks.push({
        level: 'medium',
        type: 'declining-trend',
        description: `追读力呈下降趋势，变化率 ${(trend.changeRate * 100).toFixed(1)}%`,
        suggestion: '建议增加章节间的悬念连接，减少平淡章节',
      });
    }
    
    // 预测低于阈值
    const lowestForecast = Math.min(...trend.forecast);
    if (lowestForecast < this.config.dangerThreshold) {
      risks.push({
        level: 'critical',
        type: 'forecast-danger',
        description: `预测未来章节追读力可能降至 ${lowestForecast}`,
        suggestion: '需要重大剧情转折或爽点来扭转趋势',
      });
    }
    
    return risks;
  }

  /**
   * 生成改进建议
   */
  private generateImprovements(trend: RetentionTrend): string[] {
    const improvements: string[] = [];
    
    if (trend.trend === 'declining') {
      improvements.push('增加章尾悬念强度');
      improvements.push('提升爽点密度');
      improvements.push('缩短章节节奏');
    }
    
    if (trend.averageScore < 75) {
      improvements.push('加强 Hook 设计');
      improvements.push('增加情感波动');
    }
    
    return improvements.length > 0 ? improvements : ['保持当前节奏，质量良好'];
  }

  /**
   * 生成章节类型建议
   */
  private generateChapterTypeAdvice(chapterNumber: number, trend: RetentionTrend): ChapterTypeAdvice {
    // 根据趋势决定章节类型
    let recommendedType: 'normal' | 'climax' | 'transition' | 'setup';
    let reason: string;
    let excitementTarget: number;
    let cliffhangerIntensity: number;
    
    if (trend.trend === 'declining' || trend.averageScore < 70) {
      // 需要高潮来扭转趋势
      recommendedType = 'climax';
      reason = '需要高潮章节扭转下降趋势';
      excitementTarget = 9;
      cliffhangerIntensity = 9;
    } else if (trend.trend === 'rising') {
      // 上升趋势可以适当放松
      recommendedType = 'normal';
      reason = '上升趋势良好，保持节奏';
      excitementTarget = 7;
      cliffhangerIntensity = 7;
    } else {
      // 稳定期可以适当铺垫
      recommendedType = 'normal';
      reason = '追读力稳定，适当推进剧情';
      excitementTarget = 7;
      cliffhangerIntensity = 7;
    }
    
    return {
      currentChapter: chapterNumber,
      recommendedType,
      reason,
      excitementTarget,
      cliffhangerIntensity,
    };
  }

  /**
   * 推荐钩子类型
   */
  private recommendHooks(trend: RetentionTrend): string[] {
    if (trend.trend === 'declining') {
      return ['sudden_reveal', 'urgent_crisis', 'identity_reveal'];
    } else if (trend.trend === 'rising') {
      return ['unfinished_action', 'mysterious_item', 'countdown'];
    } else {
      return ['tough_choice', 'promise_threat', 'hidden_meaning'];
    }
  }

  /**
   * 推荐爽点类型
   */
  private recommendCoolPoints(trend: RetentionTrend): string[] {
    if (trend.trend === 'declining') {
      return ['face-slapping', 'power-display', 'identity-reveal'];
    } else {
      return ['growth', 'love-progress', 'treasure-find'];
    }
  }

  /**
   * 构建预测评分
   */
  private buildPredictedScore(trend: RetentionTrend, chapterNumber: number): ReadRetentionScore {
    const predictedTotal = Math.round(
      trend.averageScore * 0.8 + trend.forecast[0] * 0.2
    );

    return {
      total: predictedTotal,
      dimensions: {
        hookScore: {
          score: Math.round(predictedTotal * 1.05),
          analysis: { avgHookStrength: predictedTotal / 100 },
          suggestions: [],
        },
        coolpointScore: {
          score: predictedTotal,
          analysis: { density: 2.0, variety: 0.7 },
          suggestions: [],
        },
        microFulfillment: {
          score: predictedTotal,
          rate: 0.8,
          avgPromiseCount: 3,
          avgFulfillChapter: 1,
          analysis: '',
          suggestions: [],
        },
        suspenseDebt: {
          score: predictedTotal,
          pendingCount: 3,
          maxDebtChapters: 10,
          riskLevel: 'low',
          analysis: '',
          suggestions: [],
        },
        rhythmHealth: {
          score: predictedTotal,
          questContinuity: 0.8,
          fireConsistency: 0.75,
          constellationPacing: 0.7,
          analysis: '',
          suggestions: [],
        },
        originality: {
          score: 70,
          tropeCount: 1,
          uniqueElements: [],
          genericPatterns: [],
          analysis: '',
          suggestions: [],
        },
      },
      risks: [],
      improvements: [],
      genreMatch: {
        score: 80,
        expectedProfile: 'urban',
        actualCharacteristics: [],
        gap: '',
      },
    };
  }

  /**
   * 获取趋势分析
   */
  getTrend(): RetentionTrend | null {
    if (this.history.length < 3) return null;
    return this.analyzeTrend();
  }
}

export interface RetentionPredictorConfig {
  warningThreshold: number;
  dangerThreshold: number;
  trendWindowSize: number;
  forecastHorizon: number;
}

// ============================================================
// 单例
// ============================================================

let predictorInstance: RetentionPredictor | null = null;

export function getRetentionPredictor(): RetentionPredictor {
  if (!predictorInstance) {
    predictorInstance = new RetentionPredictor();
  }
  return predictorInstance;
}

export function createRetentionPredictor(config?: Partial<RetentionPredictorConfig>): RetentionPredictor {
  predictorInstance = new RetentionPredictor(config);
  return predictorInstance;
}
