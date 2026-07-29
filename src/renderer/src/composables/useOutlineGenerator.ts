import { ref, computed } from 'vue';
import {
  UnifiedOutlineGenerator,
  type GenerateOptions,
  type GenerationResult,
} from '@/services/outline/generators/unified-generator';
import type { Outline } from '@/services/outline/schemas/outline.schema';
import type { GeneratedOutline } from '@/types/inspiration';
import type { OutlineDirection } from '@/services/outline/types/direction';
import type { ExecutableOutline } from '@/services/outline/types/executable-outline';

/**
 * 生成选项
 */
export interface UseOutlineGeneratorOptions {
  /** 字数范围 */
  wordCountRange?: string;
  /** 温度参数 */
  temperature?: number;
  /** Top P 参数 */
  topP?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 长篇承载力增强说明 */
  enhancementBrief?: string;
}

/**
 * 返回值接口
 */
export interface UseOutlineGeneratorReturn {
  /** 是否正在生成 */
  isGenerating: ReturnType<typeof ref<boolean>>;
  /** 错误信息 */
  error: ReturnType<typeof ref<string | null>>;
  /** 生成进度 */
  progress: ReturnType<typeof ref<string>>;
  /** 警告信息列表 */
  warnings: ReturnType<typeof ref<string[]>>;
  /** 生成策略 */
  strategy: ReturnType<typeof ref<string>>;
  /** 生成的大纲列表 */
  outlines: ReturnType<typeof ref<GeneratedOutline[]>>;
  /** 是否生成成功 */
  isSuccess: ReturnType<typeof computed<boolean>>;
  /** 原始 Markdown（用于调试） */
  rawMarkdown: ReturnType<typeof ref<string>>;
  /** 生成大纲方法 */
  generateOutlines: (prompt: string, options?: UseOutlineGeneratorOptions) => Promise<GeneratedOutline[]>;
  /** 生成方向卡 */
  generateDirections: (prompt: string, options?: UseOutlineGeneratorOptions) => Promise<OutlineDirection[]>;
  /** 展开方向为可执行方案 */
  expandDirection: (
    prompt: string,
    direction: OutlineDirection,
    options?: UseOutlineGeneratorOptions,
  ) => Promise<ExecutableOutline | null>;
  /** 取消当前在飞的生成请求 */
  cancel: () => void;
  /** 最近一次结束是否由用户取消（供 UI 区分空结果与主动取消） */
  wasCancelled: ReturnType<typeof ref<boolean>>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * 大纲生成 Composable
 * 使用多层级降级策略，优先 Markdown 解析，兼容所有模型
 */
export function useOutlineGenerator(): UseOutlineGeneratorReturn {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const progress = ref<string>('');
  const warnings = ref<string[]>([]);
  const strategy = ref<string>('');
  const outlines = ref<GeneratedOutline[]>([]);
  const rawMarkdown = ref<string>('');
  const wasCancelled = ref(false);

  let generator: UnifiedOutlineGenerator | null = null;

  // 竞态保护：每次发起生成都递增 id，异步请求返回时比对 id，
  // 若不匹配说明期间用户已发起新请求 / 切换 tab / 重置，旧结果丢弃。
  // 否则会出现"旧请求晚到覆盖新状态"的竞态（generateOutlines / generateDirections /
  // expandDirection 共用同一组响应式状态，且底层 fetch 无法 abort）。
  let generationId = 0;
  // 当前在飞请求的 AbortController。发起新请求或 reset 时 abort 旧请求，
  // 避免竞态场景下并发多个付费请求，并让旧请求尽早结束。
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

  /** 底层 fetch 被 abort 时抛 AbortError，不应当作"生成失败"展示给用户。 */
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
      temperature: options?.temperature ?? 0.7,
      topP: options?.topP ?? 0.9,
      wordCountRange: options?.wordCountRange ?? '50万-100万字',
      maxRetries: options?.maxRetries ?? 2,
      ...(signal ? { signal } : {}),
    };
  }

  async function generateOutlines(
    prompt: string,
    options?: UseOutlineGeneratorOptions,
  ): Promise<GeneratedOutline[]> {
    const currentId = ++generationId;
    const signal = createSignal();
    isGenerating.value = true;
    wasCancelled.value = false;
    error.value = null;
    progress.value = '准备生成...';
    warnings.value = [];
    strategy.value = '';
    outlines.value = [];
    rawMarkdown.value = '';

    try {
      const result = await getGenerator().generate(
        prompt,
        buildGenerateOptions(options, signal),
        (msg) => {
          // 仅当仍是本次请求时才更新进度，避免旧请求覆盖新进度文案
          if (currentId === generationId) {
            progress.value = msg;
          }
        },
      );

      // 旧请求晚到：丢弃结果，不写状态
      if (currentId !== generationId) {
        return [];
      }

      return handleGenerationResult(result);
    } catch (err) {
      // 主动取消视为正常结束（竞态 / reset），不写入错误。
      if (isAbortError(err)) return [];
      if (currentId !== generationId) return [];
      console.error('[useOutlineGenerator] Outline generation error:', err);
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
        (msg) => {
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
        (msg) => {
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

  function handleGenerationResult(result: GenerationResult): GeneratedOutline[] {
    warnings.value = result.warnings;
    strategy.value = result.strategy;
    rawMarkdown.value = result.rawMarkdown || '';

    if (result.success && result.outlines.length > 0) {
      const generatedOutlines = result.outlines.map((outline, index) =>
        convertToGeneratedOutline(outline, index),
      );

      outlines.value = generatedOutlines;
      return generatedOutlines;
    }

    if (result.errors.length > 0) {
      error.value = result.errors.join('; ');
    } else {
      error.value = '生成失败，请重试';
    }

    return [];
  }

  function convertToGeneratedOutline(outline: Outline, index: number): GeneratedOutline {
    const characters = (outline.characters || []).map((c) => ({
      name: c.name || '',
      role: c.role || '',
      description: c.description || '',
      personality: c.personality || [],
      appearance: c.appearance || '',
      abilities: c.abilities || [],
      background: c.background || '',
      relationships: (c.relationships || []).map((r) => ({
        targetName: r.targetName || '',
        type: r.type || 'neutral',
        description: r.description || '',
      })),
    }));

    const foreshadows = (outline.foreshadows || []).map((f) => ({
      hint: f.hint || '',
      type: f.type || 'event',
      suggestedChapter: f.suggestedChapter,
    }));

    const worldSetting = outline.worldSetting
      ? {
          locations: (outline.worldSetting.locations || []).map((l) => ({
            name: l.name || '',
            description: l.description || '',
            level: l.level || 'city',
            parentName: l.parentName || '',
          })),
          factions: (outline.worldSetting.factions || []).map((f) => ({
            name: f.name || '',
            description: f.description || '',
            parentName: f.parentName || '',
            allies: f.allies || [],
            enemies: f.enemies || [],
          })),
          rules: (outline.worldSetting.rules || []).map((r) => ({
            name: r.name || '',
            description: r.description || '',
            category: r.category || 'custom',
            relatedRuleNames: r.relatedRuleNames || [],
          })),
        }
      : undefined;

    const subplots = (outline.subplots || []).map((s) => ({
      title: s.title || '',
      description: s.description || '',
      relatedCharacters: s.relatedCharacters || [],
      chapterRange: s.chapterRange,
      purpose: s.purpose || '',
    }));

    const chapters = (outline.chapters || []).map((ch) => ({
      title: ch.title || '',
      summary: ch.summary || '',
      keyEvents: ch.keyEvents || [],
      involvedCharacters: ch.involvedCharacters || [],
    }));

    const emotionGoal = outline.emotionGoal
      ? {
          primary: outline.emotionGoal.primary || '',
          secondary: outline.emotionGoal.secondary,
          arc: outline.emotionGoal.arc || 'rising',
          density: outline.emotionGoal.density,
          highPoints: outline.emotionGoal.highPoints || [],
          lowPoints: outline.emotionGoal.lowPoints || [],
        }
      : undefined;

    const coolPointDesign = outline.coolPointDesign
      ? {
          patterns: outline.coolPointDesign.patterns || [],
          arranged: (outline.coolPointDesign.arranged || []).map((cp) => ({
            type: cp.type || '',
            description: cp.description || '',
            suggestedChapter: cp.suggestedChapter,
          })),
        }
      : undefined;

    const coreSellingPoints = (outline.coreSellingPoints || []).map((cp) => ({
      name: cp.name || '',
      description: cp.description || '',
      priority: cp.priority || 1,
    }));

    const conflictDesign = outline.conflictDesign
      ? {
          source: outline.conflictDesign.source || '',
          escalation: (outline.conflictDesign.escalation || []).map((e) =>
            typeof e === 'string' ? e : e.description || '',
          ),
          majorConflicts: (outline.conflictDesign.majorConflicts || []).map((c) =>
            typeof c === 'string' ? c : c.title || '',
          ),
        }
      : undefined;

    const storyLines = outline.storyLines
      ? {
          map: outline.storyLines.map?.planned?.join(' → ') || '',
          faction: outline.storyLines.faction?.planned?.join(' → ') || '',
          character:
            outline.storyLines.character?.planned
              ?.map((p) => (typeof p === 'string' ? p : p.role))
              .join(' → ') || '',
          goldenfinger: outline.storyLines.goldenfinger?.type || '',
          worldRules: outline.storyLines.worldRules?.revealed?.join(' → ') || '',
          conflict: outline.storyLines.conflict?.chains?.map((c) => c.name).join(' → ') || '',
          collection: outline.storyLines.collection?.target?.join(' → ') || '',
          romance: outline.storyLines.romance?.currentStage || '',
        }
      : undefined;

    return {
      id: outline.id || `outline-${index}-${Date.now()}`,
      title: outline.title || '未命名大纲',
      synopsis: outline.synopsis || '',
      genres: outline.genres || [],
      worldSetting,
      subplots,
      chapters,
      structure: outline.structure || { act1: '', act2a: '', act2b: '', act3: '' },
      characters,
      foreshadows,
      estimatedWordCount: outline.estimatedWordCount || 0,
      emotionGoal,
      coolPointDesign,
      coreSellingPoints,
      conflictDesign,
      storyLines,
    };
  }

  function reset() {
    // 让任何在飞的请求结果作废，并主动取消底层 fetch，避免并发计费
    abortInFlight();
    generationId++;
    isGenerating.value = false;
    wasCancelled.value = false;
    error.value = null;
    progress.value = '';
    warnings.value = [];
    strategy.value = '';
    outlines.value = [];
    rawMarkdown.value = '';
  }

  /** 仅取消当前生成，保留已有结果（方向卡/大纲） */
  function cancel(): void {
    if (!isGenerating.value && !currentAbort) return;
    abortInFlight();
    generationId++;
    isGenerating.value = false;
    progress.value = '';
    wasCancelled.value = true;
    // 主动取消不记为错误，由 UI 用 toast 提示
    error.value = null;
  }

  const isSuccess = computed(() => outlines.value.length > 0 && !error.value);

  return {
    isGenerating,
    error,
    progress,
    warnings,
    strategy,
    outlines,
    isSuccess,
    rawMarkdown,
    generateOutlines,
    generateDirections,
    expandDirection,
    cancel,
    wasCancelled,
    reset,
  };
}
