/**
 * 章节目录生成 Composable
 * 封装从大纲自动生成章节目录的业务逻辑
 */

import { ref, readonly } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import type { WritingStyle, GenerateChapterResponse } from '@/types/writing';
import type { PlotNode, Character } from '@/types/project';
import { PromptBuilder } from '@/services/writing/prompt-builder';

export interface GeneratedChapter {
  title: string;
  outline: string;
  orderIndex: number;
  keyEvents: string[];
  foreshadows: string[];
  chapterType?: string;  // 章节类型
}

export interface UseChapterOutlineGeneratorReturn {
  // 状态
  isGenerating: typeof isGenerating;
  error: typeof error;
  generatedChapters: typeof generatedChapters;

  // 方法
  generateOutlines: (options?: {
    chapterCount?: number;
    wordsPerChapter?: number;
    style?: WritingStyle;
  }) => Promise<GeneratedChapter[] | null>;
  applyOutlines: (chapters: GeneratedChapter[]) => Promise<boolean>;
  createChapters: (chapters: GeneratedChapter[]) => Promise<string[]>;
}

const isGenerating = ref(false);
const error = ref<string | null>(null);
const generatedChapters = ref<GeneratedChapter[]>([]);

export function useChapterOutlineGenerator(): UseChapterOutlineGeneratorReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();

  /**
   * 获取 AI 客户端
   * 使用统一的 AI Provider 获取逻辑
   */
  function getAIClient() {
    return requireAIService();
  }

  /**
   * 从大纲生成章节目录
   */
  async function generateOutlines(options?: {
    chapterCount?: number;
    wordsPerChapter?: number;
    style?: WritingStyle;
  }): Promise<GeneratedChapter[] | null> {
    const project = projectStore.currentProject;
    if (!project) {
      error.value = '请先选择一个项目';
      return null;
    }

    const chapterCount = options?.chapterCount || Math.ceil(
      (project.targetWordCount || 800000) / (options?.wordsPerChapter || 4000)
    );
    const wordsPerChapter = options?.wordsPerChapter || 4000;
    const style = options?.style || 'concise';

    isGenerating.value = true;
    error.value = null;
    generatedChapters.value = [];

    try {
      const client = getAIClient();

      // 构建 prompt
      const worldSchema = project.worldSchema;
      const characters = project.characters?.slice(0, 5) || [];

      const prompt = PromptBuilder.buildChapterOutlinePrompt(
        project.name,
        project.description || '',
        chapterCount,
        wordsPerChapter,
        style,
        worldSchema ? {
          locations: worldSchema.locations || [],
          rules: worldSchema.rules || [],
          factions: worldSchema.factions || [],
        } : undefined,
        characters.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          description: c.description,
          personality: c.profile?.personality || [],
        }))
      );

      // 生成内容
      const result = await client.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 8000,
      });

      if (!result) {
        error.value = 'AI 返回内容为空';
        return null;
      }

      // 解析 JSON
      const chapters = parseChaptersFromResult(result, chapterCount);
      generatedChapters.value = chapters;

      return chapters;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败';
      return null;
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 解析 AI 返回的章节数据
   */
  function parseChaptersFromResult(result: string, chapterCount: number): GeneratedChapter[] {
    try {
      // 尝试提取 JSON
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                         result.match(/\{[\s\S]*"chapters"[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        if (parsed.chapters && Array.isArray(parsed.chapters)) {
          return parsed.chapters.map((c: any, i: number) => ({
            title: c.title || `第${i + 1}章`,
            outline: c.outline || '',
            orderIndex: i,
            keyEvents: Array.isArray(c.keyEvents) ? c.keyEvents : [],
            foreshadows: Array.isArray(c.foreshadows) ? c.foreshadows : [],
            chapterType: c.chapterType || (i === 0 ? 'world_intro' : 'normal'),
          }));
        }
      }

      // 如果解析失败，尝试按行解析
      return parseChaptersFromText(result, chapterCount);

    } catch (err) {
      console.error('[ChapterOutlineGenerator] Parse error:', err);
      return parseChaptersFromText(result, chapterCount);
    }
  }

  /**
   * 从文本解析章节（备用方案）
   */
  function parseChaptersFromText(text: string, chapterCount: number): GeneratedChapter[] {
    const chapters: GeneratedChapter[] = [];
    const lines = text.split('\n');

    let currentChapter: Partial<GeneratedChapter> = {};
    let inChapter = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测章节标题
      const chapterMatch = trimmed.match(/^(第[一二三四五六七八九十百千万\d]+章|Chapter\s+\d+)/i);
      if (chapterMatch) {
        // 保存之前的章节
        if (currentChapter.title && currentChapter.outline) {
          chapters.push(currentChapter as GeneratedChapter);
        }

        inChapter = true;
        currentChapter = {
          title: trimmed.replace(/^#+\s*/, ''),
          outline: '',
          orderIndex: chapters.length,
          keyEvents: [],
          foreshadows: [],
          chapterType: chapters.length === 0 ? 'world_intro' : 'normal',
        };
      } else if (inChapter && trimmed) {
        // 累积大纲内容
        currentChapter.outline = (currentChapter.outline || '') + trimmed + '\n';
      }
    }

    // 保存最后一个章节
    if (currentChapter.title) {
      chapters.push(currentChapter as GeneratedChapter);
    }

    // 如果解析出的章节数量不够，使用占位符补充
    while (chapters.length < chapterCount) {
      chapters.push({
        title: `第${chapters.length + 1}章`,
        outline: '（待补充）',
        orderIndex: chapters.length,
        keyEvents: [],
        foreshadows: [],
        chapterType: chapters.length === 0 ? 'world_intro' : 'normal',
      });
    }

    return chapters.slice(0, chapterCount);
  }

  /**
   * 应用生成的章节大纲到项目
   */
  async function applyOutlines(chapters: GeneratedChapter[]): Promise<boolean> {
    try {
      // 更新项目的大纲
      const plotOutline: PlotNode[] = chapters.map((chapter, index) => ({
        id: `plot-chapter-${index}-${Date.now()}`,
        title: chapter.title,
        description: chapter.outline,
        type: 'chapter' as const,
        orderIndex: index,
        keyEvents: chapter.keyEvents,
        relatedCharacters: [],
      }));

      projectStore.setPlotOutline(plotOutline);
      await projectStore.saveCurrentProject();

      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '应用大纲失败';
      return false;
    }
  }

  /**
   * 创建章节
   */
  async function createChapters(chapters: GeneratedChapter[]): Promise<string[]> {
    const project = projectStore.currentProject;
    if (!project) {
      error.value = '请先选择一个项目';
      return [];
    }

    const createdChapterIds: string[] = [];

    try {
      // 获取第一个卷
      const firstVolume = projectStore.sortedVolumes[0];
      if (!firstVolume) {
        // 创建默认卷
        await projectStore.createVolume('第一卷');
      }

      const volumeId = projectStore.sortedVolumes[0]?.id;
      if (!volumeId) {
        throw new Error('无法创建卷');
      }

      // 创建章节
      for (const chapter of chapters) {
        const chapterId = await projectStore.createChapter(volumeId);

        // 更新章节标题和大纲
        const existingChapters = projectStore.chapters;
        const newChapter = existingChapters.find(c => c.id === chapterId);

        if (newChapter) {
          await projectStore.updateChapter(chapterId, {
            title: chapter.title,
            outline: chapter.outline,
          });
          createdChapterIds.push(chapterId);
        }
      }

      return createdChapterIds;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建章节失败';
      return createdChapterIds;
    }
  }

  return {
    // 状态
    isGenerating: readonly(isGenerating),
    error: readonly(error),
    generatedChapters: readonly(generatedChapters),

    // 方法
    generateOutlines,
    applyOutlines,
    createChapters,
  };
}
