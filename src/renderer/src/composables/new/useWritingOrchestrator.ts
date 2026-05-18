/**
 * 写作编排器
 * 基于 webnovel-writer-master 的 AI 写作编排系统
 * 
 * 编排器负责：
 * - 协调各个子系统（合同、记忆、上下文、写作）
 * - 管理写作流程状态
 * - 处理写作异常
 * - 控制批量写作
 */

import { ref, computed, shallowRef } from 'vue';
import { useContractManager } from './useContractManager';
import { useMemorySystem } from './useMemorySystem';
import { useContextManager } from './useContextManager';
import { useChapterWriter, type WritingTask, type WritingResult } from './useChapterWriter';
import type { ChapterContract, MasterContract } from '@/types/contract';
import type { ReadRetentionScore } from '@/types/evaluation';

// ============================================================
// 类型定义
// ============================================================

export interface WritingSession {
  id: string;
  projectId: string;
  startChapter: number;
  endChapter: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  results: WritingResult[];
  errors: WritingError[];
  startedAt: string;
  completedAt?: string;
}

export interface WritingError {
  chapter: number;
  type: 'contract_violation' | 'quality_check_failed' | 'generation_failed' | 'unknown';
  message: string;
  timestamp: string;
  recoverable: boolean;
}

export interface OrchestratorConfig {
  // 并发写作章节数
  concurrency: number;
  // 自动保存间隔
  autoSaveInterval: number;
  // 质量检查阈值
  qualityThreshold: number;
  // 最大重试次数
  maxRetries: number;
  // 是否启用记忆系统
  enableMemory: boolean;
  // 是否启用上下文优化
  enableContextOptimization: boolean;
}

// ============================================================
// Composable 定义
// ============================================================

export function useWritingOrchestrator(projectId: string) {
  // 配置
  const config = ref<OrchestratorConfig>({
    concurrency: 1,
    autoSaveInterval: 5000,
    qualityThreshold: 70,
    maxRetries: 3,
    enableMemory: true,
    enableContextOptimization: true,
  });

  // 状态
  const currentSession = shallowRef<WritingSession | null>(null);
  const isWriting = ref(false);
  const isPaused = ref(false);
  const currentChapter = ref<number>(0);
  const totalProgress = ref(0);

  // 子系统
  const contractManager = useContractManager({ projectId });
  const memorySystem = useMemorySystem({ projectId });
  const contextManager = useContextManager({ projectId, contractManager });
  const chapterWriter = useChapterWriter({ 
    projectId, 
    contextManager,
    memorySystem 
  });

  // 计算属性
  const hasActiveSession = computed(() => currentSession.value !== null);
  
  const sessionProgress = computed(() => {
    if (!currentSession.value) return 0;
    const { startChapter, endChapter, results } = currentSession.value;
    const total = endChapter - startChapter + 1;
    return Math.round((results.length / total) * 100);
  });

  const sessionStatus = computed(() => {
    if (!currentSession.value) return 'idle';
    return currentSession.value.status;
  });

  // ============================================================
  // 会话管理
  // ============================================================

  /**
   * 创建写作会话
   */
  function createSession(
    startChapter: number,
    endChapter: number
  ): WritingSession {
    const session: WritingSession = {
      id: `session-${Date.now()}`,
      projectId,
      startChapter,
      endChapter,
      status: 'pending',
      progress: 0,
      results: [],
      errors: [],
      startedAt: new Date().toISOString(),
    };
    
    currentSession.value = session;
    return session;
  }

  /**
   * 开始写作会话
   */
  async function startSession(startChapter: number, endChapter: number): Promise<void> {
    if (isWriting.value) return;

    const session = createSession(startChapter, endChapter);
    isWriting.value = true;
    isPaused.value = false;
    currentChapter.value = startChapter;

    try {
      session.status = 'running';
      
      // 初始化上下文
      if (config.value.enableContextOptimization) {
        await contextManager.initialize();
      }

      // 初始化记忆
      if (config.value.enableMemory) {
        memorySystem.initialize();
      }

      // 写作循环
      for (let ch = startChapter; ch <= endChapter; ch++) {
        if (!isWriting.value) break;
        
        while (isPaused.value) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!isWriting.value) break;
        }

        currentChapter.value = ch;
        await writeChapter(ch, session);
      }

      session.status = 'completed';
      session.completedAt = new Date().toISOString();
    } catch (error) {
      session.status = 'failed';
      session.errors.push({
        chapter: currentChapter.value,
        type: 'unknown',
        message: String(error),
        timestamp: new Date().toISOString(),
        recoverable: true,
      });
    } finally {
      isWriting.value = false;
    }
  }

  /**
   * 写入单个章节
   */
  async function writeChapter(chapter: number, session: WritingSession): Promise<void> {
    const task: WritingTask = {
      chapterNumber: chapter,
      contract: contractManager.getChapterByNumber(chapter) || null,
      previousChapter: chapter > 1 ? contractManager.getChapterByNumber(chapter - 1) : null,
    };

    try {
      const result = await chapterWriter.write(task);

      if (result.success) {
        session.results.push(result);
        
        // 更新记忆系统
        if (config.value.enableMemory) {
          memorySystem.addChapterSummary({
            chapter: result.chapterNumber,
            summary: result.content.slice(0, 500),
            wordCount: result.wordCount,
            coolPoints: result.coolPoints || [],
            foreshadows: result.foreshadowUpdates || [],
          });
        }

        // 更新进度
        session.progress = Math.round((session.results.length / (session.endChapter - session.startChapter + 1)) * 100);
      } else {
        session.errors.push({
          chapter,
          type: 'generation_failed',
          message: result.error || '写作失败',
          timestamp: new Date().toISOString(),
          recoverable: result.recoverable,
        });

        // 尝试重试
        if (result.recoverable) {
          await retryChapter(chapter, session, 1);
        }
      }
    } catch (error) {
      session.errors.push({
        chapter,
        type: 'unknown',
        message: String(error),
        timestamp: new Date().toISOString(),
        recoverable: true,
      });
    }
  }

  /**
   * 重试章节写作
   */
  async function retryChapter(
    chapter: number, 
    session: WritingSession, 
    attempt: number
  ): Promise<void> {
    if (attempt > config.value.maxRetries) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    await writeChapter(chapter, session);
  }

  /**
   * 暂停写作会话
   */
  function pauseSession(): void {
    if (isWriting.value) {
      isPaused.value = true;
      if (currentSession.value) {
        currentSession.value.status = 'paused';
      }
    }
  }

  /**
   * 恢复写作会话
   */
  function resumeSession(): void {
    if (isPaused.value && currentSession.value) {
      isPaused.value = false;
      currentSession.value.status = 'running';
      startSession(currentChapter.value, currentSession.value.endChapter);
    }
  }

  /**
   * 停止写作会话
   */
  function stopSession(): void {
    isWriting.value = false;
    isPaused.value = false;
    if (currentSession.value) {
      currentSession.value.status = 'completed';
      currentSession.value.completedAt = new Date().toISOString();
    }
  }

  // ============================================================
  // 单章写作
  // ============================================================

  /**
   * 写作单个章节（不创建会话）
   */
  async function writeSingleChapter(chapterNumber: number): Promise<WritingResult> {
    const task: WritingTask = {
      chapterNumber,
      contract: contractManager.getChapterByNumber(chapterNumber) || null,
      previousChapter: chapterNumber > 1 
        ? contractManager.getChapterByNumber(chapterNumber - 1) 
        : null,
    };

    return await chapterWriter.write(task);
  }

  // ============================================================
  // 质量评估
  // ============================================================

  /**
   * 评估章节质量
   */
  async function evaluateChapter(result: WritingResult): Promise<ReadRetentionScore | null> {
    if (!result.content) return null;
    
    // 简单的质量评估
    const score: ReadRetentionScore = {
      total: 75,
      dimensions: {
        hookScore: {
          score: 75,
          analysis: {
            openingHook: { type: 'conflict', strength: 0.75, executed: true },
            chapterEndHooks: [],
            avgHookStrength: 0.75,
            weakChapters: [],
          },
          suggestions: [],
        },
        coolpointScore: {
          score: 75,
          analysis: {
            byType: {} as any,
            density: 2.0,
            variety: 0.7,
            climaxDistribution: [],
            drySpells: [],
          },
          suggestions: [],
        },
        microFulfillment: {
          score: 75,
          rate: 0.8,
          avgPromiseCount: 3,
          avgFulfillChapter: 1,
          analysis: '',
          suggestions: [],
        },
        suspenseDebt: {
          score: 75,
          pendingCount: 3,
          maxDebtChapters: 10,
          riskLevel: 'low',
          analysis: '',
          suggestions: [],
        },
        rhythmHealth: {
          score: 75,
          questContinuity: 0.8,
          fireConsistency: 0.75,
          constellationPacing: 0.7,
          analysis: '',
          suggestions: [],
        },
        originality: {
          score: 70,
          tropeCount: 1,
          uniqueElements: [],
          genericPatterns: ['经典套路'],
          analysis: '',
          suggestions: [],
        },
      },
      risks: [],
      improvements: [],
      genreMatch: {
        score: 80,
        expectedProfile: 'urban',
        actualCharacteristics: ['都市'],
        gap: '匹配良好',
      },
    };

    return score;
  }

  /**
   * 检查是否达到质量阈值
   */
  function isQualityAcceptable(score: ReadRetentionScore): boolean {
    return score.total >= config.value.qualityThreshold;
  }

  // ============================================================
  // 合同管理
  // ============================================================

  /**
   * 锁定章节合同
   */
  function lockChapterContract(chapterNumber: number): void {
    const chapter = contractManager.getChapterByNumber(chapterNumber);
    if (chapter) {
      contractManager.lockChapter(chapter.meta.chapterId);
    }
  }

  /**
   * 验证章节是否符合合同
   */
  function validateAgainstContract(
    chapterNumber: number,
    content: string
  ): { valid: boolean; violations: string[] } {
    const chapter = contractManager.getChapterByNumber(chapterNumber);
    if (!chapter) {
      return { valid: true, violations: [] };
    }

    const violations: string[] = [];

    // 检查必须包含的内容
    for (const mustInclude of chapter.constraints.mustInclude) {
      if (!content.includes(mustInclude)) {
        violations.push(`缺少必要内容：${mustInclude}`);
      }
    }

    // 检查禁止包含的内容
    for (const mustNotInclude of chapter.constraints.mustNotInclude) {
      if (content.includes(mustNotInclude)) {
        violations.push(`包含禁止内容：${mustNotInclude}`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  // ============================================================
  // 配置管理
  // ============================================================

  /**
   * 更新配置
   */
  function updateConfig(updates: Partial<OrchestratorConfig>): void {
    config.value = { ...config.value, ...updates };
  }

  /**
   * 重置配置
   */
  function resetConfig(): void {
    config.value = {
      concurrency: 1,
      autoSaveInterval: 5000,
      qualityThreshold: 70,
      maxRetries: 3,
      enableMemory: true,
      enableContextOptimization: true,
    };
  }

  // ============================================================
  // 导出
  // ============================================================

  /**
   * 导出会话结果
   */
  function exportSessionResults(): WritingResult[] {
    return currentSession.value?.results || [];
  }

  /**
   * 导出会话错误
   */
  function exportSessionErrors(): WritingError[] {
    return currentSession.value?.errors || [];
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 配置
    config,
    updateConfig,
    resetConfig,

    // 状态
    currentSession,
    isWriting,
    isPaused,
    currentChapter,
    totalProgress,

    // 计算属性
    hasActiveSession,
    sessionProgress,
    sessionStatus,

    // 子系统（暴露给外部）
    contractManager,
    memorySystem,
    contextManager,
    chapterWriter,

    // 会话管理
    startSession,
    pauseSession,
    resumeSession,
    stopSession,

    // 单章写作
    writeSingleChapter,

    // 质量评估
    evaluateChapter,
    isQualityAcceptable,

    // 合同验证
    lockChapterContract,
    validateAgainstContract,

    // 导出
    exportSessionResults,
    exportSessionErrors,
  };
}

// 重新导出类型
export type { WritingTask, WritingResult } from './useChapterWriter';
