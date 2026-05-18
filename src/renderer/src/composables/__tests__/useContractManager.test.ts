/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useContractManager } from '@/composables/new/useContractManager';
import type { GeneratedOutline } from '@/types/inspiration';

describe('useContractManager', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      expect(contractManager.masterContract.value).toBeNull();
      expect(contractManager.hasContract.value).toBe(false);
      expect(contractManager.volumes.value).toEqual([]);
      expect(contractManager.chapters.value).toEqual([]);
    });
  });

  describe('initializeFromOutline', () => {
    it('should create master contract from outline', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [
          { id: 'ch1', number: 1, title: '第一章', wordCount: 3000 },
          { id: 'ch2', number: 2, title: '第二章', wordCount: 3000 },
        ],
      };

      contractManager.initializeFromOutline(outline);

      expect(contractManager.hasContract.value).toBe(true);
      expect(contractManager.masterContract.value).not.toBeNull();
      expect(contractManager.masterContract.value?.meta.title).toBe('Test Novel');
      expect(contractManager.masterContract.value?.meta.targetWordCount).toBe(300000);
    });

    it('should create volume contracts based on chapter count', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: Array.from({ length: 35 }, (_, i) => ({
          id: `ch${i + 1}`,
          number: i + 1,
          title: `第${i + 1}章`,
          wordCount: 3000,
        })),
      };

      contractManager.initializeFromOutline(outline);

      expect(contractManager.volumes.value.length).toBe(2); // 35 chapters = 2 volumes
      expect(contractManager.volumes.value[0].meta.volumeNumber).toBe(1);
      expect(contractManager.volumes.value[0].meta.startChapter).toBe(1);
      expect(contractManager.volumes.value[0].meta.endChapter).toBe(30);
      expect(contractManager.volumes.value[1].meta.startChapter).toBe(31);
      expect(contractManager.volumes.value[1].meta.endChapter).toBe(35);
    });

    it('should create chapter contracts', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [
          { id: 'ch1', number: 1, title: '第一章', wordCount: 3000 },
          { id: 'ch2', number: 2, title: '第二章', wordCount: 3000 },
        ],
      };

      contractManager.initializeFromOutline(outline);

      expect(contractManager.chapters.value.length).toBe(2);
      expect(contractManager.chapters.value[0].meta.title).toBe('第一章');
      expect(contractManager.chapters.value[1].meta.title).toBe('第二章');
    });
  });

  describe('chapter operations', () => {
    it('should get chapter by number', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [
          { id: 'ch1', number: 1, title: '第一章', wordCount: 3000 },
          { id: 'ch2', number: 2, title: '第二章', wordCount: 3000 },
        ],
      };

      contractManager.initializeFromOutline(outline);

      const chapter = contractManager.getChapterByNumber(1);
      expect(chapter).not.toBeUndefined();
      expect(chapter?.meta.title).toBe('第一章');
    });

    it('should update chapter status', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [{ id: 'ch1', number: 1, title: '第一章', wordCount: 3000 }],
      };

      contractManager.initializeFromOutline(outline);

      const chapter = contractManager.getChapterByNumber(1);
      expect(chapter?.meta.status).toBe('draft');

      contractManager.lockChapter(chapter!.meta.chapterId);
      const updatedChapter = contractManager.getChapterByNumber(1);
      expect(updatedChapter?.meta.status).toBe('locked');

      contractManager.completeChapter(chapter!.meta.chapterId);
      const completedChapter = contractManager.getChapterByNumber(1);
      expect(completedChapter?.meta.status).toBe('completed');
    });
  });

  describe('foreshadow operations', () => {
    it('should add foreshadow', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [],
      };

      contractManager.initializeFromOutline(outline);

      contractManager.addForeshadow({
        hint: '神秘剑客',
        type: 'character',
        buriedChapter: 1,
        revealChapter: 0,
        status: 'buried',
      });

      expect(contractManager.activeForeshadows.value.length).toBe(1);
      expect(contractManager.activeForeshadows.value[0].hint).toBe('神秘剑客');
    });

    it('should update foreshadow status', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [],
      };

      contractManager.initializeFromOutline(outline);

      contractManager.addForeshadow({
        hint: '神秘剑客',
        type: 'character',
        buriedChapter: 1,
        revealChapter: 0,
        status: 'buried',
      });

      const foreshadowId = contractManager.activeForeshadows.value[0].id;
      contractManager.updateForeshadowStatus(foreshadowId, 'developed');

      expect(contractManager.activeForeshadows.value[0].status).toBe('developed');
    });
  });

  describe('character operations', () => {
    it('should add character', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [],
      };

      contractManager.initializeFromOutline(outline);

      contractManager.addCharacter({
        name: '主角',
        role: 'protagonist',
        description: '主角描述',
        personality: ['勇敢', '正直'],
        relationships: [],
        growth: { currentStage: 1, stages: [] },
      });

      expect(contractManager.masterContract.value?.characters.length).toBe(1);
      expect(contractManager.masterContract.value?.characters[0].name).toBe('主角');
    });

    it('should get protagonist', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [],
      };

      contractManager.initializeFromOutline(outline);

      contractManager.addCharacter({
        name: '主角',
        role: 'protagonist',
        description: '主角描述',
        personality: ['勇敢'],
        relationships: [],
        growth: { currentStage: 1, stages: [] },
      });

      const protagonist = contractManager.getProtagonist();
      expect(protagonist).not.toBeUndefined();
      expect(protagonist?.name).toBe('主角');
    });
  });

  describe('export/import', () => {
    it('should export and import master contract', () => {
      const contractManager = useContractManager({ projectId: 'test-project' });

      const outline: GeneratedOutline = {
        title: 'Test Novel',
        genres: ['都市'],
        estimatedWordCount: 300000,
        chapters: [],
      };

      contractManager.initializeFromOutline(outline);

      const json = contractManager.exportMasterContract();
      expect(json).toContain('Test Novel');

      const newManager = useContractManager({ projectId: 'test-project-2' });
      newManager.importMasterContract(json);
      expect(newManager.masterContract.value?.meta.title).toBe('Test Novel');
    });
  });
});
