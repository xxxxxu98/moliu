/**
 * 写作监控与日志系统
 * 基于 webnovel-writer 架构
 * 
 * 功能：
 * - 流水线事件日志
 * - 性能监控
 * - 错误追踪
 * - 统计报告
 */

import { ref, computed } from 'vue';

// ============================================================
// 日志级别
// ============================================================

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  chapter?: number;
  step?: string;
}

export type LogCategory =
  | 'pipeline'
  | 'contract'
  | 'memory'
  | 'review'
  | 'polish'
  | 'commit'
  | 'backup'
  | 'system';

// ============================================================
// 性能指标
// ============================================================

export interface PerformanceMetric {
  operation: string;
  chapter?: number;
  step?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
}

export interface PerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  slowestOperation: PerformanceMetric | null;
  fastestOperation: PerformanceMetric | null;
}

// ============================================================
// 章节统计
// ============================================================

export interface ChapterStats {
  chapterNumber: number;
  wordCount: number;
  duration: number;
  stepDurations: Record<string, number>;
  reviewScore?: number;
  antiAIScore?: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

// ============================================================
// 监控管理器
// ============================================================

export class WritingMonitor {
  // 日志
  private logs = ref<LogEntry[]>([]);
  
  // 性能指标
  private metrics = ref<PerformanceMetric[]>([]);
  
  // 章节统计
  private chapterStats = ref<Map<number, ChapterStats>>(new Map());
  
  // 当前会话统计
  private sessionStats = ref({
    startTime: 0,
    chaptersCompleted: 0,
    chaptersFailed: 0,
    totalWordsWritten: 0,
    totalDuration: 0,
  });
  
  // 最大日志条数
  private readonly MAX_LOGS = 1000;
  
  // 事件监听器
  private listeners = new Set<(entry: LogEntry) => void>();
  
  // ============================================================
  // 日志 API
  // ============================================================
  
  /**
   * 记录日志
   */
  log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: any,
    chapter?: number,
    step?: string
  ): void {
    const entry: LogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      chapter,
      step,
    };
    
    this.logs.value.push(entry);
    
    // 限制日志数量
    if (this.logs.value.length > this.MAX_LOGS) {
      this.logs.value = this.logs.value.slice(-this.MAX_LOGS);
    }
    
    // 触发监听器
    this.emitLog(entry);
    
    // 控制台输出
    this.outputToConsole(entry);
  }
  
  /**
   * 便捷方法
   */
  debug(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }
  
  info(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }
  
  warn(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }
  
  error(category: LogCategory, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }
  
  /**
   * 获取日志
   */
  getLogs(filter?: {
    level?: LogLevel;
    category?: LogCategory;
    chapter?: number;
    since?: string;
  }): LogEntry[] {
    let filtered = this.logs.value;
    
    if (filter?.level) {
      filtered = filtered.filter(l => l.level === filter.level);
    }
    
    if (filter?.category) {
      filtered = filtered.filter(l => l.category === filter.category);
    }
    
    if (filter?.chapter) {
      filtered = filtered.filter(l => l.chapter === filter.chapter);
    }
    
    if (filter?.since) {
      const since = new Date(filter.since).getTime();
      filtered = filtered.filter(l => new Date(l.timestamp).getTime() >= since);
    }
    
    return filtered;
  }
  
  /**
   * 清除日志
   */
  clearLogs(): void {
    this.logs.value = [];
  }
  
  // ============================================================
  // 性能监控 API
  // ============================================================
  
  /**
   * 开始计时
   */
  startTimer(operation: string, chapter?: number, step?: string): string {
    const metricId = `metric_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    this.metrics.value.push({
      operation,
      chapter,
      step,
      startTime: Date.now(),
      success: true,
    });
    
    return metricId;
  }
  
  /**
   * 结束计时
   */
  endTimer(metricId: string, success: boolean = true, error?: string): void {
    const metric = this.metrics.value.find(m => 
      `${m.operation}_${m.startTime}` === metricId || 
      `metric_${m.startTime}` === metricId.slice(0, -8)
    );
    
    if (metric) {
      metric.endTime = Date.now();
      metric.duration = metric.endTime - metric.startTime;
      metric.success = success;
      metric.error = error;
    }
  }
  
  /**
   * 记录操作
   */
  recordOperation(metric: PerformanceMetric): void {
    this.metrics.value.push(metric);
    
    // 限制数量
    if (this.metrics.value.length > 500) {
      this.metrics.value = this.metrics.value.slice(-500);
    }
  }
  
  /**
   * 获取性能统计
   */
  getPerformanceStats(): PerformanceStats {
    const completed = this.metrics.value.filter(m => m.duration !== undefined);
    
    if (completed.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        slowestOperation: null,
        fastestOperation: null,
      };
    }
    
    const successful = completed.filter(m => m.success);
    const failed = completed.filter(m => !m.success);
    const durations = completed.map(m => m.duration!).filter(d => d > 0);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    
    const sorted = [...completed].sort((a, b) => (b.duration || 0) - (a.duration || 0));
    
    return {
      totalOperations: completed.length,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      averageDuration,
      slowestOperation: sorted[0] || null,
      fastestOperation: sorted[sorted.length - 1] || null,
    };
  }
  
  /**
   * 获取操作耗时排名
   */
  getOperationRankings(): { operation: string; averageDuration: number; count: number }[] {
    const grouped = new Map<string, { total: number; count: number }>();
    
    for (const metric of this.metrics.value) {
      if (metric.duration) {
        const existing = grouped.get(metric.operation) || { total: 0, count: 0 };
        grouped.set(metric.operation, {
          total: existing.total + metric.duration,
          count: existing.count + 1,
        });
      }
    }
    
    return Array.from(grouped.entries())
      .map(([operation, { total, count }]) => ({
        operation,
        averageDuration: total / count,
        count,
      }))
      .sort((a, b) => b.averageDuration - a.averageDuration);
  }
  
  // ============================================================
  // 章节统计 API
  // ============================================================
  
  /**
   * 记录章节统计
   */
  recordChapterStats(stats: ChapterStats): void {
    this.chapterStats.value.set(stats.chapterNumber, stats);
    
    // 更新会话统计
    this.sessionStats.value.chaptersCompleted++;
    this.sessionStats.value.totalWordsWritten += stats.wordCount;
    this.sessionStats.value.totalDuration += stats.duration;
    
    if (stats.status === 'failed') {
      this.sessionStats.value.chaptersFailed++;
    }
  }
  
  /**
   * 获取章节统计
   */
  getChapterStats(chapter: number): ChapterStats | undefined {
    return this.chapterStats.value.get(chapter);
  }
  
  /**
   * 获取所有章节统计
   */
  getAllChapterStats(): ChapterStats[] {
    return Array.from(this.chapterStats.value.values()).sort(
      (a, b) => a.chapterNumber - b.chapterNumber
    );
  }
  
  /**
   * 获取会话统计
   */
  getSessionStats() {
    return { ...this.sessionStats.value };
  }
  
  /**
   * 获取平均章节数据
   */
  getAverageChapterStats(): {
    averageWordCount: number;
    averageDuration: number;
    averageReviewScore: number;
    averageAntiAIScore: number;
    successRate: number;
  } {
    const stats = this.getAllChapterStats();
    
    if (stats.length === 0) {
      return {
        averageWordCount: 0,
        averageDuration: 0,
        averageReviewScore: 0,
        averageAntiAIScore: 0,
        successRate: 0,
      };
    }
    
    const successful = stats.filter(s => s.status === 'success');
    
    return {
      averageWordCount: stats.reduce((sum, s) => sum + s.wordCount, 0) / stats.length,
      averageDuration: stats.reduce((sum, s) => sum + s.duration, 0) / stats.length,
      averageReviewScore: successful.reduce((sum, s) => sum + (s.reviewScore || 0), 0) / successful.length,
      averageAntiAIScore: successful.reduce((sum, s) => sum + (s.antiAIScore || 0), 0) / successful.length,
      successRate: (successful.length / stats.length) * 100,
    };
  }
  
  // ============================================================
  // 事件监听
  // ============================================================
  
  /**
   * 添加日志监听器
   */
  addListener(listener: (entry: LogEntry) => void): void {
    this.listeners.add(listener);
  }
  
  /**
   * 移除日志监听器
   */
  removeListener(listener: (entry: LogEntry) => void): void {
    this.listeners.delete(listener);
  }
  
  /**
   * 触发监听器
   */
  private emitLog(entry: LogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (error) {
        console.error('[Monitor] Listener error:', error);
      }
    }
  }
  
  // ============================================================
  // 控制台输出
  // ============================================================
  
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp.slice(11, 19)}] [${entry.category.toUpperCase()}]`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.data || '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.data || '');
        break;
    }
  }
  
  // ============================================================
  // 会话管理
  // ============================================================
  
  /**
   * 开始会话
   */
  startSession(): void {
    this.sessionStats.value = {
      startTime: Date.now(),
      chaptersCompleted: 0,
      chaptersFailed: 0,
      totalWordsWritten: 0,
      totalDuration: 0,
    };
    
    this.info('system', '写作会话开始');
  }
  
  /**
   * 结束会话
   */
  endSession(): void {
    const session = this.getSessionStats();
    const avgStats = this.getAverageChapterStats();
    
    this.info('system', '写作会话结束', {
      ...session,
      ...avgStats,
    });
  }
  
  /**
   * 生成报告
   */
  generateReport(): string {
    const session = this.getSessionStats();
    const avgStats = this.getAverageChapterStats();
    const perfStats = this.getPerformanceStats();
    const rankings = this.getOperationRankings().slice(0, 5);
    const recentLogs = this.getLogs({ since: new Date(Date.now() - 3600000).toISOString() });
    
    const report = `
===============================================
           写作会话报告
===============================================

会话时长: ${((Date.now() - session.startTime) / 60000).toFixed(1)} 分钟
开始时间: ${new Date(session.startTime).toLocaleString()}

【章节统计】
完成章节: ${session.chaptersCompleted} 章
失败章节: ${session.chaptersFailed} 章
总字数: ${session.totalWordsWritten.toLocaleString()} 字
成功率: ${avgStats.successRate.toFixed(1)}%

【平均数据】
平均字数: ${avgStats.averageWordCount.toFixed(0)} 字/章
平均耗时: ${(avgStats.averageDuration / 60000).toFixed(1)} 分钟/章
平均审核分: ${avgStats.averageReviewScore.toFixed(1)}
平均去AI分: ${avgStats.averageAntiAIScore.toFixed(1)}

【性能统计】
总操作数: ${perfStats.totalOperations}
成功操作: ${perfStats.successfulOperations}
失败操作: ${perfStats.failedOperations}
平均耗时: ${(perfStats.averageDuration / 1000).toFixed(1)} 秒

【耗时排名 TOP 5】
${rankings.map((r, i) => `${i + 1}. ${r.operation}: ${(r.averageDuration / 1000).toFixed(1)}s (${r.count}次)`).join('\n')}

【最近日志 (${recentLogs.length}条)】
${recentLogs.slice(-10).map(l => `[${l.level}] ${l.message}`).join('\n')}

===============================================
    `.trim();
    
    return report;
  }
}

// ============================================================
// 全局单例
// ============================================================

let monitorInstance: WritingMonitor | null = null;

export function getWritingMonitor(): WritingMonitor {
  if (!monitorInstance) {
    monitorInstance = new WritingMonitor();
  }
  return monitorInstance;
}

// ============================================================
// Composable 导出
// ============================================================

export function useWritingMonitor() {
  const monitor = getWritingMonitor();
  
  return {
    monitor,
    
    // 日志
    log: (level: LogLevel, category: LogCategory, message: string, data?: any, chapter?: number, step?: string) =>
      monitor.log(level, category, message, data, chapter, step),
    debug: (category: LogCategory, message: string, data?: any) =>
      monitor.debug(category, message, data),
    info: (category: LogCategory, message: string, data?: any) =>
      monitor.info(category, message, data),
    warn: (category: LogCategory, message: string, data?: any) =>
      monitor.warn(category, message, data),
    error: (category: LogCategory, message: string, data?: any) =>
      monitor.error(category, message, data),
    getLogs: (filter?: any) => monitor.getLogs(filter),
    clearLogs: () => monitor.clearLogs(),
    
    // 性能
    startTimer: (operation: string, chapter?: number, step?: string) =>
      monitor.startTimer(operation, chapter, step),
    endTimer: (metricId: string, success?: boolean, error?: string) =>
      monitor.endTimer(metricId, success, error),
    getPerformanceStats: () => monitor.getPerformanceStats(),
    getOperationRankings: () => monitor.getOperationRankings(),
    
    // 章节统计
    recordChapterStats: (stats: ChapterStats) => monitor.recordChapterStats(stats),
    getChapterStats: (chapter: number) => monitor.getChapterStats(chapter),
    getAllChapterStats: () => monitor.getAllChapterStats(),
    getSessionStats: () => monitor.getSessionStats(),
    getAverageChapterStats: () => monitor.getAverageChapterStats(),
    
    // 会话
    startSession: () => monitor.startSession(),
    endSession: () => monitor.endSession(),
    generateReport: () => monitor.generateReport(),
  };
}
