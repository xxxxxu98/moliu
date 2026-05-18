/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useWritingStore } from '../writing.store';

describe('useWritingStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  describe('initial state', () => {
    it('should have empty initial state', () => {
      const store = useWritingStore();

      expect(store.currentSession).toBeNull();
      expect(store.currentTask).toBeNull();
      expect(store.currentResult).toBeNull();
      expect(store.isWriting).toBe(false);
      expect(store.isChecking).toBe(false);
      expect(store.progress).toBe(0);
      expect(store.error).toBeNull();
    });

    it('should have default options', () => {
      const store = useWritingStore();

      expect(store.options.temperature).toBe(0.7);
      expect(store.options.maxTokens).toBe(2000);
      expect(store.options.enableQualityCheck).toBe(true);
      expect(store.options.enableDeAI).toBe(false);
    });
  });

  describe('session management', () => {
    it('should start a session', () => {
      const store = useWritingStore();

      const session = store.startSession('test-project', 1);

      expect(session).not.toBeNull();
      expect(session.projectId).toBe('test-project');
      expect(session.chapterNumber).toBe(1);
      expect(session.status).toBe('active');
      expect(store.currentSession).not.toBeNull();
    });

    it('should end a session', () => {
      const store = useWritingStore();

      store.startSession('test-project', 1);
      store.endSession();

      expect(store.currentSession).toBeNull();
      expect(store.sessionHistory.length).toBe(1);
      expect(store.sessionHistory[0].status).toBe('completed');
    });

    it('should cancel a session', () => {
      const store = useWritingStore();

      store.startSession('test-project', 1);
      store.cancelSession();

      expect(store.currentSession).toBeNull();
      expect(store.isWriting).toBe(false);
      expect(store.sessionHistory[0].status).toBe('cancelled');
    });
  });

  describe('task management', () => {
    it('should set current task', () => {
      const store = useWritingStore();

      store.setTask({
        projectId: 'test-project',
        chapterNumber: 1,
        title: '第一章',
      });

      expect(store.currentTask).not.toBeNull();
      expect(store.currentTask?.title).toBe('第一章');
    });

    it('should add task to queue', () => {
      const store = useWritingStore();

      store.addToQueue({
        projectId: 'test-project',
        chapterNumber: 1,
      });
      store.addToQueue({
        projectId: 'test-project',
        chapterNumber: 2,
      });

      expect(store.taskQueue.length).toBe(2);
      expect(store.hasQueuedTasks).toBe(true);
    });

    it('should clear queue', () => {
      const store = useWritingStore();

      store.addToQueue({
        projectId: 'test-project',
        chapterNumber: 1,
      });
      store.clearQueue();

      expect(store.taskQueue.length).toBe(0);
      expect(store.hasQueuedTasks).toBe(false);
    });
  });

  describe('writing execution', () => {
    it('should execute writing task', async () => {
      vi.useRealTimers();
      const store = useWritingStore();

      store.setTask({
        projectId: 'test-project',
        chapterNumber: 1,
        title: '第一章',
      });

      const result = await store.executeWriting();

      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.content).toContain('第一章');
    });

    it('should handle writing without task', async () => {
      const store = useWritingStore();

      const result = await store.executeWriting();

      expect(result).toBeNull();
      expect(store.error).toBe('No task to execute');
    });
  });

  describe('quality check', () => {
    it('should check quality of content', async () => {
      const store = useWritingStore();

      const content = '突然，门被推开了。\n\n这是一个测试内容。';

      const result = await store.checkQuality(content);

      expect(result).not.toBeNull();
      expect(result.score).toBeGreaterThan(0);
      expect(result.details).toBeDefined();
    });

    it('should detect missing hook', async () => {
      const store = useWritingStore();

      const content = '这是一个没有任何钩子的普通段落。';

      const result = await store.checkQuality(content);

      expect(result.issues.some(i => i.category === 'hook')).toBe(true);
    });
  });

  describe('computed properties', () => {
    it('should check hasActiveSession', () => {
      const store = useWritingStore();

      expect(store.hasActiveSession).toBe(false);

      store.startSession('test-project', 1);

      expect(store.hasActiveSession).toBe(true);
    });

    it('should check canStartWriting', () => {
      const store = useWritingStore();

      expect(store.canStartWriting).toBe(false);

      store.setTask({
        projectId: 'test-project',
        chapterNumber: 1,
      });

      expect(store.canStartWriting).toBe(true);
    });
  });

  describe('options management', () => {
    it('should update options', () => {
      const store = useWritingStore();

      store.updateOptions({
        temperature: 0.9,
        enableDeAI: true,
      });

      expect(store.options.temperature).toBe(0.9);
      expect(store.options.enableDeAI).toBe(true);
    });
  });

  describe('results management', () => {
    it('should clear results', () => {
      const store = useWritingStore();

      store.setTask({
        projectId: 'test-project',
        chapterNumber: 1,
      });

      vi.advanceTimersByTime(2000);
      store.executeWriting();

      store.clearResults();

      expect(store.currentResult).toBeNull();
      expect(store.lastQualityCheck).toBeNull();
      expect(store.error).toBeNull();
    });

    it('should clear history', () => {
      const store = useWritingStore();

      store.startSession('test-project', 1);
      store.endSession();
      store.startSession('test-project', 2);
      store.endSession();

      expect(store.sessionHistory.length).toBe(2);

      store.clearHistory();

      expect(store.sessionHistory.length).toBe(0);
    });
  });

  describe('countWords utility', () => {
    it('should count Chinese characters', () => {
      const store = useWritingStore();

      const count = store.countWords('这是一个测试句子');

      expect(count).toBe(8);
    });

    it('should count English words', () => {
      const store = useWritingStore();

      const count = store.countWords('This is a test');

      expect(count).toBe(4);
    });

    it('should count mixed content', () => {
      const store = useWritingStore();

      const count = store.countWords('Hello 你好 World 世界');

      expect(count).toBe(6);
    });

    it('should exclude headers and markers', () => {
      const store = useWritingStore();

      const count = store.countWords('# 标题\n\n正文内容');

      expect(count).toBe(4); // 只计算"正文内容"
    });
  });
});
