/**
 * 记忆编排器
 * 基于 webnovel-writer 架构
 * 
 * 负责：
 * - 构建三层记忆包（工作/情景/语义）
 * - 管理记忆预算
 * - 过滤相关记忆
 * - 提供记忆查询
 */

import { ref, computed } from 'vue';
import type {
  MemoryPack,
  MemoryItem,
  MemoryLayer,
  MemoryCategory,
  MemoryQuery,
  MemoryQueryResult,
  MemoryBudget,
  WorkingMemoryItem,
  EpisodicMemoryItem,
  SemanticMemoryItem,
  ChapterSummary,
  StateChange,
  Constraint,
  Warning,
} from './types';
import { MemoryLayer as Layer, MemoryCategory as Category } from './types';
import { useProjectStore } from '@/stores/project.store';

export class MemoryOrchestrator {
  // 记忆存储
  private items = ref<MemoryItem[]>([]);
  
  // 近期摘要
  private summaries = ref<Map<number, ChapterSummary>>(new Map());
  
  // 状态变化
  private stateChanges = ref<StateChange[]>([]);
  
  // Store
  private projectStore = useProjectStore();
  
  // 记忆优先级
  private readonly PRIORITY: Record<MemoryCategory, number> = {
    'world_rule': 0,
    'character_state': 1,
    'relationship': 2,
    'story_fact': 3,
    'open_loop': 4,
    'reader_promise': 5,
    'timeline': 6,
  };
  
  // 默认记忆预算
  private readonly DEFAULT_BUDGET: MemoryBudget = {
    semantic: 15,
    working: 9,
    episodic: 6,
  };
  
  // ============================================================
  // 核心 API
  // ============================================================
  
  /**
   * 构建记忆包
   */
  async buildMemoryPack(
    chapter: number,
    taskType: string = 'write'
  ): Promise<MemoryPack> {
    // 1. 获取大纲
    const outline = await this.loadChapterOutline(chapter);
    
    // 2. 构建工作记忆
    const working = await this.buildWorkingMemory(chapter, outline);
    
    // 3. 构建情景记忆
    const episodic = await this.buildEpisodicMemory(chapter);
    
    // 4. 检索语义记忆
    const semantic = await this.querySemanticMemory(chapter, outline);
    
    // 5. 过滤相关记忆
    const filtered = this.filterRelevant(semantic, chapter, outline);
    
    // 6. 应用记忆预算
    const budget = this.allocateLimits(this.DEFAULT_BUDGET, taskType);
    const allocated = this.applyBudget(filtered, budget);
    
    // 7. 获取近期变化
    const recentChanges = this.getRecentStateChanges();
    
    // 8. 提取活跃约束
    const activeConstraints = this.extractConstraints(allocated);
    
    // 9. 检查冲突
    const warnings = this.checkWarnings();
    
    return {
      workingMemory: working,
      episodicMemory: episodic,
      semanticMemory: allocated,
      activeConstraints,
      recentChanges,
      warnings,
      stats: this.calculateStats(allocated, working, episodic),
    };
  }
  
  /**
   * 添加章节摘要
   */
  async addChapterSummary(summary: ChapterSummary): Promise<void> {
    // 保存摘要
    this.summaries.value.set(summary.chapter, summary);
    
    // 更新记忆存储
    await this.updateMemoryFromSummary(summary);
  }
  
  /**
   * 从内容更新记忆
   */
  async updateFromChapter(chapter: number, content: string): Promise<void> {
    // TODO: 使用 AI 提取记忆
    // 目前简化处理
    const summary = this.extractBasicSummary(content);
    await this.addChapterSummary({
      chapter,
      title: '',
      summary: summary.text,
      wordCount: summary.wordCount,
      coolPoints: [],
      foreshadows: [],
      keyEvents: summary.events,
      charactersInScene: [],
      location: '',
      timeSpan: '',
    });
  }
  
  /**
   * 查询记忆
   */
  query(query: MemoryQuery): MemoryQueryResult {
    let items = this.items.value;
    
    // 过滤层级
    if (query.layers?.length) {
      items = items.filter(item => query.layers!.includes(item.layer));
    }
    
    // 过滤分类
    if (query.categories?.length) {
      items = items.filter(item => query.categories!.includes(item.category));
    }
    
    // 过滤章节范围
    if (query.chapter) {
      items = items.filter(item => 
        Math.abs(item.sourceChapter - query.chapter!) <= 20
      );
    }
    
    // 关键词过滤
    if (query.keywords?.length) {
      const keywordLower = query.keywords.map(k => k.toLowerCase());
      items = items.filter(item => {
        const text = `${item.subject} ${item.field || ''} ${item.value}`.toLowerCase();
        return keywordLower.some(k => text.includes(k));
      });
    }
    
    // 过滤已归档
    if (!query.includeArchived) {
      items = items.filter(item => item.status !== 'archived');
    }
    
    // 限制数量
    if (query.limit) {
      items = items.slice(0, query.limit);
    }
    
    return {
      items,
      total: items.length,
      matchedBy: 'subject',
    };
  }
  
  /**
   * 获取冲突
   */
  getConflicts(): MemoryItem[] {
    const conflicts: MemoryItem[] = [];
    
    // 简单冲突检测：相同主体相同字段的不同值
    const grouped = new Map<string, MemoryItem[]>();
    
    for (const item of this.items.value) {
      const key = `${item.subject}|${item.field || ''}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }
    
    for (const [key, group] of grouped) {
      if (group.length > 1) {
        const values = new Set(group.map(i => i.value));
        if (values.size > 1) {
          conflicts.push(...group);
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * 获取活跃约束
   */
  getActiveConstraints(): Constraint[] {
    const constraints: Constraint[] = [];
    
    for (const item of this.items.value) {
      if (item.layer === Layer.SEMANTIC) {
        if (item.category === 'world_rule' || item.category === 'open_loop') {
          constraints.push({
            id: item.id,
            type: item.category === 'world_rule' ? 'world_rule' : 'foreshadow',
            description: `${item.subject}: ${item.value}`,
            sourceChapter: item.sourceChapter,
            status: item.status === 'active' ? 'active' : 'resolved',
          });
        }
      }
    }
    
    return constraints;
  }
  
  // ============================================================
  // 记忆构建
  // ============================================================
  
  private async buildWorkingMemory(
    chapter: number,
    outline: string
  ): Promise<WorkingMemoryItem[]> {
    const working: WorkingMemoryItem[] = [];
    
    // 添加章纲
    if (outline) {
      working.push({
        layer: Layer.WORKING,
        source: 'outline',
        chapter,
        content: outline.slice(0, 1500), // 限制长度
      });
    }
    
    // 添加近期摘要
    const summaryWindow = 3;
    for (let ch = Math.max(1, chapter - summaryWindow); ch < chapter; ch++) {
      const summary = this.summaries.value.get(ch);
      if (summary) {
        working.push({
          layer: Layer.WORKING,
          source: 'previous_summary',
          chapter: ch,
          content: summary.summary.slice(0, 800),
        });
      }
    }
    
    // 添加状态导出
    const stateExport = this.exportCurrentState();
    working.push({
      layer: Layer.WORKING,
      source: 'state_export',
      chapter,
      content: stateExport,
    });
    
    return working;
  }
  
  private async buildEpisodicMemory(
    chapter: number
  ): Promise<EpisodicMemoryItem[]> {
    const episodic: EpisodicMemoryItem[]> = [];
    const limit = 10;
    
    // 获取近期状态变化
    const changes = this.stateChanges.value
      .filter(sc => sc.chapter >= chapter - 20)
      .slice(-limit);
    
    for (const change of changes) {
      episodic.push({
        layer: Layer.EPISODIC,
        source: 'state_change',
        chapter: change.chapter,
        entityId: change.entityId,
        field: change.field,
        content: change,
      });
    }
    
    // TODO: 添加关系变化和登场记录
    
    return episodic;
  }
  
  private async querySemanticMemory(
    chapter: number,
    outline: string
  ): Promise<SemanticMemoryItem[]> {
    const allSemantic = this.items.value
      .filter(item => item.layer === Layer.SEMANTIC)
      .map(item => ({
        layer: item.layer,
        category: item.category,
        subject: item.subject,
        field: item.field,
        value: item.value,
        sourceChapter: item.sourceChapter,
        source: item.source,
        priority: this.PRIORITY[item.category] ?? 99,
        status: item.status === 'active' ? 'active' : 'resolved',
      }));
    
    // 按相关性和优先级排序
    return allSemantic.sort((a, b) => {
      // 首先按优先级
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // 然后按章节距离
      const distA = Math.abs(a.sourceChapter - chapter);
      const distB = Math.abs(b.sourceChapter - chapter);
      return distA - distB;
    });
  }
  
  private filterRelevant(
    items: SemanticMemoryItem[],
    chapter: number,
    outline: string
  ): SemanticMemoryItem[] {
    if (!outline) {
      return items;
    }
    
    const relevant: SemanticMemoryItem[] = [];
    const outlineLower = outline.toLowerCase();
    const sourceWindow = 20;
    
    for (const item of items) {
      // 检查主题匹配
      if (item.subject && outlineLower.includes(item.subject.toLowerCase())) {
        relevant.push(item);
        continue;
      }
      
      // 检查字段匹配
      if (item.field && outlineLower.includes(item.field.toLowerCase())) {
        relevant.push(item);
        continue;
      }
      
      // 检查值匹配
      if (item.value && outlineLower.includes(item.value.slice(0, 20).toLowerCase())) {
        relevant.push(item);
        continue;
      }
      
      // 检查章节距离
      if (item.sourceChapter > 0 && chapter - item.sourceChapter <= sourceWindow) {
        relevant.push(item);
      }
    }
    
    return relevant;
  }
  
  private allocateLimits(
    budget: MemoryBudget,
    taskType: string
  ): MemoryBudget {
    // 根据任务类型调整预算
    if (taskType === 'outline') {
      return { semantic: 20, working: 5, episodic: 5 };
    }
    if (taskType === 'review') {
      return { semantic: 10, working: 15, episodic: 5 };
    }
    return budget;
  }
  
  private applyBudget(
    items: SemanticMemoryItem[],
    budget: MemoryBudget
  ): SemanticMemoryItem[] {
    return items.slice(0, budget.semantic);
  }
  
  // ============================================================
  // 辅助方法
  // ============================================================
  
  private async loadChapterOutline(chapter: number): Promise<string> {
    const project = this.projectStore.currentProject;
    if (!project) return '';
    
    const chapterData = project.plotOutline?.find(
      (p: any) => p.chapterNumber === chapter
    );
    
    return chapterData?.description || chapterData?.plotSummary || '';
  }
  
  private exportCurrentState(): object {
    const project = this.projectStore.currentProject;
    
    return {
      protagonistState: project?.protagonistState || {},
      plotThreads: project?.plotThreads || [],
      disambiguationPending: project?.disambiguationPending || [],
    };
  }
  
  private getRecentStateChanges(): StateChange[] {
    return this.stateChanges.value.slice(-10);
  }
  
  private extractConstraints(
    items: SemanticMemoryItem[]
  ): Constraint[] {
    return items
      .filter(item => item.category === 'world_rule' || item.category === 'open_loop')
      .map(item => ({
        id: `${item.subject}-${item.field}`,
        type: item.category === 'world_rule' ? 'world_rule' : 'foreshadow',
        description: `${item.subject}: ${item.value}`,
        sourceChapter: item.sourceChapter,
        status: item.status === 'active' ? 'active' : 'satisfied',
      }));
  }
  
  private checkWarnings(): Warning[] {
    const warnings: Warning[] = [];
    
    // 检查记忆冲突
    const conflicts = this.getConflicts();
    if (conflicts.length > 0) {
      warnings.push({
        type: 'memory_conflict',
        count: conflicts.length,
        details: conflicts.map(c => `${c.subject}: ${c.value}`).slice(0, 5),
      });
    }
    
    // TODO: 检查时间线缺口
    // TODO: 检查未解决的伏笔
    
    return warnings;
  }
  
  private calculateStats(
    semantic: SemanticMemoryItem[],
    working: WorkingMemoryItem[],
    episodic: EpisodicMemoryItem[]
  ): {
    total: number;
    workingTotal: number;
    episodicTotal: number;
    semanticTotal: number;
    injected: number;
    layeredTotalInjected: number;
    filtered: number;
    conflicts: number;
  } {
    const allSemantic = this.items.value.filter(i => i.layer === Layer.SEMANTIC);
    const conflicts = this.getConflicts();
    
    return {
      total: this.items.value.length,
      workingTotal: working.length,
      episodicTotal: episodic.length,
      semanticTotal: allSemantic.length,
      injected: semantic.length,
      layeredTotalInjected: working.length + episodic.length + semantic.length,
      filtered: allSemantic.length - semantic.length,
      conflicts: conflicts.length,
    };
  }
  
  private async updateMemoryFromSummary(summary: ChapterSummary): Promise<void> {
    // 从摘要中提取记忆项
    const items: Omit<MemoryItem, 'id' | 'createdAt'>[] = [];
    
    // 添加关键事件
    for (const event of summary.keyEvents) {
      items.push({
        layer: Layer.SEMANTIC,
        category: 'story_fact',
        subject: 'event',
        value: event,
        sourceChapter: summary.chapter,
        source: 'chapter',
        status: 'active',
        updatedAt: new Date().toISOString(),
        priority: this.PRIORITY['story_fact'],
      });
    }
    
    // 添加角色
    for (const charName of summary.charactersInScene) {
      items.push({
        layer: Layer.SEMANTIC,
        category: 'character_state',
        subject: charName,
        value: '出场',
        sourceChapter: summary.chapter,
        source: 'chapter',
        status: 'active',
        updatedAt: new Date().toISOString(),
        priority: this.PRIORITY['character_state'],
      });
    }
    
    // 添加伏笔
    for (const foreshadow of summary.foreshadows) {
      items.push({
        layer: Layer.SEMANTIC,
        category: 'open_loop',
        subject: 'foreshadow',
        field: foreshadow.id,
        value: foreshadow.hint,
        sourceChapter: summary.chapter,
        source: 'chapter',
        status: foreshadow.status === 'revealed' ? 'resolved' : 'active',
        updatedAt: new Date().toISOString(),
        priority: this.PRIORITY['open_loop'],
      });
    }
    
    // 添加到存储
    for (const item of items) {
      this.addItem(item);
    }
  }
  
  private addItem(item: Omit<MemoryItem, 'id' | 'createdAt'>): void {
    const newItem: MemoryItem = {
      ...item,
      id: `memory_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this.items.value.push(newItem);
  }
  
  private extractBasicSummary(content: string): {
    text: string;
    wordCount: number;
    events: string[];
  } {
    // 简单提取：取前500字作为摘要
    const text = content.slice(0, 500);
    const wordCount = content.length;
    
    // 简单事件提取：取包含引号的对话
    const events: string[] = [];
    const dialogueMatches = content.match(/"[^"]+"/g);
    if (dialogueMatches) {
      events.push(...dialogueMatches.slice(0, 3));
    }
    
    return { text, wordCount, events };
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useMemoryOrchestrator() {
  const orchestrator = new MemoryOrchestrator();
  
  return {
    orchestrator,
    
    // 方法
    buildMemoryPack: (chapter: number, taskType?: string) => 
      orchestrator.buildMemoryPack(chapter, taskType),
    addChapterSummary: (summary: ChapterSummary) => 
      orchestrator.addChapterSummary(summary),
    updateFromChapter: (chapter: number, content: string) => 
      orchestrator.updateFromChapter(chapter, content),
    query: (query: MemoryQuery) => orchestrator.query(query),
    getConflicts: () => orchestrator.getConflicts(),
    getActiveConstraints: () => orchestrator.getActiveConstraints(),
  };
}
