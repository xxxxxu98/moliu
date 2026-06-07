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

  let generator: UnifiedOutlineGenerator | null = null;

  function getGenerator(): UnifiedOutlineGenerator {
    if (!generator) {
      generator = new UnifiedOutlineGenerator();
    }
    return generator;
  }

  function buildGenerateOptions(options?: UseOutlineGeneratorOptions): GenerateOptions {
    return {
      temperature: options?.temperature ?? 0.7,
      topP: options?.topP ?? 0.9,
      wordCountRange: options?.wordCountRange ?? '50万-100万字',
      maxRetries: options?.maxRetries ?? 2,
    };
  }

  async function generateOutlines(
    prompt: string,
    options?: UseOutlineGeneratorOptions,
  ): Promise<GeneratedOutline[]> {
    isGenerating.value = true;
    error.value = null;
    progress.value = '准备生成...';
    warnings.value = [];
    strategy.value = '';
    outlines.value = [];
    rawMarkdown.value = '';

    try {
      const result = await getGenerator().generate(
        prompt,
        buildGenerateOptions(options),
        (msg) => {
          progress.value = msg;
        },
      );

      return handleGenerationResult(result);
    } catch (err) {
      console.error('[useOutlineGenerator] Outline generation error:', err);
      error.value = String(err);
      return [];
    } finally {
      isGenerating.value = false;
      progress.value = '';
    }
  }

  async function generateDirections(
    prompt: string,
    options?: UseOutlineGeneratorOptions,
  ): Promise<OutlineDirection[]> {
    isGenerating.value = true;
    error.value = null;
    progress.value = '正在生成创作方向...';
    warnings.value = [];
    strategy.value = '';
    rawMarkdown.value = '';

    try {
      const result = await getGenerator().generateDirections(
        prompt,
        buildGenerateOptions(options),
        (msg) => {
          progress.value = msg;
        },
      );

      rawMarkdown.value = result.rawText ?? '';
      warnings.value = result.warnings ?? [];
      strategy.value = result.strategy ?? '';

      if (result.directions.length === 0) {
        error.value = result.warnings?.[0] ?? '未能生成可用方向，请重试';
      }

      return result.directions;
    } catch (err) {
      console.error('[useOutlineGenerator] Direction generation error:', err);
      error.value = String(err);
      return [];
    } finally {
      isGenerating.value = false;
      progress.value = '';
    }
  }

  async function expandDirection(
    prompt: string,
    direction: OutlineDirection,
    options?: UseOutlineGeneratorOptions,
  ): Promise<ExecutableOutline | null> {
    isGenerating.value = true;
    error.value = null;
    progress.value = '正在展开主方案...';
    warnings.value = [];
    strategy.value = '';
    rawMarkdown.value = '';

    try {
      const result = await getGenerator().expandDirection(
        prompt,
        direction,
        buildGenerateOptions(options),
        (msg) => {
          progress.value = msg;
        },
      );

      rawMarkdown.value = result.rawText ?? '';
      warnings.value = result.warnings ?? [];
      strategy.value = result.strategy ?? '';

      if (!result.outline) {
        error.value = result.warnings?.[0] ?? '主方案展开失败，请重试';
      }

      return result.outline;
    } catch (err) {
      console.error('[useOutlineGenerator] Expand direction error:', err);
      error.value = String(err);
      return null;
    } finally {
      isGenerating.value = false;
      progress.value = '';
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
    isGenerating.value = false;
    error.value = null;
    progress.value = '';
    warnings.value = [];
    strategy.value = '';
    outlines.value = [];
    rawMarkdown.value = '';
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
    reset,
  };
}
