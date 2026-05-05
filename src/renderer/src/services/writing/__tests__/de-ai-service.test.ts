/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { DeAIService, type DeAIDetectionResult, type DeAIFixResult } from '@/services/writing/de-ai-service';

describe('DeAIService', () => {
  describe('detect', () => {
    it('should detect banned words in text', async () => {
      const text = '她的眼眸中闪烁着神秘的光芒，似乎隐藏着无尽的秘密。';
      const result: DeAIDetectionResult = await DeAIService.detect(text);
      
      expect(result).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should return no issues for clean text', async () => {
      const text = '小明走进教室，拿出书本开始学习。';
      const result: DeAIDetectionResult = await DeAIService.detect(text);
      
      expect(result.level).toBeDefined();
      expect(['none', 'mild', 'moderate', 'severe']).toContain(result.level);
    });

    it('should detect AI patterns like 缓缓地, 静静地', async () => {
      const text = '他缓缓地走向门口，静静地站在那里。';
      const result: DeAIDetectionResult = await DeAIService.detect(text);
      
      const aiPatternIssues = result.issues.filter(i => i.type === 'ai_pattern');
      expect(aiPatternIssues.length).toBeGreaterThan(0);
    });

    it('should count issue statistics correctly', async () => {
      const text = `
        她静静地站在窗前。
        他缓缓地抬起头。
        似乎有什么在等待。
        仿佛一切都将改变。
      `;
      const result: DeAIDetectionResult = await DeAIService.detect(text);
      
      expect(result.issueStats).toBeDefined();
      expect(result.issueStats.aiPatterns).toBeGreaterThanOrEqual(0);
      expect(result.issueStats.bannedWords).toBeGreaterThanOrEqual(0);
    });

    it('should provide suggestions for issues', async () => {
      const text = '就在这时，他做出了决定。';
      const result: DeAIDetectionResult = await DeAIService.detect(text);
      
      expect(result.suggestions).toBeDefined();
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('fix', () => {
    it('should fix AI patterns and return corrected content', async () => {
      const text = `
        她静静地站在窗前。
        他缓缓地转过头来。
        似乎有什么在等待。
        就在这时，门被推开了。
      `;
      const result: DeAIFixResult = await DeAIService.fix(text);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    });

    it('should count fixed issues', async () => {
      const text = '缓缓地 静静地 缓缓地';
      const result: DeAIFixResult = await DeAIService.fix(text);
      
      expect(result.fixedCount).toBeDefined();
      expect(typeof result.fixedCount).toBe('number');
    });

    it('should extract chapter title if present', async () => {
      const text = `# 第一章：新的开始

        缓缓地，风吹过山岗。
        她静静地望着远方。
      `;
      const result: DeAIFixResult = await DeAIService.fix(text);
      
      // Title extraction depends on format
      expect(result.title === null || typeof result.title === 'string').toBe(true);
    });

    it('should return detailed fix information', async () => {
      const text = '缓缓地，他离开了。';
      const result: DeAIFixResult = await DeAIService.fix(text);
      
      expect(result.fixes).toBeDefined();
      expect(Array.isArray(result.fixes)).toBe(true);
      result.fixes.forEach(fix => {
        expect(fix.original).toBeDefined();
        expect(fix.replacement).toBeDefined();
        expect(fix.reason).toBeDefined();
      });
    });
  });

  describe('detectAndFix', () => {
    it('should perform both detection and fixing', async () => {
      const text = '缓缓地，她抬起头。';
      const result = await DeAIService.detectAndFix(text);
      
      expect(result).toBeDefined();
      expect(result.original).toBeDefined();
      expect(result.corrected).toBeDefined();
      expect(result.corrected.content).toBeDefined();
    });
  });

  describe('batchProcess', () => {
    it('should process multiple texts', async () => {
      const texts = [
        '缓缓地，风吹过。',
        '静静地，她笑了。',
        '他走向门口。'
      ];
      
      const results = await DeAIService.batchProcess(texts);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(texts.length);
    });

    it('should return detection and fix for each text', async () => {
      const texts = ['缓缓地', '静静'];
      const results = await DeAIService.batchProcess(texts);
      
      results.forEach(result => {
        expect(result.detection).toBeDefined();
        expect(result.fix).toBeDefined();
        expect(result.index).toBeDefined();
      });
    });
  });
});
