/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';

describe('ReviewService', () => {
  describe('service instantiation', () => {
    it('should be importable', async () => {
      const module = await import('@/services/review/review-service');
      expect(module.ReviewService).toBeDefined();
    });
  });
});
