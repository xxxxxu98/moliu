/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMemorySystem } from '@/composables/new/useMemorySystem';

describe('useMemorySystem', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });

      expect(memorySystem.state.value).toBeNull();
      expect(memorySystem.totalWordCount.value).toBe(0);
      expect(memorySystem.currentChapter.value).toBe(1);
    });
  });

  describe('initialize', () => {
    it('should create default state', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      expect(memorySystem.state.value).not.toBeNull();
      expect(memorySystem.state.value?.meta.projectId).toBe('test-project');
      expect(memorySystem.state.value?.meta.currentChapter).toBe(1);
      expect(memorySystem.state.value?.meta.totalWordCount).toBe(0);
    });
  });

  describe('updateProgress', () => {
    it('should update chapter and word count', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.updateProgress(5, 3000);

      expect(memorySystem.state.value?.meta.currentChapter).toBe(5);
      expect(memorySystem.state.value?.meta.totalWordCount).toBe(3000);
    });
  });

  describe('unlockSettings', () => {
    it('should unlock a location', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.unlockSetting('locations', '神秘森林');

      expect(memorySystem.unlockedLocations.value).toContain('神秘森林');
    });

    it('should unlock multiple locations', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.unlockSettings('locations', ['地点A', '地点B', '地点C']);

      expect(memorySystem.unlockedLocations.value).toHaveLength(3);
    });

    it('should not duplicate locations', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.unlockSetting('locations', '神秘森林');
      memorySystem.unlockSetting('locations', '神秘森林');

      expect(memorySystem.unlockedLocations.value).toHaveLength(1);
    });
  });

  describe('foreshadow tracking', () => {
    it('should add foreshadow', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addForeshadow('fs-1', 1);

      expect(memorySystem.activeForeshadows.value).toHaveLength(1);
      expect(memorySystem.activeForeshadows.value[0].status).toBe('buried');
    });

    it('should update foreshadow status', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addForeshadow('fs-1', 1);
      memorySystem.updateForeshadowStatus('fs-1', 'developed', 5);

      expect(memorySystem.activeForeshadows.value[0].status).toBe('developed');
    });

    it('should mention foreshadow', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addForeshadow('fs-1', 1);
      memorySystem.mentionForeshadow('fs-1', 3);

      expect(memorySystem.getForeshadowStatus('fs-1')?.lastMention).toBe(3);
    });
  });

  describe('entity management', () => {
    it('should add entity', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      const entity = memorySystem.addEntity({
        name: '神秘森林',
        type: 'location',
        description: '一片神秘的森林',
        tags: ['冒险', '危险'],
        firstAppearance: 1,
      });

      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('神秘森林');
      expect(memorySystem.entityList.value).toHaveLength(1);
    });

    it('should find entity by name', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addEntity({
        name: '神秘森林',
        type: 'location',
        description: '一片神秘的森林',
        tags: [],
        firstAppearance: 1,
      });

      const found = memorySystem.findEntity('神秘');
      expect(found).not.toBeUndefined();
      expect(found?.name).toBe('神秘森林');
    });

    it('should increment mentions', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      const entity = memorySystem.addEntity({
        name: '神秘森林',
        type: 'location',
        description: '一片神秘的森林',
        tags: [],
        firstAppearance: 1,
      });

      memorySystem.incrementMentions(entity.id, 3);

      const updated = memorySystem.findEntity('神秘森林');
      expect(updated?.mentions).toBe(2);
    });

    it('should query entities by type', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addEntity({
        name: '神秘森林',
        type: 'location',
        description: '',
        tags: [],
        firstAppearance: 1,
      });
      memorySystem.addEntity({
        name: '主角',
        type: 'character',
        description: '',
        tags: [],
        firstAppearance: 1,
      });

      const locations = memorySystem.queryEntities({ type: 'location' });
      expect(locations).toHaveLength(1);
      expect(locations[0].name).toBe('神秘森林');
    });
  });

  describe('chapter summaries', () => {
    it('should add chapter summary', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addChapterSummary({
        chapter: 1,
        summary: '主角开始了冒险',
        wordCount: 3000,
        coolPoints: ['打脸'],
        foreshadows: [],
      });

      const summary = memorySystem.getChapterSummary(1);
      expect(summary).not.toBeUndefined();
      expect(summary?.summary).toBe('主角开始了冒险');
    });

    it('should get multiple chapter summaries', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addChapterSummary({ chapter: 1, summary: '第一章', wordCount: 3000, coolPoints: [], foreshadows: [] });
      memorySystem.addChapterSummary({ chapter: 2, summary: '第二章', wordCount: 3000, coolPoints: [], foreshadows: [] });
      memorySystem.addChapterSummary({ chapter: 3, summary: '第三章', wordCount: 3000, coolPoints: [], foreshadows: [] });

      const summaries = memorySystem.getChapterSummaries([1, 2, 3]);
      expect(summaries).toHaveLength(3);
    });

    it('should get summaries text', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addChapterSummary({ chapter: 1, summary: '第一章内容', wordCount: 3000, coolPoints: [], foreshadows: [] });
      memorySystem.addChapterSummary({ chapter: 2, summary: '第二章内容', wordCount: 3000, coolPoints: [], foreshadows: [] });

      const text = memorySystem.getSummariesText([1, 2]);
      expect(text).toContain('第一章');
      expect(text).toContain('第二章');
    });
  });

  describe('temp notes', () => {
    it('should add temp note', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addTempNote('这是一个好主意', 1, 'idea');

      const unresolved = memorySystem.getUnresolvedNotes();
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].content).toBe('这是一个好主意');
    });

    it('should resolve note', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addTempNote('这是一个好主意', 1, 'idea');
      const note = memorySystem.getUnresolvedNotes()[0];

      memorySystem.resolveNote(note.id);

      const unresolved = memorySystem.getUnresolvedNotes();
      expect(unresolved).toHaveLength(0);
    });
  });

  describe('export', () => {
    it('should export all data', () => {
      const memorySystem = useMemorySystem({ projectId: 'test-project' });
      memorySystem.initialize();

      memorySystem.addChapterSummary({
        chapter: 1,
        summary: '测试',
        wordCount: 3000,
        coolPoints: [],
        foreshadows: [],
      });

      const exported = memorySystem.exportAll();

      expect(exported.state).not.toBeNull();
      expect(exported.scratchpad.summaries).toHaveLength(1);
    });
  });
});
