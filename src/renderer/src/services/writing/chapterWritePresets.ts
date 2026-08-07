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

/**
 * 单次 AI / chat-completion 请求的超时上限（SSOT）。
 *
 * scene-draft 单章需生成 2000 字以上正文，慢模型（如 deepseek-v4-flash）单次请求
 * 实测可达 3-5 分钟甚至更长。过短的超时会误杀正常长输出（曾因 120s 连续触发
 * socket hang up 导致整批续写失败）。
 *
 * 生产路径（createStructuredAIFromActiveProvider）与冒烟测试路径（realStructuredAI）
 * 必须共用此值，避免「测试能跑通、生产超时」的不对称。
 *
 * 注意：依赖此 AI 的 vitest 用例超时必须 ≥ 此值，否则 hung request 会先撞测试超时。
 */
export const AI_SINGLE_REQUEST_TIMEOUT_MS = 1_800_000; // 30 分钟
