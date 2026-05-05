/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { extractChapterMemory, safeExtractChapterMemory, buildCharacterStateTable, buildPlotProgressTable } from '../extract-plot-memory';
import type { Chapter, ChapterMemory } from '@/types/project';

function createMockChapter(overrides?: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    volumeId: 'vol-1',
    title: '第一章：开始',
    content: '张三走进长安城，他是一个勇敢的修士。',
    wordCount: 30,
    orderIndex: 0,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Chapter;
}

describe('extractChapterMemory', () => {
  it('should extract memory from chapter content', async () => {
    const chapter = createMockChapter({
      content: '张三走进长安城，他是一个勇敢的修士。',
    });
    
    const result = await extractChapterMemory(chapter, 0);
    
    expect(result).toBeDefined();
    expect(result.chapterId).toBe(chapter.id);
    expect(result.chapterIndex).toBe(0);
  });

  it('should handle empty content gracefully', async () => {
    const chapter = createMockChapter({
      content: '',
    });
    
    const result = await extractChapterMemory(chapter, 0, {
      enableAIEnhancement: false,
      enableFileBackup: false,
    });
    
    expect(result).toBeDefined();
    expect(result.corePlot).toBeDefined();
  });
});

describe('safeExtractChapterMemory', () => {
  it('should extract memory successfully', async () => {
    const chapter = createMockChapter({
      content: '张三在长安城修炼。',
    });
    
    const result = await safeExtractChapterMemory(chapter, 0, {
      enableAIEnhancement: false,
      enableFileBackup: false,
    });
    
    expect(result).toBeDefined();
    expect(result.chapterId).toBe(chapter.id);
  });
});

describe('buildCharacterStateTable', () => {
  it('should build character state table from memories', () => {
    const memories: ChapterMemory[] = [
      {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        chapterIndex: 0,
        corePlot: 'Test',
        keyEvents: [],
        locations: [],
        characterStateChanges: [
          { characterName: '张三', stateType: 'ability', state: '筑基二层', detail: '突破到筑基二层' },
        ],
        revealedForeshadows: [],
        newForeshadows: [],
        wordCount: 100,
        createdAt: new Date().toISOString(),
      },
    ];
    
    const result = buildCharacterStateTable(memories);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('张三');
  });

  it('should handle empty memories', () => {
    const result = buildCharacterStateTable([]);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});

describe('buildPlotProgressTable', () => {
  it('should build plot progress table from memories', () => {
    const memories: ChapterMemory[] = [
      {
        chapterId: 'ch1',
        chapterTitle: 'Chapter 1',
        chapterIndex: 0,
        corePlot: 'Test plot',
        keyEvents: ['Event 1', 'Event 2'],
        locations: [],
        characterStateChanges: [],
        revealedForeshadows: [],
        newForeshadows: ['Foreshadow 1'],
        wordCount: 100,
        createdAt: new Date().toISOString(),
      },
    ];
    
    const result = buildPlotProgressTable(memories);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
    expect(result).toContain('Chapter');
  });

  it('should handle empty memories', () => {
    const result = buildPlotProgressTable([]);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });
});
