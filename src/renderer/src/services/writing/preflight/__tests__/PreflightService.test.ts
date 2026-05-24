/**
 * PreflightService 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PreflightService } from '../PreflightService';
import type { PreflightResult } from '@/types/writing-v2';

// Mock the project store
vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => ({
    currentProject: null,
    currentChapter: null,
    chapters: [],
    characters: [],
    worldSchema: null,
    plotOutline: null,
  }),
}));

describe('PreflightService', () => {
  let service: PreflightService;

  beforeEach(() => {
    service = new PreflightService();
  });

  describe('基础检查', () => {
    it('应返回未就绪状态当没有项目时', async () => {
      const result = await service.preflight();
      expect(result.ready).toBe(false);
      expect(result.errors.some(e => e.includes('项目'))).toBe(true);
    });

    it('应检查章节列表', async () => {
      const result = await service.preflight();
      expect(result.checks).toBeDefined();
      expect(result.checks.chapters).toBeDefined();
    });

    it('应包含预检时间戳', async () => {
      const result = await service.preflight();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('检查项目结构', () => {
    it('应检查世界观设置', async () => {
      const result = await service.preflight();
      expect(result.checks.worldSchema).toBeDefined();
    });

    it('应检查角色列表', async () => {
      const result = await service.preflight();
      expect(result.checks.characters).toBeDefined();
    });

    it('应检查大纲', async () => {
      const result = await service.preflight();
      expect(result.checks.plotOutline).toBeDefined();
    });
  });

  describe('检查项详情', () => {
    it('应包含警告信息', async () => {
      const result = await service.preflight();
      expect(result.warnings).toBeDefined();
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('应包含错误信息', async () => {
      const result = await service.preflight();
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('帮助方法', () => {
    it('应返回友好的状态描述', () => {
      const description = service.getStatusDescription();
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });

    it('应提供改进建议', () => {
      const suggestions = service.getSuggestions();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('应生成状态报告', () => {
      const report = service.getStatusReport();
      expect(report).toBeDefined();
      expect(report.ready).toBeDefined();
      expect(report.errors).toBeDefined();
      expect(report.warnings).toBeDefined();
    });
  });
});
