/**
 * 章节提交管理器
 * 基于 webnovel-writer 架构
 * 
 * 职责：
 * - 从章节内容中提取事实
 * - 评估合同完成度
 * - 处理歧义
 * - 更新人物状态和投影
 */

import type {
  CommitResult,
  FulfillmentResult,
  DisambiguationResult,
  DisambiguationItem,
  ExtractionResult,
  ExtractedEvent,
  StateDelta,
  EntityDelta,
  Scene,
  ProjectionStatus,
} from './types';
import { useProjectStore } from '@/stores/project.store';
import { useMemoryOrchestrator } from '../memory/MemoryOrchestrator';
import type { ReviewResult } from '../review/types';

export class ChapterCommitManager {
  private projectStore = useProjectStore();
  private memoryOrchestrator = useMemoryOrchestrator();
  
  /**
   * 执行 Commit
   */
  async commit(
    chapterNumber: number,
    reviewResult: ReviewResult,
    content: string
  ): Promise<CommitResult> {
    // 1. 提取事实
    const extraction = await this.extractFacts(chapterNumber, content);
    
    // 2. 评估完成度
    const fulfillment = await this.evaluateFulfillment(chapterNumber, extraction);
    
    // 3. 处理歧义
    const disambiguation = await this.resolveAmbiguities(chapterNumber, extraction);
    
    // 4. 更新投影
    const projection = await this.updateProjections(chapterNumber, extraction, disambiguation);
    
    // 5. 生成原因列表
    const reasons = this.generateReasons(fulfillment, disambiguation);
    
    // 6. 判断是否接受
    const status = this.determineStatus(fulfillment, disambiguation);
    
    return {
      status,
      chapter: chapterNumber,
      timestamp: new Date().toISOString(),
      fulfillment,
      disambiguation,
      extraction,
      projection,
      reasons,
    };
  }
  
  // ============================================================
  // 事实提取
  // ============================================================
  
  private async extractFacts(
    chapterNumber: number,
    content: string
  ): Promise<ExtractionResult> {
    // 简化实现：使用规则提取
    // 完整实现应该调用 AI 提取
    
    const events: ExtractedEvent[] = [];
    const stateDeltas: StateDelta[] = [];
    const entityDeltas: EntityDelta[] = [];
    const entities: string[] = [];
    const scenes: Scene[] = [];
    
    // 1. 提取对话中的事件
    const dialogues = content.match(/[""][^""]+[""]/g) || [];
    for (const dialogue of dialogues) {
      const cleanDialogue = dialogue.replace(/[""]/g, '');
      
      // 检测承诺
      if (/发誓|承诺|保证|答应|一定/.test(cleanDialogue)) {
        events.push({
          event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          chapter: chapterNumber,
          event_type: 'promise',
          subject: 'unknown',
          payload: {
            action: '做出承诺',
            result: cleanDialogue.slice(0, 50),
          },
        });
      }
      
      // 检测威胁
      if (/威胁|警告|等着瞧|别怪/.test(cleanDialogue)) {
        events.push({
          event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          chapter: chapterNumber,
          event_type: 'threat',
          subject: 'unknown',
          payload: {
            action: '发出威胁',
            result: cleanDialogue.slice(0, 50),
          },
        });
      }
    }
    
    // 2. 提取状态变化
    const stateChangePatterns = [
      // 关系变化
      { pattern: /(成为|变成|化为)(.+)/, type: 'relationship', field: 'status' },
      // 能力变化
      { pattern: /(获得|失去|提升|降低)(.+)/, type: 'ability', field: 'level' },
      // 位置变化
      { pattern: /(来到|回到|前往|离开)(.+)/, type: 'location', field: 'where' },
    ];
    
    for (const { pattern, type, field } of stateChangePatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        for (const match of matches) {
          stateDeltas.push({
            entity_id: 'unknown',
            field,
            from: '',
            to: match.replace(pattern, '$2'),
          });
        }
      }
    }
    
    // 3. 提取角色名
    const possibleNames = content.match(/[\u4e00-\u9fa5]{2,4}(?:说|道|问|答|喊|叫|道)/g);
    if (possibleNames) {
      for (const name of possibleNames) {
        const cleanName = name.replace(/(?:说|道|问|答|喊|叫|道)/, '');
        if (cleanName.length >= 2 && cleanName.length <= 4) {
          entities.push(cleanName);
        }
      }
    }
    
    // 4. 提取场景
    const locationIndicators = ['来到', '走进', '回到', '位于', '在', '来到'];
    for (const indicator of locationIndicators) {
      const match = content.match(new RegExp(`${indicator}([^，。]+?)(?:，|。|$)`, 'i'));
      if (match) {
        scenes.push({
          location: match[1].trim(),
          time: '',
          participants: entities.slice(0, 3),
        });
        break;
      }
    }
    
    // 5. 生成摘要文本
    const summaryText = this.generateSummaryText(chapterNumber, content);
    
    return {
      acceptedEvents: events,
      stateDeltas,
      entityDeltas,
      entitiesAppeared: [...new Set(entities)],
      scenes: scenes.slice(0, 3),
      summaryText,
    };
  }
  
  // ============================================================
  // 完成度评估
  // ============================================================
  
  private async evaluateFulfillment(
    chapterNumber: number,
    extraction: ExtractionResult
  ): Promise<FulfillmentResult> {
    // 获取章节合同
    // 修复：原代码用 p.chapterNumber === chapterNumber（PlotNode 没有该字段）和 chapter.plotSummary（PlotNode 也没有），
    // 导致 find 永远返回 undefined，plannedNodes 永远为空，完成度评估完全失效。
    // 正确做法：用 orderIndex（章号-1）+ type='chapter' 查找，并从 PlotNode 的结构化字段提取计划节点。
    const project = this.projectStore.currentProject;
    const expectedOrderIndex = chapterNumber - 1;
    const chapter = project?.plotOutline?.find(
      (p) => p.orderIndex === expectedOrderIndex && p.type === 'chapter'
    );

    if (!chapter) {
      return {
        plannedNodes: [],
        coveredNodes: [],
        missedNodes: [],
        extraNodes: [],
      };
    }

    // 从章纲的结构化字段提取计划节点（CBN / CPNs / CEN / mustCover / keyEvents）
    const plannedNodes: string[] = [];
    if (chapter.CBN) plannedNodes.push(chapter.CBN);
    if (Array.isArray(chapter.CPNs)) plannedNodes.push(...chapter.CPNs);
    if (chapter.CEN) plannedNodes.push(chapter.CEN);
    if (Array.isArray(chapter.mustCover)) plannedNodes.push(...chapter.mustCover);
    if (Array.isArray(chapter.keyEvents)) plannedNodes.push(...chapter.keyEvents);
    // 兜底：如果结构化字段全空，回退到 description
    if (plannedNodes.length === 0 && chapter.description) {
      const sentences = chapter.description.split(/[。\n]/).map(s => s.trim()).filter(s => s.length > 5);
      plannedNodes.push(...sentences);
    }

    // 从提取结果中检查覆盖
    const summaryLower = extraction.summaryText.toLowerCase();
    const coveredNodes: string[] = [];
    const missedNodes: string[] = [];

    for (const node of plannedNodes) {
      const nodeKeywords = node.split(/[，。、]/).filter(w => w.length >= 2);
      const found = nodeKeywords.some(k => summaryLower.includes(k.toLowerCase()));

      if (found) {
        coveredNodes.push(node);
      } else {
        missedNodes.push(node);
      }
    }

    return {
      plannedNodes,
      coveredNodes,
      missedNodes,
      extraNodes: [],  // 从内容中提取但未在计划中的节点
    };
  }
  
  // ============================================================
  // 歧义处理
  // ============================================================
  
  private async resolveAmbiguities(
    chapterNumber: number,
    extraction: ExtractionResult
  ): Promise<DisambiguationResult> {
    const pending: DisambiguationItem[] = [];
    const resolved: DisambiguationItem[] = [];
    
    // 检测歧义项
    const ambiguousPatterns = [
      // 角色关系不明确
      /(.+)和(.+)的?关系/,
      // 物品归属不明确
      /(.+)的(.+)/,
      // 事件原因不明确
      /因为(.+)，所以/,
    ];
    
    // 简化处理：将提取的事件作为待处理项
    for (const event of extraction.acceptedEvents) {
      if (event.event_type === 'promise' || event.event_type === 'threat') {
        pending.push({
          id: event.event_id,
          question: `检查承诺/威胁是否需要后续跟进：${event.payload.result}`,
          status: 'pending',
        });
      }
    }
    
    // 检测未提及的关键角色
    const project = this.projectStore.currentProject;
    const mainCharacters = project?.characters?.filter(
      (c: any) => c.role === '主角' || c.role?.includes('主角')
    ) || [];
    
    for (const char of mainCharacters) {
      if (!extraction.entitiesAppeared.includes(char.name)) {
        pending.push({
          id: `char_${char.id}`,
          question: `主角${char.name}在本章未出场，是否需要调整？`,
          status: 'pending',
        });
      }
    }
    
    return { pending, resolved };
  }
  
  // ============================================================
  // 投影更新
  // ============================================================
  
  private async updateProjections(
    chapterNumber: number,
    extraction: ExtractionResult,
    disambiguation: DisambiguationResult
  ): Promise<ProjectionStatus> {
    const status: ProjectionStatus = {
      state: 'done',
      index: 'done',
      summary: 'done',
      memory: 'pending',
      vector: 'pending',
    };
    
    try {
      // 1. 更新状态
      // 简化：存储到项目状态
      const project = this.projectStore.currentProject;
      if (project) {
        project.lastChapter = chapterNumber;
        project.lastUpdated = new Date().toISOString();
      }
      
      // 2. 更新索引
      // 简化：记录章节已完成
      // TODO: 实现完整的索引更新
      
      // 3. 更新摘要
      await this.memoryOrchestrator.addChapterSummary({
        chapter: chapterNumber,
        title: extraction.scenes[0]?.location || `第${chapterNumber}章`,
        summary: extraction.summaryText,
        wordCount: extraction.summaryText.length,
        coolPoints: [],
        foreshadows: [],
        keyEvents: extraction.acceptedEvents.map(e => e.payload.result),
        charactersInScene: extraction.entitiesAppeared,
        location: extraction.scenes[0]?.location || '',
        timeSpan: '',
      });
      status.summary = 'done';
      
      // 4. 更新记忆
      await this.memoryOrchestrator.updateFromChapter(
        chapterNumber,
        extraction.summaryText
      );
      status.memory = 'done';
      
      // 5. 向量存储
      // TODO: 实现向量存储
      status.vector = 'skipped';
      
    } catch (error) {
      console.error('[ChapterCommit] 更新投影失败:', error);
      status.state = 'failed';
      status.memory = 'failed';
    }
    
    return status;
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private generateSummaryText(chapterNumber: number, content: string): string {
    // 提取前300字作为摘要
    return content.slice(0, 300);
  }
  
  private generateReasons(
    fulfillment: FulfillmentResult,
    disambiguation: DisambiguationResult
  ): string[] {
    const reasons: string[] = [];
    
    // 完成度原因
    if (fulfillment.missedNodes.length === 0) {
      reasons.push('所有计划节点均已覆盖');
    } else {
      reasons.push(`遗漏节点: ${fulfillment.missedNodes.slice(0, 2).join(', ')}`);
    }
    
    // 歧义原因
    if (disambiguation.pending.length > 0) {
      reasons.push(`存在${disambiguation.pending.length}个待处理歧义`);
    }
    
    return reasons;
  }
  
  private determineStatus(
    fulfillment: FulfillmentResult,
    disambiguation: DisambiguationResult
  ): 'accepted' | 'rejected' {
    // 如果遗漏节点过多，拒绝
    if (fulfillment.missedNodes.length > fulfillment.plannedNodes.length * 0.5) {
      return 'rejected';
    }
    
    // 如果有待处理的严重歧义，拒绝
    const criticalAmbiguities = disambiguation.pending.filter(
      d => d.question.includes('主角')
    );
    if (criticalAmbiguities.length > 0) {
      return 'rejected';
    }
    
    return 'accepted';
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useChapterCommitManager() {
  const manager = new ChapterCommitManager();
  
  return {
    manager,
    commit: (chapterNumber: number, reviewResult: ReviewResult, content: string) =>
      manager.commit(chapterNumber, reviewResult, content),
  };
}
