import type { Foreshadow } from '@/types/project';

/**
 * 伏笔「规划 vs 实际埋设」双阶段生命周期。
 *
 * 背景：大纲预埋伏笔的 setupChapter 是全书规划章号（千章书里可达 488/695），
 * 落库时若直接当 createdChapter 用并标 buried，会在已写章节数远小于规划值时
 * 污染三处下游：紧急度计算（进度比 >1 恒为 critical）、写作 prompt 的相关性
 * 过滤（|createdChapter - 当前章| > 3 永不命中）、判官的 openForeshadows 清单。
 *
 * 约定：
 * - status='planned'：仅存在于大纲，正文还没写到埋设点；
 * - status='buried' 及之后：正文已实际埋设，createdChapter 为实际埋设章号；
 * - actualPlantedChapter：正文确认埋设时回填，planned 阶段不定义。
 */

/** 旧数据/调用方未传 plannedChapterCount 时的兜底规模 */
const DEFAULT_PLANNED_CHAPTERS = 100;

export interface ForeshadowUrgency {
  level: 'critical' | 'high' | 'medium' | 'low';
  /** 0-100，供排序与平均分 */
  score: number;
}

/**
 * 归一化一条伏笔的创建侧数据。
 *
 * 规则：setupChapter 超出「已写到/正在写的章号」时视为规划值——状态退回
 * planned、createdChapter 暂记规划章（保持可追溯）、清掉 actualPlantedChapter。
 * setupChapter 缺失时维持原状（旧项目兼容）。
 */
export function normalizeForeshadow(
  foreshadow: Foreshadow,
  writtenChapterCount: number
): Foreshadow {
  if (foreshadow.status === 'resolved') return foreshadow;

  const setupChapter = foreshadow.setupChapter ?? foreshadow.actualPlantedChapter;
  // 已实际埋设（有 actualPlantedChapter 且落在已写范围内）的保持 buried 语义
  const planted = foreshadow.actualPlantedChapter;
  if (planted !== undefined && planted <= writtenChapterCount) {
    return {
      ...foreshadow,
      createdChapter: planted,
    };
  }

  if (
    setupChapter !== undefined &&
    setupChapter > writtenChapterCount &&
    foreshadow.status !== 'planned'
  ) {
    return {
      ...foreshadow,
      status: 'planned',
      createdChapter: setupChapter,
      actualPlantedChapter: undefined,
    };
  }
  return foreshadow;
}

/** 正文确认埋设：写入实际章号并转入 buried。幂等，重复调用只推进不回退。 */
export function markForeshadowPlanted(
  foreshadow: Foreshadow,
  chapterNumber: number
): Foreshadow {
  if (foreshadow.status === 'resolved') return foreshadow;
  return {
    ...foreshadow,
    status: 'buried',
    createdChapter: chapterNumber,
    actualPlantedChapter: chapterNumber,
  };
}

/** 伏笔是否已计入「应回收」统计（planned 尚未埋设，不该催收）。 */
export function isPlanted(foreshadow: Foreshadow): boolean {
  return foreshadow.status !== 'planned';
}

/**
 * 统一紧急度口径。
 *
 * plantedChapter 用实际埋设章；planned 状态的伏笔只按「距规划埋设点的距离」
 * 给提示级权重（low/medium），不再参与「埋设进度比」——那正是旧实现
 * plantedProgress = 488/100 失真的来源。
 */
export function calculateForeshadowUrgency(
  foreshadow: Foreshadow,
  currentChapter: number,
  plannedChapterCount?: number
): ForeshadowUrgency {
  const plannedCount = plannedChapterCount && plannedChapterCount > 0
    ? plannedChapterCount
    : DEFAULT_PLANNED_CHAPTERS;

  if (foreshadow.status === 'planned') {
    const setup = foreshadow.setupChapter ?? foreshadow.createdChapter;
    // 已到/过规划埋设点仍未埋 → 提示升级；未到点保持 low
    const distance = setup - currentChapter;
    if (distance <= 0) return { level: 'medium', score: 45 };
    if (distance <= 3) return { level: 'low', score: 30 };
    return { level: 'low', score: 10 };
  }

  const plantedChapter = foreshadow.actualPlantedChapter ?? foreshadow.createdChapter;
  const expected = foreshadow.suggestedResolutionChapter ?? foreshadow.payoffChapter;

  if (expected) {
    const remaining = expected - currentChapter;
    if (remaining <= 0) return { level: 'critical', score: 100 };
    if (remaining <= 3) return { level: 'high', score: 75 };
    if (remaining <= 5) return { level: 'medium', score: 50 };
    return { level: 'low', score: 25 };
  }

  const plantedProgress = plantedChapter / plannedCount;
  const currentProgress = currentChapter / plannedCount;
  if (plantedProgress > 0.8 && currentProgress > 0.9) return { level: 'critical', score: 100 };
  if (plantedProgress > 0.6 && currentProgress > 0.75) return { level: 'high', score: 75 };
  if (plantedProgress > 0.4 && currentProgress > 0.5) return { level: 'medium', score: 50 };
  return { level: 'low', score: 25 };
}
