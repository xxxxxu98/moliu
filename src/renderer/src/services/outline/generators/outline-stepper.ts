/**
 * 大纲主方案分步生成编排器。
 *
 * 把原来一次性产出全部 14 段的主请求，拆成 5 个聚焦小请求，逐步拼装 rawText：
 *   步1 骨架（定位/驱动/金手指/规模/四幕/世界）→ 步2 卷纲 → 步3 启动包 →
 *   步4 角色+伏笔 → 步5 支线/故事线/情绪/卖点
 *
 * 单步最大输出从 ~14000 字降到 ~3000-4500 字，显著降低推理型模型撞 finish_reason=length
 * 的概率。对外仍是一次 Promise，拼装完成的 rawText 交给外层 parseExpandedOutline 与
 * 后续 completeIncompleteOutline / reviewAndFixOutline / repairChapterBlueprints 流程。
 *
 * 步级重试：瞬态错误（429/网络/5xx）按指数退避重试，非瞬态（含长度截断）不重试。
 * 硬必需步（骨架/卷纲/启动包）失败上抛，触发外层整体重试；
 * 软步（角色伏笔/节奏包装）失败跳过并记 warning，由 completeIncompleteOutline 兜底或接受缺失。
 */
import type { GenerateOptions } from './unified-generator';
import type { OutlineDirection } from '../types/direction';
import type { BuiltPrompt } from '../prompts/system/shared';
import {
  extractOutlineSectionBody,
  replaceOutlineSection,
} from './outline-completer';
import {
  OUTLINE_GENERATION_STEPS,
  type StepBuildContext,
} from '../prompts/system/expand-direction-steps';
import {
  isAbortedError,
  isTransientError,
  classifyError,
  retryBackoffDelayMs,
} from '@/utils/ai-error-classify';

/** 注入式结构化文本调用器（与 outline-completer / outline-reviewer 同模式） */
export type StructuredTextCaller = (
  system: string,
  user: string,
  options: GenerateOptions,
) => Promise<string>;

export interface GenerateOutlineStepsParams {
  seed: string;
  direction: OutlineDirection;
  options: GenerateOptions;
  enhancementBrief?: string;
  wordCountRange: string;
  callStructuredTextMode: StructuredTextCaller;
  onProgress?: (message: string) => void;
}

export interface GenerateOutlineStepsResult {
  /** 拼装完整的方案文本（含各步产出的所有段） */
  rawText: string;
  warnings: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带瞬态退避的单步请求。
 * 瞬态错误（429/网络/5xx）按指数退避重试；非瞬态（如长度上限截断、解析失败）不重试，直接抛。
 * 主动取消（abort）一律上抛，不重试。
 */
async function callStepWithRetry(
  callStructuredTextMode: StructuredTextCaller,
  system: string,
  user: string,
  options: GenerateOptions,
  maxAttempts: number,
  onProgress?: (message: string) => void,
  stepLabel?: string,
): Promise<string> {
  const total = Math.max(1, maxAttempts);
  let lastError: unknown;
  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      return await callStructuredTextMode(system, user, options);
    } catch (error) {
      if (isAbortedError(error)) throw error;
      lastError = error;
      if (attempt >= total) break;
      if (isTransientError(error)) {
        // 限流走独立退避（15/30s 起步；短退避下账户级 429 只会连吃 429 耗尽额度）
        const delay = retryBackoffDelayMs(classifyError(error).kind, attempt);
        onProgress?.(
          `${stepLabel ? `${stepLabel}：` : ''}请求被限流或网络抖动，${delay}ms 后重试 (${attempt}/${total})`,
        );
        await sleep(delay);
        continue;
      }
      // 非瞬态错误（长度上限截断、解析失败等）：重试无益，直接中止本步
      break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** 模型响应里是否真实存在指定段的 `## 段名` 头（用于区分"段缺失"与"全文兜底"） */
function hasSectionHeader(raw: string, aliases: string[]): boolean {
  const headerPattern = new RegExp(
    `^##\\s*(?:${aliases.map(escapeRegExp).join('|')})(?:\\s*[（(].*)?\\s*$`,
    'mu',
  );
  return headerPattern.test(raw);
}

/**
 * 把模型对本步的响应中，属于本步产出的各段提取出来，拼装（替换或追加）到累计 rawText。
 * 每段独立处理：某段缺失只记 warning，不阻断同步其它段的拼装。
 *
 * 注意：extractOutlineSectionBody 在缺失段头时会返回整段全文（为兼容模型不按段名开头的输出），
 * 所以这里先用 hasSectionHeader 确认段头真实存在，再提取，避免把全文误当作某段正文拼入。
 */
function stitchStepSections(
  rawText: string,
  generated: string,
  sections: { canonical: string; aliases: string[] }[],
  warnings: string[],
): string {
  let next = rawText;
  for (const section of sections) {
    if (!hasSectionHeader(generated, section.aliases)) {
      warnings.push(`主方案未返回「${section.canonical}」段正文`);
      continue;
    }
    const body = extractOutlineSectionBody(generated, section.aliases);
    if (body.trim()) {
      next = replaceOutlineSection(next, section.aliases, section.canonical, body);
    } else {
      warnings.push(`主方案「${section.canonical}」段正文为空`);
    }
  }
  return next;
}

/**
 * 分步生成大纲主方案，返回拼装完整的 rawText。
 *
 * 外层 expandDirection 拿到 rawText 后 parseExpandedOutline，再走既有的补全/审查/修复流程。
 */
export async function generateExpandedOutlineInSteps(
  params: GenerateOutlineStepsParams,
): Promise<GenerateOutlineStepsResult> {
  const {
    seed,
    direction,
    options,
    enhancementBrief,
    wordCountRange,
    callStructuredTextMode,
    onProgress,
  } = params;

  const maxAttempts = Math.max(1, options.maxRetries ?? 2);
  const warnings: string[] = [];
  let rawText = '';

  for (const step of OUTLINE_GENERATION_STEPS) {
    onProgress?.(step.progressMessage);

    const ctx: StepBuildContext = {
      seed,
      direction,
      wordCountRange,
      enhancementBrief,
      accumulatedRawText: rawText,
    };
    const built: BuiltPrompt = step.build(ctx);

    let generated: string;
    try {
      generated = await callStepWithRetry(
        callStructuredTextMode,
        built.system,
        built.user,
        options,
        maxAttempts,
        onProgress,
        step.id,
      );
    } catch (error) {
      // 主动取消一律上抛，由调用方按 currentId 判定丢弃
      if (isAbortedError(error)) throw error;
      if (step.required) {
        // 硬必需步失败：上抛触发外层 runWithRetry 整体重试（降温）
        throw error;
      }
      // 软步失败：记 warning 并跳过，由下游 completeIncompleteOutline 兜底或接受缺失
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`「${step.id}」步生成失败，已跳过：${message.slice(0, 160)}`);
      continue;
    }

    rawText = stitchStepSections(rawText, generated, step.sections, warnings);
  }

  return { rawText, warnings };
}
