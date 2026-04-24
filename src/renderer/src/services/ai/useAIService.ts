import { ref, computed, readonly } from 'vue';
import { useSettingsStore } from '@/stores/settings.store';
import { useProjectStore } from '@/stores/project.store';
import { AIServiceFactory, type UnifiedAIService, type ProjectContext, type AIWriteResult, type AISuggestion, type AIGenerationConfig } from './factory';
import type { AIWriteMode } from './types';

/**
 * AI 服务 Composable
 * 提供 AI 协作功能的响应式接口
 */
export function useAIService() {
  const settingsStore = useSettingsStore();
  const projectStore = useProjectStore();

  // 当前 AI 服务实例
  const aiService = ref<UnifiedAIService | null>(null);

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
   * 获取当前启用的 AI 提供商配置
   * 优先使用用户在设置页面选择的默认模型
   */
  const activeProvider = computed(() => {
    const providers = settingsStore.aiProviders;
    const defaultModelId = settingsStore.defaultModel;
    
    // 优先查找与 defaultModel 匹配的厂商
    if (defaultModelId) {
      const [providerId, modelName] = defaultModelId.split(':');
      const matched = providers.find(p => 
        p.id === providerId && 
        p.modelName === modelName && 
        p.enabled && 
        p.apiKey
      );
      if (matched) return matched;
    }
    
    // Fallback: 查找第一个已启用且配置了 API Key 的提供商
    return providers.find(p => p.enabled && p.apiKey);
  });

  /**
   * 获取当前模型
   */
  const currentModel = computed(() => {
    const provider = activeProvider.value;
    if (!provider) return null;

    // 使用配置的模型名称
    return provider.modelName || AIServiceFactory.getDefaultModel(provider.provider);
  });

  /**
   * 初始化 AI 服务
   */
  function initAIService() {
    const provider = activeProvider.value;
    if (!provider) {
      aiService.value = null;
      return false;
    }

    try {
      aiService.value = AIServiceFactory.createService(
        provider.provider,
        provider.apiKey,
        provider.baseUrl,
        currentModel.value || undefined,
        undefined, // 不设置 maxTokens
        provider.generationConfig
      );
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize AI service';
      aiService.value = null;
      return false;
    }
  }

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
   * 生成内容
   */
  async function generate(
    mode: AIWriteMode,
    customPrompt?: string
  ): Promise<AIWriteResult | null> {
    if (!initAIService()) {
      error.value = '请先配置 AI 服务';
      return null;
    }

    const context = buildProjectContext(customPrompt);
    if (!context) {
      error.value = '请先选择一个章节';
      return null;
    }

    isGenerating.value = true;
    error.value = '';
    generatedText.value = '';

    try {
      const result = await aiService.value!.continueWriting(context, mode);
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
      if (!initAIService()) {
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

      isGenerating.value = true;
      isStreaming.value = true;
      error.value = '';
      generatedText.value = '';

      // 检查是否支持流式输出
      if (aiService.value?.continueWritingStream) {
        aiService.value.continueWritingStream(
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
    if (!initAIService()) {
      error.value = '请先配置 AI 服务';
      return [];
    }

    const context = buildProjectContext();
    if (!context) {
      error.value = '请先选择一个章节';
      return [];
    }

    isAnalyzing.value = true;
    error.value = '';

    try {
      suggestions.value = await aiService.value!.analyzeChapter(context);
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
    if (!initAIService()) {
      return;
    }

    const context = buildProjectContext();
    if (!context) {
      return;
    }

    isLoadingMemory.value = true;

    try {
      memoryContext.value = await aiService.value!.getMemoryContext(context);
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
    if (!initAIService()) {
      return { success: false, error: '请先配置 AI 服务' };
    }

    try {
      const result = await aiService.value!.testConnection();
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
