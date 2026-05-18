/**
 * 市场趋势服务
 * 基于 oh-story-claudecode-main 的扫榜功能
 * 
 * 市场趋势 = 平台热点 + 题材趋势 + 差异化建议
 */

import { ref, computed } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface TrendingTag {
  name: string;
  popularity: number;       // 0-100 热度
  trend: 'rising' | 'stable' | 'falling';
  category: string;
  examples?: string[];     // 热门作品示例
}

export interface TrendAnalysis {
  platform: 'qidian' | 'fanqie' | 'jjjj' | 'general';
  updatedAt: string;
  topGenres: TrendingTag[];
  hotElements: TrendingTag[];
  risingTags: TrendingTag[];
  fallingTags: TrendingTag[];
}

export interface DifferentiationSuggestion {
  // 反套路方向
  antiTrope: string;
  // 核心卖点
  sellingPoint: string;
  // 风险提示
  riskWarning: string;
  // 市场空白
  marketGap: string;
  // 建议组合
  suggestedCombos: string[][];
}

export interface MarketInsight {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  recommendation: string;
}

// ============================================================
// 模拟数据（实际使用时替换为API调用）
// ============================================================

const MOCK_TRENDS: TrendAnalysis[] = [
  {
    platform: 'qidian',
    updatedAt: new Date().toISOString(),
    topGenres: [
      { name: '都市', popularity: 95, trend: 'stable', category: '题材' },
      { name: '玄幻', popularity: 90, trend: 'stable', category: '题材' },
      { name: '修仙', popularity: 85, trend: 'falling', category: '题材' },
      { name: '科幻', popularity: 80, trend: 'rising', category: '题材' },
    ],
    hotElements: [
      { name: '系统流', popularity: 92, trend: 'stable', category: '元素' },
      { name: '重生', popularity: 88, trend: 'stable', category: '元素' },
      { name: '穿越', popularity: 85, trend: 'falling', category: '元素' },
      { name: '无敌流', popularity: 75, trend: 'rising', category: '元素' },
      { name: '苟道流', popularity: 70, trend: 'rising', category: '元素' },
    ],
    risingTags: [
      { name: '星际', popularity: 75, trend: 'rising', category: '标签' },
      { name: '直播', popularity: 72, trend: 'rising', category: '标签' },
      { name: '鉴宝', popularity: 68, trend: 'rising', category: '标签' },
    ],
    fallingTags: [
      { name: '退婚流', popularity: 50, trend: 'falling', category: '标签' },
      { name: '废物流', popularity: 55, trend: 'falling', category: '标签' },
    ],
  },
  {
    platform: 'fanqie',
    updatedAt: new Date().toISOString(),
    topGenres: [
      { name: '都市', popularity: 95, trend: 'stable', category: '题材' },
      { name: '言情', popularity: 88, trend: 'stable', category: '题材' },
      { name: '现代言情', popularity: 85, trend: 'stable', category: '题材' },
      { name: '甜宠', popularity: 80, trend: 'rising', category: '题材' },
    ],
    hotElements: [
      { name: '霸总', popularity: 90, trend: 'stable', category: '元素' },
      { name: '重生', popularity: 85, trend: 'stable', category: '元素' },
      { name: '马甲', popularity: 82, trend: 'rising', category: '元素' },
      { name: '团宠', popularity: 78, trend: 'rising', category: '元素' },
    ],
    risingTags: [
      { name: '闪婚', popularity: 75, trend: 'rising', category: '标签' },
      { name: '豪门', popularity: 70, trend: 'rising', category: '标签' },
    ],
    fallingTags: [
      { name: '虐恋', popularity: 45, trend: 'falling', category: '标签' },
    ],
  },
];

// ============================================================
// Composable 定义
// ============================================================

export function useMarketTrends() {
  // 状态
  const trends = ref<TrendAnalysis[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const selectedPlatform = ref<'qidian' | 'fanqie' | 'jjjj' | 'general'>('general');

  // 计算属性
  const currentTrend = computed(() => {
    if (selectedPlatform.value === 'general') {
      return mergeTrends(trends.value);
    }
    return trends.value.find(t => t.platform === selectedPlatform.value) || null;
  });

  const topGenres = computed(() => {
    return currentTrend.value?.topGenres.filter(g => g.trend !== 'falling') || [];
  });

  const risingTags = computed(() => {
    return currentTrend.value?.risingTags || [];
  });

  const hotElements = computed(() => {
    return currentTrend.value?.hotElements || [];
  });

  // ============================================================
  // 获取趋势
  // ============================================================

  /**
   * 抓取所有平台趋势
   */
  async function fetchTrends(): Promise<void> {
    isLoading.value = true;
    error.value = null;

    try {
      // 模拟API延迟
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 实际使用时替换为真实API调用
      trends.value = MOCK_TRENDS;
    } catch (e) {
      error.value = '获取趋势失败，请重试';
      console.error('Failed to fetch trends:', e);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 抓取指定平台趋势
   */
  async function fetchPlatformTrend(platform: 'qidian' | 'fanqie' | 'jjjj'): Promise<TrendAnalysis | null> {
    isLoading.value = true;
    error.value = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      // 模拟API调用
      const trend = MOCK_TRENDS.find(t => t.platform === platform);
      if (trend) {
        // 更新或添加
        const index = trends.value.findIndex(t => t.platform === platform);
        if (index >= 0) {
          trends.value[index] = trend;
        } else {
          trends.value.push(trend);
        }
        return trend;
      }
      return null;
    } catch (e) {
      error.value = `获取${platform}趋势失败`;
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  // ============================================================
  // 差异化建议
  // ============================================================

  /**
   * 生成差异化建议
   */
  function generateDifferentiation(userSelection: {
    genres: string[];
    elements: string[];
  }): DifferentiationSuggestion {
    const genres = userSelection.genres;
    const elements = userSelection.elements;

    // 分析热门组合
    const hotCombos = analyzeHotCombos();

    // 检查是否与热门重叠
    const overlapping = genres.filter(g =>
      hotCombos.some(combo => combo.includes(g))
    );

    // 生成反套路建议
    const antiTrope = generateAntiTrope(genres, elements);

    // 生成市场空白建议
    const marketGap = findMarketGap(genres, elements);

    return {
      antiTrope,
      sellingPoint: generateSellingPoint(genres, elements),
      riskWarning: generateRiskWarning(genres, elements),
      marketGap,
      suggestedCombos: generateSuggestedCombos(genres, elements),
    };
  }

  /**
   * 分析热门组合
   */
  function analyzeHotCombos(): string[][] {
    const combos: string[][] = [];

    // 从当前趋势中提取热门组合
    if (currentTrend.value) {
      const genres = currentTrend.value.topGenres.map(g => g.name);
      const elements = currentTrend.value.hotElements.map(e => e.name);

      // 生成可能的组合
      for (const genre of genres.slice(0, 3)) {
        for (const element of elements.slice(0, 3)) {
          combos.push([genre, element]);
        }
      }
    }

    return combos;
  }

  /**
   * 生成反套路建议
   */
  function generateAntiTrope(genres: string[], elements: string[]): string {
    const suggestions: string[] = [];

    // 检查是否包含下降趋势的元素
    const fallingElements = currentTrend.value?.fallingTags || [];
    for (const tag of fallingElements) {
      if (elements.includes(tag.name)) {
        suggestions.push(`"${tag.name}"正在过气，建议增加新元素`);
      }
    }

    // 检查是否包含热门元素
    const hotElements = currentTrend.value?.hotElements || [];
    const isHot = elements.some(e =>
      hotElements.some(h => h.name === e)
    );

    if (isHot) {
      suggestions.push('当前组合较热门，可以考虑增加差异化设定');
    }

    // 检查题材组合
    if (genres.includes('都市') && genres.includes('修仙')) {
      suggestions.push('都市修仙混搭有独特性，可深挖');
    }

    return suggestions.length > 0
      ? suggestions.join('；')
      : '当前组合较为独特，保持优势';
  }

  /**
   * 生成市场空白建议
   */
  function findMarketGap(genres: string[], elements: string[]): string {
    const gaps: string[] = [];

    // 检查冷门但有潜力的元素
    const rising = currentTrend.value?.risingTags || [];
    const notUsedRising = rising.filter(t =>
      !genres.includes(t.name) && !elements.includes(t.name)
    );

    if (notUsedRising.length > 0) {
      gaps.push(`可考虑"${notUsedRising[0].name}"元素，当前热度上升`);
    }

    // 检查未覆盖的题材
    const topGenres = currentTrend.value?.topGenres || [];
    const notUsedGenres = topGenres.filter(t =>
      t.trend !== 'falling' &&
      !genres.includes(t.name)
    );

    if (notUsedGenres.length > 0 && genres.length < 3) {
      gaps.push(`可考虑增加"${notUsedGenres[0].name}"题材`);
    }

    return gaps.length > 0
      ? gaps.join('；')
      : '建议深耕现有组合，打造差异化优势';
  }

  /**
   * 生成核心卖点
   */
  function generateSellingPoint(genres: string[], elements: string[]): string {
    // 简单的卖点生成逻辑
    if (genres.includes('都市') && elements.includes('直播')) {
      return '都市直播题材，紧跟时代热点，主角逆袭路线清晰';
    }
    if (genres.includes('都市') && elements.includes('重生')) {
      return '都市重生题材，主角带着前世记忆逆袭';
    }
    if (genres.includes('玄幻') && elements.includes('系统')) {
      return '玄幻系统流，主角升级路线明确';
    }
    return '独特组合，差异化明显';
  }

  /**
   * 生成风险提示
   */
  function generateRiskWarning(genres: string[], elements: string[]): string {
    const warnings: string[] = [];

    // 检查是否太热门
    const isOvercrowded = genres.length >= 2 &&
      elements.filter(e =>
        currentTrend.value?.hotElements.some(h => h.name === e)
      ).length >= 2;

    if (isOvercrowded) {
      warnings.push('当前赛道拥挤，需要突出差异化');
    }

    // 检查题材稳定性
    const fallingGenres = currentTrend.value?.fallingTags || [];
    if (genres.some(g => fallingGenres.some(f => f.name === g))) {
      warnings.push('部分题材热度下降');
    }

    return warnings.length > 0
      ? warnings.join('；')
      : '整体风险可控';
  }

  /**
   * 生成建议组合
   */
  function generateSuggestedCombos(genres: string[], elements: string[]): string[][] {
    const combos: string[][] = [];
    const hot = currentTrend.value?.hotElements || [];
    const rising = currentTrend.value?.risingTags || [];

    // 生成2-3个建议组合
    for (const element of hot.slice(0, 2)) {
      for (const genre of genres.slice(0, 2)) {
        if (!elements.includes(element.name)) {
          combos.push([genre, element.name]);
        }
      }
    }

    // 添加上升中的元素
    for (const tag of rising.slice(0, 2)) {
      if (!elements.includes(tag.name)) {
        combos.push([genres[0] || '都市', tag.name]);
      }
    }

    return combos.slice(0, 3);
  }

  // ============================================================
  // 市场洞察
  // ============================================================

  /**
   * 获取市场洞察
   */
  function getMarketInsights(): MarketInsight[] {
    const insights: MarketInsight[] = [];

    // 平台趋势洞察
    if (currentTrend.value) {
      const rising = currentTrend.value.risingTags.slice(0, 2);
      if (rising.length > 0) {
        insights.push({
          title: '新兴题材崛起',
          description: `${rising[0].name}题材热度上升中`,
          impact: 'high',
          recommendation: '可以考虑结合当前题材',
        });
      }
    }

    // 差异化洞察
    insights.push({
      title: '差异化建议',
      description: '建议在热门题材中寻找细分赛道',
      impact: 'medium',
      recommendation: '深耕垂直领域，打造独特卖点',
    });

    return insights;
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  /**
   * 合并多平台趋势
   */
  function mergeTrends(trendList: TrendAnalysis[]): TrendAnalysis {
    if (trendList.length === 0) {
      return {
        platform: 'general',
        updatedAt: new Date().toISOString(),
        topGenres: [],
        hotElements: [],
        risingTags: [],
        fallingTags: [],
      };
    }

    // 合并所有平台数据
    const allGenres = trendList.flatMap(t => t.topGenres);
    const allElements = trendList.flatMap(t => t.hotElements);
    const allRising = trendList.flatMap(t => t.risingTags);
    const allFalling = trendList.flatMap(t => t.fallingTags);

    // 去重并按热度排序
    const uniqueGenres = deduplicateAndSort(allGenres);
    const uniqueElements = deduplicateAndSort(allElements);
    const uniqueRising = deduplicateAndSort(allRising);
    const uniqueFalling = deduplicateAndSort(allFalling);

    return {
      platform: 'general',
      updatedAt: new Date().toISOString(),
      topGenres: uniqueGenres.slice(0, 10),
      hotElements: uniqueElements.slice(0, 10),
      risingTags: uniqueRising.slice(0, 10),
      fallingTags: uniqueFalling.slice(0, 10),
    };
  }

  function deduplicateAndSort(tags: TrendingTag[]): TrendingTag[] {
    const map = new Map<string, TrendingTag>();

    for (const tag of tags) {
      const existing = map.get(tag.name);
      if (!existing || existing.popularity < tag.popularity) {
        map.set(tag.name, tag);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.popularity - a.popularity);
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 状态
    trends,
    isLoading,
    error,
    selectedPlatform,

    // 计算属性
    currentTrend,
    topGenres,
    risingTags,
    hotElements,

    // 方法
    fetchTrends,
    fetchPlatformTrend,
    generateDifferentiation,
    getMarketInsights,
  };
}
