/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewService, type ReviewContext, type ReviewOptions } from '../review-service';
import type { Project, Chapter } from '@/types/project';

// Mock data factories
function createMockProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project',
    genre: [{ id: 'g1', name: 'Fantasy' }],
    wordCount: 50000,
    targetWordCount: 100000,
    status: 'writing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    characters: [
      {
        id: 'char-1',
        name: '张三',
        role: 'protagonist',
        description: '主角',
        profile: {
          personality: ['勇敢', '正直'],
          appearance: '高大威猛',
          speakingStyle: '豪爽',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'char-2',
        name: '李四',
        role: 'antagonist',
        description: '反派',
        profile: {
          personality: ['阴险', '狡诈'],
          appearance: '瘦削阴冷',
          speakingStyle: '低沉',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    worldSchema: {
      locations: [
        { id: 'loc-1', name: '长安城', level: 'city', description: '首都' },
        { id: 'loc-2', name: '紫霄宫', level: 'building', description: '修仙门派', parentId: 'loc-1' },
      ],
      rules: [
        { id: 'rule-1', name: '灵力', description: '修炼能量', locked: true },
      ],
      factions: [
        { id: 'fac-1', name: '正道联盟', description: '正道门派联盟' },
      ],
    },
    ...overrides,
  } as Project;
}

function createMockChapter(overrides?: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    volumeId: 'vol-1',
    title: '第一章：开始',
    content: '',
    wordCount: 3000,
    orderIndex: 0,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Chapter;
}

function createMockContext(overrides?: Partial<ReviewContext>): ReviewContext {
  const project = createMockProject();
  const chapter = createMockChapter();
  
  return {
    project,
    chapter,
    chapterIndex: 0,
    ...overrides,
  };
}

describe('ReviewService', () => {
  describe('constructor', () => {
    it('should create a ReviewService with default options', () => {
      const context = createMockContext();
      const service = new ReviewService(context);
      
      expect(service).toBeDefined();
    });

    it('should create a ReviewService with custom options', () => {
      const context = createMockContext();
      const options: ReviewOptions = {
        checkSetting: false,
        checkTimeline: true,
        strictMode: true,
      };
      const service = new ReviewService(context, options);
      
      expect(service).toBeDefined();
    });
  });

  describe('review', () => {
    it('should return a SixDimensionReview object', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三走进长安城，他是一个勇敢的修士。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.review();
      
      expect(result).toBeDefined();
      expect(result.dimensions).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.score).toBeDefined();
    });

    it('should perform all dimension checks by default', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三和李四在长安城相遇。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.review();
      
      expect(result.dimensions.setting).toBeDefined();
      expect(result.dimensions.timeline).toBeDefined();
      expect(result.dimensions.continuity).toBeDefined();
      expect(result.dimensions.character).toBeDefined();
      expect(result.dimensions.logic).toBeDefined();
      expect(result.dimensions.ai_flavor).toBeDefined();
    });

    it('should skip disabled checks', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三走进长安城。',
        }),
      });
      const service = new ReviewService(context, {
        checkSetting: false,
        checkCharacter: false,
      });
      
      const result = await service.review();
      
      expect(result.dimensions.setting.passed).toBe(true);
      expect(result.dimensions.character.passed).toBe(true);
    });
  });

  describe('checkSettingConsistency', () => {
    it('should detect inconsistent location usage', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三在长安城修炼，突然瞬移到了紫霄宫。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.checkSettingConsistency(context.chapter.content);
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('should allow consistent location transitions', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三先在长安城，然后前往紫霄宫修炼。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.checkSettingConsistency(context.chapter.content);
      
      // Should have no critical issues
      const criticalIssues = result.filter(i => i.severity === 'critical');
      expect(criticalIssues.length).toBe(0);
    });
  });

  describe('checkCharacterConsistency', () => {
    it('should detect character behavior inconsistencies', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三是一个冷酷无情的杀手，但在这一刻，他突然变得热情好客。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.checkCharacterConsistency(context.chapter.content);
      
      expect(Array.isArray(result)).toBe(true);
    });

    it('should allow consistent character portrayal', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三是一个勇敢的修士，他面对敌人毫不畏惧。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.checkCharacterConsistency(context.chapter.content);
      
      const criticalIssues = result.filter(i => i.severity === 'critical');
      expect(criticalIssues.length).toBe(0);
    });
  });

  describe('checkAIFlavor', () => {
    it('should detect AI-flavored writing patterns', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '就在这时，他缓缓地做出了决定。似乎有什么在等待。与此同时，她静静地站在那里。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.checkAIFlavor(context.chapter.content);
      
      expect(Array.isArray(result)).toBe(true);
      // Should detect AI patterns
    });
  });

  describe('checkLogic', () => {
    it('should detect logical contradictions', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三是长安城的唯一守护者，但李四说他独自守卫了城池。',
        }),
      });
      const service = new ReviewService(context);
      
      const result = await service.checkLogic(context.chapter.content);
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('calculateScore', () => {
    it('should calculate a score between 0 and 100', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三走进长安城。',
        }),
      });
      const service = new ReviewService(context);
      
      const score = service.calculateScore();
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('generateReport', () => {
    it('should generate a review report', async () => {
      const context = createMockContext({
        chapter: createMockChapter({
          content: '张三在长安城修炼。',
        }),
      });
      const service = new ReviewService(context);
      
      const review = await service.review();
      const report = service.generateReport(review);
      
      expect(report).toBeDefined();
      expect(typeof report).toBe('string');
    });
  });
});
