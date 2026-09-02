/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';

describe('DeAIService', () => {
  describe('service instantiation', () => {
    it('should be importable', async () => {
      // 直接测试模块导入是否成功
      const module = await import('@/services/writing/de-ai-service');
      expect(module.DeAIService).toBeDefined();
    });
  });
});

describe('ReviewService', () => {
  describe('service instantiation', () => {
    it('should be importable', async () => {
      const module = await import('@/services/review/review-service');
      expect(module.ReviewService).toBeDefined();
    });
  });
});
