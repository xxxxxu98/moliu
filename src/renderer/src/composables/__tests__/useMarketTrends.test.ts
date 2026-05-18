/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMarketTrends } from '@/composables/new/useMarketTrends';

describe('useMarketTrends', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should initialize with empty trends', () => {
      const trends = useMarketTrends();

      expect(trends.trends.value).toEqual([]);
      expect(trends.isLoading.value).toBe(false);
      expect(trends.error.value).toBeNull();
    });
  });

  describe('fetchTrends', () => {
    it('should fetch trends successfully', async () => {
      const trends = useMarketTrends();

      await trends.fetchTrends();

      expect(trends.trends.value.length).toBeGreaterThan(0);
      expect(trends.isLoading.value).toBe(false);
    });
  });

  describe('fetchPlatformTrend', () => {
    it('should fetch platform trend', async () => {
      const trends = useMarketTrends();

      const result = await trends.fetchPlatformTrend('qidian');

      expect(result).not.toBeNull();
      if (result) {
        expect(result.platform).toBe('qidian');
      }
    });
  });

  describe('differentiation suggestions', () => {
    it('should generate differentiation suggestions', () => {
      const trends = useMarketTrends();

      const suggestion = trends.generateDifferentiation({
        genres: ['都市'],
        elements: ['重生', '逆袭'],
      });

      expect(suggestion.antiTrope).toBeDefined();
      expect(suggestion.sellingPoint).toBeDefined();
      expect(suggestion.riskWarning).toBeDefined();
      expect(suggestion.marketGap).toBeDefined();
      expect(Array.isArray(suggestion.suggestedCombos)).toBe(true);
    });

    it('should handle empty selection', () => {
      const trends = useMarketTrends();

      const suggestion = trends.generateDifferentiation({
        genres: [],
        elements: [],
      });

      expect(suggestion.antiTrope).toBeDefined();
      expect(suggestion.suggestedCombos).toEqual([]);
    });
  });

  describe('market insights', () => {
    it('should get market insights', () => {
      const trends = useMarketTrends();

      const insights = trends.getMarketInsights();

      expect(Array.isArray(insights)).toBe(true);
    });
  });

  describe('computed properties', () => {
    it('should filter top genres', async () => {
      const trends = useMarketTrends();
      await trends.fetchTrends();

      const topGenres = trends.topGenres.value;

      // Top genres should not include falling ones
      if (topGenres.length > 0) {
        expect(topGenres.every(g => g.trend !== 'falling')).toBe(true);
      }
    });

    it('should filter rising tags', async () => {
      const trends = useMarketTrends();
      await trends.fetchTrends();

      const risingTags = trends.risingTags.value;

      expect(Array.isArray(risingTags)).toBe(true);
    });

    it('should filter hot elements', async () => {
      const trends = useMarketTrends();
      await trends.fetchTrends();

      const hotElements = trends.hotElements.value;

      expect(Array.isArray(hotElements)).toBe(true);
    });
  });

  describe('platform selection', () => {
    it('should change selected platform', async () => {
      const trends = useMarketTrends();
      await trends.fetchTrends();

      trends.selectedPlatform.value = 'qidian';

      expect(trends.selectedPlatform.value).toBe('qidian');
    });
  });
});
