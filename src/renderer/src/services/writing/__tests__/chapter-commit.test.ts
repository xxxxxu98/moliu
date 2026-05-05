/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { ChapterCommitService, type CommitContext } from '../chapter-commit';
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
    characters: [],
    worldSchema: { locations: [], rules: [], factions: [] },
    ...overrides,
  } as Project;
}

function createMockChapter(overrides?: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    volumeId: 'vol-1',
    title: '第一章：开始',
    content: '测试内容',
    wordCount: 3000,
    orderIndex: 0,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Chapter;
}

function createMockCommitContext(): CommitContext {
  return {
    project: createMockProject(),
    chapter: createMockChapter(),
    chapterIndex: 0,
  };
}

describe('ChapterCommitService', () => {
  describe('constructor', () => {
    it('should create a ChapterCommitService with context', () => {
      const context = createMockCommitContext();
      const service = new ChapterCommitService(context);
      
      expect(service).toBeDefined();
    });
  });
});
