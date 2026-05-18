/**
 * 市场趋势服务 v2
 * Moliu v2.0 - 基于网络数据的网文市场趋势分析服务
 * 
 * 职责：
 * 1. 获取各平台热门题材榜单
 * 2. 分析题材热度趋势
 * 3. 推荐潜力题材
 * 4. 生成趋势报告
 */

import { useMarketTrends } from "@/composables/new/useMarketTrends";

// ============================================================
// Types
// ============================================================

export interface TrendTag {
  id: string;
  name: string;
  category: string;
  trend: "rising" | "stable" | "declining";
  hotScore: number;
  growth: number;
  description: string;
  recommended?: boolean;
  platformData?: {
    platform: string;
    rank: number;
    trend: number;
  }[];
}

export interface MarketTrendReport {
  generatedAt: string;
  overallMarketHealth: "hot" | "warm" | "cold";
  topCategories: string[];
  risingTags: TrendTag[];
  decliningTags: TrendTag[];
  recommendations: {
    tag: string;
    reason: string;
    riskLevel: "low" | "medium" | "high";
  }[];
  seasonalFactors?: string[];
}

export interface GenreAnalysis {
  genre: string;
  marketSize: "large" | "medium" | "small";
  competition: "fierce" | "moderate" | "low";
  profitability: "high" | "medium" | "low";
  trends: string[];
  warnings: string[];
}

// ============================================================
// Service
// ============================================================

export class MarketTrendsService {
  private marketTrends: ReturnType<typeof useMarketTrends>;

  constructor() {
    this.marketTrends = useMarketTrends();
  }

  /**
   * 获取热门题材列表
   */
  getHotTags(limit?: number): TrendTag[] {
    const tags = this.marketTrends.getTrendingTags();

    // 按热度排序
    const sorted = [...tags].sort((a, b) => b.hotScore - a.hotScore);

    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * 获取上升趋势题材
   */
  getRisingTags(): TrendTag[] {
    return this.marketTrends.getTrendingTags().filter(t => t.trend === "rising");
  }

  /**
   * 获取题材分析
   */
  analyzeGenre(genre: string): GenreAnalysis {
    const tags = this.marketTrends.getTrendingTags();
    const genreTag = tags.find(t => t.name.includes(genre));

    const baseAnalysis: GenreAnalysis = {
      genre,
      marketSize: this.inferMarketSize(genre),
      competition: this.inferCompetition(genre),
      profitability: this.inferProfitability(genre),
      trends: genreTag?.description ? [genreTag.description] : [],
      warnings: this.getGenreWarnings(genre),
    };

    return baseAnalysis;
  }

  /**
   * 生成市场趋势报告
   */
  async generateReport(): Promise<MarketTrendReport> {
    const tags = this.marketTrends.getTrendingTags();

    // 计算市场热度
    const avgHotScore = tags.reduce((sum, t) => sum + t.hotScore, 0) / tags.length;
    let overallHealth: "hot" | "warm" | "cold" = "warm";
    if (avgHotScore >= 80) overallHealth = "hot";
    else if (avgHotScore < 60) overallHealth = "cold";

    // 获取上升和下降趋势
    const risingTags = tags.filter(t => t.trend === "rising" && t.growth >= 10);
    const decliningTags = tags.filter(t => t.trend === "declining" && t.growth <= -10);

    // 获取热门分类
    const categoryCounts = tags.reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.hotScore;
      return acc;
    }, {} as Record<string, number>);

    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    // 生成推荐
    const recommendations = this.generateRecommendations(risingTags);

    return {
      generatedAt: new Date().toISOString(),
      overallMarketHealth: overallHealth,
      topCategories,
      risingTags,
      decliningTags,
      recommendations,
      seasonalFactors: this.getSeasonalFactors(),
    };
  }

  /**
   * 获取题材对比分析
   */
  compareGenres(genre1: string, genre2: string): {
    winner: string;
    scores: Record<string, number>;
    analysis: string;
  } {
    const analysis1 = this.analyzeGenre(genre1);
    const analysis2 = this.analyzeGenre(genre2);

    const score1 = this.calculateGenreScore(analysis1);
    const score2 = this.calculateGenreScore(analysis2);

    return {
      winner: score1 >= score2 ? genre1 : genre2,
      scores: {
        [genre1]: score1,
        [genre2]: score2,
      },
      analysis: score1 > score2
        ? `${genre1} 在市场热度、竞争程度、盈利潜力方面更具优势`
        : `${genre2} 在市场热度、竞争程度、盈利潜力方面更具优势`,
    };
  }

  /**
   * 推荐适合新人的题材
   */
  recommendForBeginners(): TrendTag[] {
    const tags = this.marketTrends.getTrendingTags();

    // 筛选条件：竞争适中、有成熟套路可学习、盈利稳定
    return tags
      .filter(t => {
        const isLowCompetition = t.hotScore >= 70 && t.hotScore <= 85;
        const isStable = t.trend !== "declining";
        return isLowCompetition && isStable;
      })
      .sort((a, b) => b.hotScore - a.hotScore)
      .slice(0, 5);
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private calculateGenreScore(analysis: GenreAnalysis): number {
    let score = 0;

    // 市场大小
    if (analysis.marketSize === "large") score += 30;
    else if (analysis.marketSize === "medium") score += 20;
    else score += 10;

    // 竞争程度（反向）
    if (analysis.competition === "low") score += 30;
    else if (analysis.competition === "moderate") score += 20;
    else score += 10;

    // 盈利能力
    if (analysis.profitability === "high") score += 40;
    else if (analysis.profitability === "medium") score += 25;
    else score += 10;

    return score;
  }

  private inferMarketSize(genre: string): "large" | "medium" | "small" {
    const largeGenres = ["都市", "玄幻", "仙侠", "穿越"];
    const mediumGenres = ["科幻", "悬疑", "言情", "游戏"];

    if (largeGenres.some(g => genre.includes(g))) return "large";
    if (mediumGenres.some(g => genre.includes(g))) return "medium";
    return "small";
  }

  private inferCompetition(genre: string): "fierce" | "moderate" | "low" {
    const fierceGenres = ["都市", "总裁", "穿越"];
    const moderateGenres = ["玄幻", "修仙", "言情"];

    if (fierceGenres.some(g => genre.includes(g))) return "fierce";
    if (moderateGenres.some(g => genre.includes(g))) return "moderate";
    return "low";
  }

  private inferProfitability(genre: string): "high" | "medium" | "low" {
    const highGenres = ["都市", "玄幻", "仙侠"];
    const mediumGenres = ["言情", "穿越", "科幻"];

    if (highGenres.some(g => genre.includes(g))) return "high";
    if (mediumGenres.some(g => genre.includes(g))) return "medium";
    return "low";
  }

  private getGenreWarnings(genre: string): string[] {
    const warnings: string[] = [];

    if (genre.includes("总裁")) {
      warnings.push("同质化严重，需要创新突破");
    }
    if (genre.includes("穿越")) {
      warnings.push("套路成熟，需要独特设定");
    }
    if (genre.includes("玄幻")) {
      warnings.push("竞争激烈，建议找准细分定位");
    }

    return warnings;
  }

  private generateRecommendations(risingTags: TrendTag[]): MarketTrendReport["recommendations"] {
    return risingTags.slice(0, 3).map(tag => ({
      tag: tag.name,
      reason: `热度上升中(${tag.growth > 0 ? "+" : ""}${tag.growth}%)，${tag.description}`,
      riskLevel: tag.growth > 20 ? "medium" : "low",
    }));
  }

  private getSeasonalFactors(): string[] {
    const month = new Date().getMonth() + 1;
    const factors: string[] = [];

    // 季节性因素
    if (month >= 1 && month <= 2) {
      factors.push("春节期间，阅读量整体上升");
    }
    if (month >= 6 && month <= 8) {
      factors.push("暑假期间，学生群体活跃");
    }

    return factors;
  }
}

// ============================================================
// Export singleton factory
// ============================================================

let marketTrendsServiceInstance: MarketTrendsService | null = null;

export function createMarketTrendsService(): MarketTrendsService {
  if (!marketTrendsServiceInstance) {
    marketTrendsServiceInstance = new MarketTrendsService();
  }
  return marketTrendsServiceInstance;
}

export function getMarketTrendsService(): MarketTrendsService {
  return createMarketTrendsService();
}
