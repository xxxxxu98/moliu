/**
 * 写作编排器
 * 协调各个子系统完成批量写作任务
 */

import { ref, computed } from 'vue';
import type {
  PipelineConfig,
  PipelineResult,
  PipelineEvent,
  WritingStep,
} from './orchestrator/types';
import { DEFAULT_PIPELINE_CONFIG, PipelineStatus, WritingStep as Step } from './orchestrator/types';
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
  type:
    | 'session_start'
    | 'session_pause'
    | 'session_resume'
    | 'session_complete'
    | 'session_error'
    | 'chapter_start'
    | 'chapter_complete'
    | 'chapter_error'
    | 'step_start'
    | 'step_complete'
    | 'step_error';
  data?: Record<string, unknown>;
  error?: string;
  chapter?: number;
  step?: WritingStep;
}

export type OrchestratorListener = (event: OrchestratorEvent) => void;

export interface SessionState {
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

export interface ErrorRecord {
  chapter: number;
  step: WritingStep;
  error: string;
  timestamp: string;
  recoverable: boolean;
}

// ============================================================
// 编排器
// ============================================================

export class WritingOrchestrator {
  private readonly _projectStore = useProjectStore();
  private readonly _pipeline: WritingPipeline;
  private readonly _contractManager: ContractManager;
  private readonly _memoryOrchestrator: MemoryOrchestrator;
  private readonly _readerSignalsManager: ReturnType<typeof useReaderSignals>;
  private readonly _backupManager: GitBackupManager;
  private readonly _listeners = new Set<OrchestratorListener>();

  private readonly _sessionRef = ref<SessionState | null>(null);
  private readonly _errorsRef = ref<ErrorRecord[]>([]);
  private readonly _progressRef = ref({
    currentChapter: 0,
    totalChapters: 0,
    completedChapters: 0,
    failedChapters: 0,
    currentStep: null as WritingStep | null,
    estimatedTimeRemaining: 0,
  });

  private _config: PipelineConfig;
  private _onChapterComplete?: (chapter: number, result: PipelineResult) => void;
  private _onSessionComplete?: (session: SessionState) => void;
  private _onError?: (error: ErrorRecord) => void;

  constructor(config?: Partial<PipelineConfig>) {
    this._config = { ...DEFAULT_PIPELINE_CONFIG, ...config };

    this._pipeline = new WritingPipeline(this._config);
    this._contractManager = new ContractManager();
    this._memoryOrchestrator = new MemoryOrchestrator();
    this._readerSignalsManager = useReaderSignals();
    this._backupManager = new GitBackupManager();

    this.setupPipelineListeners();
  }

  // ============================================================
  // 事件监听
  // ============================================================

  addEventListener(listener: OrchestratorListener): void {
    this._listeners.add(listener);
  }

  removeEventListener(listener: OrchestratorListener): void {
    this._listeners.delete(listener);
  }

  private emit(event: OrchestratorEvent): void {
    this._listeners.forEach((listener) => {
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

  async startBatchWriting(
    startChapter: number,
    endChapter: number,
    config?: Partial<PipelineConfig>
  ): Promise<SessionState> {
    const project = this._projectStore.currentProject;
    if (!project) {
      throw new Error('未找到当前项目');
    }

    if (config) {
      this._pipeline.updateConfig(config);
    }

    const session: SessionState = {
      id: `session_${Date.now()}`,
      startTime: new Date().toISOString(),
      status: 'running',
      currentChapter: startChapter,
      startChapter,
      endChapter,
      completedChapters: [],
      failedChapters: [],
      config: { ...this._config, ...config },
    };

    this._sessionRef.value = session;
    this._progressRef.value = {
      currentChapter: startChapter,
      totalChapters: endChapter - startChapter + 1,
      completedChapters: 0,
      failedChapters: 0,
      currentStep: null,
      estimatedTimeRemaining: (endChapter - startChapter + 1) * 5 * 60 * 1000,
    };

    this.emit({ type: 'session_start', data: { startChapter, endChapter, targetChapters: session.config } });

    await this.initializeSubsystems();

    try {
      await this.executeBatchWriteLoop(session);

      session.status = 'completed';
      session.endTime = new Date().toISOString();
      this.emit({ type: 'session_complete' });
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date().toISOString();

      const errorRecord: ErrorRecord = {
        chapter: this._progressRef.value.currentChapter,
        step: this._progressRef.value.currentStep!,
        error: String(error),
        timestamp: new Date().toISOString(),
        recoverable: false,
      };

      this._errorsRef.value.push(errorRecord);
      this.emit({ type: 'session_error', error: String(error) });
    }

    if (this._onSessionComplete) {
      this._onSessionComplete(session);
    }

    return session;
  }

  pause(): void {
    this._pipeline.pause();
    if (this._sessionRef.value) {
      this._sessionRef.value.status = 'paused';
    }
    this.emit({ type: 'session_pause' });
  }

  resume(): void {
    this._pipeline.resume();
    if (this._sessionRef.value) {
      this._sessionRef.value.status = 'running';
    }
    this.emit({ type: 'session_resume' });
  }

  stop(): void {
    this._pipeline.stop();
    if (this._sessionRef.value) {
      this._sessionRef.value.status = 'failed';
      this._sessionRef.value.endTime = new Date().toISOString();
    }
    this.emit({ type: 'session_error', error: '用户停止写作' });
  }

  skipCurrentChapter(): void {
    if (this._sessionRef.value) {
      this._sessionRef.value.failedChapters.push(this._progressRef.value.currentChapter);
      this._progressRef.value.failedChapters++;
    }
  }

  async retryCurrentChapter(): Promise<void> {
    const chapter = this._progressRef.value.currentChapter;
    await this.executeSingleChapter(chapter);
  }

  setCallbacks(callbacks: {
    onChapterComplete?: (chapter: number, result: PipelineResult) => void;
    onSessionComplete?: (session: SessionState) => void;
    onError?: (error: ErrorRecord) => void;
  }): void {
    this._onChapterComplete = callbacks.onChapterComplete;
    this._onSessionComplete = callbacks.onSessionComplete;
    this._onError = callbacks.onError;
  }

  updateConfig(config: Partial<PipelineConfig>): void {
    this._config = { ...this._config, ...config };
    this._pipeline.updateConfig(config);
  }

  // ============================================================
  // 计算属性
  // ============================================================

  get sessionState() {
    return this._sessionRef;
  }

  get errorList() {
    return this._errorsRef;
  }

  get progressState() {
    return this._progressRef;
  }

  get isRunning() {
    return computed(() => this._sessionRef.value?.status === 'running');
  }

  get isPaused() {
    return computed(() => this._sessionRef.value?.status === 'paused');
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private async initializeSubsystems(): Promise<void> {
    await this._contractManager.loadMasterContract();
    console.log('[WritingOrchestrator] 子系统初始化完成');
  }

  private async executeBatchWriteLoop(session: SessionState): Promise<void> {
    for (let chapter = session.startChapter; chapter <= session.endChapter; chapter++) {
      if (session.status === 'failed' || session.status === 'idle') {
        break;
      }

      while (session.status === 'paused') {
        await this.sleep(1000);
        if (session.status === 'failed' || session.status === 'idle') {
          return;
        }
      }

      session.currentChapter = chapter;
      this._progressRef.value.currentChapter = chapter;

      this.emit({ type: 'chapter_start', chapter, data: { chapterIndex: chapter } });

      try {
        const result = await this.executeSingleChapter(chapter);

        session.completedChapters.push(chapter);
        this._progressRef.value.completedChapters++;

        this.emit({ type: 'chapter_complete', chapter });

        if (this._onChapterComplete) {
          this._onChapterComplete(chapter, result);
        }
      } catch (error) {
        session.failedChapters.push(chapter);
        this._progressRef.value.failedChapters++;

        const writingError: ErrorRecord = {
          chapter,
          step: this._progressRef.value.currentStep!,
          error: String(error),
          timestamp: new Date().toISOString(),
          recoverable: true,
        };

        this._errorsRef.value.push(writingError);

        this.emit({ type: 'chapter_error', chapter, error: String(error) });

        if (this._onError) {
          this._onError(writingError);
        }

        if (!this._config.enableCommit) {
          console.warn(`[WritingOrchestrator] 第${chapter}章失败，继续下一章`);
        } else {
          if (!writingError.recoverable) {
            throw error;
          }
        }
      }

      this.updateEstimatedTime();
    }
  }

  private async executeSingleChapter(chapter: number): Promise<PipelineResult> {
    console.log(`[WritingOrchestrator] 开始写作第${chapter}章`);

    const context = await this.buildChapterContext(chapter);
    const result = await this._pipeline.execute(chapter, context);

    if (result.steps) {
      const reviewStep = result.steps.find((s) => s.step === Step.REVIEW);
      if (reviewStep?.data?.reviewResult) {
        this._readerSignalsManager.recordReview(reviewStep.data.reviewResult);
      }
    }

    console.log(`[WritingOrchestrator] 第${chapter}章写作完成`);

    return result;
  }

  private async buildChapterContext(chapter: number): Promise<Record<string, unknown>> {
    const project = this._projectStore.currentProject;

    const memoryPack = await this._memoryOrchestrator.buildMemoryPack(chapter);
    const readerSignals = this._readerSignalsManager.getSignals();
    const contract = await this._contractManager.loadChapterContract(chapter);

    const previousChapter = chapter > 1
      ? project?.chapters?.find((c) => c.orderIndex + 1 === chapter - 1)
      : null;

    const memoryQuery = this._memoryOrchestrator.query({
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
      previousSummary: memoryQuery.items.map((i) => i.value).join('\n'),
      targetWordCount: project?.settings?.targetWordCountPerChapter || 3000,
    };
  }

  private setupPipelineListeners(): void {
    this._pipeline.addEventListener((event: PipelineEvent) => {
      switch (event.type) {
        case 'step_start':
          this._progressRef.value.currentStep = event.step!;
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

  private updateEstimatedTime(): void {
    const completed = this._progressRef.value.completedChapters;
    const total = this._progressRef.value.totalChapters;
    const remaining = total - completed - this._progressRef.value.failedChapters;

    this._progressRef.value.estimatedTimeRemaining = remaining * 5 * 60 * 1000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================
// Composable
// ============================================================

export function useWritingOrchestrator() {
  const orchestrator = new WritingOrchestrator();

  return {
    orchestrator,

    session: orchestrator.sessionState,
    errors: orchestrator.errorList,
    progress: orchestrator.progressState,
    isRunning: orchestrator.isRunning,
    isPaused: orchestrator.isPaused,

    startBatchWriting: (start: number, end: number, config?: Partial<PipelineConfig>) =>
      orchestrator.startBatchWriting(start, end, config),
    pause: () => orchestrator.pause(),
    resume: () => orchestrator.resume(),
    stop: () => orchestrator.stop(),
    skipCurrentChapter: () => orchestrator.skipCurrentChapter(),
    retryCurrentChapter: () => orchestrator.retryCurrentChapter(),
    setCallbacks: (callbacks) => orchestrator.setCallbacks(callbacks),
    updateConfig: (config) => orchestrator.updateConfig(config),

    addEventListener: (listener: OrchestratorListener) => orchestrator.addEventListener(listener),
    removeEventListener: (listener: OrchestratorListener) => orchestrator.removeEventListener(listener),
  };
}
