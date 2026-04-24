import { ref, computed, readonly } from 'vue';
import { useSettingsStore } from '@/stores/settings.store';
import { useProjectStore } from '@/stores/project.store';
import { useActiveAIProvider } from '@/composables/useActiveAIProvider';
import type { ProjectContext, AIWriteResult, AISuggestion, AIWriteMode } from './factory';

/**
 * AI 服务 Composable
 * 提供 AI 协作功能的响应式接口
 * 使用统一的 AI Provider 获取逻辑
 */
export function useAIService() {
  const settingsStore = useSettingsStore();
  const projectStore = useProjectStore();
  const { activeProvider, currentModel, requireAIService, hasProvider } = useActiveAIProvider();

  // 生成状态
  const isGenerating = ref(false);
  const isAnalyzing = ref(false);
  const isLoadingMemory = ref(false);

  // 生成结果
  const generatedText = ref('');
  const isStreaming = ref(false);
  const suggestions = ref<AISuggestion[]>([]);
  const memoryContext = ref<{
    charactersInScene: import('@/types/project').Character[];
    location: string;
    time: string;
    mood: string;
  }>({
    charactersInScene: [],
    location: '',
    time: '',
    mood: '',
  });

  // 错误信息
  const error = ref<string | null>(null);

  /**
   * 构建项目上下文
   */
  function buildProjectContext(customPrompt?: string): ProjectContext | null {
    const project = projectStore.currentProject;
    const currentChapter = projectStore.currentChapter;

    if (!project || !currentChapter) {
      return null;
    }

    // 获取当前章节在卷中的索引
    const currentChapterIndex = projectStore.sortedChapters.findIndex(
      c => c.id === currentChapter.id
    );

    // 构建前后章节摘要
    const prevChapter = currentChapterIndex > 0 ? projectStore.sortedChapters[currentChapterIndex - 1] : null;
    const nextChapter = currentChapterIndex < projectStore.sortedChapters.length - 1
      ? projectStore.sortedChapters[currentChapterIndex + 1]
      : null;

    // 获取相关的伏笔
    const relatedForeshadows = project.foreshadows?.filter(f => {
      if (!f.createdChapter) return false;
      const chapterNum = parseInt(currentChapter.title.replace(/[^0-9]/g, '')) || 1;
      return Math.abs(f.createdChapter - chapterNum) <= 3;
    });

    return {
      project,
      currentChapterId: currentChapter.id,
      currentChapterContent: currentChapter.content || '',
      adjacentChaptersSummary: {
        previousChapterTitle: prevChapter?.title,
        previousChapterSummary: prevChapter?.content?.slice(0, 200) + '...',
        nextChapterTitle: nextChapter?.title,
        nextChapterSummary: nextChapter?.content?.slice(0, 200) + '...',
      },
      charactersInScene: project.characters || [],
      relatedForeshadows,
      customPrompt,
    };
  }

  /**
   * 初始化 AI 服务
   */
  function initAIService() {
    if (!hasProvider.value) {
      return false;
    }
    return true;
  }

  /**
   * 生成内容
   */
  async function generate(
    mode: AIWriteMode,
    customPrompt?: string
  ): Promise<AIWriteResult | null> {
    if (!hasProvider.value) {
      error.value = '请先配置 AI 服务';
      return null;
    }

    const context = buildProjectContext(customPrompt);
    if (!context) {
      error.value = '请先选择一个章节';
      return null;
    }

    const aiService = requireAIService();
    isGenerating.value = true;
    error.value = '';
    generatedText.value = '';

    try {
      const result = await aiService.continueWriting(context, mode);
      generatedText.value = result.content;
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Generation failed';
      return null;
    } finally {
      isGenerating.value = false;
    }
  }

  /**
   * 流式生成内容
   */
  function generateStream(
    mode: AIWriteMode,
    customPrompt?: string,
    onChunk?: (text: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!hasProvider.value) {
        error.value = '请先配置 AI 服务';
        reject(new Error(error.value));
        return;
      }

      const context = buildProjectContext(customPrompt);
      if (!context) {
        error.value = '请先选择一个章节';
        reject(new Error(error.value));
        return;
      }

      const aiService = requireAIService();
      isGenerating.value = true;
      isStreaming.value = true;
      error.value = '';
      generatedText.value = '';

      // 检查是否支持流式输出
      if (aiService.continueWritingStream) {
        aiService.continueWritingStream(
          context,
          mode,
          (chunk) => {
            generatedText.value += chunk;
            onChunk?.(chunk);
          },
          () => {
            isGenerating.value = false;
            isStreaming.value = false;
            resolve();
          },
          (errMsg) => {
            error.value = errMsg;
            isGenerating.value = false;
            isStreaming.value = false;
            reject(new Error(errMsg));
          }
        );
      } else {
        // 如果不支持流式，回退到普通生成
        generate(mode, customPrompt)
          .then(() => resolve())
          .catch(reject)
          .finally(() => {
            isStreaming.value = false;
          });
      }
    });
  }

  /**
   * 分析章节
   */
  async function analyzeChapter(): Promise<AISuggestion[]> {
    if (!hasProvider.value) {
      error.value = '请先配置 AI 服务';
      return [];
    }

    const context = buildProjectContext();
    if (!context) {
      error.value = '请先选择一个章节';
      return [];
    }

    const aiService = requireAIService();
    isAnalyzing.value = true;
    error.value = '';

    try {
      suggestions.value = await aiService.analyzeChapter(context);
      return suggestions.value;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Analysis failed';
      return [];
    } finally {
      isAnalyzing.value = false;
    }
  }

  /**
   * 加载记忆上下文
   */
  async function loadMemoryContext(): Promise<void> {
    if (!hasProvider.value) {
      return;
    }

    const context = buildProjectContext();
    if (!context) {
      return;
    }

    const aiService = requireAIService();
    isLoadingMemory.value = true;

    try {
      memoryContext.value = await aiService.getMemoryContext(context);
    } catch (err) {
      console.error('Failed to load memory context:', err);
    } finally {
      isLoadingMemory.value = false;
    }
  }

  /**
   * 清除生成结果
   */
  function clearResult() {
    generatedText.value = '';
    error.value = '';
  }

  /**
   * 测试连接
   */
  async function testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!hasProvider.value) {
      return { success: false, error: '请先配置 AI 服务' };
    }

    try {
      const aiService = requireAIService();
      const result = await aiService.testConnection();
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      };
    }
  }

  return {
    // 状态
    isGenerating: readonly(isGenerating),
    isAnalyzing: readonly(isAnalyzing),
    isLoadingMemory: readonly(isLoadingMemory),
    isStreaming: readonly(isStreaming),
    generatedText: readonly(generatedText),
    suggestions: readonly(suggestions),
    memoryContext: readonly(memoryContext),
    error: readonly(error),
    activeProvider,
    currentModel,
    hasProvider,
    // 方法
    initAIService,
    generate,
    generateStream,
    analyzeChapter,
    loadMemoryContext,
    clearResult,
    testConnection,
  };
}
