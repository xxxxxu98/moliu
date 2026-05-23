/**
 * 批量写作优化服务
 * 支持进度管理、断点续写、批量处理
 */

import { ref, computed } from 'vue';

// ============================================================
// 类型定义
// ============================================================

export interface BatchWritingConfig {
  /** 最大并发写作数 */
  maxConcurrency: number;
  /** 每章最大字数 */
  maxWordsPerChapter: number;
  /** 每章最小字数 */
  minWordsPerChapter: number;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval: number;
  /** 是否启用断点续写 */
  enableResume: boolean;
  /** 是否启用自动优化 */
  enableAutoOptimize: boolean;
}

export interface BatchChapter {
  chapterNumber: number;
  status: BatchChapterStatus;
  contract?: any;
  content?: string;
  wordCount?: number;
  error?: string;
  retryCount: number;
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export type BatchChapterStatus = 
  | 'pending'    // 待处理
  | 'running'     // 写作中
  | 'reviewing'    // 审查中
  | 'polishing'    // 润色中
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'skipped';     // 跳过

export interface BatchWritingProgress {
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  currentChapter: number;
  progress: number;  // 0-100
  estimatedTimeRemaining?: number;  // 毫秒
  averageChapterTime?: number;  // 毫秒
}

export interface BatchWritingSession {
  id: string;
  startChapter: number;
  endChapter: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
  progress: BatchWritingProgress;
  chapters: BatchChapter[];
  startedAt: string;
  completedAt?: string;
  config: BatchWritingConfig;
}

export interface BatchWritingCallbacks {
  onChapterStart?: (chapter: number) => void;
  onChapterComplete?: (chapter: number, result: any) => void;
  onChapterError?: (chapter: number, error: string) => void;
  onProgressUpdate?: (progress: BatchWritingProgress) => void;
  onSessionComplete?: (session: BatchWritingSession) => void;
}

// ============================================================
// 批量写作管理器
// ============================================================

export class BatchWritingManager {
  private config: BatchWritingConfig;
  private session: BatchWritingSession | null = null;
  private callbacks: BatchWritingCallbacks = {};
  private abortController: AbortController | null = null;
  private chapterTimes: number[] = [];

  // 状态
  private isRunning = ref(false);
  private isPaused = ref(false);

  constructor(config: Partial<BatchWritingConfig> = {}) {
    this.config = {
      maxConcurrency: 1,
      maxWordsPerChapter: 5000,
      minWordsPerChapter: 2000,
      autoSaveInterval: 5000,
      enableResume: true,
      enableAutoOptimize: true,
      ...config,
    };
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: BatchWritingCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 开始批量写作
   */
  async start(
    startChapter: number,
    endChapter: number,
    getContract: (chapter: number) => any | null,
    writeChapter: (chapter: number, contract: any) => Promise<any>
  ): Promise<BatchWritingSession> {
    // 创建会话
    this.session = this.createSession(startChapter, endChapter);
    this.abortController = new AbortController();
    this.isRunning.value = true;
    this.isPaused.value = false;

    try {
      // 初始化章节
      for (let ch = startChapter; ch <= endChapter; ch++) {
        this.session.chapters.push({
          chapterNumber: ch,
          status: 'pending',
          contract: getContract(ch),
          retryCount: 0,
        });
      }

      // 执行写作
      await this.executeBatch(writeChapter);

      this.session.status = 'completed';
      this.session.completedAt = new Date().toISOString();
    } catch (error) {
      this.session.status = 'failed';
      console.error('[BatchWriting] Session failed:', error);
    } finally {
      this.isRunning.value = false;
      this.callbacks.onSessionComplete?.(this.session);
    }

    return this.session;
  }

  /**
   * 暂停
   */
  pause(): void {
    if (this.isRunning.value && !this.isPaused.value) {
      this.isPaused.value = true;
      if (this.session) {
        this.session.status = 'paused';
      }
    }
  }

  /**
   * 恢复
   */
  resume(): void {
    if (this.isRunning.value && this.isPaused.value) {
      this.isPaused.value = false;
      if (this.session) {
        this.session.status = 'running';
      }
    }
  }

  /**
   * 停止
   */
  stop(): void {
    this.abortController?.abort();
    this.isRunning.value = false;
    this.isPaused.value = false;
    if (this.session) {
      this.session.status = 'failed';
    }
  }

  /**
   * 获取会话
   */
  getSession(): BatchWritingSession | null {
    return this.session;
  }

  /**
   * 获取进度
   */
  getProgress(): BatchWritingProgress | null {
    if (!this.session) return null;
    return this.session.progress;
  }

  /**
   * 是否运行中
   */
  getIsRunning(): boolean {
    return this.isRunning.value;
  }

  /**
   * 是否暂停
   */
  getIsPaused(): boolean {
    return this.isPaused.value;
  }

  // ============================================================
  // 私有方法
  // ============================================================

  private createSession(startChapter: number, endChapter: number): BatchWritingSession {
    const totalChapters = endChapter - startChapter + 1;
    
    return {
      id: `batch-${Date.now()}`,
      startChapter,
      endChapter,
      status: 'running',
      progress: {
        totalChapters,
        completedChapters: 0,
        failedChapters: 0,
        currentChapter: startChapter,
        progress: 0,
      },
      chapters: [],
      startedAt: new Date().toISOString(),
      config: { ...this.config },
    };
  }

  private async executeBatch(
    writeChapter: (chapter: number, contract: any) => Promise<any>
  ): Promise<void> {
    if (!this.session) return;

    for (let i = 0; i < this.session.chapters.length; i++) {
      // 检查是否停止
      if (this.abortController?.signal.aborted) {
        break;
      }

      // 等待如果暂停
      while (this.isPaused.value && !this.abortController?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const chapter = this.session.chapters[i];
      
      // 跳过已完成的（用于断点续写）
      if (chapter.status === 'completed') {
        continue;
      }

      // 执行章节写作
      await this.writeChapter(chapter, writeChapter);

      // 更新进度
      this.updateProgress();
    }
  }

  private async writeChapter(
    chapter: BatchChapter,
    writeChapter: (chapter: number, contract: any) => Promise<any>
  ): Promise<void> {
    if (!this.session) return;

    const startTime = Date.now();
    chapter.status = 'running';
    chapter.startTime = new Date().toISOString();
    this.session.progress.currentChapter = chapter.chapterNumber;

    this.callbacks.onChapterStart?.(chapter.chapterNumber);

    try {
      // 写作
      chapter.status = 'reviewing';
      const result = await writeChapter(chapter.chapterNumber, chapter.contract);

      // 审查
      chapter.status = 'polishing';
      await new Promise(resolve => setTimeout(resolve, 500));

      // 完成
      chapter.status = 'completed';
      chapter.content = result.content;
      chapter.wordCount = result.wordCount;
      chapter.endTime = new Date().toISOString();
      chapter.duration = Date.now() - startTime;

      this.chapterTimes.push(chapter.duration);
      
      this.callbacks.onChapterComplete?.(chapter.chapterNumber, result);
    } catch (error) {
      chapter.status = 'failed';
      chapter.error = String(error);
      chapter.endTime = new Date().toISOString();
      chapter.duration = Date.now() - startTime;

      this.callbacks.onChapterError?.(chapter.chapterNumber, String(error));
    }
  }

  private updateProgress(): void {
    if (!this.session) return;

    const completed = this.session.chapters.filter(
      c => c.status === 'completed' || c.status === 'failed'
    ).length;

    this.session.progress.completedChapters = this.session.chapters.filter(
      c => c.status === 'completed'
    ).length;

    this.session.progress.failedChapters = this.session.chapters.filter(
      c => c.status === 'failed'
    ).length;

    this.session.progress.progress = Math.round(
      (completed / this.session.progress.totalChapters) * 100
    );

    // 计算预计剩余时间
    if (this.chapterTimes.length > 0) {
      const avgTime = this.chapterTimes.reduce((a, b) => a + b, 0) / this.chapterTimes.length;
      const remaining = this.session.progress.totalChapters - completed;
      this.session.progress.estimatedTimeRemaining = avgTime * remaining;
      this.session.progress.averageChapterTime = avgTime;
    }

    this.callbacks.onProgressUpdate?.(this.session.progress);
  }
}

// ============================================================
// Composable
// ============================================================

export function useBatchWriting(defaultConfig?: Partial<BatchWritingConfig>) {
  const manager = new BatchWritingManager(defaultConfig);

  const isRunning = computed(() => manager.getIsRunning());
  const isPaused = computed(() => manager.getIsPaused());
  const progress = computed(() => manager.getProgress());
  const session = computed(() => manager.getSession());

  return {
    // 状态
    isRunning,
    isPaused,
    progress,
    session,

    // 方法
    start: manager.start.bind(manager),
    pause: manager.pause.bind(manager),
    resume: manager.resume.bind(manager),
    stop: manager.stop.bind(manager),
    setCallbacks: manager.setCallbacks.bind(manager),
  };
}

// ============================================================
// 导出
// ============================================================

export {
  BatchWritingManager,
  type BatchWritingConfig,
  type BatchChapter,
  type BatchWritingProgress,
  type BatchWritingSession,
  type BatchWritingCallbacks,
};
