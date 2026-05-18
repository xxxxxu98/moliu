/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../context-manager';
import type { WritingConfig } from '@/types/writing';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      expect(manager).toBeDefined();
      expect(manager.getCurrentTokenUsage()).toBe(0);
    });

    it('should create with custom config', () => {
      const config: Partial<WritingConfig> = {
        targetWordCount: 1000000,
        wordsPerChapter: 5000,
      };
      const customManager = new ContextManager(config);
      expect(customManager).toBeDefined();
    });
  });

  describe('token budget', () => {
    it('should return available token budget', () => {
      const budget = manager.getAvailableTokenBudget();
      expect(budget).toBeGreaterThan(0);
    });

    it('should track current token usage', () => {
      const initialUsage = manager.getCurrentTokenUsage();
      expect(initialUsage).toBe(0);

      // Building context should increase usage
      manager.buildProjectContext('Test', 'A test synopsis');
      const afterUsage = manager.getCurrentTokenUsage();
      expect(afterUsage).toBeGreaterThan(0);
    });
  });

  describe('buildProjectContext', () => {
    it('should build basic project context', () => {
      const context = manager.buildProjectContext(
        'Test Novel',
        'A test novel synopsis'
      );

      expect(context).toContain('Test Novel');
      expect(context).toContain('A test novel synopsis');
    });

    it('should handle empty parameters', () => {
      const context = manager.buildProjectContext('', '');
      expect(context).toBeDefined();
    });
  });

  describe('buildVolumeContext', () => {
    it('should build basic volume context', () => {
      const context = manager.buildVolumeContext(
        'Volume 1',
        'Volume outline'
      );

      expect(context).toContain('Volume 1');
      expect(context).toContain('Volume outline');
    });
  });

  describe('buildChapterContext', () => {
    it('should build basic chapter context', () => {
      const context = manager.buildChapterContext(
        'Chapter 1',
        'Chapter outline',
        []
      );

      expect(context).toContain('Chapter 1');
      expect(context).toContain('Chapter outline');
    });
  });

  describe('buildWritingContext', () => {
    it('should build writing context', () => {
      const context = manager.buildWritingContext(
        'existing content',
        'writing instructions'
      );

      expect(context).toContain('writing instructions');
    });
  });

  describe('extractPreviousChapterSummary', () => {
    it('should return full content if under limit', () => {
      const content = 'Short content';
      const result = manager.extractPreviousChapterSummary(content, 100);
      expect(result).toBe('Short content');
    });

    it('should truncate at paragraph boundary', () => {
      const content = 'First paragraph.\n\nSecond paragraph with more content.';
      const result = manager.extractPreviousChapterSummary(content, 20);
      expect(result).toContain('First paragraph');
    });

    it('should handle empty content', () => {
      const result = manager.extractPreviousChapterSummary('', 100);
      expect(result).toBe('');
    });
  });

  describe('extractChapterEnding', () => {
    it('should extract last sentence', () => {
      const content = 'Some content.\n\nLast paragraph with key sentence。';
      const result = manager.extractChapterEnding(content);
      expect(result).toContain('key sentence');
    });

    it('should handle empty content', () => {
      const result = manager.extractChapterEnding('');
      expect(result).toBe('');
    });
  });

  describe('checkContextOverLimit', () => {
    it('should return false for short content', () => {
      const shortContext = 'Short context';
      const result = manager.checkContextOverLimit(shortContext);
      expect(result).toBe(false);
    });

    it('should return true for very long content', () => {
      const longContext = 'a'.repeat(200000); // More characters to exceed budget
      const result = manager.checkContextOverLimit(longContext);
      expect(result).toBe(true);
    });
  });

  describe('optimizeContext', () => {
    it('should return original if under limit', () => {
      const context = 'Short context';
      const result = manager.optimizeContext(context, 'project');
      expect(result).toBe(context);
    });
  });

  describe('resetContextUsage', () => {
    it('should reset token usage', () => {
      manager.buildProjectContext('Test', 'Synopsis');
      expect(manager.getCurrentTokenUsage()).toBeGreaterThan(0);

      manager.resetContextUsage();
      expect(manager.getCurrentTokenUsage()).toBe(0);
    });
  });

  describe('getContextHistory', () => {
    it('should return context history', () => {
      manager.buildProjectContext('Test', 'Synopsis');

      const history = manager.getContextHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('createContextManager', () => {
    it('should create manager instance', async () => {
      const { createContextManager } = await import('../context-manager');
      const manager = createContextManager();
      expect(manager).toBeInstanceOf(ContextManager);
    });
  });
});
