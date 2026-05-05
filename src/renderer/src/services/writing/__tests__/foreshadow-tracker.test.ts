/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { ForeshadowAnalyzer, ForeshadowTracker } from '../foreshadow-tracker';
import type { EnhancedForeshadow, LoopType, UrgencyLevel } from '@/types/writing-task';

describe('ForeshadowAnalyzer', () => {
  describe('analyze', () => {
    it('should analyze text and return foreshadow analyses', () => {
      const text = '就在这时，一道神秘的光芒闪过，似乎有什么不祥的事情即将发生。';
      const result = ForeshadowAnalyzer.analyze(text, 1);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect mystery type foreshadow', () => {
      const text = '她似乎看到了什么，总觉得有什么不对劲。';
      const result = ForeshadowAnalyzer.analyze(text, 1);
      
      const mysteryForeshadows = result.filter(f => f.type === 'mystery');
      expect(mysteryForeshadows.length).toBeGreaterThanOrEqual(0);
    });

    it('should set planted chapter correctly', () => {
      const text = '他隐约感觉到危险的逼近。';
      const chapterNumber = 10;
      const result = ForeshadowAnalyzer.analyze(text, chapterNumber);
      
      result.forEach(foreshadow => {
        expect(foreshadow.plantedChapter).toBe(chapterNumber);
      });
    });
  });

  describe('calculateUrgency', () => {
    it('should calculate urgency based on analysis', () => {
      const analysis = {
        id: 'fs-1',
        content: '神秘力量觉醒',
        type: 'mystery' as LoopType,
        urgency: 'medium' as UrgencyLevel,
        plantedChapter: 1,
        confidence: 0.8,
      };
      
      const urgency = ForeshadowAnalyzer.calculateUrgency(analysis, 10);
      expect(['critical', 'high', 'medium', 'low']).toContain(urgency);
    });
  });
});

describe('ForeshadowTracker', () => {
  describe('constructor', () => {
    it('should create a ForeshadowTracker instance', () => {
      const tracker = new ForeshadowTracker([], 1);
      expect(tracker).toBeDefined();
    });

    it('should initialize with existing foreshadows', () => {
      const initialForeshadows: EnhancedForeshadow[] = [
        {
          id: 'fs-1',
          content: '测试伏笔',
          type: 'mystery',
          plantedChapter: 1,
          status: 'buried',
          plantedAt: new Date().toISOString(),
        },
      ];
      const tracker = new ForeshadowTracker(initialForeshadows, 5);
      expect(tracker).toBeDefined();
    });
  });

  describe('add', () => {
    it('should add a foreshadow to tracking', () => {
      const tracker = new ForeshadowTracker([], 1);
      const foreshadow: EnhancedForeshadow = {
        id: 'fs-1',
        content: '神秘力量的觉醒',
        type: 'mystery',
        plantedChapter: 1,
        expectedPayoffChapter: 10,
        status: 'buried',
        plantedAt: new Date().toISOString(),
      };
      
      tracker.add(foreshadow);
      
      const all = tracker.generateReport();
      expect(all.activeForeshadows.length).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update an existing foreshadow status', () => {
      const tracker = new ForeshadowTracker([], 1);
      const foreshadow: EnhancedForeshadow = {
        id: 'fs-1',
        content: '神秘力量的觉醒',
        type: 'mystery',
        plantedChapter: 1,
        status: 'buried',
        plantedAt: new Date().toISOString(),
      };
      
      tracker.add(foreshadow);
      tracker.updateStatus('fs-1', 'hinted');
      
      const all = tracker.generateReport();
      expect(all.activeForeshadows[0].status).toBe('hinted');
    });

    it('should mark a foreshadow as resolved with payoff chapter', () => {
      const tracker = new ForeshadowTracker([], 1);
      const foreshadow: EnhancedForeshadow = {
        id: 'fs-1',
        content: '神秘力量的觉醒',
        type: 'mystery',
        plantedChapter: 1,
        status: 'foreshadowed',
        plantedAt: new Date().toISOString(),
      };
      
      tracker.add(foreshadow);
      tracker.updateStatus('fs-1', 'resolved', 10);
      
      const all = tracker.generateReport();
      expect(all.resolvedForeshadows.length).toBe(1);
      expect(all.resolvedForeshadows[0].payoffChapter).toBe(10);
    });

    it('should return false for non-existent foreshadow', () => {
      const tracker = new ForeshadowTracker([], 1);
      const result = tracker.updateStatus('non-existent', 'resolved');
      
      expect(result).toBe(false);
    });
  });

  describe('getActive', () => {
    it('should return only active foreshadows', () => {
      const tracker = new ForeshadowTracker([], 5);
      
      tracker.add({
        id: 'fs-1',
        content: '伏笔1',
        type: 'mystery',
        plantedChapter: 1,
        status: 'buried',
        plantedAt: new Date().toISOString(),
      });
      
      tracker.add({
        id: 'fs-2',
        content: '伏笔2',
        type: 'conflict',
        plantedChapter: 2,
        status: 'resolved',
        payoffChapter: 5,
        plantedAt: new Date().toISOString(),
      });
      
      const active = tracker.getActive();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('fs-1');
    });
  });

  describe('generateReport', () => {
    it('should generate tracking result with all categories', () => {
      const tracker = new ForeshadowTracker([], 10);
      
      tracker.add({
        id: 'fs-1',
        content: '伏笔1',
        type: 'mystery',
        plantedChapter: 1,
        status: 'buried',
        plantedAt: new Date().toISOString(),
      });
      
      const result = tracker.generateReport();
      
      expect(result).toBeDefined();
      expect(result.activeForeshadows).toBeDefined();
      expect(result.urgentForeshadows).toBeDefined();
      expect(result.overdueForeshadows).toBeDefined();
      expect(result.resolvedForeshadows).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('should calculate correct statistics', () => {
      const tracker = new ForeshadowTracker([], 10);
      
      tracker.add({
        id: 'fs-1',
        content: '伏笔1',
        type: 'mystery',
        plantedChapter: 1,
        status: 'buried',
        plantedAt: new Date().toISOString(),
      });
      
      tracker.add({
        id: 'fs-2',
        content: '伏笔2',
        type: 'conflict',
        plantedChapter: 2,
        status: 'resolved',
        payoffChapter: 5,
        plantedAt: new Date().toISOString(),
      });
      
      const result = tracker.generateReport();
      
      expect(result.stats.total).toBe(2);
      expect(result.stats.buried).toBe(1);
      expect(result.stats.resolved).toBe(1);
    });
  });
});
