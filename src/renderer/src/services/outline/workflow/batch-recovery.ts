/**
 * Batch Recovery System
 * 批次恢复机制 - 批次生成失败后的断点续传
 * 从 webnovel-writer 借鉴的批次恢复策略
 */

import type { ChapterCommit, VolumeContract } from '../contracts';

/**
 * 批次任务类型
 */
export type BatchTaskType = 
  | 'volume_batch'     // 卷批量生成
  | 'chapter_batch'     // 章批量生成
  | 'beat_batch'       // 节拍表批量生成
  | 'outline_batch';   // 大纲批量生成

/**
 * 批次任务状态
 */
export type BatchTaskStatus = 
  | 'pending'      // 待执行
  | 'running'      // 执行中
  | 'paused'       // 已暂停
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'cancelled';   // 已取消

/**
 * 批次任务条目
 */
export interface BatchTaskItem {
  id: string;
  index: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  content?: ChapterCommit | VolumeContract;
  error?: string;
  retries: number;
  startedAt?: string;
  completedAt?: string;
}

/**
 * 批次任务
 */
export interface BatchTask {
  id: string;
  type: BatchTaskType;
  name: string;
  status: BatchTaskStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  items: BatchTaskItem[];
  progress: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 恢复点
 */
export interface RecoveryPoint {
  taskId: string;
  lastCompletedIndex: number;
  timestamp: string;
  context: Record<string, any>;
  items: BatchTaskItem[];
}

/**
 * 批次配置
 */
export interface BatchConfig {
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
  autoSave: boolean;
  saveInterval: number;
  continueOnError: boolean;
}

/**
 * 批次执行结果
 */
export interface BatchExecutionResult {
  success: boolean;
  taskId: string;
  completedItems: number;
  failedItems: number;
  results: (ChapterCommit | VolumeContract | null)[];
  errors: string[];
}

/**
 * 批次恢复管理器
 */
export class BatchRecovery {
  private tasks: Map<string, BatchTask> = new Map();
  private config: BatchConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    batchSize: 5,
    autoSave: true,
    saveInterval: 5000,
    continueOnError: true,
  };
  private saveCallback?: (recoveryPoint: RecoveryPoint) => void;
  private loadCallback?: () => RecoveryPoint[] | null;

  /**
   * 配置批次管理器
   */
  configure(config: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置保存回调
   */
  setSaveCallback(callback: (point: RecoveryPoint) => void): void {
    this.saveCallback = callback;
  }

  /**
   * 设置加载回调
   */
  setLoadCallback(callback: () => RecoveryPoint[] | null): void {
    this.loadCallback = callback;
  }

  /**
   * 创建批次任务
   */
  createTask(
    type: BatchTaskType,
    name: string,
    itemCount: number,
    metadata?: Record<string, any>
  ): BatchTask {
    const task: BatchTask = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      name,
      status: 'pending',
      totalItems: itemCount,
      completedItems: 0,
      failedItems: 0,
      items: [],
      progress: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata,
    };

    // 创建任务条目
    for (let i = 0; i < itemCount; i++) {
      task.items.push({
        id: `item-${i}`,
        index: i,
        status: 'pending',
        retries: 0,
      });
    }

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): BatchTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): BatchTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 开始批次任务
   */
  async startTask(
    taskId: string,
    executor: (item: BatchTaskItem, context: any) => Promise<any>
  ): Promise<BatchExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        success: false,
        taskId,
        completedItems: 0,
        failedItems: 0,
        results: [],
        errors: ['任务不存在'],
      };
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();

    const results: any[] = [];
    const errors: string[] = [];
    const context: Record<string, any> = { taskId };

    for (let i = 0; i < task.items.length; i++) {
      const item = task.items[i];
      
      if (item.status === 'completed' || item.status === 'skipped') {
        results.push(item.content);
        errors.push('');
        continue;
      }

      item.status = 'processing';
      item.startedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();

      try {
        const result = await executor(item, context);
        item.status = 'completed';
        item.content = result;
        item.completedAt = new Date().toISOString();
        task.completedItems++;
        results.push(result);
        errors.push('');

      } catch (error) {
        item.retries++;
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        item.error = errorMessage;

        if (item.retries >= this.config.maxRetries) {
          item.status = 'failed';
          task.failedItems++;
          results.push(null);
          errors.push(errorMessage);
          
          if (!this.config.continueOnError) {
            task.status = 'failed';
            task.error = `在第 ${i + 1} 项失败：${errorMessage}`;
            break;
          }
        } else {
          // 等待后重试
          await this.delay(this.config.retryDelay);
          i--; // 重试当前项
        }
      }

      // 更新进度
      task.progress = Math.round((task.completedItems / task.totalItems) * 100);

      // 自动保存
      if (this.config.autoSave && this.saveCallback && i % this.getSaveInterval() === 0) {
        this.saveRecoveryPoint(task);
      }
    }

    // 判断最终状态
    if (task.failedItems === task.totalItems) {
      task.status = 'failed';
    } else if (task.completedItems + task.failedItems === task.totalItems) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    }

    task.updatedAt = new Date().toISOString();

    return {
      success: task.status !== 'failed',
      taskId,
      completedItems: task.completedItems,
      failedItems: task.failedItems,
      results,
      errors,
    };
  }

  /**
   * 暂停任务
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.status = 'paused';
    task.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * 恢复任务
   */
  async resumeTask(
    taskId: string,
    executor: (item: BatchTaskItem, context: any) => Promise<any>
  ): Promise<BatchExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') {
      return {
        success: false,
        taskId,
        completedItems: 0,
        failedItems: 0,
        results: [],
        errors: ['任务不存在或不在暂停状态'],
      };
    }

    task.status = 'running';
    return this.continueFromItem(task, executor, task.items.length);
  }

  /**
   * 从断点继续执行
   */
  private async continueFromItem(
    task: BatchTask,
    executor: (item: BatchTaskItem, context: any) => Promise<any>
  ): Promise<BatchExecutionResult> {
    const results: any[] = [];
    const errors: string[] = [];
    const context: Record<string, any> = { taskId: task.id };

    // 填充已完成的结果
    for (const item of task.items) {
      if (item.status === 'completed' && item.content) {
        results.push(item.content);
        errors.push('');
      } else {
        results.push(null);
        errors.push(item.error || '');
      }
    }

    // 找到下一个待处理的项
    const startIndex = task.items.findIndex(
      item => item.status === 'pending' || item.status === 'processing'
    );

    if (startIndex === -1) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      return {
        success: true,
        taskId: task.id,
        completedItems: task.completedItems,
        failedItems: task.failedItems,
        results,
        errors,
      };
    }

    for (let i = startIndex; i < task.items.length; i++) {
      const item = task.items[i];
      
      if (item.status === 'completed' || item.status === 'skipped') {
        continue;
      }

      item.status = 'processing';
      item.startedAt = new Date().toISOString();
      task.updatedAt = new Date().toISOString();

      try {
        const result = await executor(item, context);
        item.status = 'completed';
        item.content = result;
        item.completedAt = new Date().toISOString();
        task.completedItems++;
        results[i] = result;
        errors[i] = '';

      } catch (error) {
        item.retries++;
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        item.error = errorMessage;

        if (item.retries >= this.config.maxRetries) {
          item.status = 'failed';
          task.failedItems++;
          results[i] = null;
          errors[i] = errorMessage;
          
          if (!this.config.continueOnError) {
            task.status = 'failed';
            task.error = `在第 ${i + 1} 项失败：${errorMessage}`;
            break;
          }
        } else {
          await this.delay(this.config.retryDelay);
          i--;
        }
      }

      task.progress = Math.round((task.completedItems / task.totalItems) * 100);

      if (this.config.autoSave && this.saveCallback && i % this.getSaveInterval() === 0) {
        this.saveRecoveryPoint(task);
      }
    }

    if (task.failedItems === task.totalItems) {
      task.status = 'failed';
    } else if (task.completedItems + task.failedItems === task.totalItems) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    }

    task.updatedAt = new Date().toISOString();

    return {
      success: task.status !== 'failed',
      taskId: task.id,
      completedItems: task.completedItems,
      failedItems: task.failedItems,
      results,
      errors,
    };
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed') return false;

    task.status = 'cancelled';
    task.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): boolean {
    return this.tasks.delete(taskId);
  }

  /**
   * 获取恢复点
   */
  getRecoveryPoint(taskId: string): RecoveryPoint | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const lastCompletedIndex = task.items.findIndex(
      item => item.status !== 'completed' && item.status !== 'skipped'
    ) - 1;

    return {
      taskId,
      lastCompletedIndex: Math.max(0, lastCompletedIndex),
      timestamp: new Date().toISOString(),
      context: task.metadata || {},
      items: task.items,
    };
  }

  /**
   * 从恢复点恢复
   */
  async restoreFromRecoveryPoint(
    recoveryPoint: RecoveryPoint,
    executor: (item: BatchTaskItem, context: any) => Promise<any>
  ): Promise<BatchExecutionResult> {
    // 查找或创建任务
    let task = this.tasks.get(recoveryPoint.taskId);
    
    if (!task) {
      task = {
        id: recoveryPoint.taskId,
        type: 'chapter_batch',
        name: '恢复的任务',
        status: 'paused',
        totalItems: recoveryPoint.items.length,
        completedItems: 0,
        failedItems: 0,
        items: recoveryPoint.items,
        progress: 0,
        startedAt: recoveryPoint.timestamp,
        updatedAt: new Date().toISOString(),
        metadata: recoveryPoint.context,
      };
      this.tasks.set(task.id, task);
    }

    // 重置失败项为待处理
    for (const item of task.items) {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.retries = 0;
        item.error = undefined;
      }
    }

    // 重新统计
    task.completedItems = task.items.filter(i => i.status === 'completed').length;
    task.failedItems = 0;
    task.status = 'paused';

    return this.resumeTask(task.id, executor);
  }

  /**
   * 保存恢复点
   */
  private saveRecoveryPoint(task: BatchTask): void {
    if (!this.saveCallback) return;

    const recoveryPoint = this.getRecoveryPoint(task.id);
    if (recoveryPoint) {
      this.saveCallback(recoveryPoint);
    }
  }

  /**
   * 加载恢复点
   */
  loadRecoveryPoints(): RecoveryPoint[] {
    if (this.loadCallback) {
      return this.loadCallback() || [];
    }
    return [];
  }

  /**
   * 获取失败项
   */
  getFailedItems(taskId: string): BatchTaskItem[] {
    const task = this.tasks.get(taskId);
    if (!task) return [];
    return task.items.filter(item => item.status === 'failed');
  }

  /**
   * 重试失败项
   */
  async retryFailedItems(
    taskId: string,
    executor: (item: BatchTaskItem, context: any) => Promise<any>
  ): Promise<BatchExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        success: false,
        taskId,
        completedItems: 0,
        failedItems: 0,
        results: [],
        errors: ['任务不存在'],
      };
    }

    // 重置失败项
    for (const item of task.items) {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.retries = 0;
      }
    }

    task.failedItems = 0;
    task.status = 'running';

    return this.continueFromItem(task, executor);
  }

  /**
   * 生成进度报告
   */
  generateProgressReport(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) return '任务不存在';

    const lines: string[] = [];
    lines.push(`# 批次任务：${task.name}`);
    lines.push('');
    lines.push(`**状态**：${this.getStatusText(task.status)}`);
    lines.push(`**进度**：${task.progress}% (${task.completedItems}/${task.totalItems})`);
    lines.push(`**开始时间**：${task.startedAt}`);
    if (task.completedAt) {
      lines.push(`**完成时间**：${task.completedAt}`);
    }
    lines.push('');

    // 进度条
    const barLength = 30;
    const filledLength = Math.round((task.progress / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    lines.push(`**${bar}**`);
    lines.push('');

    // 失败项
    if (task.failedItems > 0) {
      lines.push('## 失败项');
      for (const item of task.items) {
        if (item.status === 'failed') {
          lines.push(`- 第${item.index + 1}项：${item.error}`);
        }
      }
      lines.push('');
    }

    // 错误信息
    if (task.error) {
      lines.push(`**错误信息**：${task.error}`);
    }

    return lines.join('\n');
  }

  // ====== 辅助方法 ======

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getSaveInterval(): number {
    return Math.max(1, Math.floor(this.config.batchSize / 2));
  }

  private getStatusText(status: BatchTaskStatus): string {
    const statusMap: Record<BatchTaskStatus, string> = {
      pending: '待执行',
      running: '执行中',
      paused: '已暂停',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    return statusMap[status] || status;
  }
}

// 导出单例
export const batchRecovery = new BatchRecovery();
