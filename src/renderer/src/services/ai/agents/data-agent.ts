/**
 * Data Agent - 数据管理 Agent
 * Moliu v2.0 - 负责管理数据存储和检索
 * 
 * 职责：
 * 1. 管理项目数据文件
 * 2. 提供数据检索接口
 * 3. 数据版本控制
 * 4. 数据备份和恢复
 */

import { useMemorySystem } from "@/composables/new/useMemorySystem";
import type { ProjectState, EntityIndex, ChapterSummary } from "@/types/memory";

// ============================================================
// Types
// ============================================================

export interface DataQuery {
  projectId: string;
  type: "project" | "chapter" | "character" | "foreshadow" | "all";
  filters?: {
    chapterRange?: [number, number];
    entityIds?: string[];
    status?: string;
  };
}

export interface DataResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface BackupInfo {
  projectId: string;
  createdAt: string;
  size: number;
  chapterCount: number;
}

// ============================================================
// Agent
// ============================================================

export class DataAgent {
  private memorySystem: ReturnType<typeof useMemorySystem>;

  constructor() {
    this.memorySystem = useMemorySystem();
  }

  /**
   * 保存项目状态
   */
  async saveProjectState(state: ProjectState): Promise<DataResult> {
    try {
      await this.memorySystem.saveProjectState(state);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "保存失败",
      };
    }
  }

  /**
   * 加载项目状态
   */
  async loadProjectState(projectId: string): Promise<DataResult> {
    try {
      const state = await this.memorySystem.getProjectState(projectId);
      return {
        success: true,
        data: state,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "加载失败",
      };
    }
  }

  /**
   * 保存章节摘要
   */
  async saveChapterSummary(
    projectId: string,
    chapterNumber: number,
    summary: string,
    keyEvents?: string[]
  ): Promise<DataResult> {
    try {
      const chapterSummary: ChapterSummary = {
        chapterNumber,
        summary,
        keyEvents: keyEvents || [],
        coolPoints: [],
        foreshadowUpdates: [],
        createdAt: new Date().toISOString(),
        wordCount: summary.length,
      };

      await this.memorySystem.saveChapterSummary(projectId, chapterSummary);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "保存失败",
      };
    }
  }

  /**
   * 获取章节摘要
   */
  async getChapterSummaries(
    projectId: string,
    fromChapter: number,
    toChapter: number
  ): Promise<ChapterSummary[]> {
    return this.memorySystem.getChapterSummaries(projectId, fromChapter, toChapter);
  }

  /**
   * 更新实体状态
   */
  async updateEntityState(
    projectId: string,
    entityType: "character" | "foreshadow" | "location" | "event",
    entity: any
  ): Promise<DataResult> {
    try {
      await this.memorySystem.updateEntityState(projectId, entityType, entity);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "更新失败",
      };
    }
  }

  /**
   * 获取实体状态
   */
  async getEntityStates(
    projectId: string,
    entityType: "character" | "foreshadow" | "location" | "event",
    entityIds?: string[]
  ): Promise<any[]> {
    return this.memorySystem.getEntityStates(projectId, entityType, entityIds);
  }

  /**
   * 添加记忆
   */
  async addMemory(
    projectId: string,
    memoryType: "event" | "decision" | "note" | "scratchpad",
    content: string,
    metadata?: Record<string, any>
  ): Promise<DataResult> {
    try {
      await this.memorySystem.addMemory(projectId, memoryType, content, metadata);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "添加失败",
      };
    }
  }

  /**
   * 查询记忆
   */
  async queryMemories(
    projectId: string,
    memoryType?: "event" | "decision" | "note" | "scratchpad",
    limit?: number
  ): Promise<any[]> {
    return this.memorySystem.queryMemories(projectId, memoryType, limit);
  }

  /**
   * 搜索记忆
   */
  async searchMemories(
    projectId: string,
    query: string,
    limit?: number
  ): Promise<any[]> {
    return this.memorySystem.searchMemories(projectId, query, limit);
  }

  /**
   * 创建备份
   */
  async createBackup(projectId: string): Promise<DataResult> {
    try {
      const backupInfo = await this.memorySystem.createBackup(projectId);
      return {
        success: true,
        data: backupInfo,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "备份失败",
      };
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(projectId: string, backupId: string): Promise<DataResult> {
    try {
      await this.memorySystem.restoreBackup(projectId, backupId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "恢复失败",
      };
    }
  }

  /**
   * 获取备份列表
   */
  async listBackups(projectId: string): Promise<BackupInfo[]> {
    return this.memorySystem.listBackups(projectId);
  }

  /**
   * 删除项目数据
   */
  async deleteProject(projectId: string): Promise<DataResult> {
    try {
      await this.memorySystem.deleteProject(projectId);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "删除失败",
      };
    }
  }

  /**
   * 导出项目数据
   */
  async exportProject(projectId: string): Promise<DataResult> {
    try {
      const state = await this.memorySystem.getProjectState(projectId);
      const summaries = await this.memorySystem.getChapterSummaries(
        projectId,
        1,
        9999
      );

      return {
        success: true,
        data: {
          projectState: state,
          chapterSummaries: summaries,
          exportedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "导出失败",
      };
    }
  }

  /**
   * 导入项目数据
   */
  async importProject(data: {
    projectState: ProjectState;
    chapterSummaries?: ChapterSummary[];
  }): Promise<DataResult> {
    try {
      await this.memorySystem.saveProjectState(data.projectState);

      if (data.chapterSummaries) {
        for (const summary of data.chapterSummaries) {
          await this.memorySystem.saveChapterSummary(
            data.projectState.meta.id,
            summary
          );
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "导入失败",
      };
    }
  }
}

// ============================================================
// Export singleton
// ============================================================

let dataAgentInstance: DataAgent | null = null;

export function getDataAgent(): DataAgent {
  if (!dataAgentInstance) {
    dataAgentInstance = new DataAgent();
  }
  return dataAgentInstance;
}
