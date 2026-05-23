/**
 * 写作编排器
 * 整合所有子系统
 * 
 * 整合：
 * - WritingPipeline (流水线)
 * - ContractManager (合同系统)
 * - MemoryOrchestrator (记忆系统)
 * - ReaderSignals (追读力信号)
 * - GitBackupManager (备份管理)
 */

import { ref, computed, watch } from 'vue';
import type {
  PipelineConfig,
  PipelineResult,
  PipelineEvent,
  WritingStep,
  PipelineStatus,
  MemoryPack,
  ReaderSignals,
} from './orchestrator/types';
import { DEFAULT_PIPELINE_CONFIG, PipelineStatus as Status, WritingStep as Step } from './orchestrator/types';
import { WritingPipeline } from './orchestrator/WritingPipeline';
import { ContractManager } from './contract/ContractManager';
import { MemoryOrchestrator } from './memory/MemoryOrchestrator';
import { useReaderSignals } from './memory/ReaderSignals';
import { GitBackupManager } from './backup/GitBackupManager';
import { useProjectStore } from '@/stores/project.store';

// ============================================================
// 写作会话状态
// ============================================================

export interface WritingSession {
  id: string;
  startTime: string;
  endTime?: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentChapter: number;
  startChapter: number;
  endChapter: number;
  completedChapters: number[];
  failedChapters: number[];
  config: PipelineConfig;
}

export interface WritingError {
  chapter: number;
  step: WritingStep;
  error: string;
  timestamp: string;
  recoverable: boolean;
}

// ============================================================
// 写作编排器
// ============================================================

export class WritingOrchestrator {
  // Store
  private projectStore = useProjectStore();
  
  // 子系统
  private pipeline: WritingPipeline;
  private contractManager: ContractManager;
  private memoryOrchestrator: MemoryOrchestrator;
  private readerSignalsManager: ReturnType<typeof useReaderSignals>;
  private backupManager: GitBackupManager;
  
  // 状态
  private session = ref<WritingSession | null>(null);
  private errors = ref<WritingError[]>([]);
  private progress = ref({
    currentChapter: 0,
    totalChapters: 0,
    completedChapters: 0,
    failedChapters: 0,
    currentStep: null as WritingStep | null,
    estimatedTimeRemaining: 0,
  });
  
  // 配置
  private config: PipelineConfig;
  
  // 事件回调
  private onChapterComplete?: (chapter: number, result: PipelineResult) => void;
  private onSessionComplete?: (session: WritingSession) => void;
  private onError?: (error: WritingError) => void;
  
  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    
    // 初始化子系统
    this.pipeline = new WritingPipeline(this.config);
    this.contractManager = new ContractManager();
    this.memoryOrchestrator = new MemoryOrchestrator();
    this.readerSignalsManager = useReaderSignals();
    this.backupManager = new GitBackupManager();
    
    // 监听流水线事件
    this.setupPipelineListeners();
  }
  
  // ============================================================
  // 公开 API
  // ============================================================
  
  /**
   * 开始批量写作
   */
  async startBatchWriting(
    startChapter: number,
    endChapter: number,
    config?: Partial<PipelineConfig>
  ): Promise<WritingSession> {
    // 验证项目
    const project = this.projectStore.currentProject;
    if (!project) {
      throw new Error('未找到当前项目');
    }
    
    // 更新配置
    if (config) {
      this.pipeline.updateConfig(config);
    }
    
    // 创建会话
    const session: WritingSession = {
      id: `session_${Date.now()}`,
      startTime: new Date().toISOString(),
      status: 'running',
      currentChapter: startChapter,
      startChapter,
      endChapter,
      completedChapters: [],
      failedChapters: [],
      config: { ...this.config, ...config },
    };
    
    this.session.value = session;
    this.progress.value = {
      currentChapter: startChapter,
      totalChapters: endChapter - startChapter + 1,
      completedChapters: 0,
      failedChapters: 0,
      currentStep: null,
      estimatedTimeRemaining: (endChapter - startChapter + 1) * 5 * 60 * 1000, // 假设每章5分钟
    };
    
    // 初始化子系统
    await this.initializeSubsystems();
    
    // 执行批量写作
    try {
      await this.executeBatchWriteLoop(session);
      
      session.status = 'completed';
      session.endTime = new Date().toISOString();
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      
      this.errors.value.push({
        chapter: this.progress.value.currentChapter,
        step: this.progress.value.currentStep!,
        error: String(error),
        timestamp: new Date().toISOString(),
        recoverable: false,
      });
    }
    
    // 回调
    if (this.onSessionComplete) {
      this.onSessionComplete(session);
    }
    
    return session;
  }
  
  /**
   * 暂停写作
   */
  pause(): void {
    this.pipeline.pause();
    if (this.session.value) {
      this.session.value.status = 'paused';
    }
  }
  
  /**
   * 恢复写作
   */
  resume(): void {
    this.pipeline.resume();
    if (this.session.value) {
      this.session.value.status = 'running';
    }
  }
  
  /**
   * 停止写作
   */
  stop(): void {
    this.pipeline.stop();
    if (this.session.value) {
      this.session.value.status = 'failed';
      this.session.value.endTime = new Date().toISOString();
    }
  }
  
  /**
   * 跳过当前章节
   */
  skipCurrentChapter(): void {
    if (this.session.value) {
      this.session.value.failedChapters.push(this.progress.value.currentChapter);
      this.progress.value.failedChapters++;
    }
  }
  
  /**
   * 重试当前章节
   */
  async retryCurrentChapter(): Promise<void> {
    const chapter = this.progress.value.currentChapter;
    await this.executeSingleChapter(chapter);
  }
  
  /**
   * 设置回调
   */
  setCallbacks(callbacks: {
    onChapterComplete?: (chapter: number, result: PipelineResult) => void;
    onSessionComplete?: (session: WritingSession) => void;
    onError?: (error: WritingError) => void;
  }): void {
    this.onChapterComplete = callbacks.onChapterComplete;
    this.onSessionComplete = callbacks.onSessionComplete;
    this.onError = callbacks.onError;
  }
  
  // ============================================================
  // 计算属性
  // ============================================================
  
  get sessionState() {
    return this.session;
  }
  
  get errorList() {
    return this.errors;
  }
  
  get progressState() {
    return this.progress;
  }
  
  get isRunning() {
    return computed(() => 
      this.session.value?.status === 'running'
    );
  }
  
  get isPaused() {
    return computed(() => 
      this.session.value?.status === 'paused'
    );
  }
  
  // ============================================================
  // 私有方法
  // ============================================================
  
  /**
   * 初始化子系统
   */
  private async initializeSubsystems(): Promise<void> {
    // 1. 加载合同
    await this.contractManager.loadMasterContract();
    
    // 2. 初始化记忆系统
    // (MemoryOrchestrator 已在构造函数中初始化)
    
    // 3. 初始化追读力信号
    // (已在 useReaderSignals 中初始化)
    
    console.log('[WritingOrchestrator] 子系统初始化完成');
  }
  
  /**
   * 执行批量写作循环
   */
  private async executeBatchWriteLoop(session: WritingSession): Promise<void> {
    for (
      let chapter = session.startChapter;
      chapter <= session.endChapter;
      chapter++
    ) {
      // 检查是否停止
      if (session.status === 'failed' || session.status === 'idle') {
        break;
      }
      
      // 检查是否暂停
      while (session.status === 'paused') {
        await this.sleep(1000);
        if (session.status === 'failed' || session.status === 'idle') {
          return;
        }
      }
      
      session.currentChapter = chapter;
      this.progress.value.currentChapter = chapter;
      
      try {
        // 执行单章写作
        const result = await this.executeSingleChapter(chapter);
        
        // 记录完成
        session.completedChapters.push(chapter);
        this.progress.value.completedChapters++;
        
        // 回调
        if (this.onChapterComplete) {
          this.onChapterComplete(chapter, result);
        }
        
      } catch (error) {
        // 记录失败
        session.failedChapters.push(chapter);
        this.progress.value.failedChapters++;
        
        const writingError: WritingError = {
          chapter,
          step: this.progress.value.currentStep!,
          error: String(error),
          timestamp: new Date().toISOString(),
          recoverable: true,
        };
        
        this.errors.value.push(writingError);
        
        // 回调
        if (this.onError) {
          this.onError(writingError);
        }
        
        // 根据配置决定是否继续
        if (!this.config.enableCommit) {
          // 非必须提交模式，继续下一章
          console.warn(`[WritingOrchestrator] 第${chapter}章失败，继续下一章`);
        } else {
          // 必须提交模式，检查是否可恢复
          if (!writingError.recoverable) {
            throw error;
          }
        }
      }
      
      // 更新预估时间
      this.updateEstimatedTime();
    }
  }
  
  /**
   * 执行单章写作
   */
  private async executeSingleChapter(chapter: number): Promise<PipelineResult> {
    console.log(`[WritingOrchestrator] 开始写作第${chapter}章`);
    
    // 1. 构建上下文
    const context = await this.buildChapterContext(chapter);
    
    // 2. 执行流水线
    const result = await this.pipeline.execute(chapter, context);
    
    // 3. 更新追读力信号
    if (result.steps) {
      const reviewStep = result.steps.find(s => s.step === Step.REVIEW);
      if (reviewStep?.data?.reviewResult) {
        this.readerSignalsManager.recordReview(reviewStep.data.reviewResult);
      }
    }
    
    console.log(`[WritingOrchestrator] 第${chapter}章写作完成`);
    
    return result;
  }
  
  /**
   * 构建章节上下文
   */
  private async buildChapterContext(chapter: number): Promise<any> {
    const project = this.projectStore.currentProject;
    
    // 1. 获取记忆包
    const memoryPack = await this.memoryOrchestrator.buildMemoryPack(chapter);
    
    // 2. 获取追读力信号
    const readerSignals = this.readerSignalsManager.getSignals();
    
    // 3. 获取章节合同
    const contract = await this.contractManager.loadChapterContract(chapter);
    
    // 4. 获取前章内容
    const previousChapter = chapter > 1
      ? project?.chapters?.find((c: any) => c.orderIndex + 1 === chapter - 1)
      : null;
    
    // 5. 获取前章摘要
    const memoryQuery = this.memoryOrchestrator.query({
      chapter: chapter - 1,
      layers: ['working', 'episodic'],
      limit: 5,
    });
    
    return {
      project,
      chapter,
      memoryPack,
      readerSignals,
      contract,
      previousChapter,
      previousSummary: memoryQuery.items.map(i => i.value).join('\n'),
      targetWordCount: project?.settings?.targetWordCountPerChapter || 3000,
    };
  }
  
  /**
   * 设置流水线监听器
   */
  private setupPipelineListeners(): void {
    this.pipeline.addEventListener((event: PipelineEvent) => {
      switch (event.type) {
        case 'step_start':
          this.progress.value.currentStep = event.step!;
          break;
          
        case 'step_complete':
          console.log(`[Pipeline] 步骤完成: ${event.step}`);
          break;
          
        case 'step_error':
          console.error(`[Pipeline] 步骤错误: ${event.step}`, event.error);
          break;
          
        case 'pipeline_complete':
          console.log(`[Pipeline] 章节完成: ${event.chapterNumber}`);
          break;
          
        case 'pipeline_error':
          console.error(`[Pipeline] 章节错误: ${event.chapterNumber}`, event.error);
          break;
      }
    });
  }
  
  /**
   * 更新预估剩余时间
   */
  private updateEstimatedTime(): void {
    const completed = this.progress.value.completedChapters;
    const total = this.progress.value.totalChapters;
    const remaining = total - completed - this.progress.value.failedChapters;
    
    // 假设平均每章5分钟
    this.progress.value.estimatedTimeRemaining = remaining * 5 * 60 * 1000;
  }
  
  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useWritingOrchestrator() {
  const orchestrator = new WritingOrchestrator();
  
  return {
    orchestrator,
    
    // 状态
    session: orchestrator.sessionState,
    errors: orchestrator.errorList,
    progress: orchestrator.progressState,
    isRunning: orchestrator.isRunning,
    isPaused: orchestrator.isPaused,
    
    // 方法
    startBatchWriting: (start: number, end: number, config?: Partial<PipelineConfig>) =>
      orchestrator.startBatchWriting(start, end, config),
    pause: () => orchestrator.pause(),
    resume: () => orchestrator.resume(),
    stop: () => orchestrator.stop(),
    skipCurrentChapter: () => orchestrator.skipCurrentChapter(),
    retryCurrentChapter: () => orchestrator.retryCurrentChapter(),
    setCallbacks: (callbacks) => orchestrator.setCallbacks(callbacks),
  };
}
