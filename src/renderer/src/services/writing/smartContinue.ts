/**
 * 智能续写单一入口（SSOT）
 *
 * App（WritingOrchestratorV2）与冒烟/harness 必须都走这里，
 * 保证预检 → 任务书 → ChapterWritingPipeline(SMART_CONTINUE) 与正式逻辑同步。
 */
import {
  ChapterWritingPipeline,
  type ChapterWriteInput,
  type ChapterWriteOutput,
  type ChapterWritingPipelineDeps,
} from './ChapterWritingPipeline';
import { SMART_CONTINUE_PRESET } from './chapterWritePresets';

export type SmartContinueDeps = ChapterWritingPipelineDeps;

export type SmartContinueInput = Omit<
  ChapterWriteInput,
  'useTaskBook' | 'enablePreflight' | 'enableSupplement'
> &
  Partial<Pick<ChapterWriteInput, 'useTaskBook' | 'enablePreflight' | 'enableSupplement'>>;

/** 构造与正式智能续写同构的管道实例 */
export function createSmartContinuePipeline(
  deps?: SmartContinueDeps
): ChapterWritingPipeline {
  return new ChapterWritingPipeline(deps);
}

/**
 * 执行智能续写正式路径。
 * 固定合并 SMART_CONTINUE_PRESET；调用方覆盖项中的 undefined 不覆盖预设。
 */
export async function executeSmartContinue(
  input: SmartContinueInput,
  deps?: SmartContinueDeps
): Promise<ChapterWriteOutput> {
  const pipeline = createSmartContinuePipeline(deps);
  return pipeline.execute({
    ...input,
    useTaskBook: input.useTaskBook ?? SMART_CONTINUE_PRESET.useTaskBook,
    enablePreflight: input.enablePreflight ?? SMART_CONTINUE_PRESET.enablePreflight,
    enableSupplement: input.enableSupplement ?? SMART_CONTINUE_PRESET.enableSupplement,
  });
}
