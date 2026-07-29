/**
 * 单章写作管道场景预设（SSOT）
 *
 * 智能续写 / 批量续写共用 ChapterWritingPipeline，差异只体现在选项：
 * - enablePreflight：智能续写默认开；批量默认关（加速）
 * - enableSupplement：两边默认都开（字数不足自动补写）
 * - useTaskBook：两边默认都开
 *
 * 调用方应优先使用预设，避免魔法布尔值散落。
 */

/** 管道场景可选开关 */
export interface ChapterWriteOptionFlags {
  useTaskBook: boolean;
  enablePreflight: boolean;
  enableSupplement: boolean;
}

/** 智能续写（一键 / V2）：完整预检 + 任务书 + 补字 */
export const SMART_CONTINUE_PRESET: ChapterWriteOptionFlags = {
  useTaskBook: true,
  enablePreflight: true,
  enableSupplement: true,
};

/** 批量续写：跳过预检加速，仍保留任务书 + 补字 */
export const BATCH_CONTINUE_PRESET: ChapterWriteOptionFlags = {
  useTaskBook: true,
  enablePreflight: false,
  enableSupplement: true,
};

/**
 * 合并预设与调用方覆盖项。
 * 覆盖项中的 undefined 不覆盖预设。
 */
export function resolveChapterWriteOptions(
  preset: ChapterWriteOptionFlags,
  overrides?: Partial<ChapterWriteOptionFlags>
): ChapterWriteOptionFlags {
  return {
    useTaskBook: overrides?.useTaskBook ?? preset.useTaskBook,
    enablePreflight: overrides?.enablePreflight ?? preset.enablePreflight,
    enableSupplement: overrides?.enableSupplement ?? preset.enableSupplement,
  };
}
