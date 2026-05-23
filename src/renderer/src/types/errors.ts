/**
 * 应用统一错误类型定义
 * 提供标准化的错误码和错误处理机制
 */

// ============================================
// 错误码枚举
// ============================================

export enum ErrorCode {
  // 项目相关错误 (PROJ_xxx)
  PROJECT_NOT_FOUND = 'PROJ_001',
  PROJECT_CREATE_FAILED = 'PROJ_002',
  PROJECT_SAVE_FAILED = 'PROJ_003',
  PROJECT_LOAD_FAILED = 'PROJ_004',

  // 章节相关错误 (CHAP_xxx)
  CHAPTER_NOT_FOUND = 'CHAP_001',
  CHAPTER_CREATE_FAILED = 'CHAP_002',
  CHAPTER_UPDATE_FAILED = 'CHAP_003',
  CHAPTER_DELETE_FAILED = 'CHAP_004',
  CHAPTER_CONTENT_EMPTY = 'CHAP_005',

  // AI 服务相关错误 (AI_xxx)
  AI_CONNECTION_FAILED = 'AI_001',
  AI_RESPONSE_INVALID = 'AI_002',
  AI_TIMEOUT = 'AI_003',
  AI_QUOTA_EXCEEDED = 'AI_004',
  AI_PROVIDER_NOT_CONFIGURED = 'AI_005',
  AI_GENERATION_FAILED = 'AI_006',
  AI_STREAM_FAILED = 'AI_007',

  // 记忆系统错误 (MEM_xxx)
  MEMORY_EXTRACT_FAILED = 'MEM_001',
  MEMORY_SAVE_FAILED = 'MEM_002',
  MEMORY_LOAD_FAILED = 'MEM_003',
  MEMORY_BACKUP_FAILED = 'MEM_004',

  // 审查系统错误 (REV_xxx)
  REVIEW_FAILED = 'REV_001',
  REVIEW_TIMEOUT = 'REV_002',
  REVIEW_BLOCKED = 'REV_003',

  // 写作任务错误 (WRITE_xxx)
  WRITE_TASK_FAILED = 'WRITE_001',
  WRITE_TASK_CANCELLED = 'WRITE_002',
  WRITE_TASK_ABORTED = 'WRITE_003',
  WRITE_BATCH_IN_PROGRESS = 'WRITE_004',

  // 去 AI 味错误 (DEAI_xxx)
  DEAI_FIX_FAILED = 'DEAI_001',
  DEAI_ANALYSIS_FAILED = 'DEAI_002',

  // 伏笔追踪错误 (FORE_xxx)
  FORESHADOW_EXTRACT_FAILED = 'FORE_001',
  FORESHADOW_TRACK_FAILED = 'FORE_002',

  // 通用错误 (SYS_xxx)
  UNKNOWN_ERROR = 'SYS_001',
  VALIDATION_ERROR = 'SYS_002',
  NETWORK_ERROR = 'SYS_003',
  PERMISSION_DENIED = 'SYS_004',
}

// ============================================
// 错误类别
// ============================================

export enum ErrorCategory {
  PROJECT = 'project',
  CHAPTER = 'chapter',
  AI = 'ai',
  MEMORY = 'memory',
  REVIEW = 'review',
  WRITING = 'writing',
  DEAI = 'deai',
  FESHADOW = 'foreshadow',
  SYSTEM = 'system',
}

// ============================================
// 错误严重级别
// ============================================

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

// ============================================
// 应用错误类
// ============================================

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      details?: Record<string, unknown>;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.code = code;
    this.category = options?.category ?? this.getCategoryFromCode(code);
    this.severity = options?.severity ?? this.getSeverityFromCode(code);
    this.details = options?.details;
    this.context = options?.context;
    this.timestamp = new Date();

    // 保持错误栈追踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * 从错误码推断错误类别
   */
  private getCategoryFromCode(code: ErrorCode): ErrorCategory {
    const prefix = code.split('_')[0].toLowerCase();
    const categoryMap: Record<string, ErrorCategory> = {
      'proj': ErrorCategory.PROJECT,
      'chap': ErrorCategory.CHAPTER,
      'ai': ErrorCategory.AI,
      'mem': ErrorCategory.MEMORY,
      'rev': ErrorCategory.REVIEW,
      'write': ErrorCategory.WRITING,
      'deai': ErrorCategory.DEAI,
      'fore': ErrorCategory.FESHADOW,
      'sys': ErrorCategory.SYSTEM,
    };
    return categoryMap[prefix] ?? ErrorCategory.SYSTEM;
  }

  /**
   * 从错误码推断严重级别
   */
  private getSeverityFromCode(code: ErrorCode): ErrorSeverity {
    const suffix = code.split('_')[1];
    if (['001', '002'].includes(suffix)) {
      return ErrorSeverity.ERROR;
    }
    return ErrorSeverity.WARNING;
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    const messageMap: Record<ErrorCode, string> = {
      [ErrorCode.PROJECT_NOT_FOUND]: '项目不存在',
      [ErrorCode.PROJECT_CREATE_FAILED]: '创建项目失败',
      [ErrorCode.PROJECT_SAVE_FAILED]: '保存项目失败',
      [ErrorCode.PROJECT_LOAD_FAILED]: '加载项目失败',

      [ErrorCode.CHAPTER_NOT_FOUND]: '章节不存在',
      [ErrorCode.CHAPTER_CREATE_FAILED]: '创建章节失败',
      [ErrorCode.CHAPTER_UPDATE_FAILED]: '更新章节失败',
      [ErrorCode.CHAPTER_DELETE_FAILED]: '删除章节失败',
      [ErrorCode.CHAPTER_CONTENT_EMPTY]: '章节内容为空',

      [ErrorCode.AI_CONNECTION_FAILED]: 'AI 服务连接失败',
      [ErrorCode.AI_RESPONSE_INVALID]: 'AI 响应格式错误',
      [ErrorCode.AI_TIMEOUT]: 'AI 请求超时',
      [ErrorCode.AI_QUOTA_EXCEEDED]: 'AI 调用配额已用完',
      [ErrorCode.AI_PROVIDER_NOT_CONFIGURED]: 'AI 服务未配置',
      [ErrorCode.AI_GENERATION_FAILED]: 'AI 内容生成失败',
      [ErrorCode.AI_STREAM_FAILED]: 'AI 流式输出失败',

      [ErrorCode.MEMORY_EXTRACT_FAILED]: '提取记忆失败',
      [ErrorCode.MEMORY_SAVE_FAILED]: '保存记忆失败',
      [ErrorCode.MEMORY_LOAD_FAILED]: '加载记忆失败',
      [ErrorCode.MEMORY_BACKUP_FAILED]: '备份记忆失败',

      [ErrorCode.REVIEW_FAILED]: '章节审查失败',
      [ErrorCode.REVIEW_TIMEOUT]: '审查超时',
      [ErrorCode.REVIEW_BLOCKED]: '审查未通过，存在阻断性问题',

      [ErrorCode.WRITE_TASK_FAILED]: '写作任务执行失败',
      [ErrorCode.WRITE_TASK_CANCELLED]: '写作任务已取消',
      [ErrorCode.WRITE_TASK_ABORTED]: '写作任务已中止',
      [ErrorCode.WRITE_BATCH_IN_PROGRESS]: '批量写作正在进行中',

      [ErrorCode.DEAI_FIX_FAILED]: '去 AI 味处理失败',
      [ErrorCode.DEAI_ANALYSIS_FAILED]: 'AI 味分析失败',

      [ErrorCode.FORESHADOW_EXTRACT_FAILED]: '提取伏笔失败',
      [ErrorCode.FORESHADOW_TRACK_FAILED]: '追踪伏笔失败',

      [ErrorCode.UNKNOWN_ERROR]: '发生未知错误',
      [ErrorCode.VALIDATION_ERROR]: '数据验证失败',
      [ErrorCode.NETWORK_ERROR]: '网络错误',
      [ErrorCode.PERMISSION_DENIED]: '权限不足',
    };

    return messageMap[this.code] ?? this.message;
  }

  /**
   * 转换为可序列化的对象
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      severity: this.severity,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

// ============================================
// 特定领域的错误类
// ============================================

export type AppErrorOptions = {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  details?: Record<string, unknown>;
  context?: Record<string, unknown>;
  cause?: Error;
};

export class AIError extends AppError {
  constructor(message: string, code: ErrorCode, options?: AppErrorOptions) {
    super(message, code, { ...options, category: ErrorCategory.AI });
    this.name = 'AIError';
  }
}

export class WritingError extends AppError {
  constructor(message: string, code: ErrorCode, options?: AppErrorOptions) {
    super(message, code, { ...options, category: ErrorCategory.WRITING });
    this.name = 'WritingError';
  }
}

export class MemoryError extends AppError {
  constructor(message: string, code: ErrorCode, options?: AppErrorOptions) {
    super(message, code, { ...options, category: ErrorCategory.MEMORY });
    this.name = 'MemoryError';
  }
}

// ============================================
// 错误处理辅助函数
// ============================================

/**
 * 判断是否为 AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * 安全地获取错误消息
 */
export function getErrorMessage(error: unknown, fallback: string = '发生错误'): string {
  if (isAppError(error)) {
    return error.getUserMessage();
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

/**
 * 包装 Promise 错误
 */
export async function withErrorHandling<T>(
  promise: Promise<T>,
  options: {
    errorCode: ErrorCode;
    context?: Record<string, unknown>;
    fallback?: T;
    onError?: (error: AppError) => void;
  }
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    const appError = error instanceof AppError
      ? error
      : new AppError(
          error instanceof Error ? error.message : 'Unknown error',
          options.errorCode,
          {
            cause: error instanceof Error ? error : undefined,
            context: options.context,
          }
        );

    options.onError?.(appError);

    if (options.fallback !== undefined) {
      return options.fallback;
    }

    throw appError;
  }
}

/**
 * 创建错误工厂函数
 */
export function createErrorFactory(category: ErrorCategory) {
  return {
    create: (
      message: string,
      code: ErrorCode,
      options?: Parameters<typeof AppError>[2]
    ): AppError => {
      return new AppError(message, code, { ...options, category });
    },
    ai: (message: string, code: ErrorCode, options?: Parameters<typeof AIError>[2]): AIError => {
      return new AIError(message, code, options);
    },
    writing: (message: string, code: ErrorCode, options?: Parameters<typeof WritingError>[2]): WritingError => {
      return new WritingError(message, code, options);
    },
    memory: (message: string, code: ErrorCode, options?: Parameters<typeof MemoryError>[2]): MemoryError => {
      return new MemoryError(message, code, options);
    },
  };
}

// 导出通用错误工厂
export const errors = createErrorFactory(ErrorCategory.SYSTEM);
