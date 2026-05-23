/**
 * 记忆编排器
 * 管理三层记忆包（工作/情景/语义）
 */

import { ref } from 'vue';
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

// ============================================================
// 常量
// ============================================================

const PRIORITY_MAP: Record<MemoryCategory, number> = {
  'world_rule': 0,
  'character_state': 1,
  'relationship': 2,
  'story_fact': 3,
  'open_loop': 4,
  'reader_promise': 5,
  'timeline': 6,
};

const DEFAULT_BUDGET: MemoryBudget = {
  semantic: 15,
  working: 9,
  episodic: 6,
};

const SUMMARY_WINDOW = 3;
const SOURCE_WINDOW = 20;

// ============================================================
// 记忆编排器
// ============================================================

export class MemoryOrchestrator {
  private readonly _items = ref<MemoryItem[]>([]);
  private readonly _summaries = ref<Map<number, ChapterSummary>>(new Map());
  private readonly _stateChanges = ref<StateChange[]>([]);
  private readonly _projectStore = useProjectStore();

  private _currentBudget: MemoryBudget = { ...DEFAULT_BUDGET };

  // ============================================================
  // 核心 API
  // ============================================================

  updateBudget(budget: Partial<MemoryBudget>): void {
    this._currentBudget = { ...this._currentBudget, ...budget };
  }

  resetBudget(): void {
    this._currentBudget = { ...DEFAULT_BUDGET };
  }

  async buildMemoryPack(chapter: number, taskType = 'write'): Promise<MemoryPack> {
    const outline = await this.loadChapterOutline(chapter);
    const working = await this.buildWorkingMemory(chapter, outline);
    const episodic = await this.buildEpisodicMemory(chapter);
    const semantic = await this.querySemanticMemory(chapter, outline);
    const filtered = this.filterRelevant(semantic, chapter, outline);
    const budget = this.allocateLimits(this._currentBudget, taskType);
    const allocated = this.applyBudget(filtered, budget);
    const recentChanges = this.getRecentStateChanges();
    const activeConstraints = this.extractConstraints(allocated);
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

  async addChapterSummary(summary: ChapterSummary): Promise<void> {
    this._summaries.value.set(summary.chapter, summary);
    await this.updateMemoryFromSummary(summary);
  }

  async updateFromChapter(chapter: number, content: string): Promise<void> {
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

  query(q: MemoryQuery): MemoryQueryResult {
    let items = this._items.value;

    if (q.layers?.length) {
      items = items.filter((item) => q.layers!.includes(item.layer));
    }

    if (q.categories?.length) {
      items = items.filter((item) => q.categories!.includes(item.category));
    }

    if (q.chapter) {
      items = items.filter((item) => Math.abs(item.sourceChapter - q.chapter!) <= SOURCE_WINDOW);
    }

    if (q.keywords?.length) {
      const keywordsLower = q.keywords.map((k) => k.toLowerCase());
      items = items.filter((item) => {
        const text = `${item.subject} ${item.field || ''} ${item.value}`.toLowerCase();
        return keywordsLower.some((k) => text.includes(k));
      });
    }

    if (!q.includeArchived) {
      items = items.filter((item) => item.status !== 'archived');
    }

    if (q.limit) {
      items = items.slice(0, q.limit);
    }

    return {
      items,
      total: items.length,
      matchedBy: 'subject',
    };
  }

  getConflicts(): MemoryItem[] {
    const conflicts: MemoryItem[] = [];
    const grouped = new Map<string, MemoryItem[]>();

    for (const item of this._items.value) {
      const key = `${item.subject}|${item.field || ''}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }

    for (const [, group] of grouped) {
      if (group.length > 1) {
        const values = new Set(group.map((i) => i.value));
        if (values.size > 1) {
          conflicts.push(...group);
        }
      }
    }

    return conflicts;
  }

  getActiveConstraints(): Constraint[] {
    const constraints: Constraint[] = [];

    for (const item of this._items.value) {
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

  private async buildWorkingMemory(chapter: number, outline: string): Promise<WorkingMemoryItem[]> {
    const working: WorkingMemoryItem[] = [];

    if (outline) {
      working.push({
        layer: Layer.WORKING,
        source: 'outline',
        chapter,
        content: outline.slice(0, 1500),
      });
    }

    for (let ch = Math.max(1, chapter - SUMMARY_WINDOW); ch < chapter; ch++) {
      const summary = this._summaries.value.get(ch);
      if (summary) {
        working.push({
          layer: Layer.WORKING,
          source: 'previous_summary',
          chapter: ch,
          content: summary.summary.slice(0, 800),
        });
      }
    }

    const stateExport = this.exportCurrentState();
    working.push({
      layer: Layer.WORKING,
      source: 'state_export',
      chapter,
      content: stateExport,
    });

    return working;
  }

  private async buildEpisodicMemory(chapter: number): Promise<EpisodicMemoryItem[]> {
    const episodic: EpisodicMemoryItem[] = [];

    const changes = this._stateChanges.value
      .filter((sc) => sc.chapter >= chapter - SOURCE_WINDOW)
      .slice(-10);

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

    return episodic;
  }

  private async querySemanticMemory(chapter: number, outline: string): Promise<SemanticMemoryItem[]> {
    const allSemantic = this._items.value
      .filter((item) => item.layer === Layer.SEMANTIC)
      .map((item) => ({
        layer: item.layer,
        category: item.category,
        subject: item.subject,
        field: item.field,
        value: item.value,
        sourceChapter: item.sourceChapter,
        source: item.source,
        priority: PRIORITY_MAP[item.category] ?? 99,
        status: item.status === 'active' ? 'active' : 'resolved',
      }));

    return allSemantic.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      const distA = Math.abs(a.sourceChapter - chapter);
      const distB = Math.abs(b.sourceChapter - chapter);
      return distA - distB;
    });
  }

  private filterRelevant(items: SemanticMemoryItem[], chapter: number, outline: string): SemanticMemoryItem[] {
    if (!outline) {
      return items;
    }

    const relevant: SemanticMemoryItem[] = [];
    const outlineLower = outline.toLowerCase();

    for (const item of items) {
      if (item.subject && outlineLower.includes(item.subject.toLowerCase())) {
        relevant.push(item);
        continue;
      }

      if (item.field && outlineLower.includes(item.field.toLowerCase())) {
        relevant.push(item);
        continue;
      }

      if (item.value && outlineLower.includes(item.value.slice(0, 20).toLowerCase())) {
        relevant.push(item);
        continue;
      }

      if (item.sourceChapter > 0 && chapter - item.sourceChapter <= SOURCE_WINDOW) {
        relevant.push(item);
      }
    }

    return relevant;
  }

  private allocateLimits(budget: MemoryBudget, taskType: string): MemoryBudget {
    if (taskType === 'outline') {
      return { semantic: 20, working: 5, episodic: 5 };
    }
    if (taskType === 'review') {
      return { semantic: 10, working: 15, episodic: 5 };
    }
    if (taskType === 'custom' && budget !== DEFAULT_BUDGET) {
      return budget;
    }
    return this._currentBudget;
  }

  private applyBudget(items: SemanticMemoryItem[], budget: MemoryBudget): SemanticMemoryItem[] {
    return items.slice(0, budget.semantic);
  }

  // ============================================================
  // 辅助方法
  // ============================================================

  private async loadChapterOutline(chapter: number): Promise<string> {
    const project = this._projectStore.currentProject;
    if (!project) return '';

    const chapterData = project.plotOutline?.find(
      (p: { chapterNumber?: number }) => p.chapterNumber === chapter
    );

    return chapterData?.description || chapterData?.plotSummary || '';
  }

  private exportCurrentState(): string {
    const project = this._projectStore.currentProject;

    return JSON.stringify({
      protagonistState: project?.protagonistState || {},
      plotThreads: project?.plotThreads || [],
      disambiguationPending: project?.disambiguationPending || [],
    });
  }

  private getRecentStateChanges(): StateChange[] {
    return this._stateChanges.value.slice(-10);
  }

  private extractConstraints(items: SemanticMemoryItem[]): Constraint[] {
    return items
      .filter((item) => item.category === 'world_rule' || item.category === 'open_loop')
      .map((item) => ({
        id: `${item.subject}-${item.field}`,
        type: item.category === 'world_rule' ? 'world_rule' : 'foreshadow',
        description: `${item.subject}: ${item.value}`,
        sourceChapter: item.sourceChapter,
        status: item.status === 'active' ? 'active' : 'satisfied',
      }));
  }

  private checkWarnings(): Warning[] {
    const warnings: Warning[] = [];
    const conflicts = this.getConflicts();

    if (conflicts.length > 0) {
      warnings.push({
        type: 'memory_conflict',
        count: conflicts.length,
        details: conflicts.map((c) => `${c.subject}: ${c.value}`).slice(0, 5),
      });
    }

    return warnings;
  }

  private calculateStats(
    semantic: SemanticMemoryItem[],
    working: WorkingMemoryItem[],
    episodic: EpisodicMemoryItem[]
  ): MemoryPack['stats'] {
    const allSemantic = this._items.value.filter((i) => i.layer === Layer.SEMANTIC);
    const conflicts = this.getConflicts();

    return {
      total: this._items.value.length,
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
    const items: Omit<MemoryItem, 'id' | 'createdAt'>[] = [];

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
        priority: PRIORITY_MAP['story_fact'],
      });
    }

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
        priority: PRIORITY_MAP['character_state'],
      });
    }

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
        priority: PRIORITY_MAP['open_loop'],
      });
    }

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
    this._items.value.push(newItem);
  }

  private extractBasicSummary(content: string): {
    text: string;
    wordCount: number;
    events: string[];
  } {
    const text = content.slice(0, 500);
    const wordCount = content.length;
    const events: string[] = [];
    const dialogueMatches = content.match(/"[^"]+"/g);

    if (dialogueMatches) {
      events.push(...dialogueMatches.slice(0, 3));
    }

    return { text, wordCount, events };
  }
}

// ============================================================
// Composable
// ============================================================

export function useMemoryOrchestrator() {
  const orchestrator = new MemoryOrchestrator();

  return {
    orchestrator,

    buildMemoryPack: (chapter: number, taskType?: string) =>
      orchestrator.buildMemoryPack(chapter, taskType),
    addChapterSummary: (summary: ChapterSummary) =>
      orchestrator.addChapterSummary(summary),
    updateFromChapter: (chapter: number, content: string) =>
      orchestrator.updateFromChapter(chapter, content),
    query: (q: MemoryQuery) => orchestrator.query(q),
    getConflicts: () => orchestrator.getConflicts(),
    getActiveConstraints: () => orchestrator.getActiveConstraints(),

    updateConfig: (config: Partial<MemoryBudget>) => {
      orchestrator.updateBudget(config);
    },
  };
}
