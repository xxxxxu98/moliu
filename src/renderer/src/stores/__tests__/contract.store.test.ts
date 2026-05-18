/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useContractStore } from '../contract.store';
import type { MasterContract, VolumeContract, ChapterContract } from '@/types/contract';

describe('useContractStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have empty initial state', () => {
      const store = useContractStore();

      expect(store.masterContract).toBeNull();
      expect(store.volumeContracts.size).toBe(0);
      expect(store.chapterContracts.size).toBe(0);
      expect(store.isDirty).toBe(false);
      expect(store.lastSaved).toBeNull();
    });
  });

  describe('master contract operations', () => {
    it('should set master contract', () => {
      const store = useContractStore();

      const mockContract: MasterContract = {
        meta: {
          projectId: 'test',
          title: 'Test Novel',
          genre: 'urban',
          targetWordCount: 300000,
          chapterCount: 100,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: '1.0.0',
        },
        genreProfile: {
          id: 'urban',
          name: '都市',
          hooks: { opening: [], chapterEnd: [] },
          coolpoints: { types: [], comboInterval: 3, density: 0.5 },
          pacingRedLines: { rising: [], climax: [], falling: [] },
        },
        coreSetting: {
          worldType: 'urban',
          powerSystem: 'modern',
          goldenFinger: { type: 'system', name: '系统', style: 'game', visibility: 'immediate', cost: '完成任务' },
          timeSetting: { era: 'modern', timeline: 'linear' },
        },
        characters: [],
        creativeConstraints: { antiTrope: '', hardConstraints: [], protagonistFlaw: '', antagonistMirror: '' },
        strands: {
          quest: { mainConflict: '', milestones: [] },
          fire: { romanceType: 'sweet', milestones: [] },
          constellation: { revealPlan: [] },
        },
        coreForeshadows: [],
        powerSystem: { levels: [], rules: [], constraints: [] },
      };

      store.setMasterContract(mockContract);

      expect(store.masterContract).not.toBeNull();
      expect(store.masterContract?.meta.title).toBe('Test Novel');
      expect(store.isDirty).toBe(true);
    });

    it('should update master contract', () => {
      const store = useContractStore();

      const mockContract: MasterContract = {
        meta: {
          projectId: 'test',
          title: 'Test Novel',
          genre: 'urban',
          targetWordCount: 300000,
          chapterCount: 100,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: '1.0.0',
        },
        genreProfile: {
          id: 'urban',
          name: '都市',
          hooks: { opening: [], chapterEnd: [] },
          coolpoints: { types: [], comboInterval: 3, density: 0.5 },
          pacingRedLines: { rising: [], climax: [], falling: [] },
        },
        coreSetting: {
          worldType: 'urban',
          powerSystem: 'modern',
          goldenFinger: { type: 'system', name: '系统', style: 'game', visibility: 'immediate', cost: '完成任务' },
          timeSetting: { era: 'modern', timeline: 'linear' },
        },
        characters: [],
        creativeConstraints: { antiTrope: '', hardConstraints: [], protagonistFlaw: '', antagonistMirror: '' },
        strands: {
          quest: { mainConflict: '', milestones: [] },
          fire: { romanceType: 'sweet', milestones: [] },
          constellation: { revealPlan: [] },
        },
        coreForeshadows: [],
        powerSystem: { levels: [], rules: [], constraints: [] },
      };

      store.setMasterContract(mockContract);
      store.updateMasterContract({
        meta: { ...mockContract.meta, title: 'Updated Title' },
      });

      expect(store.masterContract?.meta.title).toBe('Updated Title');
    });
  });

  describe('volume contract operations', () => {
    it('should add volume contract', () => {
      const store = useContractStore();

      const volume: VolumeContract = {
        meta: {
          volumeId: 'vol-1',
          volumeNumber: 1,
          title: '第一卷',
          startChapter: 1,
          endChapter: 30,
          targetWordCount: 90000,
        },
        overview: {
          theme: '开篇',
          mainConflict: '冲突1',
          subplots: [],
        },
        characters: { added: [], arcs: [] },
        strandProgress: {
          quest: { currentStage: 1, stages: [], conflicts: [] },
          fire: { romanceType: 'sweet', currentStage: 1, milestones: [] },
          constellation: { revealedRules: [], revealedMysteries: [], nextReveal: null },
        },
        foreshadows: [],
        climax: { chapter: 30, description: '', type: 'battle' },
      };

      store.addVolumeContract(volume);

      expect(store.volumeContracts.size).toBe(1);
      expect(store.allVolumes[0].meta.title).toBe('第一卷');
    });

    it('should update volume contract', () => {
      const store = useContractStore();

      const volume: VolumeContract = {
        meta: {
          volumeId: 'vol-1',
          volumeNumber: 1,
          title: '第一卷',
          startChapter: 1,
          endChapter: 30,
          targetWordCount: 90000,
        },
        overview: {
          theme: '开篇',
          mainConflict: '冲突1',
          subplots: [],
        },
        characters: { added: [], arcs: [] },
        strandProgress: {
          quest: { currentStage: 1, stages: [], conflicts: [] },
          fire: { romanceType: 'sweet', currentStage: 1, milestones: [] },
          constellation: { revealedRules: [], revealedMysteries: [], nextReveal: null },
        },
        foreshadows: [],
        climax: { chapter: 30, description: '', type: 'battle' },
      };

      store.addVolumeContract(volume);
      store.updateVolumeContract('vol-1', { meta: { ...volume.meta, title: '新版第一卷' } });

      expect(store.allVolumes[0].meta.title).toBe('新版第一卷');
    });

    it('should remove volume contract', () => {
      const store = useContractStore();

      const volume: VolumeContract = {
        meta: {
          volumeId: 'vol-1',
          volumeNumber: 1,
          title: '第一卷',
          startChapter: 1,
          endChapter: 30,
          targetWordCount: 90000,
        },
        overview: { theme: '', mainConflict: '', subplots: [] },
        characters: { added: [], arcs: [] },
        strandProgress: {
          quest: { currentStage: 1, stages: [], conflicts: [] },
          fire: { romanceType: 'sweet', currentStage: 1, milestones: [] },
          constellation: { revealedRules: [], revealedMysteries: [], nextReveal: null },
        },
        foreshadows: [],
        climax: { chapter: 30, description: '', type: 'battle' },
      };

      store.addVolumeContract(volume);
      store.removeVolumeContract('vol-1');

      expect(store.volumeContracts.size).toBe(0);
    });
  });

  describe('chapter contract operations', () => {
    it('should set chapter contract', () => {
      const store = useContractStore();

      const chapter: ChapterContract = {
        meta: {
          chapterId: 'ch-1',
          chapterNumber: 1,
          volumeId: 'vol-1',
          title: '第一章',
          targetWordCount: 3000,
          status: 'draft',
        },
        cbn: {
          situation: '开始',
          characterStatus: '正常',
          pendingIssues: [],
          hook: { type: 'conflict', description: '', details: {} },
        },
        cpns: [],
        cen: {
          resolution: '完成',
          newHook: { type: 'cliffhanger', description: '', details: {} },
        },
        charactersPresent: [],
        location: '地点',
        constraints: { mustInclude: [], mustNotInclude: [], callbacks: [] },
        foreshadowOps: [],
      };

      store.setChapterContract(1, chapter);

      expect(store.chapterContracts.size).toBe(1);
      expect(store.allChapters[0].meta.title).toBe('第一章');
    });

    it('should update chapter contract', () => {
      const store = useContractStore();

      const chapter: ChapterContract = {
        meta: {
          chapterId: 'ch-1',
          chapterNumber: 1,
          volumeId: 'vol-1',
          title: '第一章',
          targetWordCount: 3000,
          status: 'draft',
        },
        cbn: {
          situation: '开始',
          characterStatus: '正常',
          pendingIssues: [],
          hook: { type: 'conflict', description: '', details: {} },
        },
        cpns: [],
        cen: {
          resolution: '完成',
          newHook: { type: 'cliffhanger', description: '', details: {} },
        },
        charactersPresent: [],
        location: '地点',
        constraints: { mustInclude: [], mustNotInclude: [], callbacks: [] },
        foreshadowOps: [],
      };

      store.setChapterContract(1, chapter);
      store.updateChapterContract(1, {
        meta: { ...chapter.meta, title: '新版第一章' },
      });

      expect(store.allChapters[0].meta.title).toBe('新版第一章');
    });

    it('should sort chapters by chapterNumber', () => {
      const store = useContractStore();

      const chapter1: ChapterContract = {
        meta: { chapterId: 'ch-1', chapterNumber: 3, volumeId: 'vol-1', title: '第三章', targetWordCount: 3000, status: 'draft' },
        cbn: { situation: '', characterStatus: '', pendingIssues: [], hook: { type: 'conflict', description: '', details: {} } },
        cpns: [],
        cen: { resolution: '', newHook: { type: 'cliffhanger', description: '', details: {} } },
        charactersPresent: [],
        location: '',
        constraints: { mustInclude: [], mustNotInclude: [], callbacks: [] },
        foreshadowOps: [],
      };

      const chapter2: ChapterContract = {
        meta: { chapterId: 'ch-2', chapterNumber: 1, volumeId: 'vol-1', title: '第一章', targetWordCount: 3000, status: 'draft' },
        cbn: { situation: '', characterStatus: '', pendingIssues: [], hook: { type: 'conflict', description: '', details: {} } },
        cpns: [],
        cen: { resolution: '', newHook: { type: 'cliffhanger', description: '', details: {} } },
        charactersPresent: [],
        location: '',
        constraints: { mustInclude: [], mustNotInclude: [], callbacks: [] },
        foreshadowOps: [],
      };

      store.setChapterContract(3, chapter1);
      store.setChapterContract(1, chapter2);

      expect(store.allChapters[0].meta.chapterNumber).toBe(1);
      expect(store.allChapters[1].meta.chapterNumber).toBe(3);
    });
  });

  describe('current selection', () => {
    it('should set current volume', () => {
      const store = useContractStore();

      const volume: VolumeContract = {
        meta: {
          volumeId: 'vol-1',
          volumeNumber: 1,
          title: '第一卷',
          startChapter: 1,
          endChapter: 30,
          targetWordCount: 90000,
        },
        overview: { theme: '', mainConflict: '', subplots: [] },
        characters: { added: [], arcs: [] },
        strandProgress: {
          quest: { currentStage: 1, stages: [], conflicts: [] },
          fire: { romanceType: 'sweet', currentStage: 1, milestones: [] },
          constellation: { revealedRules: [], revealedMysteries: [], nextReveal: null },
        },
        foreshadows: [],
        climax: { chapter: 30, description: '', type: 'battle' },
      };

      store.addVolumeContract(volume);
      store.setCurrentVolume('vol-1');

      expect(store.currentVolumeId).toBe('vol-1');
      expect(store.currentVolume?.meta.title).toBe('第一卷');
    });

    it('should set current chapter', () => {
      const store = useContractStore();

      const chapter: ChapterContract = {
        meta: {
          chapterId: 'ch-1',
          chapterNumber: 1,
          volumeId: 'vol-1',
          title: '第一章',
          targetWordCount: 3000,
          status: 'draft',
        },
        cbn: { situation: '', characterStatus: '', pendingIssues: [], hook: { type: 'conflict', description: '', details: {} } },
        cpns: [],
        cen: { resolution: '', newHook: { type: 'cliffhanger', description: '', details: {} } },
        charactersPresent: [],
        location: '',
        constraints: { mustInclude: [], mustNotInclude: [], callbacks: [] },
        foreshadowOps: [],
      };

      store.setChapterContract(1, chapter);
      store.setCurrentChapter(1);

      expect(store.currentChapterNumber).toBe(1);
      expect(store.currentChapter?.meta.title).toBe('第一章');
    });
  });

  describe('save and load', () => {
    it('should save contracts', async () => {
      const store = useContractStore();

      await store.saveAll();

      expect(store.isDirty).toBe(false);
      expect(store.lastSaved).toBeDefined();
    });

    it('should load contracts', async () => {
      const store = useContractStore();

      await store.loadContracts('test-project');

      expect(store.isDirty).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all state', () => {
      const store = useContractStore();

      store.clear();

      expect(store.masterContract).toBeNull();
      expect(store.volumeContracts.size).toBe(0);
      expect(store.chapterContracts.size).toBe(0);
      expect(store.isDirty).toBe(false);
      expect(store.lastSaved).toBeNull();
    });
  });
});
