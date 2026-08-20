/**
 * 卷归属推导：把全局章号映射到卷实体。
 *
 * 卷规划（volumePlans.chapterRange）声明了每卷覆盖的章节区间时按真实区间定位；
 * 旧项目/旧大纲没有区间时按 estimatedChaptersPerVolume 估算——这是
 * outline-roller.buildVolumeAnchor 的既有口径，收敛到这里避免多处实现漂移。
 */

import type { Chapter, Volume } from '@/types/project';

/** metadata.volumePlans 条目的最小结构（避免与 Project 类型循环引用） */
export interface VolumePlanLike {
  volumeIndex?: number;
  chapterRange?: { start: number; end: number };
}

interface VolumeAssignmentSource {
  volumes: Volume[];
  volumePlans: VolumePlanLike[];
  estimatedChaptersPerVolume?: number;
}

/** 卷区间是否可信：至少两卷、每卷都带区间且能覆盖第 1 章 */
function hasTrustedRanges(volumePlans: VolumePlanLike[]): boolean {
  if (volumePlans.length < 2) return false;
  return volumePlans.every(plan => {
    const range = plan.chapterRange;
    return range && range.start >= 1 && range.end >= range.start;
  });
}

/**
 * 推导章节 → 卷的下标（volumes 数组下标，非 volumeIndex）。
 * 章号超出覆盖范围（滚动续写越过末卷区间）时钳到最后一卷。
 * 推导不出（无卷规划）返回 0，由调用方决定兜底。
 */
export function volumeIndexForChapter(
  chapterNumber: number,
  source: VolumeAssignmentSource,
): number {
  const volumeCount = source.volumes.length;
  if (volumeCount <= 1) return 0;

  if (hasTrustedRanges(source.volumePlans)) {
    const hit = source.volumePlans.findIndex(
      plan =>
        chapterNumber >= (plan.chapterRange!.start ?? 1)
        && chapterNumber <= (plan.chapterRange!.end ?? Number.MAX_SAFE_INTEGER),
    );
    if (hit >= 0) return Math.min(hit, volumeCount - 1);
    const last = source.volumePlans.length - 1;
    const beyondLast =
      last >= 0 && chapterNumber > (source.volumePlans[last].chapterRange?.end ?? 0);
    if (beyondLast) return volumeCount - 1;
    return 0;
  }

  // 估算回退：按每卷估算章数做除法（与 outline-roller 旧口径一致，默认 40）
  const estimated = source.estimatedChaptersPerVolume;
  const perVolume = estimated && estimated > 0 ? estimated : 40;
  return Math.min(Math.floor((chapterNumber - 1) / perVolume), volumeCount - 1);
}

/** 建章用：给定章号拿 volumeId。卷列表为空时返回 undefined，由调用方建默认卷 */
export function volumeIdForChapter(
  chapterNumber: number,
  source: VolumeAssignmentSource,
): string | undefined {
  const sorted = [...source.volumes].sort((a, b) => a.orderIndex - b.orderIndex);
  return sorted[volumeIndexForChapter(chapterNumber, source)]?.id;
}

/** 从项目实体提取推导源（生产路径的便捷入口） */
export function volumeAssignmentSourceFromProject(project: {
  volumes: Volume[];
  metadata?: {
    volumePlans?: VolumePlanLike[];
    storyScale?: { estimatedChaptersPerVolume?: number };
  };
}): VolumeAssignmentSource {
  return {
    volumes: project.volumes ?? [],
    volumePlans: project.metadata?.volumePlans ?? [],
    estimatedChaptersPerVolume: project.metadata?.storyScale?.estimatedChaptersPerVolume,
  };
}

/**
 * 按卷区间批量重排既有章节的 volumeId（章节实体已存在、卷规划后来才落地区间时用）。
 * 只做确定性重挂：章号按全局 orderIndex 排序后依次分配。返回有变化 的章节。
 */
export function reassignChapterVolumes(
  chapters: Chapter[],
  source: VolumeAssignmentSource,
): Chapter[] {
  const sorted = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  const changed: Chapter[] = [];
  sorted.forEach((chapter, index) => {
    const volumeId = volumeIdForChapter(index + 1, source);
    if (volumeId && chapter.volumeId !== volumeId) {
      changed.push({ ...chapter, volumeId });
    }
  });
  return changed;
}
