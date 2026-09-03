/**
 * 大纲生成 composable：方向卡 + 可执行大纲展开。
 * 与开题中心 / QuickStart / 冒烟共用 UnifiedOutlineGenerator，禁止再走 Markdown 多候选 generate()。
 */
import { ref } from 'vue';
import {
  UnifiedOutlineGenerator,
  type GenerateOptions,
} from '@/services/outline/generators/unified-generator';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';
import { DEFAULT_WORD_COUNT_RANGE } from '@/services/ai/unified.service';

/** 生成选项（字数/温度/取消信号） */
export interface UseOutlineGeneratorOptions {
  wordCountRange?: string;
  temperature?: number;
  topP?: number;
  maxRetries?: number;
  enhancementBrief?: string;
}

/** useOutlineGenerator 对外端口 */
export interface UseOutlineGeneratorReturn {
  isGenerating: ReturnType<typeof ref<boolean>>;
  error: ReturnType<typeof ref<string | null>>;
  progress: ReturnType<typeof ref<string>>;
  warnings: ReturnType<typeof ref<string[]>>;
  strategy: ReturnType<typeof ref<string>>;
  rawMarkdown: ReturnType<typeof ref<string>>;
  generateDirections: (prompt: string, options?: UseOutlineGeneratorOptions) => Promise<OutlineDirection[]>;
  expandDirection: (
    prompt: string,
    direction: OutlineDirection,
    options?: UseOutlineGeneratorOptions,
  ) => Promise<ExecutableOutline | null>;
  cancel: () => void;
  wasCancelled: ReturnType<typeof ref<boolean>>;
  reset: () => void;
}

/**
 * 大纲生成入口。generateDirections / expandDirection 共用同一组响应式状态与 AbortController。
 */
export function useOutlineGenerator(): UseOutlineGeneratorReturn {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const progress = ref<string>('');
  const warnings = ref<string[]>([]);
  const strategy = ref<string>('');
  const rawMarkdown = ref<string>('');
  const wasCancelled = ref(false);

  let generator: UnifiedOutlineGenerator | null = null;
  let generationId = 0;
  let currentAbort: AbortController | null = null;

  function abortInFlight(): void {
    if (currentAbort) {
      currentAbort.abort();
      currentAbort = null;
    }
  }

  function createSignal(): AbortSignal {
    abortInFlight();
    const controller = new AbortController();
    currentAbort = controller;
    return controller.signal;
  }

  function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof Error && error.name === 'AbortError') return true;
    return false;
  }

  function getGenerator(): UnifiedOutlineGenerator {
    if (!generator) {
      generator = new UnifiedOutlineGenerator();
    }
    return generator;
  }

  function buildGenerateOptions(
    options?: UseOutlineGeneratorOptions,
    signal?: AbortSignal,
  ): GenerateOptions {
    return {
      temperature: options?.temperature,
      topP: options?.topP,
      wordCountRange: options?.wordCountRange ?? DEFAULT_WORD_COUNT_RANGE,
      maxRetries: options?.maxRetries ?? 2,
      ...(signal ? { signal } : {}),
    };
  }

  async function generateDirections(
    prompt: string,
    options?: UseOutlineGeneratorOptions,
  ): Promise<OutlineDirection[]> {
    const currentId = ++generationId;
    const signal = createSignal();
    isGenerating.value = true;
    wasCancelled.value = false;
    error.value = null;
    progress.value = '正在生成创作方向...';
    warnings.value = [];
    strategy.value = '';
    rawMarkdown.value = '';

    try {
      const result = await getGenerator().generateDirections(
        prompt,
        buildGenerateOptions(options, signal),
        msg => {
          if (currentId === generationId) {
            progress.value = msg;
          }
        },
      );

      if (currentId !== generationId) {
        return [];
      }

      rawMarkdown.value = result.rawText ?? '';
      warnings.value = result.warnings ?? [];
      strategy.value = result.strategy ?? '';

      if (result.directions.length === 0) {
        error.value = result.warnings?.[0] ?? '未能生成可用方向，请重试';
      }

      return result.directions;
    } catch (err) {
      if (isAbortError(err)) return [];
      if (currentId !== generationId) return [];
      console.error('[useOutlineGenerator] Direction generation error:', err);
      error.value = String(err);
      return [];
    } finally {
      if (currentId === generationId) {
        isGenerating.value = false;
        progress.value = '';
        currentAbort = null;
      }
    }
  }

  async function expandDirection(
    prompt: string,
    direction: OutlineDirection,
    options?: UseOutlineGeneratorOptions,
  ): Promise<ExecutableOutline | null> {
    const currentId = ++generationId;
    const signal = createSignal();
    isGenerating.value = true;
    wasCancelled.value = false;
    error.value = null;
    progress.value = '正在展开主方案...';
    warnings.value = [];
    strategy.value = '';
    rawMarkdown.value = '';

    try {
      const result = await getGenerator().expandDirection(
        prompt,
        direction,
        { ...buildGenerateOptions(options, signal), enhancementBrief: options?.enhancementBrief },
        msg => {
          if (currentId === generationId) {
            progress.value = msg;
          }
        },
      );

      if (currentId !== generationId) {
        return null;
      }

      rawMarkdown.value = result.rawText ?? '';
      warnings.value = result.warnings ?? [];
      strategy.value = result.strategy ?? '';

      if (!result.outline) {
        error.value = result.warnings?.[0] ?? '主方案展开失败，请重试';
      }

      return result.outline;
    } catch (err) {
      if (isAbortError(err)) return null;
      if (currentId !== generationId) return null;
      console.error('[useOutlineGenerator] Expand direction error:', err);
      error.value = String(err);
      return null;
    } finally {
      if (currentId === generationId) {
        isGenerating.value = false;
        progress.value = '';
        currentAbort = null;
      }
    }
  }

  function reset() {
    abortInFlight();
    generationId++;
    isGenerating.value = false;
    wasCancelled.value = false;
    error.value = null;
    progress.value = '';
    warnings.value = [];
    strategy.value = '';
    rawMarkdown.value = '';
  }

  function cancel(): void {
    if (!isGenerating.value && !currentAbort) return;
    abortInFlight();
    generationId++;
    isGenerating.value = false;
    progress.value = '';
    wasCancelled.value = true;
    error.value = null;
  }

  return {
    isGenerating,
    error,
    progress,
    warnings,
    strategy,
    rawMarkdown,
    generateDirections,
    expandDirection,
    cancel,
    wasCancelled,
    reset,
  };
}
