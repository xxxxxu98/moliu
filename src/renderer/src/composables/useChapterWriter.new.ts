/**
 * 单章写作 Composable - Pipeline 版本
 * 
 * 基于 webnovel-writer 架构重构
 * 使用 WritingPipeline 进行六步流程管理
 */

import { ref, computed, readonly, watch } from 'vue';
import { useProjectStore } from '@/stores/project.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useActiveAIProvider } from './useActiveAIProvider';
import { WritingPipeline } from '@/services/writing/orchestrator/WritingPipeline';
import { useWritingContext } from './useWritingContext';
import type { PipelineConfig, PipelineResult, PipelineEvent, WritingStep, PipelineStatus } from '@/services/writing/orchestrator/types';
import type { WritingContext } from './useWritingContext';

// ============================================
// 接口定义
// ============================================

export interface UseChapterWriterOptions {
  /** 流水线配置 */
  pipelineConfig?: Partial<PipelineConfig>;
  /** 是否启用流式输出 */
  enableStreaming?: boolean;
  /** 目标字数 */
  targetWordCount?: number;
  /** 写作风格 */
  writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
}

export interface UseChapterWriterReturn {
  // 状态
  isGenerating: ReturnType<typeof readonly<typeof isGenerating>>;
  progress: ReturnType<typeof readonly<typeof progress>>;
  error: ReturnType<typeof readonly<typeof error>>;
  generatedContent: ReturnType<typeof readonly<typeof generatedContent>>;

  // 流水线状态
  currentStep: ReturnType<typeof readonly<typeof currentStep>>;
  pipelineStatus: ReturnType<typeof readonly<typeof pipelineStatus>>;
  stepResults: ReturnType<typeof readonly<typeof stepResults>>;
  
  // 审查状态
  blockingIssues: ReturnType<typeof readonly<typeof blockingIssues>>;
  reviewResult: ReturnType<typeof readonly<typeof reviewResult>>;

  // 方法
  writeChapter: (options?: {
    targetWordCount?: number;
    additionalInstructions?: string;
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }) => Promise<string | null>;
  stopWriting: () => void;
  applyGeneratedContent: () => Promise<boolean>;
  copyToClipboard: () => void;
  reset: () => void;
  
  // 流水线控制
  retryCurrentStep: () => Promise<void>;
  skipBlockingIssues: () => void;
  
  // 事件订阅
  onPipelineEvent: (callback: (event: PipelineEvent) => void) => () => void;
}

// ============================================
// 内部状态
// ============================================

const isGenerating = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);
const generatedContent = ref('');

// 流水线状态
const pipelineStatus = ref<PipelineStatus>('idle');
const currentStep = ref<WritingStep | null>(null);
const stepResults = ref<any[]>([]);

// 审查状态
const blockingIssues = ref<any[]>([]);
const reviewResult = ref<any | null>(null);

// Pipeline 实例
let pipeline: WritingPipeline | null = null;

// 当前上下文
let currentContext: WritingContext | null = null;

// ============================================
// Composable 实现
// ============================================

export function useChapterWriter(options: UseChapterWriterOptions = {}): UseChapterWriterReturn {
  const projectStore = useProjectStore();
  const settingsStore = useSettingsStore();
  const { requireAIService } = useActiveAIProvider();
  const writingContext = useWritingContext();

  // 初始化 Pipeline
  if (!pipeline) {
    pipeline = new WritingPipeline(options.pipelineConfig);
    
    // 订阅 Pipeline 事件
    pipeline.addEventListener(handlePipelineEvent);
  }

  // ============================================================
  // 事件处理
  // ============================================================
  
  function handlePipelineEvent(event: PipelineEvent): void {
    switch (event.type) {
      case 'step_start':
        currentStep.value = event.step || null;
        progress.value = calculateStepProgress(event.step);
        break;
        
      case 'step_complete':
        stepResults.value.push(event.data);
        progress.value = calculateStepProgress(event.step);
        
        // 检查审查结果
        if (event.step === 'review' && event.data?.reviewResult) {
          reviewResult.value = event.data.reviewResult;
          blockingIssues.value = event.data.reviewResult.blockingIssues || [];
        }
        
        // 检查起草结果
        if (event.step === 'draft' && event.data?.content) {
          generatedContent.value = event.data.content;
        }
        break;
        
      case 'step_error':
        error.value = event.error || '步骤执行失败';
        break;
        
      case 'pipeline_complete':
        isGenerating.value = false;
        pipelineStatus.value = 'completed';
        progress.value = 100;
        
        // 从步骤结果中提取最终内容
        const draftStep = stepResults.value.find((s: any) => s.step === 'draft');
        if (draftStep?.data?.content) {
          generatedContent.value = draftStep.data.content;
        }
        break;
        
      case 'pipeline_error':
        isGenerating.value = false;
        pipelineStatus.value = 'failed';
        error.value = event.error || '流水线执行失败';
        break;
    }
  }
  
  /**
   * 计算步骤进度
   */
  function calculateStepProgress(step: WritingStep | null | undefined): number {
    if (!step) return 0;
    
    const stepMap: Record<WritingStep, number> = {
      'task_book': 15,
      'draft': 40,
      'review': 60,
      'polish': 80,
      'commit': 95,
      'backup': 100,
    };
    
    return stepMap[step] || 0;
  }

  // ============================================================
  // 核心方法
  // ============================================================
  
  /**
   * 写入章节
   */
  async function writeChapter(chapterOptions?: {
    targetWordCount?: number;
    additionalInstructions?: string;
    writingStyle?: 'concise' | 'elegant' | 'humorous' | 'ancient';
  }): Promise<string | null> {
    const targetWordCount = chapterOptions?.targetWordCount || options.targetWordCount || 3000;
    const writingStyle = chapterOptions?.writingStyle || options.writingStyle || 'concise';

    if (isGenerating.value) {
      error.value = '正在生成中，请稍候';
      return null;
    }

    // 构建上下文
    currentContext = writingContext.buildContext({
      targetWordCount,
      writingStyle,
      includePreviousChapter: true,
    });

    if (!currentContext) {
      error.value = '无法构建写作上下文';
      return null;
    }

    // 重置状态
    reset();

    // 更新配置
    if (pipeline) {
      pipeline.updateConfig({
        enableTaskBook: true,
        enableReview: true,
        enablePolish: true,
        enableCommit: true,
        enableBackup: true,
        maxRetries: 3,
      });
    }

    try {
      isGenerating.value = true;
      pipelineStatus.value = 'running';
      error.value = null;

      // 构建 Pipeline 上下文
      const pipelineContext = buildPipelineContext(currentContext, chapterOptions);

      // 执行流水线
      const result = await pipeline!.execute(
        currentContext.chapterIndex + 1, // Pipeline 使用 1-based 章节号
        pipelineContext
      );

      if (result.status === 'completed' && result.finalContent) {
        generatedContent.value = result.finalContent;
        return result.finalContent;
      }

      if (result.error) {
        error.value = result.error;
      }

      return result.finalContent || null;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '生成失败';
      return null;
    } finally {
      if (pipelineStatus.value !== 'running') {
        isGenerating.value = false;
      }
    }
  }

  /**
   * 停止写作
   */
  function stopWriting(): void {
    if (pipeline) {
      pipeline.stop();
    }
    isGenerating.value = false;
    pipelineStatus.value = 'idle';
  }

  /**
   * 应用生成的内容到章节
   */
  async function applyGeneratedContent(): Promise<boolean> {
    if (!generatedContent.value) {
      error.value = '没有可应用的内容';
      return false;
    }

    if (!projectStore.currentChapterId) {
      error.value = '请先选择一个章节';
      return false;
    }

    try {
      const currentContent = projectStore.currentChapter?.content || '';
      const separator = currentContent.length > 0 && !currentContent.endsWith('\n') ? '\n\n' : '';
      const newContent = currentContent + separator + generatedContent.value;

      // 提取标题（如果有）
      const titleMatch = generatedContent.value.match(/^第[一二三四五六七八九十百千万\d]+章\s*(.+)/);
      const extractedTitle = titleMatch ? titleMatch[1] : null;

      const updateData: Record<string, any> = {
        content: newContent,
        wordCount: newContent.length,
      };

      if (extractedTitle && projectStore.currentChapter) {
        updateData.title = extractedTitle;
      }

      await projectStore.updateChapter(projectStore.currentChapterId, updateData);

      // 更新记忆
      await updateMemoryAfterApply();

      // 清空生成内容
      generatedContent.value = '';
      
      return true;

    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败';
      return false;
    }
  }

  /**
   * 更新记忆
   */
  async function updateMemoryAfterApply(): Promise<void> {
    if (!currentContext) return;

    try {
      const memoryOrchestrator = writingContext.memoryOrchestrator;
      await memoryOrchestrator.updateFromChapter(
        currentContext.chapterIndex,
        generatedContent.value || ''
      );
    } catch (err) {
      console.error('[useChapterWriter] 更新记忆失败:', err);
    }
  }

  /**
   * 复制到剪贴板
   */
  function copyToClipboard(): void {
    if (generatedContent.value) {
      navigator.clipboard.writeText(generatedContent.value);
    }
  }

  /**
   * 重置状态
   */
  function reset(): void {
    isGenerating.value = false;
    progress.value = 0;
    error.value = null;
    generatedContent.value = '';
    currentStep.value = null;
    pipelineStatus.value = 'idle';
    stepResults.value = [];
    blockingIssues.value = [];
    reviewResult.value = null;
  }

  /**
   * 重试当前步骤
   */
  async function retryCurrentStep(): Promise<void> {
    if (blockingIssues.value.length > 0 || reviewResult.value) {
      blockingIssues.value = [];
      reviewResult.value = null;
    }
    
    // 重新执行
    await writeChapter();
  }

  /**
   * 跳过阻断问题
   */
  function skipBlockingIssues(): void {
    console.warn('[useChapterWriter] 用户选择跳过阻断问题');
    blockingIssues.value = [];
    reviewResult.value = null;
  }

  /**
   * 订阅 Pipeline 事件
   */
  function onPipelineEvent(callback: (event: PipelineEvent) => void): () => void {
    if (pipeline) {
      pipeline.addEventListener(callback);
      return () => pipeline?.removeEventListener(callback);
    }
    return () => {};
  }

  // ============================================================
  // 私有方法
  // ============================================================
  
  /**
   * 构建 Pipeline 上下文
   */
  function buildPipelineContext(
    context: WritingContext,
    options?: {
      additionalInstructions?: string;
    }
  ): any {
    return {
      // 项目信息
      project: context.project,
      
      // 章节信息
      chapter: {
        id: context.chapterId,
        index: context.chapterIndex,
        title: context.chapterTitle,
        outline: context.chapterOutline,
        type: context.chapterType,
        existingContent: context.existingContent,
      },
      
      // 前章信息
      previousChapter: context.previousChapter,
      
      // 记忆包
      memoryPack: context.memoryPack,
      
      // 追读力信号
      readerSignals: context.readerSignals,
      
      // 合同
      contract: context.contract,
      
      // 角色
      characters: context.characters,
      
      // 伏笔
      activeForeshadows: context.activeForeshadows,
      
      // 大纲
      fullOutline: context.fullOutline,
      
      // 写作参数
      writingStyle: context.writingStyle,
      targetWordCount: context.targetWordCount,
      additionalInstructions: options?.additionalInstructions,
      
      // AI Provider
      aiProvider: requireAIService(),
    };
  }

  // ============================================================
  // 返回接口
  // ============================================================

  return {
    // 状态
    isGenerating: readonly(isGenerating),
    progress: readonly(progress),
    error: readonly(error),
    generatedContent: readonly(generatedContent),

    // 流水线状态
    currentStep: readonly(currentStep),
    pipelineStatus: readonly(pipelineStatus),
    stepResults: readonly(stepResults),
    
    // 审查状态
    blockingIssues: readonly(blockingIssues),
    reviewResult: readonly(reviewResult),

    // 方法
    writeChapter,
    stopWriting,
    applyGeneratedContent,
    copyToClipboard,
    reset,
    retryCurrentStep,
    skipBlockingIssues,
    
    // 事件
    onPipelineEvent,
  };
}

// ============================================================
// 向后兼容：保留原 useChapterWriter 的核心逻辑
// ============================================================

export { useChapterWriter as createChapterWriter };
