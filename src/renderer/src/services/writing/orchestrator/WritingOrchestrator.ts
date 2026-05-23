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

import { ref, computed } from 'vue';
import type {
  PipelineConfig,
  PipelineResult,
  PipelineEvent,
  WritingStep,
} from './orchestrator/types';
import { DEFAULT_PIPELINE_CONFIG, PipelineStatus as Status, WritingStep as Step } from './orchestrator/types';
import { WritingPipeline } from './orchestrator/WritingPipeline';
import { ContractManager } from './contract/ContractManager';
import { MemoryOrchestrator } from './memory/MemoryOrchestrator';
import { useReaderSignals } from './memory/ReaderSignals';
import { GitBackupManager } from './backup/GitBackupManager';
import { useProjectStore } from '@/stores/project.store';

// ============================================================
// 类型定义
// ============================================================

export interface OrchestratorEvent {
  type: 'session_start' | 'session_pause' | 'session_resume' | 'session_complete' | 'session_error' |
        'chapter_start' | 'chapter_complete' | 'chapter_error' |
        'step_start' | 'step_complete' | 'step_error';
  data?: Record<string, unknown>;
  error?: string;
  chapter?: number;
  step?: WritingStep;
}

export type OrchestratorListener = (event: OrchestratorEvent) => void;

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
  private sessionRef = ref<SessionState | null>(null);
  private errorsRef = ref<ErrorRecord[]>([]);
  private progressRef = ref({
    currentChapter: 0,
    totalChapters: 0,
    completedChapters: 0,
    failedChapters: 0,
    currentStep: null as WritingStep | null,
    estimatedTimeRemaining: 0,
  });
  
  // 监听器
  private listeners: Set<OrchestratorListener> = new Set();
  
  // 配置
  private config: PipelineConfig;
  
  // 事件回调
  private onChapterComplete?: (chapter: number, result: PipelineResult) => void;
  private onSessionComplete?: (session: SessionState) => void;
  private onError?: (error: ErrorRecord) => void;
  
  // ============================================================
  // 会话状态接口
  // ============================================================
  
  interface SessionState {
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
  
  interface ErrorRecord {
    chapter: number;
    step: WritingStep;
    error: string;
    timestamp: string;
    recoverable: boolean;
  }
  
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
  // 事件监听
  // ============================================================
  
  /**
   * 添加事件监听器
   */
  addEventListener(listener: OrchestratorListener): void {
    this.listeners.add(listener);
  }
  
  /**
   * 移除事件监听器
   */
  removeEventListener(listener: OrchestratorListener): void {
    this.listeners.delete(listener);
  }
  
  /**
   * 触发事件
   */
  private emit(event: OrchestratorEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('[WritingOrchestrator] 事件监听器错误:', err);
      }
    });
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
  ): Promise<SessionState> {
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
    const session: SessionState = {
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
    
    this.sessionRef.value = session;
    this.progressRef.value = {
      currentChapter: startChapter,
      totalChapters: endChapter - startChapter + 1,
      completedChapters: 0,
      failedChapters: 0,
      currentStep: null,
      estimatedTimeRemaining: (endChapter - startChapter + 1) * 5 * 60 * 1000,
    };
    
    // 触发事件
    this.emit({ type: 'session_start', data: { startChapter, endChapter, targetChapters: session.config } });
    
    // 初始化子系统
    await this.initializeSubsystems();
    
    // 执行批量写作
    try {
      await this.executeBatchWriteLoop(session);
      
      session.status = 'completed';
      session.endTime = new Date().toISOString();
      
      this.emit({ type: 'session_complete' });
      
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date().toISOString();
      
      const errorRecord: ErrorRecord = {
        chapter: this.progressRef.value.currentChapter,
        step: this.progressRef.value.currentStep!,
        error: String(error),
        timestamp: new Date().toISOString(),
        recoverable: false,
      };
      
      this.errorsRef.value.push(errorRecord);
      this.emit({ type: 'session_error', error: String(error) });
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
    if (this.sessionRef.value) {
      this.sessionRef.value.status = 'paused';
    }
    this.emit({ type: 'session_pause' });
  }
  
  /**
   * 恢复写作
   */
  resume(): void {
    this.pipeline.resume();
    if (this.sessionRef.value) {
      this.sessionRef.value.status = 'running';
    }
    this.emit({ type: 'session_resume' });
  }
  
  /**
   * 停止写作
   */
  stop(): void {
    this.pipeline.stop();
    if (this.sessionRef.value) {
      this.sessionRef.value.status = 'failed';
      this.sessionRef.value.endTime = new Date().toISOString();
    }
    this.emit({ type: 'session_error', error: '用户停止写作' });
  }
  
  /**
   * 跳过当前章节
   */
  skipCurrentChapter(): void {
    if (this.sessionRef.value) {
      this.sessionRef.value.failedChapters.push(this.progressRef.value.currentChapter);
      this.progressRef.value.failedChapters++;
    }
  }
  
  /**
   * 重试当前章节
   */
  async retryCurrentChapter(): Promise<void> {
    const chapter = this.progressRef.value.currentChapter;
    await this.executeSingleChapter(chapter);
  }
  
  /**
   * 设置回调
   */
  setCallbacks(callbacks: {
    onChapterComplete?: (chapter: number, result: PipelineResult) => void;
    onSessionComplete?: (session: SessionState) => void;
    onError?: (error: ErrorRecord) => void;
  }): void {
    this.onChapterComplete = callbacks.onChapterComplete;
    this.onSessionComplete = callbacks.onSessionComplete;
    this.onError = callbacks.onError;
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    this.pipeline.updateConfig(config);
  }
  
  // ============================================================
  // 计算属性
  // ============================================================
  
  get sessionState() {
    return this.sessionRef;
  }
  
  get errorList() {
    return this.errorsRef;
  }
  
  get progressState() {
    return this.progressRef;
  }
  
  get isRunning() {
    return computed(() => 
      this.sessionRef.value?.status === 'running'
    );
  }
  
  get isPaused() {
    return computed(() => 
      this.sessionRef.value?.status === 'paused'
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
    
    console.log('[WritingOrchestrator] 子系统初始化完成');
  }
  
  /**
   * 执行批量写作循环
   */
  private async executeBatchWriteLoop(session: SessionState): Promise<void> {
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
      this.progressRef.value.currentChapter = chapter;
      
      this.emit({ type: 'chapter_start', chapter, data: { chapterIndex: chapter } });
      
      try {
        // 执行单章写作
        const result = await this.executeSingleChapter(chapter);
        
        // 记录完成
        session.completedChapters.push(chapter);
        this.progressRef.value.completedChapters++;
        
        this.emit({ type: 'chapter_complete', chapter });
        
        // 回调
        if (this.onChapterComplete) {
          this.onChapterComplete(chapter, result);
        }
        
      } catch (error) {
        // 记录失败
        session.failedChapters.push(chapter);
        this.progressRef.value.failedChapters++;
        
        const writingError: ErrorRecord = {
          chapter,
          step: this.progressRef.value.currentStep!,
          error: String(error),
          timestamp: new Date().toISOString(),
          recoverable: true,
        };
        
        this.errorsRef.value.push(writingError);
        
        this.emit({ type: 'chapter_error', chapter, error: String(error) });
        
        // 回调
        if (this.onError) {
          this.onError(writingError);
        }
        
        // 根据配置决定是否继续
        if (!this.config.enableCommit) {
          console.warn(`[WritingOrchestrator] 第${chapter}章失败，继续下一章`);
        } else {
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
  private async buildChapterContext(chapter: number): Promise<Record<string, unknown>> {
    const project = this.projectStore.currentProject;
    
    // 1. 获取记忆包
    const memoryPack = await this.memoryOrchestrator.buildMemoryPack(chapter);
    
    // 2. 获取追读力信号
    const readerSignals = this.readerSignalsManager.getSignals();
    
    // 3. 获取章节合同
    const contract = await this.contractManager.loadChapterContract(chapter);
    
    // 4. 获取前章内容
    const previousChapter = chapter > 1
      ? project?.chapters?.find((c) => c.orderIndex + 1 === chapter - 1)
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
          this.progressRef.value.currentStep = event.step!;
          this.emit({ type: 'step_start', step: event.step });
          break;
          
        case 'step_complete':
          this.emit({ type: 'step_complete', step: event.step, data: event.data });
          break;
          
        case 'step_error':
          this.emit({ type: 'step_error', step: event.step, error: event.error });
          break;
          
        case 'pipeline_complete':
          this.emit({ type: 'step_complete', data: { chapterNumber: event.chapterNumber } });
          break;
          
        case 'pipeline_error':
          this.emit({ type: 'step_error', error: event.error });
          break;
      }
    });
  }
  
  /**
   * 更新预估剩余时间
   */
  private updateEstimatedTime(): void {
    const completed = this.progressRef.value.completedChapters;
    const total = this.progressRef.value.totalChapters;
    const remaining = total - completed - this.progressRef.value.failedChapters;
    
    this.progressRef.value.estimatedTimeRemaining = remaining * 5 * 60 * 1000;
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
    updateConfig: (config) => orchestrator.updateConfig(config),
    
    // 事件订阅
    addEventListener: (listener: OrchestratorListener) => orchestrator.addEventListener(listener),
    removeEventListener: (listener: OrchestratorListener) => orchestrator.removeEventListener(listener),
  };
}
