/**
 * Orchestrator Agent - 编排 Agent
 * Moliu v2.0 - 负责协调其他 Agent 完成复杂任务
 * 
 * 职责：
 * 1. 任务规划和分配
 * 2. Agent 协调
 * 3. 流程控制
 * 4. 错误处理和重试
 */

import { ContextAgent, getContextAgent } from "./context-agent";
import { DataAgent, getDataAgent } from "./data-agent";
import { ReviewerAgent, getReviewerAgent } from "./reviewer-agent";

// ============================================================
// Types
// ============================================================

export interface OrchestratorConfig {
  maxRetries?: number;
  timeout?: number;
  enableReview?: boolean;
}

export interface WriteTask {
  projectId: string;
  chapterNumber: number;
  prompt?: string;
  contract?: any;
}

export interface OrchestratorResult {
  success: boolean;
  content?: string;
  title?: string;
  issues?: any[];
  retryCount?: number;
  error?: string;
}

// ============================================================
// Agent
// ============================================================

export class OrchestratorAgent {
  private contextAgent: ContextAgent;
  private dataAgent: DataAgent;
  private reviewerAgent: ReviewerAgent;
  private config: OrchestratorConfig;

  constructor(config?: OrchestratorConfig) {
    this.contextAgent = getContextAgent();
    this.dataAgent = getDataAgent();
    this.reviewerAgent = getReviewerAgent();
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      timeout: config?.timeout ?? 30000,
      enableReview: config?.enableReview ?? true,
    };
  }

  /**
   * 执行章节写作任务
   */
  async executeWriteTask(task: WriteTask): Promise<OrchestratorResult> {
    let retryCount = 0;
    let lastError: string | undefined;

    while (retryCount < (this.config.maxRetries || 3)) {
      try {
        // 1. 获取上下文
        const context = await this.contextAgent.getContext({
          projectId: task.projectId,
          currentChapter: task.chapterNumber,
          phase: "writing",
        });

        // 2. 准备生成 prompt
        const prompt = this.preparePrompt(task, context);

        // 3. 生成内容（这里应该调用 AI 服务）
        const content = await this.generateContent(prompt);

        // 4. 审查内容
        if (this.config.enableReview) {
          const review = await this.reviewerAgent.review({
            content,
            projectId: task.projectId,
            chapterNumber: task.chapterNumber,
            type: "full",
          });

          if (!review.passed && retryCount < (this.config.maxRetries || 3) - 1) {
            retryCount++;
            lastError = "内容未通过审查";
            continue;
          }

          // 5. 保存章节
          await this.saveChapter(task, content, review);

          return {
            success: true,
            content,
            title: this.extractTitle(content),
            issues: review.issues,
            retryCount,
          };
        }

        // 无审查模式
        await this.saveChapter(task, content, null);

        return {
          success: true,
          content,
          title: this.extractTitle(content),
          retryCount,
        };
      } catch (error) {
        retryCount++;
        lastError = error instanceof Error ? error.message : "未知错误";
      }
    }

    return {
      success: false,
      error: lastError,
      retryCount,
    };
  }

  /**
   * 执行大纲生成任务
   */
  async executeOutlineTask(params: {
    projectId: string;
    genres: string[];
    emotionGoals: string[];
    coreSetting: any;
    coolPoints: string[];
  }): Promise<OrchestratorResult> {
    try {
      // 1. 构建生成 prompt
      const prompt = this.prepareOutlinePrompt(params);

      // 2. 生成大纲
      const content = await this.generateContent(prompt);

      // 3. 解析大纲
      const outline = this.parseOutline(content);

      // 4. 保存大纲
      await this.dataAgent.saveProjectState({
        meta: {
          id: params.projectId,
          name: outline.title || "未命名项目",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        characters: [],
        locations: [],
        foreshadows: [],
        chapters: outline.chapters || [],
      });

      return {
        success: true,
        content: JSON.stringify(outline, null, 2),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "大纲生成失败",
      };
    }
  }

  /**
   * 执行批量写作任务
   */
  async executeBatchWriteTask(
    tasks: WriteTask[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<OrchestratorResult[]> {
    const results: OrchestratorResult[] = [];
    const total = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
      const result = await this.executeWriteTask(tasks[i]);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    return results;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private preparePrompt(task: WriteTask, context: any): string {
    // 构建写作 prompt
    let prompt = `# 写作任务\n\n`;

    if (context.summary.characters) {
      prompt += `## 当前角色状态\n${context.summary.characters}\n\n`;
    }

    if (context.summary.plot) {
      prompt += `## 近期剧情\n${context.summary.plot}\n\n`;
    }

    if (context.summary.foreshadows) {
      prompt += `## 活跃伏笔\n${context.summary.foreshadows}\n\n`;
    }

    prompt += `## 章节要求\n`;
    prompt += `章节号：第${task.chapterNumber}章\n`;

    if (task.prompt) {
      prompt += `自定义要求：${task.prompt}\n`;
    }

    prompt += `\n请生成符合以上上下文的章节内容。`;

    return prompt;
  }

  private prepareOutlinePrompt(params: {
    genres: string[];
    emotionGoals: string[];
    coreSetting: any;
    coolPoints: string[];
  }): string {
    let prompt = `# 大纲生成任务\n\n`;

    prompt += `## 题材\n${params.genres.join("、")}\n\n`;
    prompt += `## 情绪目标\n${params.emotionGoals.join("、")}\n\n`;
    prompt += `## 核心设定\n`;
    prompt += `- 世界类型：${params.coreSetting.worldType}\n`;
    prompt += `- 力量体系：${params.coreSetting.powerSystem}\n`;
    prompt += `- 金手指：${params.coreSetting.goldenFinger}\n`;
    prompt += `- 主角定位：${params.coreSetting.protagonistType}\n\n`;
    prompt += `## 爽点规划\n${params.coolPoints.join("、")}\n\n`;
    prompt += `请生成一个完整的大纲，包括：\n`;
    prompt += `1. 故事标题\n`;
    prompt += `2. 简介（200字）\n`;
    prompt += `3. 章节大纲（至少10章）\n`;
    prompt += `4. 核心爽点安排\n`;

    return prompt;
  }

  private async generateContent(prompt: string): Promise<string> {
    // 这里应该调用 AI 服务
    // 暂时返回模拟内容
    return `
第1章

【内容已生成】

这是一个示例章节内容。在实际应用中，这里会调用 AI 服务生成真正的内容。

[此处省略1000字...]
    `.trim();
  }

  private async saveChapter(
    task: WriteTask,
    content: string,
    review: any
  ): Promise<void> {
    const title = this.extractTitle(content);
    const summary = this.generateChapterSummary(content);

    await this.dataAgent.saveChapterSummary(
      task.projectId,
      task.chapterNumber,
      summary
    );

    await this.dataAgent.addMemory(
      task.projectId,
      "event",
      `完成第${task.chapterNumber}章写作${review?.passed ? "(已审查)" : ""}`
    );
  }

  private extractTitle(content: string): string {
    // 尝试提取标题
    const match = content.match(/^第[一二三四五六七八九十百千万\d]+章[：:]\s*(.+)/m);
    if (match) return match[1];

    const chapterMatch = content.match(/Chapter\s*\d+[：:]\s*(.+)/im);
    if (chapterMatch) return chapterMatch[1];

    return `第${this.extractChapterNumber(content)}章`;
  }

  private extractChapterNumber(content: string): number {
    const match = content.match(/第([一二三四五六七八九十百千万\d]+)章/);
    if (match) {
      const chineseToNumber: Record<string, number> = {
        一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
        六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
      };
      return chineseToNumber[match[1]] || parseInt(match[1]) || 1;
    }
    return 1;
  }

  private generateChapterSummary(content: string): string {
    // 生成章节摘要
    const paragraphs = content.split(/\n\n/).filter(p => p.trim());
    if (paragraphs.length > 0) {
      return paragraphs[0].slice(0, 200);
    }
    return content.slice(0, 200);
  }

  private parseOutline(content: string): any {
    // 解析大纲内容
    try {
      return JSON.parse(content);
    } catch {
      // 如果不是 JSON，尝试简单解析
      return {
        title: "未命名项目",
        synopsis: content.slice(0, 500),
        chapters: [],
      };
    }
  }
}

// ============================================================
// Export
// ============================================================

let orchestratorAgentInstance: OrchestratorAgent | null = null;

export function getOrchestratorAgent(config?: OrchestratorConfig): OrchestratorAgent {
  if (!orchestratorAgentInstance) {
    orchestratorAgentInstance = new OrchestratorAgent(config);
  }
  return orchestratorAgentInstance;
}

export function createOrchestratorAgent(config?: OrchestratorConfig): OrchestratorAgent {
  return new OrchestratorAgent(config);
}
