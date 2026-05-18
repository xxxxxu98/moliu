/**
 * Context Agent - 上下文管理 Agent
 * Moliu v2.0 - 负责管理写作上下文，为其他 Agent 提供上下文信息
 * 
 * 职责：
 * 1. 收集和整合项目状态
 * 2. 检索相关记忆和上下文
 * 3. 构建上下文摘要
 * 4. 管理上下文窗口
 */

import { useMemorySystem } from "@/composables/new/useMemorySystem";
import { useContextManager } from "@/composables/new/useContextManager";
import type { WritingContext, ContextPhase } from "@/composables/new/useContextManager";

// ============================================================
// Types
// ============================================================

export interface ContextQuery {
  /** 项目 ID */
  projectId: string;
  /** 当前章节号 */
  currentChapter?: number;
  /** 上下文阶段 */
  phase?: ContextPhase;
  /** 需要包含的角色 */
  characters?: string[];
  /** 需要包含的伏笔 */
  foreshadows?: string[];
  /** 上下文长度限制 */
  maxLength?: number;
}

export interface ContextResult {
  /** 上下文内容 */
  context: WritingContext;
  /** 相关记忆列表 */
  memories: {
    id: string;
    content: string;
    relevance: number;
  }[];
  /** 摘要信息 */
  summary: {
    characters: string;
    plot: string;
    foreshadows: string;
  };
}

// ============================================================
// Agent
// ============================================================

export class ContextAgent {
  private memorySystem: ReturnType<typeof useMemorySystem>;
  private contextManager: ReturnType<typeof useContextManager>;

  constructor() {
    this.memorySystem = useMemorySystem();
    this.contextManager = useContextManager();
  }

  /**
   * 获取上下文
   */
  async getContext(query: ContextQuery): Promise<ContextResult> {
    // 1. 获取项目状态
    const projectState = await this.memorySystem.getProjectState(query.projectId);

    if (!projectState) {
      return {
        context: {
          phase: query.phase || "outline",
          masterContract: null,
          chapterContract: null,
          characterSummaries: [],
          foreshadowSummary: {
            activeForeshadows: [],
            upcomingReveals: [],
            overdueForeshadows: [],
          },
          recentEvents: [],
          pendingTasks: [],
        },
        memories: [],
        summary: {
          characters: "",
          plot: "",
          foreshadows: "",
        },
      };
    }

    // 2. 检索相关记忆
    const relevantMemories = await this.retrieveRelevantMemories(
      query.projectId,
      query
    );

    // 3. 构建上下文
    const context = await this.contextManager.getContextForPhase(
      query.phase || "writing",
      {
        projectId: query.projectId,
        chapterNumber: query.currentChapter,
        characters: query.characters,
        foreshadows: query.foreshadows,
      }
    );

    // 4. 生成摘要
    const summary = this.generateSummary(projectState, relevantMemories);

    return {
      context,
      memories: relevantMemories,
      summary,
    };
  }

  /**
   * 检索相关记忆
   */
  private async retrieveRelevantMemories(
    projectId: string,
    query: ContextQuery
  ): Promise<ContextResult["memories"]> {
    const memories: ContextResult["memories"] = [];

    // 获取章节摘要
    if (query.currentChapter && query.currentChapter > 1) {
      const summaries = await this.memorySystem.getChapterSummaries(
        projectId,
        Math.max(1, query.currentChapter - 3),
        query.currentChapter - 1
      );

      for (const summary of summaries) {
        memories.push({
          id: summary.chapterNumber.toString(),
          content: summary.summary,
          relevance: summary.chapterNumber === query.currentChapter - 1 ? 1 : 0.7,
        });
      }
    }

    // 获取角色状态
    if (query.characters && query.characters.length > 0) {
      const characterStates = await this.memorySystem.getEntityStates(
        projectId,
        "character",
        query.characters
      );

      for (const state of characterStates) {
        memories.push({
          id: state.id,
          content: `${state.name}: ${state.currentState}`,
          relevance: 0.8,
        });
      }
    }

    // 获取伏笔状态
    if (query.foreshadows && query.foreshadows.length > 0) {
      const foreshadowStates = await this.memorySystem.getEntityStates(
        projectId,
        "foreshadow",
        query.foreshadows
      );

      for (const state of foreshadowStates) {
        memories.push({
          id: state.id,
          content: `伏笔 "${state.id}": ${state.currentState}`,
          relevance: 0.9,
        });
      }
    }

    // 按相关性排序
    return memories.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    projectState: any,
    memories: ContextResult["memories"]
  ): ContextResult["summary"] {
    // 角色摘要
    const charactersSummary = projectState.characters
      ?.map((c: any) => `${c.name}(${c.status})`)
      .join(", ") || "暂无角色信息";

    // 剧情摘要
    const plotSummary = memories
      .filter(m => m.relevance >= 0.7)
      .map(m => m.content)
      .slice(0, 3)
      .join(" | ") || "暂无剧情进展";

    // 伏笔摘要
    const foreshadowSummary = projectState.foreshadows
      ?.filter((f: any) => f.status === "active")
      .map((f: any) => f.description)
      .join(", ") || "暂无活跃伏笔";

    return {
      characters: charactersSummary,
      plot: plotSummary,
      foreshadows: foreshadowSummary,
    };
  }

  /**
   * 更新上下文
   */
  async updateContext(
    projectId: string,
    updates: {
      characters?: any[];
      foreshadows?: any[];
      events?: string[];
    }
  ): Promise<void> {
    // 更新记忆系统
    if (updates.characters) {
      for (const char of updates.characters) {
        await this.memorySystem.updateEntityState(projectId, "character", char);
      }
    }

    if (updates.foreshadows) {
      for (const fs of updates.foreshadows) {
        await this.memorySystem.updateEntityState(projectId, "foreshadow", fs);
      }
    }

    if (updates.events) {
      for (const event of updates.events) {
        await this.memorySystem.addMemory(projectId, "event", event);
      }
    }
  }

  /**
   * 获取上下文令牌数（估算）
   */
  async estimateContextTokens(
    query: ContextQuery
  ): Promise<{ tokens: number; withinLimit: boolean }> {
    const context = await this.getContext(query);
    const text = JSON.stringify(context);

    // 粗略估算：中文约 2 字符/token，英文约 4 字符/token
    const estimatedTokens = Math.ceil(text.length / 2);

    return {
      tokens: estimatedTokens,
      withinLimit: estimatedTokens < 8000,
    };
  }
}

// ============================================================
// Export singleton
// ============================================================

let contextAgentInstance: ContextAgent | null = null;

export function getContextAgent(): ContextAgent {
  if (!contextAgentInstance) {
    contextAgentInstance = new ContextAgent();
  }
  return contextAgentInstance;
}
