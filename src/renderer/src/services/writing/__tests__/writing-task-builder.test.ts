/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { WritingTaskBuilder, createTaskBookBuilder, type TaskBookBuildOptions } from '../writing-task-builder';
import type { Project, Chapter } from '@/types/project';
import type { WritingStyle } from '@/types/writing';

// Mock data factories
function createMockProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    description: 'A test project for unit testing',
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
    content: '这是测试章节内容。',
    wordCount: 3000,
    orderIndex: 0,
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Chapter;
}

function createMockOptions(project?: Project, chapterIndex?: number): TaskBookBuildOptions {
  return {
    project: project || createMockProject(),
    chapterIndex: chapterIndex || 0,
    writingStyle: 'concise' as WritingStyle,
    targetWordCount: 3000,
    recentChapterCount: 3,
  };
}

describe('WritingTaskBuilder', () => {
  describe('constructor', () => {
    it('should create a WritingTaskBuilder instance', () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      
      expect(builder).toBeDefined();
    });
  });

  describe('loadBaseContext', () => {
    it('should load base context without error', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      
      const context = await builder.loadBaseContext();
      
      expect(context).toBeDefined();
      expect(context.project).toBeDefined();
      expect(context.characters).toBeDefined();
      expect(context.worldSchema).toBeDefined();
    });

    it('should include project name and description', async () => {
      const project = createMockProject({ name: 'Custom Project', description: 'Custom description' });
      const options = createMockOptions(project);
      const builder = new WritingTaskBuilder(options);
      
      const context = await builder.loadBaseContext();
      
      expect(context.project.name).toBe('Custom Project');
      expect(context.project.description).toBe('Custom description');
    });
  });

  describe('loadDeepContext', () => {
    it('should load deep context without error', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      await builder.loadBaseContext();
      
      const deepContext = await builder.loadDeepContext();
      
      expect(deepContext).toBeDefined();
      expect(deepContext.characters).toBeDefined();
      expect(deepContext.worldSchema).toBeDefined();
    });
  });

  describe('loadSupplementData', () => {
    it('should load supplement data without error', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      await builder.loadBaseContext();
      
      const supplement = await builder.loadSupplementData();
      
      expect(supplement).toBeDefined();
    });
  });

  describe('assembleTaskBook', () => {
    it('should assemble a complete task book', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      
      const taskBook = await builder.assembleTaskBook();
      
      expect(taskBook).toBeDefined();
      expect(taskBook.meta).toBeDefined();
      expect(taskBook.baseContext).toBeDefined();
      expect(taskBook.deepContext).toBeDefined();
      expect(taskBook.supplementData).toBeDefined();
      expect(taskBook.writingGuidance).toBeDefined();
    });

    it('should include all five parts of task book', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      
      const taskBook = await builder.assembleTaskBook();
      
      // 五段式任务书结构
      expect(taskBook.meta).toBeDefined();
      expect(taskBook.baseContext).toBeDefined();
      expect(taskBook.deepContext).toBeDefined();
      expect(taskBook.supplementData).toBeDefined();
      expect(taskBook.writingGuidance).toBeDefined();
    });

    it('should include meta information', async () => {
      const project = createMockProject();
      const options = createMockOptions(project, 5);
      const builder = new WritingTaskBuilder(options);
      
      const taskBook = await builder.assembleTaskBook();
      
      expect(taskBook.meta.chapterNumber).toBe(5);
      expect(taskBook.meta.projectName).toBe('Test Project');
    });
  });

  describe('exportToPrompt', () => {
    it('should export task book to prompt string', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      
      const prompt = await builder.exportToPrompt();
      
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include writing guidance in prompt', async () => {
      const options = createMockOptions();
      const builder = new WritingTaskBuilder(options);
      
      const prompt = await builder.exportToPrompt();
      
      expect(prompt).toContain('写作铁律');
    });
  });
});

describe('createTaskBookBuilder', () => {
  it('should create a WritingTaskBuilder instance', () => {
    const options = createMockOptions();
    const builder = createTaskBookBuilder(options);
    
    expect(builder).toBeDefined();
    expect(builder instanceof WritingTaskBuilder).toBe(true);
  });

  it('should accept all required options', () => {
    const project = createMockProject();
    const options: TaskBookBuildOptions = {
      project,
      chapterIndex: 1,
      writingStyle: 'elegant',
      targetWordCount: 4000,
      chapterOutline: '这是一个测试大纲',
      recentChapterCount: 5,
    };
    
    const builder = createTaskBookBuilder(options);
    expect(builder).toBeDefined();
  });
});

describe('WritingTaskBuilder with different styles', () => {
  const styles: WritingStyle[] = ['concise', 'elegant', 'humorous', 'ancient'];
  
  styles.forEach(style => {
    it(`should handle ${style} writing style`, async () => {
      const options = createMockOptions();
      options.writingStyle = style;
      const builder = new WritingTaskBuilder(options);
      
      const taskBook = await builder.assembleTaskBook();
      
      expect(taskBook).toBeDefined();
      expect(taskBook.writingGuidance).toBeDefined();
    });
  });
});

describe('WritingTaskBuilder with characters', () => {
  it('should include protagonist and antagonist', async () => {
    const options = createMockOptions();
    const builder = new WritingTaskBuilder(options);
    
    const taskBook = await builder.assembleTaskBook();
    
    expect(taskBook.baseContext.characters).toBeDefined();
    const characters = taskBook.baseContext.characters;
    const protagonist = characters.find((c: any) => c.role === 'protagonist');
    const antagonist = characters.find((c: any) => c.role === 'antagonist');
    
    expect(protagonist).toBeDefined();
    expect(antagonist).toBeDefined();
    expect(protagonist.name).toBe('张三');
    expect(antagonist.name).toBe('李四');
  });
});
