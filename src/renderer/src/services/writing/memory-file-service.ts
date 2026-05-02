/**
 * 记忆文件服务
 * 提供文件系统备份功能，参考 oh-story-claudecode 的设计理念
 * - 每个章节记忆存储为独立的 Markdown 文件
 * - 支持按需读取，不依赖 JSON 解析
 * - 提供容错机制，单文件损坏不影响其他数据
 */

import type { ChapterMemory, CharacterStateChange } from '@/types/project';

// 文件存储格式
export interface MemoryFileContent {
  version: string;
  chapterId: string;
  chapterTitle: string;
  chapterIndex: number;
  corePlot: string;
  keyEvents: string[];
  locations: string[];
  timelineMark?: string;
  characterStateChanges: CharacterStateChange[];
  revealedForeshadows: string[];
  newForeshadows: string[];
  emotionalTone?: string;
  wordCount: number;
  createdAt: string;
}

// 内存缓存，避免重复读取
const memoryCache = new Map<string, ChapterMemory>();
const fileCache = new Map<string, string>();

/**
 * 格式化日期为文件名安全格式
 */
function formatDateForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * 从 Markdown 格式解析记忆
 */
export function parseMemoryFromMarkdown(markdown: string, chapterId: string): ChapterMemory | null {
  try {
    // 提取各字段
    const result: Partial<ChapterMemory> = {
      chapterId,
    };

    // 解析章节标题
    const titleMatch = markdown.match(/^#\s*(.+)$/m);
    if (titleMatch) {
      result.chapterTitle = titleMatch[1].trim();
    }

    // 解析章节序号
    const indexMatch = markdown.match(/\*\*章节序号\*\*:\s*(\d+)/);
    if (indexMatch) {
      result.chapterIndex = parseInt(indexMatch[1], 10);
    }

    // 解析核心情节
    const corePlotMatch = markdown.match(/\*\*核心情节\*\*:\s*\n([^#]+?)(?=\n##|\n###|$)/s);
    if (corePlotMatch) {
      result.corePlot = corePlotMatch[1].trim();
    }

    // 解析关键事件
    const keyEventsMatch = markdown.match(/\*\*关键事件\*\*:\s*\n([\s\S]*?)(?=\n##|\n###|$)/);
    if (keyEventsMatch) {
      const events = keyEventsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean);
      result.keyEvents = events;
    }

    // 解析场景/地点
    const locationsMatch = markdown.match(/\*\*场景\/地点\*\*:\s*\n([\s\S]*?)(?=\n##|\n###|$)/);
    if (locationsMatch) {
      const locations = locationsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean);
      result.locations = locations;
    }

    // 解析时间线
    const timelineMatch = markdown.match(/\*\*时间线标记\*\*:\s*([^\n]+)/);
    if (timelineMatch) {
      result.timelineMark = timelineMatch[1].trim();
    }

    // 解析情感基调
    const emotionMatch = markdown.match(/\*\*情感基调\*\*:\s*([^\n]+)/);
    if (emotionMatch) {
      result.emotionalTone = emotionMatch[1].trim();
    }

    // 解析章节字数
    const wordCountMatch = markdown.match(/\*\*章节字数\*\*:\s*(\d+)/);
    if (wordCountMatch) {
      result.wordCount = parseInt(wordCountMatch[1], 10);
    }

    // 解析创建时间
    const createdAtMatch = markdown.match(/\*\*创建时间\*\*:\s*([^\n]+)/);
    if (createdAtMatch) {
      result.createdAt = createdAtMatch[1].trim();
    }

    // 解析角色状态变化
    const characterChanges: CharacterStateChange[] = [];
    const characterSectionMatch = markdown.match(/## 角色状态变化\n([\s\S]*?)(?=##|$)/);
    if (characterSectionMatch) {
      const lines = characterSectionMatch[1].split('\n');
      let currentChar: Partial<CharacterStateChange> = {};
      for (const line of lines) {
        if (line.startsWith('### ')) {
          if (currentChar.characterName) {
            characterChanges.push(currentChar as CharacterStateChange);
          }
          currentChar = { characterName: line.replace('### ', '').trim() };
        } else if (line.startsWith('- **') && currentChar.characterName) {
          const propMatch = line.match(/- \*\*(\w+)\*\*:\s*(.+)/);
          if (propMatch) {
            const [, prop, value] = propMatch;
            if (prop === '类型') currentChar.stateType = value.trim() as CharacterStateChange['stateType'];
            if (prop === '状态') currentChar.state = value.trim();
            if (prop === '详情') currentChar.detail = value.trim();
          }
        }
      }
      if (currentChar.characterName) {
        characterChanges.push(currentChar as CharacterStateChange);
      }
    }
    result.characterStateChanges = characterChanges;

    // 解析伏笔
    const revealedMatch = markdown.match(/## 已揭示的伏笔\n([\s\S]*?)(?=##|$)/);
    if (revealedMatch) {
      result.revealedForeshadows = revealedMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean);
    }

    const newForeshadowsMatch = markdown.match(/## 新埋伏笔\n([\s\S]*?)(?=##|$)/);
    if (newForeshadowsMatch) {
      result.newForeshadows = newForeshadowsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean);
    }

    // 验证必填字段
    if (!result.chapterId || !result.chapterTitle || result.corePlot === undefined) {
      console.warn('[MemoryFileService] 解析失败：缺少必填字段', { chapterId, hasTitle: !!result.chapterTitle });
      return null;
    }

    // 设置默认值
    result.keyEvents = result.keyEvents || [];
    result.locations = result.locations || [];
    result.characterStateChanges = result.characterStateChanges || [];
    result.revealedForeshadows = result.revealedForeshadows || [];
    result.newForeshadows = result.newForeshadows || [];
    result.corePlot = result.corePlot || '（无内容）';
    result.wordCount = result.wordCount || 0;
    result.createdAt = result.createdAt || new Date().toISOString();

    return result as ChapterMemory;
  } catch (error) {
    console.error('[MemoryFileService] 解析 Markdown 失败:', error);
    return null;
  }
}

/**
 * 将记忆转换为 Markdown 格式
 */
export function memoryToMarkdown(memory: ChapterMemory): string {
  const lines: string[] = [
    `# ${memory.chapterTitle}`,
    '',
    '---',
    '',
    `**章节序号**: ${memory.chapterIndex}`,
    `**情感基调**: ${memory.emotionalTone || '未识别'}`,
    `**章节字数**: ${memory.wordCount}`,
    `**创建时间**: ${memory.createdAt}`,
    '',
    `**时间线标记**: ${memory.timelineMark || '（无）'}`,
    '',
    '---',
    '',
    '## 核心情节',
    '',
    memory.corePlot,
    '',
    '## 关键事件',
    '',
    ...(memory.keyEvents.length > 0
      ? memory.keyEvents.map(e => `- ${e}`)
      : ['- （无）']),
    '',
    '## 场景/地点',
    '',
    ...(memory.locations.length > 0
      ? memory.locations.map(l => `- ${l}`)
      : ['- （无）']),
    '',
  ];

  // 角色状态变化
  if (memory.characterStateChanges.length > 0) {
    lines.push('## 角色状态变化', '');
    for (const change of memory.characterStateChanges) {
      lines.push(`### ${change.characterName}`);
      lines.push(`- **类型**: ${change.stateType}`);
      lines.push(`- **状态**: ${change.state}`);
      lines.push(`- **详情**: ${change.detail}`);
      lines.push('');
    }
  }

  // 已揭示的伏笔
  lines.push('## 已揭示的伏笔', '');
  if (memory.revealedForeshadows.length > 0) {
    lines.push(...memory.revealedForeshadows.map(f => `- ${f}`));
  } else {
    lines.push('- （无）');
  }
  lines.push('');

  // 新埋伏笔
  lines.push('## 新埋伏笔', '');
  if (memory.newForeshadows.length > 0) {
    lines.push(...memory.newForeshadows.map(f => `- ${f}`));
  } else {
    lines.push('- （无）');
  }

  return lines.join('\n');
}

/**
 * 记忆文件服务 - 封装文件操作
 */
export class MemoryFileService {
  private projectId: string;
  private projectName: string;
  private basePath: string;

  constructor(projectId: string, projectName: string) {
    this.projectId = projectId;
    this.projectName = projectName;
    // 在 Electron 环境下，路径由主进程处理
    this.basePath = `memories/${this.sanitizeFilename(projectName)}`;
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFilename(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
  }

  /**
   * 生成章节记忆文件名
   */
  private getMemoryFilename(chapterId: string, chapterIndex: number, title: string): string {
    const safeTitle = this.sanitizeFilename(title).slice(0, 20);
    return `chapter-${String(chapterIndex).padStart(3, '0')}-${safeTitle}.md`;
  }

  /**
   * 保存章节记忆到文件系统
   */
  async saveMemory(memory: ChapterMemory): Promise<boolean> {
    try {
      const filename = this.getMemoryFilename(
        memory.chapterId,
        memory.chapterIndex,
        memory.chapterTitle
      );
      const markdown = memoryToMarkdown(memory);
      const filePath = `${this.basePath}/${filename}`;

      // 通过 IPC 调用主进程保存文件
      await window.electronAPI.saveMemoryFile({
        projectId: this.projectId,
        filePath,
        content: markdown,
      });

      // 更新缓存
      memoryCache.set(memory.chapterId, memory);
      fileCache.set(memory.chapterId, markdown);

      console.log(`[MemoryFileService] 已保存记忆: ${filename}`);
      return true;
    } catch (error) {
      console.error('[MemoryFileService] 保存记忆失败:', error);
      return false;
    }
  }

  /**
   * 从文件系统加载章节记忆
   */
  async loadMemory(chapterId: string, chapterIndex?: number, chapterTitle?: string): Promise<ChapterMemory | null> {
    // 先检查内存缓存
    if (memoryCache.has(chapterId)) {
      return memoryCache.get(chapterId)!;
    }

    try {
      let filename: string;
      if (chapterIndex !== undefined && chapterTitle) {
        filename = this.getMemoryFilename(chapterId, chapterIndex, chapterTitle);
      } else {
        // 需要先查找文件
        const files = await this.listMemoryFiles();
        filename = files.find(f => f.includes(chapterId)) || files[0];
        if (!filename) return null;
      }

      const filePath = `${this.basePath}/${filename}`;

      // 通过 IPC 调用主进程读取文件
      const content = await window.electronAPI.loadMemoryFile({
        projectId: this.projectId,
        filePath,
      }) as string | null;

      if (!content) return null;

      // 更新文件缓存
      fileCache.set(chapterId, content);

      // 解析 Markdown
      const memory = parseMemoryFromMarkdown(content, chapterId);
      if (memory) {
        memoryCache.set(chapterId, memory);
      }

      return memory;
    } catch (error) {
      console.error('[MemoryFileService] 加载记忆失败:', error);
      return null;
    }
  }

  /**
   * 列出所有记忆文件
   */
  async listMemoryFiles(): Promise<string[]> {
    try {
      const files = await window.electronAPI.listMemoryFiles({
        projectId: this.projectId,
        basePath: this.basePath,
      }) as string[];

      return files.filter(f => f.endsWith('.md')).sort();
    } catch (error) {
      console.error('[MemoryFileService] 列出记忆文件失败:', error);
      return [];
    }
  }

  /**
   * 批量加载记忆
   */
  async loadMemories(chapterIds: string[]): Promise<ChapterMemory[]> {
    const memories: ChapterMemory[] = [];

    for (const chapterId of chapterIds) {
      const memory = await this.loadMemory(chapterId);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  }

  /**
   * 加载指定范围的章节记忆
   */
  async loadMemoriesInRange(startIndex: number, count: number): Promise<ChapterMemory[]> {
    const files = await this.listMemoryFiles();
    const memories: ChapterMemory[] = [];

    for (const filename of files) {
      // 解析文件名中的章节序号
      const indexMatch = filename.match(/chapter-(\d+)/);
      if (indexMatch) {
        const index = parseInt(indexMatch[1], 10);
        if (index >= startIndex && index < startIndex + count) {
          const chapterIdMatch = filename.match(/chapter-\d+-(.+)\.md/);
          if (chapterIdMatch) {
            // 尝试加载
            try {
              const filePath = `${this.basePath}/${filename}`;
              const content = await window.electronAPI.loadMemoryFile({
                projectId: this.projectId,
                filePath,
              }) as string | null;

              if (content) {
                const memory = parseMemoryFromMarkdown(content, chapterIdMatch[1]);
                if (memory) {
                  memories.push(memory);
                }
              }
            } catch {
              // 单个文件加载失败不影响其他
              console.warn(`[MemoryFileService] 加载文件失败: ${filename}`);
            }
          }
        }
      }
    }

    // 按章节顺序排序
    return memories.sort((a, b) => a.chapterIndex - b.chapterIndex);
  }

  /**
   * 删除章节记忆
   */
  async deleteMemory(chapterId: string): Promise<boolean> {
    try {
      // 查找并删除文件
      const files = await this.listMemoryFiles();
      const fileToDelete = files.find(f => f.includes(chapterId));

      if (fileToDelete) {
        const filePath = `${this.basePath}/${fileToDelete}`;
        await window.electronAPI.deleteMemoryFile({
          projectId: this.projectId,
          filePath,
        });
      }

      // 清除缓存
      memoryCache.delete(chapterId);
      fileCache.delete(chapterId);

      return true;
    } catch (error) {
      console.error('[MemoryFileService] 删除记忆失败:', error);
      return false;
    }
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    memoryCache.clear();
    fileCache.clear();
  }

  /**
   * 获取缓存的统计信息
   */
  getCacheStats(): { memoryCount: number; fileCount: number } {
    return {
      memoryCount: memoryCache.size,
      fileCount: fileCache.size,
    };
  }
}

/**
 * 创建记忆文件服务的工厂函数
 */
export function createMemoryFileService(projectId: string, projectName: string): MemoryFileService {
  return new MemoryFileService(projectId, projectName);
}

/**
 * 安全提取章节记忆 - 带容错机制
 */
export async function safeExtractChapterMemory(
  memoryService: MemoryFileService,
  chapter: { id: string; title: string; content: string },
  chapterIndex: number,
  extractionFn: (chapter: { id: string; title: string; content: string }, chapterIndex: number) => Promise<ChapterMemory>
): Promise<ChapterMemory | null> {
  try {
    // 执行提取
    const memory = await extractionFn(chapter, chapterIndex);

    // 尝试保存到文件系统
    const saved = await memoryService.saveMemory(memory);
    if (!saved) {
      console.warn('[MemoryFileService] 文件系统备份失败，但内存数据可用');
    }

    return memory;
  } catch (error) {
    console.error('[MemoryFileService] 提取记忆失败:', error);

    // 尝试从文件系统恢复
    const cached = await memoryService.loadMemory(chapter.id, chapterIndex, chapter.title);
    if (cached) {
      console.log('[MemoryFileService] 从文件系统恢复记忆成功');
      return cached;
    }

    return null;
  }
}
