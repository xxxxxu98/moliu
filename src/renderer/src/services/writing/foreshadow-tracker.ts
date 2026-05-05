/**
 * 伏笔追踪系统
 * 参考 webnovel-writer 的设计
 * - 伏笔状态管理：记录伏笔的创建、揭示、回收状态
 * - 回收提醒：在适当的时机提醒作者伏笔需要回收
 * - 伏笔密度分析：帮助作者合理安排伏笔布局
 */

import { getMemoryManager } from './memory-manager';
import type { ChapterMemory } from '@/types/project';

// ============================================
// 伏笔状态定义
// ============================================

/**
 * 伏笔状态
 */
export enum ForeshadowStatus {
  /** 埋设中 - 伏笔刚被引入，尚未成熟 */
  BURIED = 'buried',
  /** 生长中 - 伏笔开始被提及，但尚未完全展开 */
  GROWING = 'growing',
  /** 待揭示 - 伏笔成熟，可以揭示或回收 */
  READY = 'ready',
  /** 已揭示 - 伏笔真相被揭露 */
  REVEALED = 'revealed',
  /** 已回收 - 伏笔的作用完全发挥 */
  HARVESTED = 'harvested',
  /** 已失效 - 伏笔因剧情发展而失效 */
  INVALID = 'invalid',
}

/**
 * 伏笔类型
 */
export enum ForeshadowType {
  /** 人物伏笔 - 角色身份、性格、命运的暗示 */
  CHARACTER = 'character',
  /** 物品伏笔 - 关键物品的来源或用途 */
  ITEM = 'item',
  /** 事件伏笔 - 未来事件的暗示 */
  EVENT = 'event',
  /** 关系伏笔 - 角色关系的暗示 */
  RELATION = 'relation',
  /** 世界观伏笔 - 世界观设定的暗示 */
  WORLD = 'world',
  /** 对话伏笔 - 通过对话埋设的伏笔 */
  DIALOGUE = 'dialogue',
}

/**
 * 伏笔条目
 */
export interface ForeshadowEntry {
  /** 唯一标识 */
  id: string;
  /** 伏笔内容 */
  content: string;
  /** 伏笔类型 */
  type: ForeshadowType;
  /** 当前状态 */
  status: ForeshadowStatus;
  /** 创建章节 */
  createdAtChapter: number;
  /** 创建章节ID */
  createdAtChapterId: string;
  /** 期望回收章节（相对创建章节的增量） */
  expectedChaptersToReveal: number;
  /** 实际回收章节 */
  revealedAtChapter?: number;
  /** 回收章节ID */
  revealedAtChapterId?: string;
  /** 伏笔来源（创建时的描述） */
  source: string;
  /** 关联的揭示伏笔（如果这条是线索） */
  relatedForeshadows: string[];
  /** 标签 */
  tags: string[];
  /** 备注 */
  notes?: string;
}

/**
 * 伏笔统计
 */
export interface ForeshadowStats {
  totalCount: number;
  byStatus: Record<ForeshadowStatus, number>;
  byType: Record<ForeshadowType, number>;
  overdueCount: number;
  averageChaptersToReveal: number;
  harvestRate: number; // 回收率
}

/**
 * 伏笔回收建议
 */
export interface ForeshadowHarvestSuggestion {
  foreshadow: ForeshadowEntry;
  urgency: 'high' | 'medium' | 'low';
  reason: string;
  suggestedChapters: number[];
  relatedPlotPoints: string[];
}

// ============================================
// 伏笔追踪器
// ============================================

/**
 * 伏笔追踪器
 * 管理伏笔的创建、更新和回收
 */
export class ForeshadowTracker {
  private foreshadows = new Map<string, ForeshadowEntry>();
  private currentChapterIndex = 0;

  /**
   * 从章节记忆中提取伏笔
   */
  async extractFromMemories(memories: ChapterMemory[]): Promise<void> {
    for (const memory of memories) {
      for (const foreshadow of memory.newForeshadows) {
        // 检查是否已存在
        const existing = this.findByContent(foreshadow);
        if (!existing) {
          this.createForeshadow({
            content: foreshadow,
            type: this.inferForeshadowType(foreshadow),
            createdAtChapter: memory.chapterIndex,
            createdAtChapterId: memory.chapterId,
            source: `第${memory.chapterIndex + 1}章`,
          });
        }
      }
    }
  }

  /**
   * 创建伏笔
   */
  createForeshadow(params: {
    content: string;
    type: ForeshadowType;
    createdAtChapter: number;
    createdAtChapterId: string;
    source: string;
    expectedChaptersToReveal?: number;
    tags?: string[];
    notes?: string;
  }): ForeshadowEntry {
    const id = `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    const foreshadow: ForeshadowEntry = {
      id,
      content: params.content,
      type: params.type,
      status: ForeshadowStatus.BURIED,
      createdAtChapter: params.createdAtChapter,
      createdAtChapterId: params.createdAtChapterId,
      expectedChaptersToReveal: params.expectedChaptersToReveal || 10, // 默认10章后回收
      source: params.source,
      relatedForeshadows: [],
      tags: params.tags || [],
      notes: params.notes,
    };

    this.foreshadows.set(id, foreshadow);
    return foreshadow;
  }

  /**
   * 更新伏笔状态
   */
  updateForeshadowStatus(
    id: string,
    status: ForeshadowStatus,
    options?: {
      revealedAtChapter?: number;
      revealedAtChapterId?: string;
      notes?: string;
    }
  ): ForeshadowEntry | null {
    const foreshadow = this.foreshadows.get(id);
    if (!foreshadow) return null;

    foreshadow.status = status;
    
    if (status === ForeshadowStatus.REVEALED || status === ForeshadowStatus.HARVESTED) {
      foreshadow.revealedAtChapter = options?.revealedAtChapter;
      foreshadow.revealedAtChapterId = options?.revealedAtChapterId;
    }

    if (options?.notes) {
      foreshadow.notes = options.notes;
    }

    return foreshadow;
  }

  /**
   * 获取伏笔列表
   */
  getAllForeshadows(): ForeshadowEntry[] {
    return Array.from(this.foreshadows.values());
  }

  /**
   * 获取活跃伏笔（未完全回收的）
   */
  getActiveForeshadows(): ForeshadowEntry[] {
    return this.getAllForeshadows().filter(
      f => f.status !== ForeshadowStatus.HARVESTED && f.status !== ForeshadowStatus.INVALID
    );
  }

  /**
   * 按状态获取伏笔
   */
  getForeshadowsByStatus(status: ForeshadowStatus): ForeshadowEntry[] {
    return this.getAllForeshadows().filter(f => f.status === status);
  }

  /**
   * 按类型获取伏笔
   */
  getForeshadowsByType(type: ForeshadowType): ForeshadowEntry[] {
    return this.getAllForeshadows().filter(f => f.type === type);
  }

  /**
   * 检查是否有过期伏笔（需要回收但未回收的）
   */
  getOverdueForeshadows(currentChapterIndex: number): ForeshadowEntry[] {
    return this.getActiveForeshadows().filter(f => {
      const chaptersSinceCreation = currentChapterIndex - f.createdAtChapter;
      return chaptersSinceCreation > f.expectedChaptersToReveal && 
             f.status !== ForeshadowStatus.REVEALED &&
             f.status !== ForeshadowStatus.HARVESTED;
    });
  }

  /**
   * 获取即将到期的伏笔
   */
  getUpcomingForeshadows(currentChapterIndex: number, withinChapters: number = 3): ForeshadowEntry[] {
    return this.getActiveForeshadows().filter(f => {
      const chaptersSinceCreation = currentChapterIndex - f.createdAtChapter;
      const remainingChapters = f.expectedChaptersToReveal - chaptersSinceCreation;
      return remainingChapters >= 0 && remainingChapters <= withinChapters;
    });
  }

  /**
   * 获取伏笔统计
   */
  getStats(currentChapterIndex: number): ForeshadowStats {
    const all = this.getAllForeshadows();
    
    const byStatus: Record<ForeshadowStatus, number> = {
      [ForeshadowStatus.BURIED]: 0,
      [ForeshadowStatus.GROWING]: 0,
      [ForeshadowStatus.READY]: 0,
      [ForeshadowStatus.REVEALED]: 0,
      [ForeshadowStatus.HARVESTED]: 0,
      [ForeshadowStatus.INVALID]: 0,
    };

    const byType: Record<ForeshadowType, number> = {
      [ForeshadowType.CHARACTER]: 0,
      [ForeshadowType.ITEM]: 0,
      [ForeshadowType.EVENT]: 0,
      [ForeshadowType.RELATION]: 0,
      [ForeshadowType.WORLD]: 0,
      [ForeshadowType.DIALOGUE]: 0,
    };

    let totalChaptersToReveal = 0;
    let revealedCount = 0;

    for (const f of all) {
      byStatus[f.status]++;
      byType[f.type]++;
      totalChaptersToReveal += f.expectedChaptersToReveal;
      if (f.status === ForeshadowStatus.REVEALED || f.status === ForeshadowStatus.HARVESTED) {
        revealedCount++;
      }
    }

    return {
      totalCount: all.length,
      byStatus,
      byType,
      overdueCount: this.getOverdueForeshadows(currentChapterIndex).length,
      averageChaptersToReveal: all.length > 0 ? totalChaptersToReveal / all.length : 0,
      harvestRate: all.length > 0 ? revealedCount / all.length : 0,
    };
  }

  /**
   * 获取伏笔回收建议
   */
  getHarvestSuggestions(currentChapterIndex: number): ForeshadowHarvestSuggestion[] {
    const suggestions: ForeshadowHarvestSuggestion[] = [];

    // 过期伏笔 - 高优先级
    for (const f of this.getOverdueForeshadows(currentChapterIndex)) {
      suggestions.push({
        foreshadow: f,
        urgency: 'high',
        reason: `伏笔已埋设 ${currentChapterIndex - f.createdAtChapter} 章，超过预期 ${f.expectedChaptersToReveal} 章`,
        suggestedChapters: [currentChapterIndex],
        relatedPlotPoints: [f.source],
      });
    }

    // 即将到期伏笔 - 中优先级
    for (const f of this.getUpcomingForeshadows(currentChapterIndex, 3)) {
      const remaining = f.expectedChaptersToReveal - (currentChapterIndex - f.createdAtChapter);
      suggestions.push({
        foreshadow: f,
        urgency: remaining <= 1 ? 'high' : 'medium',
        reason: `伏笔还剩 ${remaining} 章需要回收`,
        suggestedChapters: [currentChapterIndex, currentChapterIndex + 1],
        relatedPlotPoints: [f.source],
      });
    }

    // 状态为 READY 的伏笔
    for (const f of this.getForeshadowsByStatus(ForeshadowStatus.READY)) {
      suggestions.push({
        foreshadow: f,
        urgency: 'medium',
        reason: '伏笔已成熟，可以揭示',
        suggestedChapters: [currentChapterIndex, currentChapterIndex + 1, currentChapterIndex + 2],
        relatedPlotPoints: [f.source],
      });
    }

    return suggestions;
  }

  /**
   * 生成伏笔追踪报告
   */
  generateReport(currentChapterIndex: number): string {
    const stats = this.getStats(currentChapterIndex);
    const suggestions = this.getHarvestSuggestions(currentChapterIndex);
    const overdue = this.getOverdueForeshadows(currentChapterIndex);
    const active = this.getActiveForeshadows();

    const sections: string[] = [
      '# 伏笔追踪报告',
      '',
      `生成时间：第 ${currentChapterIndex + 1} 章`,
      '',
      '## 统计概览',
      `- 总伏笔数：${stats.totalCount}`,
      `- 活跃伏笔：${active.length}`,
      `- 已回收：${stats.byStatus[ForeshadowStatus.HARVESTED]}`,
      `- 已揭示：${stats.byStatus[ForeshadowStatus.REVEALED]}`,
      `- 回收率：${(stats.harvestRate * 100).toFixed(1)}%`,
      `- 平均回收周期：${stats.averageChaptersToReveal.toFixed(1)} 章`,
      '',
    ];

    // 过期警告
    if (overdue.length > 0) {
      sections.push('## ⚠️ 过期伏笔警告', '');
      for (const f of overdue) {
        sections.push(`- **[${this.getTypeName(f.type)}]** ${f.content}`);
        sections.push(`  - 创建于：第 ${f.createdAtChapter + 1} 章`);
        sections.push(`  - 预期回收：${f.expectedChaptersToReveal} 章内`);
        sections.push('');
      }
    }

    // 活跃伏笔列表
    if (active.length > 0) {
      sections.push('## 活跃伏笔列表', '');
      sections.push('| 状态 | 类型 | 内容 | 创建章节 | 剩余章数 |');
      sections.push('|------|------|------|----------|----------|');
      
      for (const f of active) {
        const remaining = f.expectedChaptersToReveal - (currentChapterIndex - f.createdAtChapter);
        const remainingStr = remaining > 0 ? `${remaining} 章` : '⚠️ 已过期';
        sections.push(`| ${this.getStatusName(f.status)} | ${this.getTypeName(f.type)} | ${f.content.slice(0, 30)}... | 第${f.createdAtChapter + 1}章 | ${remainingStr} |`);
      }
      sections.push('');
    }

    // 回收建议
    if (suggestions.length > 0) {
      sections.push('## 回收建议', '');
      for (const s of suggestions) {
        sections.push(`### ${s.urgency === 'high' ? '🔴' : s.urgency === 'medium' ? '🟡' : '🟢'} ${s.foreshadow.content.slice(0, 50)}...`);
        sections.push(`- 紧急程度：${s.urgency}`);
        sections.push(`- 原因：${s.reason}`);
        sections.push(`- 建议章节：第 ${s.suggestedChapters.map(c => c + 1).join('、')} 章`);
        sections.push('');
      }
    }

    return sections.join('\n');
  }

  /**
   * 推断伏笔类型
   */
  private inferForeshadowType(content: string): ForeshadowType {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('身份') || lowerContent.includes('真实身份') || 
        lowerContent.includes('秘密') || lowerContent.includes('血缘')) {
      return ForeshadowType.CHARACTER;
    }
    if (lowerContent.includes('宝物') || lowerContent.includes('武器') || 
        lowerContent.includes('道具') || lowerContent.includes('玉佩')) {
      return ForeshadowType.ITEM;
    }
    if (lowerContent.includes('关系') || lowerContent.includes('青梅竹马') || 
        lowerContent.includes('恩怨')) {
      return ForeshadowType.RELATION;
    }
    if (lowerContent.includes('世界观') || lowerContent.includes('规则') || 
        lowerContent.includes('设定')) {
      return ForeshadowType.WORLD;
    }
    
    return ForeshadowType.EVENT;
  }

  /**
   * 根据内容查找伏笔
   */
  private findByContent(content: string): ForeshadowEntry | undefined {
    const normalizedContent = content.toLowerCase().trim();
    return this.getAllForeshadows().find(
      f => f.content.toLowerCase().trim() === normalizedContent
    );
  }

  /**
   * 获取状态名称
   */
  private getStatusName(status: ForeshadowStatus): string {
    const names: Record<ForeshadowStatus, string> = {
      [ForeshadowStatus.BURIED]: '埋设中',
      [ForeshadowStatus.GROWING]: '生长中',
      [ForeshadowStatus.READY]: '待揭示',
      [ForeshadowStatus.REVEALED]: '已揭示',
      [ForeshadowStatus.HARVESTED]: '已回收',
      [ForeshadowStatus.INVALID]: '已失效',
    };
    return names[status];
  }

  /**
   * 获取类型名称
   */
  private getTypeName(type: ForeshadowType): string {
    const names: Record<ForeshadowType, string> = {
      [ForeshadowType.CHARACTER]: '人物',
      [ForeshadowType.ITEM]: '物品',
      [ForeshadowType.EVENT]: '事件',
      [ForeshadowType.RELATION]: '关系',
      [ForeshadowType.WORLD]: '世界观',
      [ForeshadowType.DIALOGUE]: '对话',
    };
    return names[type];
  }

  /**
   * 导出伏笔数据
   */
  exportData(): ForeshadowEntry[] {
    return this.getAllForeshadows();
  }

  /**
   * 导入伏笔数据
   */
  importData(data: ForeshadowEntry[]): void {
    for (const entry of data) {
      this.foreshadows.set(entry.id, entry);
    }
  }

  /**
   * 清除所有伏笔
   */
  clear(): void {
    this.foreshadows.clear();
  }
}

// ============================================
// 单例导出
// ============================================

let tracker: ForeshadowTracker | null = null;

/**
 * 获取伏笔追踪器单例
 */
export function getForeshadowTracker(): ForeshadowTracker {
  if (!tracker) {
    tracker = new ForeshadowTracker();
  }
  return tracker;
}

/**
 * 初始化伏笔追踪器
 */
export async function initializeForeshadowTracker(): Promise<ForeshadowTracker> {
  const trackerInstance = getForeshadowTracker();
  const memoryManager = getMemoryManager();
  
  // 从记忆管理器加载伏笔
  const memories = memoryManager.getAllMemories();
  await trackerInstance.extractFromMemories(memories);
  
  return trackerInstance;
}
