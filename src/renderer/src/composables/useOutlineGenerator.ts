import { ref, computed } from 'vue';
import { UnifiedOutlineGenerator, type GenerateOptions, type GenerationResult } from '@/services/outline/generators/unified-generator';
import type { Outline } from '@/services/outline/schemas/outline.schema';
import type { GeneratedOutline } from '@/types/inspiration';

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
  isSuccess: ReturnType<typeof ref<boolean>>;
  /** 原始 Markdown（用于调试） */
  rawMarkdown: ReturnType<typeof ref<string>>;
  /** 生成大纲方法 */
  generateOutlines: (prompt: string, options?: UseOutlineGeneratorOptions) => Promise<GeneratedOutline[]>;
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

  // 生成器实例
  let generator: UnifiedOutlineGenerator | null = null;

  /**
   * 获取生成器实例
   */
  function getGenerator(): UnifiedOutlineGenerator {
    if (!generator) {
      generator = new UnifiedOutlineGenerator();
    }
    return generator;
  }

  /**
   * 生成大纲
   * @param prompt 生成大纲的提示词
   * @param options 可选配置
   * @returns 生成的大纲列表
   */
  async function generateOutlines(
    prompt: string,
    options?: UseOutlineGeneratorOptions,
  ): Promise<GeneratedOutline[]> {
    // 重置状态
    isGenerating.value = true;
    error.value = null;
    progress.value = '准备生成...';
    warnings.value = [];
    strategy.value = '';
    outlines.value = [];
    rawMarkdown.value = '';

    try {
      const generator = getGenerator();

      // 构建生成选项
      const generateOptions: GenerateOptions = {
        temperature: options?.temperature ?? 0.7,
        topP: options?.topP ?? 0.9,
        wordCountRange: options?.wordCountRange ?? '50万-100万字',
        maxRetries: options?.maxRetries ?? 2,
      };

      // 执行生成
      const result = await generator.generate(
        prompt,
        generateOptions,
        (msg) => {
          progress.value = msg;
        },
      );

      // 处理结果
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

  /**
   * 处理生成结果
   */
  function handleGenerationResult(result: GenerationResult): GeneratedOutline[] {
    // 更新状态
    warnings.value = result.warnings;
    strategy.value = result.strategy;
    rawMarkdown.value = result.rawMarkdown || '';

    if (result.success && result.outlines.length > 0) {
      // 转换为 GeneratedOutline 格式
      const generatedOutlines = result.outlines.map((outline, index) =>
        convertToGeneratedOutline(outline, index),
      );

      outlines.value = generatedOutlines;
      return generatedOutlines;
    }

    // 生成失败
    if (result.errors.length > 0) {
      error.value = result.errors.join('; ');
    } else {
      error.value = '生成失败，请重试';
    }

    return [];
  }

  /**
   * 将 Outline 转换为 GeneratedOutline
   */
  function convertToGeneratedOutline(outline: Outline, index: number): GeneratedOutline {
    // 处理角色信息
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

    // 处理伏笔信息
    const foreshadows = (outline.foreshadows || []).map((f) => ({
      hint: f.hint || '',
      type: f.type || 'mystery',
      suggestedChapter: f.suggestedChapter,
    }));

    // 处理世界观设定
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

    // 处理子情节
    const subplots = (outline.subplots || []).map((s) => ({
      title: s.title || '',
      description: s.description || '',
      relatedCharacters: s.relatedCharacters || [],
      chapterRange: s.chapterRange,
      purpose: s.purpose || '',
    }));

    // 处理章节
    const chapters = (outline.chapters || []).map((ch) => ({
      title: ch.title || '',
      summary: ch.summary || '',
      keyEvents: ch.keyEvents || [],
      involvedCharacters: ch.involvedCharacters || [],
    }));

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
    };
  }

  /**
   * 重置状态
   */
  function reset() {
    isGenerating.value = false;
    error.value = null;
    progress.value = '';
    warnings.value = [];
    strategy.value = '';
    outlines.value = [];
    rawMarkdown.value = '';
  }

  // 计算属性
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
    reset,
  };
}
