/**
 * 记忆管理器
 * 提供按需读取的记忆管理，参考 oh-story-claudecode 的设计理念
 * - 按需读取：只读取当前需要的记忆
 * - 分层缓存：内存缓存 + 文件系统
 * - 容错机制：单文件损坏不影响全局
 */

import type { ChapterMemory, CharacterStateChange } from '@/types/project';
import { MemoryFileService, createMemoryFileService } from './memory-file-service';

// 单例记忆管理器
let memoryManager: MemoryManager | null = null;

/**
 * 记忆管理器
 * 负责管理记忆的加载、保存和按需读取
 */
export class MemoryManager {
  private fileService: MemoryFileService | null = null;
  private projectId: string = '';
  private projectName: string = '';
  private memoryCache = new Map<string, ChapterMemory>();
  private shortTermCache = new Map<string, ChapterMemory>();
  private isEnabled = false;

  /**
   * 初始化记忆管理器
   */
  initialize(projectId: string, projectName: string, enableFileBackup: boolean = true): void {
    this.projectId = projectId;
    this.projectName = projectName;
    this.isEnabled = enableFileBackup;

    if (enableFileBackup) {
      this.fileService = createMemoryFileService(projectId, projectName);
    } else {
      this.fileService = null;
    }

    console.log(`[MemoryManager] 初始化: projectId=${projectId}, enableFileBackup=${enableFileBackup}`);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.memoryCache.size > 0 || this.fileService !== null;
  }

  /**
   * 获取记忆（按需加载）
   */
  async getMemory(chapterId: string): Promise<ChapterMemory | null> {
    // 先检查内存缓存
    if (this.memoryCache.has(chapterId)) {
      return this.memoryCache.get(chapterId)!;
    }

    // 检查短期记忆缓存
    if (this.shortTermCache.has(chapterId)) {
      return this.shortTermCache.get(chapterId)!;
    }

    // 从文件系统加载
    if (this.fileService) {
      const memory = await this.fileService.loadMemory(chapterId);
      if (memory) {
        this.memoryCache.set(chapterId, memory);
        return memory;
      }
    }

    return null;
  }

  /**
   * 获取多个记忆
   */
  async getMemories(chapterIds: string[]): Promise<ChapterMemory[]> {
    const memories: ChapterMemory[] = [];
    for (const id of chapterIds) {
      const memory = await this.getMemory(id);
      if (memory) {
        memories.push(memory);
      }
    }
    return memories;
  }

  /**
   * 获取最近 N 章的记忆
   */
  async getRecentMemories(count: number, currentIndex: number): Promise<ChapterMemory[]> {
    const memories: ChapterMemory[] = [];
    const startIndex = Math.max(0, currentIndex - count);

    for (let i = startIndex; i < currentIndex; i++) {
      // 通过索引查找
      for (const [, memory] of this.memoryCache) {
        if (memory.chapterIndex === i) {
          memories.push(memory);
          break;
        }
      }
    }

    // 如果缓存不足，从文件系统加载
    if (this.fileService && memories.length < count) {
      const loaded = await this.fileService.loadMemoriesInRange(startIndex, count);
      for (const memory of loaded) {
        this.memoryCache.set(memory.chapterId, memory);
        if (!memories.find(m => m.chapterId === memory.chapterId)) {
          memories.push(memory);
        }
      }
    }

    return memories.sort((a, b) => a.chapterIndex - b.chapterIndex);
  }

  /**
   * 保存记忆
   */
  async saveMemory(memory: ChapterMemory): Promise<boolean> {
    // 更新内存缓存
    this.memoryCache.set(memory.chapterId, memory);

    // 更新短期记忆缓存（保留最近章节）
    if (memory.chapterIndex >= 0) {
      this.shortTermCache.set(memory.chapterId, memory);
    }

    // 限制短期缓存大小
    if (this.shortTermCache.size > 20) {
      const entries = Array.from(this.shortTermCache.entries());
      entries.sort((a, b) => b[1].chapterIndex - a[1].chapterIndex);
      const toDelete = entries.slice(10);
      for (const [id] of toDelete) {
        this.shortTermCache.delete(id);
      }
    }

    // 保存到文件系统
    if (this.fileService) {
      return await this.fileService.saveMemory(memory);
    }

    return true;
  }

  /**
   * 批量保存记忆
   */
  async saveMemories(memories: ChapterMemory[]): Promise<void> {
    for (const memory of memories) {
      await this.saveMemory(memory);
    }
  }

  /**
   * 删除记忆
   */
  async deleteMemory(chapterId: string): Promise<boolean> {
    this.memoryCache.delete(chapterId);
    this.shortTermCache.delete(chapterId);

    if (this.fileService) {
      return await this.fileService.deleteMemory(chapterId);
    }

    return true;
  }

  /**
   * 获取所有记忆（从缓存）
   */
  getAllMemories(): ChapterMemory[] {
    return Array.from(this.memoryCache.values()).sort((a, b) => a.chapterIndex - b.chapterIndex);
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.memoryCache.clear();
    this.shortTermCache.clear();
    if (this.fileService) {
      this.fileService.clearCache();
    }
    console.log('[MemoryManager] 缓存已清除');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { memoryCacheSize: number; shortTermCacheSize: number } {
    return {
      memoryCacheSize: this.memoryCache.size,
      shortTermCacheSize: this.shortTermCache.size,
    };
  }

  /**
   * 从文件系统同步所有记忆到内存
   */
  async syncFromFileSystem(): Promise<number> {
    if (!this.fileService) return 0;

    const files = await this.fileService.listMemoryFiles();
    let count = 0;

    for (const file of files) {
      try {
        const memory = await this.fileService.loadMemory(
          file.replace('.md', ''),
          parseInt(file.match(/chapter-(\d+)/)?.[1] || '0'),
          file
        );
        if (memory) {
          this.memoryCache.set(memory.chapterId, memory);
          count++;
        }
      } catch (error) {
        console.warn(`[MemoryManager] 同步失败: ${file}`, error);
      }
    }

    console.log(`[MemoryManager] 已同步 ${count} 个记忆从文件系统`);
    return count;
  }
}

/**
 * 获取记忆管理器单例
 */
export function getMemoryManager(): MemoryManager {
  if (!memoryManager) {
    memoryManager = new MemoryManager();
  }
  return memoryManager;
}

/**
 * 初始化记忆管理器
 */
export function initializeMemoryManager(
  projectId: string,
  projectName: string,
  enableFileBackup: boolean = true
): MemoryManager {
  const manager = getMemoryManager();
  manager.initialize(projectId, projectName, enableFileBackup);
  return manager;
}

// ============================================
// 辅助函数：构建上下文数据
// ============================================

/**
 * 构建角色状态表
 */
export function buildCharacterStateTable(memories: ChapterMemory[]): string {
  if (memories.length === 0) {
    return '（暂无角色状态信息）';
  }

  // 收集每个角色的最新状态
  const characterMap = new Map<string, CharacterStateChange>();

  for (const memory of memories) {
    for (const change of memory.characterStateChanges) {
      const existing = characterMap.get(change.characterName);
      if (!existing || memory.chapterIndex > memories.find(m => m.chapterId === existing.stateType)?.chapterIndex!) {
        characterMap.set(change.characterName, change);
      }
    }
  }

  if (characterMap.size === 0) {
    return '（暂无角色状态信息）';
  }

  const lines: string[] = ['## 角色状态表', ''];

  for (const [name, change] of characterMap) {
    lines.push(`### ${name}`);
    lines.push(`- 类型：${change.stateType}`);
    lines.push(`- 状态：${change.state}`);
    lines.push(`- 详情：${change.detail}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 构建情节进度表
 */
export function buildPlotProgressTable(memories: ChapterMemory[]): string {
  if (memories.length === 0) {
    return '（暂无情节进度信息）';
  }

  const lines: string[] = ['## 情节进度表', ''];

  // 核心情节摘要
  lines.push('### 近期情节摘要', '');
  const recentMemories = memories.slice(-5);
  for (const memory of recentMemories) {
    lines.push(`**第${memory.chapterIndex + 1}章 · ${memory.chapterTitle}**`);
    lines.push(`> ${memory.corePlot.slice(0, 100)}${memory.corePlot.length > 100 ? '...' : ''}`);
    lines.push('');
  }

  // 关键事件汇总
  lines.push('### 关键事件', '');
  const allEvents = memories.flatMap(m => m.keyEvents);
  const uniqueEvents = [...new Set(allEvents)].slice(-10);
  for (const event of uniqueEvents) {
    lines.push(`- ${event}`);
  }
  lines.push('');

  // 场景/地点变化
  lines.push('### 涉及场景', '');
  const allLocations = [...new Set(memories.flatMap(m => m.locations))];
  for (const location of allLocations.slice(0, 10)) {
    lines.push(`- ${location}`);
  }
  lines.push('');

  // 伏笔追踪
  const allForeshadows = memories.flatMap(m => m.newForeshadows);
  if (allForeshadows.length > 0) {
    lines.push('### 活跃伏笔', '');
    for (const foreshadow of allForeshadows.slice(0, 5)) {
      lines.push(`- ${foreshadow}`);
    }
  }

  return lines.join('\n');
}

/**
 * 构建完整上下文（用于 AI 续写）
 */
export async function buildWritingContext(
  currentChapterId: string,
  currentChapterIndex: number,
  shortTermChapterCount: number = 5
): Promise<{
  shortTermFullText: string;
  characterStateTable: string;
  plotProgressTable: string;
}> {
  const manager = getMemoryManager();

  // 获取近期记忆
  const recentMemories = await manager.getRecentMemories(shortTermChapterCount, currentChapterIndex);

  // 构建近期章节原文（从章节数据中获取，这里用内存中的数据）
  // 注意：实际使用时应该从 projectStore 获取完整的章节内容
  const shortTermFullText = recentMemories
    .map(m => `【第${m.chapterIndex + 1}章 · ${m.chapterTitle}】\n\n${m.corePlot}`)
    .join('\n\n==========\n\n');

  // 构建角色状态表和情节进度表
  const allMemories = manager.getAllMemories();
  const characterStateTable = buildCharacterStateTable(allMemories);
  const plotProgressTable = buildPlotProgressTable(allMemories);

  return {
    shortTermFullText,
    characterStateTable,
    plotProgressTable,
  };
}
