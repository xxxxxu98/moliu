/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';

describe('WritingTaskBuilder', () => {
  describe('service instantiation', () => {
    it('should be importable', async () => {
      const module = await import('@/services/writing/writing-task-builder');
      expect(module.WritingTaskBuilder).toBeDefined();
      expect(module.createTaskBookBuilder).toBeDefined();
    });
  });
});
