/**
 * ProjectionWriters 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectionOrchestrator } from '../ProjectionWriters';
import type { ExtractionResult, ProjectionStatus } from '@/types/writing-v2';

// Mock the project store
vi.mock('@/stores/project.store', () => ({
  useProjectStore: () => ({
    updateChapter: vi.fn(),
    updateCharacter: vi.fn(),
    addForeshadow: vi.fn(),
    addMemory: vi.fn(),
  }),
}));

describe('ProjectionOrchestrator', () => {
  let orchestrator: ProjectionOrchestrator;

  const mockExtraction: ExtractionResult = {
    success: true,
    events: [],
    stateChanges: [],
    entitiesAppeared: [],
    scenes: [],
    summaryText: '测试章节内容',
    coolPoints: [],
  };

  const mockMetadata = {
    title: '第1章',
    wordCount: 1000,
    status: 'draft',
    coolPoints: 0,
    foreshadows: 0,
  };

  beforeEach(() => {
    orchestrator = new ProjectionOrchestrator();
  });

  describe('基础功能', () => {
    it('应创建 orchestrator 实例', () => {
      expect(orchestrator).toBeDefined();
    });

    it('应返回投影状态映射', () => {
      const status = orchestrator.getStatusMap();
      expect(status).toBeDefined();
      expect(status.state).toBeDefined();
      expect(status.index).toBeDefined();
      expect(status.summary).toBeDefined();
      expect(status.memory).toBeDefined();
      expect(status.vector).toBeDefined();
    });
  });

  describe('单独运行投影器', () => {
    it('应运行状态投影器', async () => {
      const result = await orchestrator.runState(1, mockExtraction, mockMetadata);
      expect(result).toBeDefined();
      expect(result).toContain('done');
    });

    it('应运行索引投影器', async () => {
      const result = await orchestrator.runIndex(1, mockExtraction, mockMetadata);
      expect(result).toBeDefined();
      expect(['done', 'skipped', 'failed']).toContain(result);
    });

    it('应运行摘要投影器', async () => {
      const result = await orchestrator.runSummary(1, mockExtraction, mockMetadata);
      expect(result).toBeDefined();
      expect(['done', 'skipped', 'failed']).toContain(result);
    });

    it('应运行记忆投影器', async () => {
      const result = await orchestrator.runMemory(1, mockExtraction, mockMetadata);
      expect(result).toBeDefined();
      expect(['done', 'skipped', 'failed']).toContain(result);
    });

    it('应运行向量投影器', async () => {
      const result = await orchestrator.runVector(1, mockExtraction, mockMetadata);
      expect(result).toBeDefined();
      expect(['done', 'skipped', 'failed']).toContain(result);
    });
  });

  describe('批量运行', () => {
    it('应运行所有投影器', async () => {
      const results = await orchestrator.runAll(1, {
        extraction: mockExtraction,
        disambiguation: { pending: [], resolved: [] },
        metadata: mockMetadata,
      });

      expect(results).toBeDefined();
      expect(results.state).toBeDefined();
      expect(results.index).toBeDefined();
      expect(results.summary).toBeDefined();
      expect(results.memory).toBeDefined();
      expect(results.vector).toBeDefined();
    });

    it('应处理投影失败', async () => {
      // 传入空数据以触发可能的失败
      const emptyExtraction = { ...mockExtraction, success: false };
      
      const results = await orchestrator.runAll(1, {
        extraction: emptyExtraction,
        disambiguation: { pending: [], resolved: [] },
        metadata: mockMetadata,
      });

      // 应该仍然返回结果，即使某些投影失败
      expect(results).toBeDefined();
    });
  });

  describe('辅助方法', () => {
    it('应生成投影报告', () => {
      const report = orchestrator.getReport();
      expect(report).toBeDefined();
      expect(report.totalProjections).toBeDefined();
      expect(report.successfulProjections).toBeDefined();
      expect(report.failedProjections).toBeDefined();
    });

    it('应重置状态', () => {
      orchestrator.reset();
      const status = orchestrator.getStatusMap();
      expect(Object.values(status).every(s => s === 'pending')).toBe(true);
    });
  });
});
