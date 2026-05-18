/**
 * 追读力评估系统
 * 基于 webnovel-writer-master 的追读力评分 + oh-story-claudecode 的爽点设计
 * 
 * 追读力评分 = Hook力 + 爽点密度 + 微兑现率 + 悬念债务 + 节奏健康度 + 原创性
 */

import { computed, ref } from 'vue';
import type {
  ReadRetentionScore,
  ReadRetentionDimensions,
  HookScore,
  CoolPointScore,
  GenreMatch,
  RiskWarning,
  GenreProfile,
} from '@/types/evaluation';
import type { CoolPointType } from '@/types/evaluation';
import {
  GENRE_PROFILES,
  matchGenreProfile,
  getRecommendedOpeningHooks,
  getRecommendedChapterEndHooks,
} from '@/data/genre-profiles';
import { getRecommendedHooksForGenre } from '@/data/hook-techniques';
import {
  getRecommendedCoolPoints,
  validateCoolPointRhythm,
  COOLPOINT_RHYTHM,
} from '@/data/coolpoint-formulas';

// ============================================================
// 用户选择类型
// ============================================================

export interface UserSelection {
  genres: string[];
  elements: string[];
  coolPointTypes?: CoolPointType[];
  targetWordCount?: number;
  chapterCount?: number;
}

// ============================================================
// Composable 定义
// ============================================================

export function useInspirationEvaluation() {
  // 当前评估结果
  const currentScore = ref<ReadRetentionScore | null>(null);
  const currentSelection = ref<UserSelection | null>(null);

  // ============================================================
  // 计算追读力评分
  // ============================================================

  /**
   * 计算追读力评分
   */
  function calculateReadRetention(selection: UserSelection): ReadRetentionScore {
    currentSelection.value = selection;

    const genres = selection.genres;
    const matchedProfile = matchGenreProfile(genres);

    // 计算各项分数
    const hookScore = calculateHookScore(selection, matchedProfile);
    const coolpointScore = calculateCoolpointScore(selection, matchedProfile);
    const microFulfillment = calculateMicroFulfillment(selection, matchedProfile);
    const suspenseDebt = calculateSuspenseDebt(selection, matchedProfile);
    const rhythmHealth = calculateRhythmHealth(selection, matchedProfile);
    const originality = calculateOriginality(selection);

    // 计算总分
    const dimensions: ReadRetentionDimensions = {
      hookScore,
      coolpointScore,
      microFulfillment,
      suspenseDebt,
      rhythmHealth,
      originality,
    };

    const total = Math.round(
      hookScore.score * 0.2 +
      coolpointScore.score * 0.25 +
      microFulfillment.score * 0.15 +
      suspenseDebt.score * 0.15 +
      rhythmHealth.score * 0.15 +
      originality.score * 0.1
    );

    // 生成风险警告
    const risks = generateRisks(selection, matchedProfile, dimensions);

    // 生成改进建议
    const improvements = generateImprovements(selection, matchedProfile, dimensions);

    // 题材匹配度
    const genreMatch: GenreMatch = {
      score: calculateGenreMatchScore(selection, matchedProfile),
      expectedProfile: matchedProfile.name,
      actualCharacteristics: genres,
      gap: evaluateGenreGap(selection, matchedProfile),
    };

    const score: ReadRetentionScore = {
      total,
      dimensions,
      risks,
      improvements,
      genreMatch,
    };

    currentScore.value = score;
    return score;
  }

  // ============================================================
  // Hook评分
  // ============================================================

  function calculateHookScore(
    selection: UserSelection,
    profile: GenreProfile
  ): HookScore {
    let score = 65; // 基础分

    // 题材加成
    const hookTechniques = getRecommendedHooksForGenre(profile.id);
    if (hookTechniques.length >= 3) score += 10;

    // 题材推荐密度加成
    score += profile.hooks.recommendedDensity * 10;

    // 元素加成
    const hookElements = ['悬念', '危机', '冲突', '反转', '揭秘', '紧张', '神秘'];
    const hasHookElement = selection.elements.some(e =>
      hookElements.some(h => e.includes(h))
    );
    if (hasHookElement) score += 10;

    // 多样性加成
    if (selection.genres.length >= 2) score += 5;

    // 扣分项
    if (selection.genres.includes('都市') && selection.genres.includes('修仙')) {
      score -= 5; // 题材冲突可能影响节奏
    }

    score = Math.min(100, Math.max(0, score));

    // 生成分析
    const suggestions: string[] = [];
    if (score < 70) {
      suggestions.push('建议增加悬念/危机元素');
    }
    if (score >= 80) {
      suggestions.push('钩子设计优秀，建议保持');
    }

    // 推荐钩子类型
    const recommendedHooks = getRecommendedOpeningHooks(selection.genres);

    return {
      score,
      analysis: {
        openingHook: {
          type: recommendedHooks[0] || 'conflict',
          strength: score / 100,
          executed: score >= 70,
        },
        chapterEndHooks: [],
        avgHookStrength: score / 100,
        weakChapters: [],
      },
      suggestions,
    };
  }

  // ============================================================
  // 爽点评分
  // ============================================================

  function calculateCoolpointScore(
    selection: UserSelection,
    profile: GenreProfile
  ): CoolPointScore {
    let score = 60; // 基础分

    // 爽点类型匹配
    const primaryCoolpoints = ['打脸', '装逼', '身份掉马', '成长', '突破'];
    const matchCount = selection.elements.filter(e =>
      primaryCoolpoints.some(cp => e.includes(cp))
    ).length;
    score += matchCount * 8;

    // 题材加成
    score += Math.round(profile.coolpoints.density.optimal * 10);

    // 多样性加成
    const variety = Math.min(1, selection.elements.length / 5);
    score += variety * 10;

    // 指定的爽点类型加成
    if (selection.coolPointTypes && selection.coolPointTypes.length > 0) {
      const recommended = getRecommendedCoolPoints(selection.genres);
      const overlap = selection.coolPointTypes.filter(t =>
        recommended.some(r => r.type === t)
      ).length;
      score += overlap * 5;
    }

    score = Math.min(100, Math.max(0, score));

    const suggestions: string[] = [];
    if (score < 70) {
      suggestions.push('建议增加爽点类型');
    }
    if (matchCount < 2) {
      suggestions.push('当前爽点设计较单一');
    }
    if (score >= 80) {
      suggestions.push('爽点配置丰富');
    }

    return {
      score,
      analysis: {
        byType: {} as any,
        density: profile.coolpoints.density.optimal,
        variety,
        climaxDistribution: [],
        drySpells: [],
      },
      suggestions,
    };
  }

  // ============================================================
  // 微兑现评分
  // ============================================================

  function calculateMicroFulfillment(
    selection: UserSelection,
    profile: GenreProfile
  ): ReadRetentionDimensions['microFulfillment'] {
    // 短期承诺兑现率
    const baseRate = 0.7;
    const genreBonus = (profile.pacing.questContinuityMax / 10) * 0.1;
    const rate = Math.min(0.95, baseRate + genreBonus);

    // 评估字数与章节数
    const wordCount = selection.targetWordCount || 300000;
    const chapterCount = selection.chapterCount || 100;
    const avgWordsPerChapter = wordCount / chapterCount;

    // 计算平均承诺数
    let avgPromiseCount = 3;
    if (avgWordsPerChapter > 4000) avgPromiseCount = 4;
    if (avgWordsPerChapter < 2000) avgPromiseCount = 2;

    // 计算平均兑现章节
    const avgFulfillChapter = Math.max(1, Math.round(profile.coolpoints.comboInterval * 0.5));

    const score = Math.round(rate * 100);

    return {
      score,
      rate,
      avgPromiseCount,
      avgFulfillChapter,
      analysis: `建议每${avgPromiseCount}章兑现一次小承诺`,
      suggestions: [
        '保持承诺兑现节奏',
        '大承诺可用多章铺垫',
      ],
    };
  }

  // ============================================================
  // 悬念债务评分
  // ============================================================

  function calculateSuspenseDebt(
    selection: UserSelection,
    profile: GenreProfile
  ): ReadRetentionDimensions['suspenseDebt'] {
    // 悬念债务评估
    const basePending = 3;
    const wordCount = selection.targetWordCount || 300000;

    // 长篇可以有更多悬念
    let pendingCount = basePending;
    if (wordCount > 500000) pendingCount = 5;
    if (wordCount > 1000000) pendingCount = 7;

    // 题材影响
    if (selection.genres.includes('悬疑') || selection.genres.includes('推理')) {
      pendingCount += 3;
    }

    // 最大债务章节
    const maxDebtChapters = profile.pacing.constellationInterval.max;

    // 风险等级
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (pendingCount > 7) riskLevel = 'high';
    else if (pendingCount > 5) riskLevel = 'medium';
    else if (pendingCount > 3) riskLevel = 'low';

    // 分数计算
    const score = Math.max(20, 100 - pendingCount * 10);

    return {
      score,
      pendingCount,
      maxDebtChapters,
      riskLevel,
      analysis: riskLevel === 'low'
        ? '悬念债务可控'
        : '悬念积累较多，建议适时揭示',
      suggestions: riskLevel === 'medium' || riskLevel === 'high'
        ? ['建议在关键节点揭示部分悬念', '控制悬念总数']
        : [],
    };
  }

  // ============================================================
  // 节奏健康度评分
  // ============================================================

  function calculateRhythmHealth(
    selection: UserSelection,
    profile: GenreProfile
  ): ReadRetentionDimensions['rhythmHealth'] {
    // Quest连续性
    const questContinuity = Math.max(0.3, 1 - (profile.pacing.questContinuityMax - 5) * 0.1);

    // Fire线稳定性
    const fireConsistency = Math.max(0.3, 1 - (profile.pacing.fireBreakMax - 10) * 0.05);

    // Constellation揭示节奏
    const constellationPacing = Math.min(
      1,
      (profile.pacing.constellationInterval.max / 20)
    );

    const score = Math.round(
      (questContinuity * 0.4 + fireConsistency * 0.3 + constellationPacing * 0.3) * 100
    );

    const suggestions: string[] = [];
    if (questContinuity < 0.7) {
      suggestions.push('建议增加Quest线连续性');
    }
    if (fireConsistency < 0.7) {
      suggestions.push('建议增加感情线更新频率');
    }

    return {
      score,
      questContinuity,
      fireConsistency,
      constellationPacing,
      analysis: '节奏整体健康' + (score >= 70 ? '，保持当前节奏' : ''),
      suggestions,
    };
  }

  // ============================================================
  // 原创性评分
  // ============================================================

  function calculateOriginality(selection: UserSelection): ReadRetentionDimensions['originality'] {
    // 基础分
    let score = 70;

    // 检查常见套路组合
    const commonCombos = [
      ['废物流', '系统流', '逆袭打脸'],
      ['重生', '都市', '逆袭打脸'],
      ['总裁', '甜宠', '误会重重'],
      ['穿越', '宫斗', '权力斗争'],
    ];

    let matchCount = 0;
    const selectedItems = [...selection.genres, ...selection.elements];

    for (const combo of commonCombos) {
      const matched = combo.filter(item =>
        selectedItems.some(selected => selected.includes(item))
      ).length;
      if (matched >= 2) matchCount++;
    }

    // 套路越多，原创性越低
    score -= matchCount * 15;

    // 检查独特元素
    const uniqueElements = ['赛博朋克', '星际', '洪荒', '规则怪谈', '机械改造', '多重人格'];
    const hasUnique = selection.elements.some(e =>
      uniqueElements.some(u => e.includes(u))
    );
    if (hasUnique) score += 10;

    score = Math.min(100, Math.max(0, score));

    const genericPatterns: string[] = [];
    if (matchCount >= 1) genericPatterns.push('经典套路组合');

    return {
      score,
      tropeCount: matchCount,
      uniqueElements: hasUnique ? ['赛博朋克', '星际'].filter(e =>
        selection.elements.some(el => el.includes(e))
      ) : [],
      genericPatterns,
      analysis: score >= 70 ? '创意较为独特' : '套路较为常见',
      suggestions: score < 70
        ? ['建议增加独特元素', '考虑反套路设计']
        : [],
    };
  }

  // ============================================================
  // 题材匹配度
  // ============================================================

  function calculateGenreMatchScore(
    selection: UserSelection,
    profile: GenreProfile
  ): number {
    const matchCount = selection.genres.filter(g =>
      profile.name.includes(g) || g.includes(profile.name)
    ).length;

    return Math.round((matchCount / Math.max(1, selection.genres.length)) * 100);
  }

  function evaluateGenreGap(
    selection: UserSelection,
    profile: GenreProfile
  ): string {
    const gaps: string[] = [];

    // 检查爽点类型差距
    const recommendedCP = profile.coolpoints.primary;
    const hasCP = selection.elements.filter(e =>
      recommendedCP.some(cp => e.includes(cp.replace('-', '')))
    ).length;

    if (hasCP === 0) {
      gaps.push(`缺少推荐的爽点类型：${recommendedCP.slice(0, 2).join('、')}`);
    }

    return gaps.length > 0 ? gaps.join('；') : '匹配良好';
  }

  // ============================================================
  // 风险警告
  // ============================================================

  function generateRisks(
    selection: UserSelection,
    profile: GenreProfile,
    dimensions: ReadRetentionDimensions
  ): RiskWarning[] {
    const risks: RiskWarning[] = [];

    // 题材冲突风险
    if (selection.genres.includes('都市') && selection.genres.includes('修仙')) {
      risks.push({
        level: 'warning',
        type: 'genre-mismatch',
        description: '都市和修仙混搭可能有世界观冲突',
        affectedChapters: [],
        suggestion: '明确主要背景，建议以一个为主',
      });
    }

    // 爽点过少风险
    if (dimensions.coolpointScore.score < 60) {
      risks.push({
        level: 'warning',
        type: 'low-coolpoint',
        description: '爽点配置较少，可能影响阅读体验',
        affectedChapters: [],
        suggestion: '增加打脸、装逼等经典爽点元素',
      });
    }

    // 悬念债务风险
    if (dimensions.suspenseDebt.riskLevel === 'high' || dimensions.suspenseDebt.riskLevel === 'critical') {
      risks.push({
        level: 'warning',
        type: 'high-suspense-debt',
        description: '悬念积累过多，可能让读者疲劳',
        affectedChapters: [],
        suggestion: '建议在关键节点揭示部分悬念',
      });
    }

    // 节奏风险
    if (dimensions.rhythmHealth.questContinuity < 0.6) {
      risks.push({
        level: 'info',
        type: 'rhythm-issue',
        description: 'Quest线连续性不足',
        affectedChapters: [],
        suggestion: '保持主线持续推进',
      });
    }

    return risks;
  }

  // ============================================================
  // 改进建议
  // ============================================================

  function generateImprovements(
    selection: UserSelection,
    profile: GenreProfile,
    dimensions: ReadRetentionDimensions
  ): string[] {
    const improvements: string[] = [];

    // Hook改进
    if (dimensions.hookScore.score < 75) {
      improvements.push('增加悬念/危机元素，提升Hook力');
    }

    // 爽点改进
    if (dimensions.coolpointScore.score < 70) {
      improvements.push('增加打脸、装逼等爽点类型');
    }

    // 原创性改进
    if (dimensions.originality.score < 65) {
      improvements.push('考虑增加独特元素或反套路设计');
    }

    // 推荐钩子
    if (improvements.length === 0) {
      const recommendedHooks = getRecommendedChapterEndHooks(selection.genres);
      if (recommendedHooks.length > 0) {
        improvements.push(`推荐章尾钩子类型：${recommendedHooks.slice(0, 2).join('、')}`);
      }
    }

    return improvements;
  }

  // ============================================================
  // 快速评估（用于灵感探索）
  // ============================================================

  /**
   * 快速评估（简化版）
   */
  function quickEvaluate(selection: UserSelection): {
    score: number;
    level: 'excellent' | 'good' | 'average' | 'poor';
    summary: string;
  } {
    const score = calculateReadRetention(selection);

    let level: 'excellent' | 'good' | 'average' | 'poor';
    if (score.total >= 80) level = 'excellent';
    else if (score.total >= 70) level = 'good';
    else if (score.total >= 60) level = 'average';
    else level = 'poor';

    const summaries: Record<typeof level, string> = {
      excellent: '追读力优秀，建议保持当前配置',
      good: '追读力良好，可小幅优化',
      average: '追读力一般，建议增加爽点或悬念',
      poor: '追读力较弱，建议重新规划',
    };

    return {
      score: score.total,
      level,
      summary: summaries[level],
    };
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 状态
    currentScore,
    currentSelection,

    // 方法
    calculateReadRetention,
    quickEvaluate,

    // 爽点节奏公式（暴露给UI）
    coolpointRhythm: COOLPOINT_RHYTHM,

    // 推荐的钩子类型（暴露给UI）
    getRecommendedOpeningHooks,
    getRecommendedChapterEndHooks,

    // 推荐的爽点类型
    getRecommendedCoolPoints,

    // 题材Profile
    getGenreProfile: (id: string) => GENRE_PROFILES.find(p => p.id === id),
    matchGenreProfile,
  };
}
