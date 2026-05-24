/**
 * 章节提交管理器 v2 (Chapter Commit Manager v2)
 * 
 * 基于 webnovel-writer 架构的完整提交链
 * 
 * 职责：
 * 1. 从章节内容中提取事实
 * 2. 评估合同完成度
 * 3. 处理歧义
 * 4. 执行投影写入
 * 5. 判定 accepted/rejected
 */

import { useProjectStore } from '@/stores/project.store';
import { useEnhancedDataAgent, EnhancedDataAgent } from '@/services/ai/agents/enhanced-data-agent';
import { useProjectionOrchestrator, ProjectionOrchestrator } from './ProjectionWriters';
import type {
  ChapterCommit,
  ReviewerOutput,
  FulfillmentResult,
  DisambiguationResult,
  ExtractionResult,
  ProjectionStatus,
} from '@/types/writing-v2';

export interface CommitInput {
  chapterNumber: number;
  content: string;
  reviewResult: ReviewerOutput;
  contract?: {
    goal?: string;
    CBN?: string;
    CPNs?: string[];
    CEN?: string;
    mustCover?: string[];
    forbiddenZones?: string[];
  };
}

export interface CommitResult {
  success: boolean;
  commit?: ChapterCommit;
  error?: string;
}

class ChapterCommitManagerV2 {
  private projectStore = useProjectStore();
  private dataAgent: EnhancedDataAgent;
  private projectionOrchestrator: ProjectionOrchestrator;

  constructor() {
    this.dataAgent = useEnhancedDataAgent();
    this.projectionOrchestrator = useProjectionOrchestrator();
  }

  /**
   * 执行提交
   */
  async commit(input: CommitInput): Promise<CommitResult> {
    const { chapterNumber, content, reviewResult, contract } = input;

    console.log('[ChapterCommitManagerV2] 开始提交:', { chapterNumber, contentLength: content.length });

    try {
      // 1. 数据提取
      const extractionResult = await this.dataAgent.extract({
        chapterNumber,
        chapterContent: content,
        contract: contract ? {
          id: `chapter-${chapterNumber}`,
          chapterNumber,
          title: `第${chapterNumber}章`,
          directive: {
            goal: contract.goal || '',
            CBN: contract.CBN,
            CPNs: contract.CPNs,
            CEN: contract.CEN,
            mustCoverNodes: contract.mustCover,
            forbiddenZones: contract.forbiddenZones,
          },
        } : undefined,
      });

      if (!extractionResult.success || !extractionResult.extraction) {
        return {
          success: false,
          error: extractionResult.error || '数据提取失败',
        };
      }

      // 2. 评估完成度（从提取结果构建）
      const fulfillment = this.evaluateFulfillment(extractionResult.extraction, contract);

      // 3. 处理歧义
      const disambiguation = extractionResult.disambiguation || { pending: [], resolved: [] };

      // 4. 执行投影
      const projectionStatus = await this.projectionOrchestrator.runAll(chapterNumber, {
        extraction: extractionResult.extraction,
        disambiguation,
        metadata: {
          title: `第${chapterNumber}章`,
          wordCount: this.countWords(content),
          status: 'committed',
          coolPoints: 0,
          foreshadows: 0,
        },
      });

      // 5. 判定状态
      const status = this.determineStatus(reviewResult, fulfillment, disambiguation);

      // 6. 生成原因列表
      const reasons = this.generateReasons(fulfillment, disambiguation);

      // 7. 构建提交对象
      const commit: ChapterCommit = {
        id: `commit_${Date.now()}`,
        chapter: chapterNumber,
        status,
        timestamp: new Date().toISOString(),
        reviewResult,
        fulfillmentResult: fulfillment,
        disambiguationResult: disambiguation,
        extractionResult: extractionResult.extraction,
        reasons,
        projectionStatus,
      };

      // 8. 更新章节状态
      if (status === 'accepted') {
        await this.updateChapterStatus(chapterNumber, 'committed');
      }

      console.log('[ChapterCommitManagerV2] 提交完成:', {
        chapterNumber,
        status,
        reasons,
        projectionStatus,
      });

      return {
        success: true,
        commit,
      };
    } catch (error) {
      console.error('[ChapterCommitManagerV2] 提交失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '提交失败',
      };
    }
  }

  /**
   * 评估完成度
   */
  private evaluateFulfillment(
    extraction: ExtractionResult,
    contract?: CommitInput['contract']
  ): FulfillmentResult {
    if (!contract) {
      return {
        plannedNodes: [],
        coveredNodes: [],
        missedNodes: [],
        extraNodes: [],
      };
    }

    const plannedNodes: string[] = [];
    const coveredNodes: string[] = [];
    const missedNodes: string[] = [];

    // 收集计划节点
    if (contract.goal) plannedNodes.push(contract.goal);
    if (contract.CBN) plannedNodes.push(contract.CBN);
    if (contract.CPNs) plannedNodes.push(...contract.CPNs);
    if (contract.CEN) plannedNodes.push(contract.CEN);
    if (contract.mustCover) plannedNodes.push(...contract.mustCover);

    // 检查覆盖
    const content = extraction.summaryText;
    for (const node of plannedNodes) {
      if (this.checkNodeCovered(content, node)) {
        coveredNodes.push(node);
      } else {
        missedNodes.push(node);
      }
    }

    // 提取额外节点
    const extraNodes = this.extractExtraNodes(content, plannedNodes);

    return {
      plannedNodes,
      coveredNodes,
      missedNodes,
      extraNodes,
    };
  }

  /**
   * 检查节点是否被覆盖
   */
  private checkNodeCovered(content: string, node: string): boolean {
    const keywords = node
      .match(/[\u4e00-\u9fa5]{2,}/g)
      ?.filter((w) => w.length >= 2) || [];

    if (keywords.length === 0) return true;

    const matchedCount = keywords.filter((k) => content.includes(k)).length;
    return matchedCount >= keywords.length * 0.5;
  }

  /**
   * 提取额外节点
   */
  private extractExtraNodes(content: string, plannedNodes: string[]): string[] {
    const extraNodes: string[] = [];
    const patterns = [
      /(?:突破|晋升|升级|获得|失去|死亡|受伤)/,
      /(?:原来|真相|揭秘|反转)/,
      /(?:关系|结交|结仇|绝交)/,
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        const match = content.match(pattern);
        if (match && !plannedNodes.some((n) => n.includes(match[0]))) {
          extraNodes.push(match[0]);
        }
      }
    }

    return [...new Set(extraNodes)];
  }

  /**
   * 判定提交状态
   */
  private determineStatus(
    reviewResult: ReviewerOutput,
    fulfillment: FulfillmentResult,
    disambiguation: DisambiguationResult
  ): 'accepted' | 'rejected' {
    // 1. 审查有 blocking 问题 → rejected
    if (reviewResult.blocking) {
      return 'rejected';
    }

    // 2. 遗漏节点过多（>50%）→ rejected
    if (fulfillment.plannedNodes.length > 0) {
      const missRatio = fulfillment.missedNodes.length / fulfillment.plannedNodes.length;
      if (missRatio > 0.5) {
        return 'rejected';
      }
    }

    // 3. 有待处理的严重歧义 → rejected
    const criticalPending = disambiguation.pending.filter(
      (p) => p.question.includes('主角')
    );
    if (criticalPending.length > 0) {
      return 'rejected';
    }

    return 'accepted';
  }

  /**
   * 生成原因列表
   */
  private generateReasons(
    fulfillment: FulfillmentResult,
    disambiguation: DisambiguationResult
  ): string[] {
    const reasons: string[] = [];

    // 完成度原因
    if (fulfillment.missedNodes.length === 0) {
      reasons.push('所有计划节点均已覆盖');
    } else {
      const missed = fulfillment.missedNodes.slice(0, 2);
      reasons.push(`遗漏节点: ${missed.join(', ')}`);
    }

    // 额外节点
    if (fulfillment.extraNodes.length > 0) {
      reasons.push(`额外内容: ${fulfillment.extraNodes.slice(0, 2).join(', ')}`);
    }

    // 歧义原因
    if (disambiguation.pending.length > 0) {
      reasons.push(`存在${disambiguation.pending.length}个待处理歧义`);
    }

    return reasons;
  }

  /**
   * 更新章节状态
   */
  private async updateChapterStatus(chapterNumber: number, status: string): Promise<void> {
    const chapterId = this.getChapterId(chapterNumber);
    if (chapterId) {
      await this.projectStore.updateChapter(chapterId, {
        status: status as any,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * 获取章节 ID
   */
  private getChapterId(chapterNumber: number): string | null {
    const chapters = this.projectStore.sortedChapters;
    const chapter = chapters.find((c) => c.orderIndex === chapterNumber - 1);
    return chapter?.id || null;
  }

  /**
   * 统计字数
   */
  private countWords(text: string): number {
    if (!text) return 0;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}

// ============================================================
// Composable 导出
// ============================================================

let managerInstance: ChapterCommitManagerV2 | null = null;

export function useChapterCommitManagerV2(): ChapterCommitManagerV2 {
  if (!managerInstance) {
    managerInstance = new ChapterCommitManagerV2();
  }
  return managerInstance;
}

export type { CommitInput, CommitResult };
export default ChapterCommitManagerV2;
