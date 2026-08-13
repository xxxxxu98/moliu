/**
 * AntiPatternsRegistry 测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AntiPatternsRegistryService } from '../AntiPatternsRegistry';

describe('AntiPatternsRegistryService', () => {
  let registry: AntiPatternsRegistryService;

  // 注册表按 projectId 持久化到 localStorage，用 Date.now() 命名会让同毫秒内的
  // 用例共用存储键而互相串数据，改用自增序号并在每例前清空存储。
  let projectSeq = 0;

  beforeEach(() => {
    localStorage.clear();
    registry = new AntiPatternsRegistryService();
    registry.initialize(`test-project-${++projectSeq}`);
  });

  describe('基础功能', () => {
    it('应初始化为空列表', () => {
      const patterns = registry.getPatterns();
      expect(patterns).toEqual([]);
    });

    it('应添加反模式', () => {
      registry.addFromReview('测试模式', 1, 'high');
      const patterns = registry.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].pattern).toBe('测试模式');
      expect(patterns[0].severity).toBe('high');
      expect(patterns[0].frequency).toBe(1);
    });

    it('应更新已存在反模式的频率', () => {
      registry.addFromReview('测试模式', 1, 'high');
      registry.addFromReview('测试模式', 2, 'high');
      const patterns = registry.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].frequency).toBe(2);
    });

    it('应移除反模式', () => {
      registry.addFromReview('测试模式', 1, 'high');
      const patterns = registry.getPatterns();
      expect(patterns).toHaveLength(1);
      
      const removed = registry.remove(patterns[0].id);
      expect(removed).toBe(true);
      expect(registry.getPatterns()).toHaveLength(0);
    });
  });

  describe('严重度管理', () => {
    it('应升级严重度', () => {
      registry.addFromReview('测试模式', 1, 'low');
      registry.addFromReview('测试模式', 2, 'high');
      
      const patterns = registry.getPatterns();
      expect(patterns[0].severity).toBe('high');
    });

    it('不应降级严重度', () => {
      registry.addFromReview('测试模式', 1, 'high');
      registry.addFromReview('测试模式', 2, 'low');
      
      const patterns = registry.getPatterns();
      expect(patterns[0].severity).toBe('high');
    });
  });

  describe('过滤功能', () => {
    beforeEach(() => {
      registry.addFromReview('高频模式1', 1, 'high');
      registry.addFromReview('高频模式2', 1, 'high');
      registry.addFromReview('中频模式', 1, 'medium');
      registry.addFromReview('低频模式', 1, 'low');
    });

    it('应获取高严重度反模式', () => {
      const patterns = registry.getHighSeverityPatterns();
      expect(patterns).toHaveLength(2);
      patterns.forEach(p => {
        expect(p.severity).toBe('high');
      });
    });

    it('应获取模式字符串列表', () => {
      // 添加多次以达到阈值
      for (let i = 0; i < 3; i++) {
        registry.addFromReview('高频模式1', i, 'high');
      }
      
      const strings = registry.getPatternStrings();
      expect(strings).toContain('高频模式1');
    });
  });

  describe('批量操作', () => {
    it('应批量添加反模式', () => {
      const patterns = [
        { pattern: '模式1', severity: 'high' as const },
        { pattern: '模式2', severity: 'medium' as const },
        { pattern: '模式3', severity: 'low' as const },
      ];
      
      const added = registry.addBatchFromReview(patterns, 1);
      expect(added).toBe(2); // 只添加 high 和 medium
    });

    it('应清空所有反模式', () => {
      registry.addFromReview('模式1', 1, 'high');
      registry.addFromReview('模式2', 1, 'high');
      
      registry.clear();
      expect(registry.getPatterns()).toHaveLength(0);
    });
  });

  describe('导入导出', () => {
    it('应导出注册表', () => {
      registry.addFromReview('测试模式', 1, 'high');
      const json = registry.export();
      
      expect(json).toContain('测试模式');
      expect(json).toContain('high');
    });

    it('应导入注册表', () => {
      registry.addFromReview('原始模式', 1, 'high');
      const original = registry.export();

      registry.clear();
      expect(registry.getPatterns()).toHaveLength(0);

      const result = registry.import(original);

      expect(result).toBe(true);
      const patterns = registry.getPatterns();
      expect(patterns.some(p => p.pattern === '原始模式')).toBe(true);
    });

    it('应拒绝无效导入', () => {
      const result = registry.import('invalid json');
      expect(result).toBe(false);
    });
  });

  describe('统计信息', () => {
    it('应返回正确的统计', () => {
      registry.addFromReview('高频1', 1, 'high');
      registry.addFromReview('高频2', 1, 'high');
      registry.addFromReview('中频', 1, 'medium');
      registry.addManual('手动模式', '修复建议');

      const stats = registry.getStats();
      
      expect(stats.total).toBe(4);
      expect(stats.bySeverity.high).toBe(2);
      // addManual 固定按 medium 记，故中等严重度为「中频」+「手动模式」两条
      expect(stats.bySeverity.medium).toBe(2);
      expect(stats.bySource.review).toBe(3);
      expect(stats.bySource.manual).toBe(1);
    });

    it('应返回高频模式列表', () => {
      for (let i = 0; i < 5; i++) {
        registry.addFromReview('高频模式', i, 'high');
      }
      registry.addFromReview('低频模式', 1, 'low');

      const stats = registry.getStats();
      expect(stats.topPatterns).toHaveLength(2);
      expect(stats.topPatterns[0].pattern).toBe('高频模式');
    });
  });

  describe('手动模式', () => {
    it('应手动添加反模式', () => {
      const result = registry.addManual('手动模式', '替换为xxx');
      expect(result).toBe(true);
      
      const patterns = registry.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0].source).toBe('manual');
      expect(patterns[0].autoFix).toBe('替换为xxx');
    });

    it('不应重复添加手动模式', () => {
      registry.addManual('手动模式');
      const result = registry.addManual('手动模式');
      expect(result).toBe(false);
    });
  });
});
