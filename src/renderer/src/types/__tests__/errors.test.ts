/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  AppError,
  AIError,
  WritingError,
  MemoryError,
  isAppError,
  getErrorMessage,
  withErrorHandling,
  createErrorFactory,
} from '@/types/errors';

describe('ErrorCode', () => {
  it('should have correct error codes', () => {
    expect(ErrorCode.PROJECT_NOT_FOUND).toBe('PROJ_001');
    expect(ErrorCode.AI_CONNECTION_FAILED).toBe('AI_001');
    expect(ErrorCode.WRITE_TASK_FAILED).toBe('WRITE_001');
    expect(ErrorCode.MEMORY_EXTRACT_FAILED).toBe('MEM_001');
  });
});

describe('ErrorCategory', () => {
  it('should have correct categories', () => {
    expect(ErrorCategory.PROJECT).toBe('project');
    expect(ErrorCategory.AI).toBe('ai');
    expect(ErrorCategory.WRITING).toBe('writing');
    expect(ErrorCategory.MEMORY).toBe('memory');
  });
});

describe('ErrorSeverity', () => {
  it('should have correct severity levels', () => {
    expect(ErrorSeverity.INFO).toBe('info');
    expect(ErrorSeverity.WARNING).toBe('warning');
    expect(ErrorSeverity.ERROR).toBe('error');
    expect(ErrorSeverity.CRITICAL).toBe('critical');
  });
});

describe('AppError', () => {
  it('should create error with code and message', () => {
    const error = new AppError('Test error', ErrorCode.UNKNOWN_ERROR);
    
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
    expect(error.category).toBe(ErrorCategory.SYSTEM);
    expect(error instanceof Error).toBe(true);
  });

  it('should infer category from error code', () => {
    const aiError = new AppError('AI error', ErrorCode.AI_CONNECTION_FAILED);
    const projectError = new AppError('Project error', ErrorCode.PROJECT_NOT_FOUND);
    
    expect(aiError.category).toBe(ErrorCategory.AI);
    expect(projectError.category).toBe(ErrorCategory.PROJECT);
  });

  it('should accept cause option', () => {
    const cause = new Error('Original error');
    const error = new AppError('Wrapped error', ErrorCode.UNKNOWN_ERROR, { cause });
    
    expect(error.cause).toBe(cause);
  });

  it('should accept details option', () => {
    const error = new AppError('Error with details', ErrorCode.UNKNOWN_ERROR, {
      details: { key: 'value' },
    });
    
    expect(error.details).toEqual({ key: 'value' });
  });

  it('should accept context option', () => {
    const error = new AppError('Error with context', ErrorCode.UNKNOWN_ERROR, {
      context: { userId: '123' },
    });
    
    expect(error.context).toEqual({ userId: '123' });
  });

  it('should have timestamp', () => {
    const before = new Date();
    const error = new AppError('Error', ErrorCode.UNKNOWN_ERROR);
    const after = new Date();
    
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  describe('getUserMessage', () => {
    it('should return mapped user message', () => {
      const error = new AppError('Raw message', ErrorCode.AI_CONNECTION_FAILED);
      expect(error.getUserMessage()).toBe('AI 服务连接失败');
    });

    it('should return message when no mapping exists', () => {
      // Use an error code without a mapped message
      const error = new AppError('Test message', ErrorCode.UNKNOWN_ERROR);
      expect(error.getUserMessage()).toBe('发生未知错误');
    });
  });

  describe('toJSON', () => {
    it('should serialize to JSON', () => {
      const error = new AppError('Test error', ErrorCode.AI_CONNECTION_FAILED, {
        details: { extra: 'info' },
      });
      
      const json = error.toJSON();
      
      expect(json.name).toBe('AppError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('AI_001');
      expect(json.category).toBe('ai');
      expect(json.severity).toBe('error');
      expect(json.details).toEqual({ extra: 'info' });
      expect(json.timestamp).toBeDefined();
    });
  });
});

describe('AIError', () => {
  it('should create AI error with category', () => {
    const error = new AIError('AI failed', ErrorCode.AI_GENERATION_FAILED);
    
    expect(error.name).toBe('AIError');
    expect(error.category).toBe(ErrorCategory.AI);
    expect(error.code).toBe(ErrorCode.AI_GENERATION_FAILED);
  });
});

describe('WritingError', () => {
  it('should create Writing error with category', () => {
    const error = new WritingError('Writing failed', ErrorCode.WRITE_TASK_FAILED);
    
    expect(error.name).toBe('WritingError');
    expect(error.category).toBe(ErrorCategory.WRITING);
    expect(error.code).toBe(ErrorCode.WRITE_TASK_FAILED);
  });
});

describe('MemoryError', () => {
  it('should create Memory error with category', () => {
    const error = new MemoryError('Memory failed', ErrorCode.MEMORY_SAVE_FAILED);
    
    expect(error.name).toBe('MemoryError');
    expect(error.category).toBe(ErrorCategory.MEMORY);
    expect(error.code).toBe(ErrorCode.MEMORY_SAVE_FAILED);
  });
});

describe('isAppError', () => {
  it('should return true for AppError', () => {
    const error = new AppError('Test', ErrorCode.UNKNOWN_ERROR);
    expect(isAppError(error)).toBe(true);
  });

  it('should return true for AIError', () => {
    const error = new AIError('Test', ErrorCode.AI_GENERATION_FAILED);
    expect(isAppError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Regular error');
    expect(isAppError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isAppError('string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError({})).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('should return user message for AppError', () => {
    const error = new AppError('Raw', ErrorCode.AI_CONNECTION_FAILED);
    expect(getErrorMessage(error)).toBe('AI 服务连接失败');
  });

  it('should return message for regular Error', () => {
    const error = new Error('Regular error');
    expect(getErrorMessage(error)).toBe('Regular error');
  });

  it('should return fallback for non-errors', () => {
    expect(getErrorMessage('string')).toBe('发生错误');
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });
});

describe('withErrorHandling', () => {
  it('should return result on success', async () => {
    const promise = Promise.resolve('success');
    const result = await withErrorHandling(promise, {
      errorCode: ErrorCode.UNKNOWN_ERROR,
    });
    
    expect(result).toBe('success');
  });

  it('should throw AppError on failure', async () => {
    const promise = Promise.reject(new Error('Test error'));
    
    await expect(
      withErrorHandling(promise, { errorCode: ErrorCode.UNKNOWN_ERROR })
    ).rejects.toThrow('Test error');
  });

  it('should call onError callback', async () => {
    const promise = Promise.reject(new Error('Test'));
    const callback = vi.fn();
    
    try {
      await withErrorHandling(promise, {
        errorCode: ErrorCode.UNKNOWN_ERROR,
        onError: callback,
      });
    } catch {
      // Expected to throw
    }
    
    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls[0][0]).toBeInstanceOf(AppError);
  });

  it('should return fallback on error', async () => {
    const promise = Promise.reject(new Error('Test'));
    
    const result = await withErrorHandling(promise, {
      errorCode: ErrorCode.UNKNOWN_ERROR,
      fallback: 'default',
    });
    
    expect(result).toBe('default');
  });
});

describe('createErrorFactory', () => {
  it('should create error factory', () => {
    const factory = createErrorFactory(ErrorCategory.AI);
    
    expect(factory.create).toBeDefined();
    expect(factory.ai).toBeDefined();
  });

  it('should create error with factory', () => {
    const factory = createErrorFactory(ErrorCategory.AI);
    const error = factory.create('Factory error', ErrorCode.AI_GENERATION_FAILED);
    
    expect(error.message).toBe('Factory error');
    expect(error.code).toBe(ErrorCode.AI_GENERATION_FAILED);
    expect(error.category).toBe(ErrorCategory.AI);
  });
});
