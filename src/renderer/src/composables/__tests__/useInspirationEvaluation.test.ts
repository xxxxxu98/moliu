/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { UserSelection } from '@/composables/new/useInspirationEvaluation';

describe('useInspirationEvaluation', () => {
  let evaluation: any;

  beforeEach(async () => {
    const module = await import('@/composables/new/useInspirationEvaluation');
    evaluation = module.useInspirationEvaluation();
  });

  describe('calculateReadRetention', () => {
    it('should calculate score for simple selection', () => {
      const selection: UserSelection = {
        genres: ['都市'],
        elements: ['重生', '逆袭'],
      };

      const score = evaluation.calculateReadRetention(selection);

      expect(score.total).toBeGreaterThan(0);
      expect(score.total).toBeLessThanOrEqual(100);
      expect(score.dimensions).toBeDefined();
    });

    it('should include all dimensions', () => {
      const selection: UserSelection = {
        genres: ['都市'],
        elements: ['重生', '打脸', '装逼'],
      };

      const score = evaluation.calculateReadRetention(selection);

      expect(score.dimensions.hookScore).toBeDefined();
      expect(score.dimensions.coolpointScore).toBeDefined();
      expect(score.dimensions.microFulfillment).toBeDefined();
      expect(score.dimensions.suspenseDebt).toBeDefined();
      expect(score.dimensions.rhythmHealth).toBeDefined();
      expect(score.dimensions.originality).toBeDefined();
    });

    it('should generate risks', () => {
      const selection: UserSelection = {
        genres: ['都市', '修仙'],
        elements: [],
      };

      const score = evaluation.calculateReadRetention(selection);

      expect(Array.isArray(score.risks)).toBe(true);
    });

    it('should include genre match info', () => {
      const selection: UserSelection = {
        genres: ['都市'],
        elements: ['重生'],
      };

      const score = evaluation.calculateReadRetention(selection);

      expect(score.genreMatch).toBeDefined();
    });
  });

  describe('quickEvaluate', () => {
    it('should return quick evaluation result', () => {
      const selection: UserSelection = {
        genres: ['都市'],
        elements: ['打脸', '装逼', '身份掉马'],
      };

      const result = evaluation.quickEvaluate(selection);

      expect(result.score).toBeDefined();
      expect(result.level).toBeDefined();
      expect(['excellent', 'good', 'average', 'poor']).toContain(result.level);
      expect(result.summary).toBeDefined();
    });

    it('should rate excellent for good selections', () => {
      const selection: UserSelection = {
        genres: ['都市'],
        elements: ['打脸', '装逼', '身份掉马', '成长', '突破', '反转'],
        coolPointTypes: ['face-slapping', 'show-off'],
      };

      const result = evaluation.quickEvaluate(selection);

      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('hook recommendations', () => {
    it('should recommend hooks for genres', () => {
      const hooks = evaluation.getRecommendedOpeningHooks(['都市']);

      expect(Array.isArray(hooks)).toBe(true);
    });

    it('should recommend chapter end hooks', () => {
      const hooks = evaluation.getRecommendedChapterEndHooks(['都市']);

      expect(Array.isArray(hooks)).toBe(true);
    });
  });

  describe('coolpoint recommendations', () => {
    it('should recommend coolpoints for genres', () => {
      const coolpoints = evaluation.getRecommendedCoolPoints(['都市']);

      expect(Array.isArray(coolpoints)).toBe(true);
    });
  });

  describe('genre profile', () => {
    it('should get genre profile by id', () => {
      const profile = evaluation.getGenreProfile('urban');

      expect(profile).toBeDefined();
      if (profile) {
        expect(profile.id).toBe('urban');
        expect(profile.hooks).toBeDefined();
        expect(profile.coolpoints).toBeDefined();
      }
    });

    it('should match genre profile', () => {
      const profile = evaluation.matchGenreProfile(['都市', '重生']);

      expect(profile).toBeDefined();
      expect(profile.name).toBeDefined();
    });
  });
});
