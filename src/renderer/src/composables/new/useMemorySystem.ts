/**
 * 记忆系统
 * 基于 webnovel-writer-master 的记忆架构
 * 
 * 记忆系统包含：
 * - state.json: 项目快照
 * - index.db: 实体索引
 * - summaries/: 章节摘要
 * - memory_scratchpad/: 临时记忆
 */

import { ref, computed, shallowRef } from 'vue';
import type {
  ProjectState,
  EntityIndex,
  MemoryScratchpad,
  ChapterSummary,
  ForeshadowStatus,
  CharacterState,
  Entity,
  Relation,
  Event,
} from '@/types/memory';

// ============================================================
// Composable 定义
// ============================================================

export interface UseMemorySystemOptions {
  projectId: string;
  onSave?: (type: 'state' | 'index' | 'scratchpad', data: any) => void;
}

export function useMemorySystem(options: UseMemorySystemOptions) {
  const { projectId, onSave } = options;

  // 状态
  const state = shallowRef<ProjectState | null>(null);
  const index = shallowRef<EntityIndex>({ entities: [], relations: [], events: [] });
  const scratchpad = shallowRef<MemoryScratchpad>({
    summaries: [],
    tempNotes: [],
    writingContextCache: [],
    pendingTasks: [],
  });

  // 计算属性
  const totalWordCount = computed(() => state.value?.meta.totalWordCount || 0);

  const currentChapter = computed(() => state.value?.meta.currentChapter || 1);

  const unlockedLocations = computed(() => state.value?.unlockedSettings.locations || []);

  const unlockedCharacters = computed(() => state.value?.unlockedSettings.characters || []);

  const activeForeshadows = computed(() => {
    if (!state.value) return [];
    return Object.entries(state.value.foreshadowStatus)
      .filter(([_, f]) => f.status !== 'revealed' && f.status !== 'forgotten')
      .map(([id, f]) => ({ id, ...f }));
  });

  const entityList = computed(() => index.value.entities);

  const recentEvents = computed(() => {
    return index.value.events
      .sort((a, b) => b.chapter - a.chapter)
      .slice(0, 20);
  });

  // ============================================================
  // 初始化
  // ============================================================

  /**
   * 创建默认状态
   */
  function createDefaultState(): ProjectState {
    return {
      meta: {
        projectId,
        currentChapter: 1,
        currentVolume: 1,
        totalWordCount: 0,
        lastUpdated: new Date().toISOString(),
      },
      unlockedSettings: {
        worldRules: [],
        locations: [],
        factions: [],
        characters: [],
        items: [],
      },
      foreshadowStatus: {},
      characterStatus: {},
      plotProgress: {
        quest: {
          currentStage: 1,
          stages: [],
          conflicts: [],
        },
        fire: {
          romanceType: 'sweet',
          currentStage: 1,
          milestones: [],
        },
        constellation: {
          revealedRules: [],
          revealedMysteries: [],
          nextReveal: null,
        },
      },
    };
  }

  /**
   * 初始化空状态
   */
  function initialize(): void {
    state.value = createDefaultState();
    index.value = { entities: [], relations: [], events: [] };
    scratchpad.value = {
      summaries: [],
      tempNotes: [],
      writingContextCache: [],
      pendingTasks: [],
    };
  }

  /**
   * 加载保存的状态
   */
  function loadFromData(data: {
    state?: ProjectState;
    index?: EntityIndex;
    scratchpad?: MemoryScratchpad;
  }): void {
    if (data.state) state.value = data.state;
    if (data.index) index.value = data.index;
    if (data.scratchpad) scratchpad.value = data.scratchpad;
  }

  // ============================================================
  // 状态更新
  // ============================================================

  /**
   * 更新项目进度
   */
  function updateProgress(chapter: number, wordCount: number): void {
    if (!state.value) return;

    state.value = {
      ...state.value,
      meta: {
        ...state.value.meta,
        currentChapter: chapter,
        totalWordCount: state.value.meta.totalWordCount + wordCount,
        lastUpdated: new Date().toISOString(),
      },
    };

    onSave?.('state', state.value);
  }

  /**
   * 解锁设定
   */
  function unlockSetting(
    type: 'worldRules' | 'locations' | 'factions' | 'characters' | 'items',
    value: string
  ): void {
    if (!state.value) return;

    const settings = state.value.unlockedSettings;
    if (!settings[type].includes(value)) {
      state.value = {
        ...state.value,
        unlockedSettings: {
          ...settings,
          [type]: [...settings[type], value],
        },
        meta: {
          ...state.value.meta,
          lastUpdated: new Date().toISOString(),
        },
      };
      onSave?.('state', state.value);
    }
  }

  /**
   * 批量解锁设定
   */
  function unlockSettings(
    type: 'worldRules' | 'locations' | 'factions' | 'characters' | 'items',
    values: string[]
  ): void {
    if (!state.value) return;

    const settings = state.value.unlockedSettings;
    const newValues = values.filter(v => !settings[type].includes(v));
    
    if (newValues.length > 0) {
      state.value = {
        ...state.value,
        unlockedSettings: {
          ...settings,
          [type]: [...settings[type], ...newValues],
        },
        meta: {
          ...state.value.meta,
          lastUpdated: new Date().toISOString(),
        },
      };
      onSave?.('state', state.value);
    }
  }

  // ============================================================
  // 伏笔追踪
  // ============================================================

  /**
   * 添加伏笔
   */
  function addForeshadow(foreshadowId: string, chapter: number): void {
    if (!state.value) return;

    state.value = {
      ...state.value,
      foreshadowStatus: {
        ...state.value.foreshadowStatus,
        [foreshadowId]: {
          status: 'buried',
          chapters: [chapter],
          lastMention: chapter,
          buriedChapter: chapter,
        },
      },
      meta: {
        ...state.value.meta,
        lastUpdated: new Date().toISOString(),
      },
    };

    onSave?.('state', state.value);
  }

  /**
   * 更新伏笔状态
   */
  function updateForeshadowStatus(
    foreshadowId: string,
    status: ForeshadowStatus['status'],
    chapter: number
  ): void {
    if (!state.value || !state.value.foreshadowStatus[foreshadowId]) return;

    const current = state.value.foreshadowStatus[foreshadowId];
    state.value = {
      ...state.value,
      foreshadowStatus: {
        ...state.value.foreshadowStatus,
        [foreshadowId]: {
          ...current,
          status,
          lastMention: chapter,
          chapters: [...new Set([...current.chapters, chapter])],
          revealChapter: status === 'revealed' ? chapter : current.revealChapter,
        },
      },
      meta: {
        ...state.value.meta,
        lastUpdated: new Date().toISOString(),
      },
    };

    onSave?.('state', state.value);
  }

  /**
   * 提及伏笔
   */
  function mentionForeshadow(foreshadowId: string, chapter: number): void {
    if (!state.value) return;

    const current = state.value.foreshadowStatus[foreshadowId];
    if (!current) {
      addForeshadow(foreshadowId, chapter);
      return;
    }

    state.value = {
      ...state.value,
      foreshadowStatus: {
        ...state.value.foreshadowStatus,
        [foreshadowId]: {
          ...current,
          lastMention: chapter,
          chapters: [...new Set([...current.chapters, chapter])],
        },
      },
    };
  }

  /**
   * 获取伏笔状态
   */
  function getForeshadowStatus(foreshadowId: string): ForeshadowStatus | undefined {
    return state.value?.foreshadowStatus[foreshadowId];
  }

  // ============================================================
  // 角色状态
  // ============================================================

  /**
   * 更新角色状态
   */
  function updateCharacterStatus(
    characterId: string,
    updates: Partial<CharacterState>,
    chapter?: number
  ): void {
    if (!state.value) return;

    const current = state.value.characterStatus[characterId] || {
      growthStage: 1,
      relationships: [],
      currentLocation: '',
      currentGoal: '',
      arcProgress: 0,
      lastAppearedChapter: chapter || 1,
      status: 'active' as const,
    };

    state.value = {
      ...state.value,
      characterStatus: {
        ...state.value.characterStatus,
        [characterId]: {
          ...current,
          ...updates,
          lastAppearedChapter: chapter || current.lastAppearedChapter,
        },
      },
      meta: {
        ...state.value.meta,
        lastUpdated: new Date().toISOString(),
      },
    };

    onSave?.('state', state.value);
  }

  /**
   * 获取角色状态
   */
  function getCharacterStatus(characterId: string): CharacterState | undefined {
    return state.value?.characterStatus[characterId];
  }

  // ============================================================
  // 实体索引操作
  // ============================================================

  /**
   * 添加实体
   */
  function addEntity(
    entity: Omit<Entity, 'id' | 'mentions' | 'lastMention'>
  ): Entity {
    const newEntity: Entity = {
      ...entity,
      id: `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      mentions: 1,
      lastMention: entity.firstAppearance,
    };

    index.value = {
      ...index.value,
      entities: [...index.value.entities, newEntity],
    };

    // 同时解锁设定
    if (entity.type === 'location') {
      unlockSetting('locations', entity.name);
    } else if (entity.type === 'character') {
      unlockSetting('characters', entity.name);
    } else if (entity.type === 'faction') {
      unlockSetting('factions', entity.name);
    }

    onSave?.('index', index.value);
    return newEntity;
  }

  /**
   * 查找实体
   */
  function findEntity(name: string): Entity | undefined {
    return index.value.entities.find(
      e => e.name.includes(name) || name.includes(e.name)
    );
  }

  /**
   * 增加提及次数
   */
  function incrementMentions(entityId: string, chapter: number): void {
    index.value = {
      ...index.value,
      entities: index.value.entities.map(e =>
        e.id === entityId
          ? { ...e, mentions: e.mentions + 1, lastMention: chapter }
          : e
      ),
    };
    onSave?.('index', index.value);
  }

  /**
   * 添加关系
   */
  function addRelation(relation: Omit<Relation, 'id'>): Relation {
    const newRelation: Relation = {
      ...relation,
      id: `relation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    index.value = {
      ...index.value,
      relations: [...index.value.relations, newRelation],
    };

    onSave?.('index', index.value);
    return newRelation;
  }

  /**
   * 添加事件
   */
  function addEvent(event: Omit<Event, 'id'>): Event {
    const newEvent: Event = {
      ...event,
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    index.value = {
      ...index.value,
      events: [...index.value.events, newEvent],
    };

    onSave?.('index', index.value);
    return newEvent;
  }

  /**
   * 查询实体
   */
  function queryEntities(options: {
    type?: Entity['type'];
    tags?: string[];
    search?: string;
  }): Entity[] {
    let results = index.value.entities;

    if (options.type) {
      results = results.filter(e => e.type === options.type);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(e =>
        options.tags!.some(tag => e.tags.includes(tag))
      );
    }

    if (options.search) {
      const search = options.search.toLowerCase();
      results = results.filter(
        e =>
          e.name.toLowerCase().includes(search) ||
          e.description.toLowerCase().includes(search)
      );
    }

    return results;
  }

  // ============================================================
  // 章节摘要
  // ============================================================

  /**
   * 添加章节摘要
   */
  function addChapterSummary(summary: Omit<ChapterSummary, 'timestamp'>): void {
    scratchpad.value = {
      ...scratchpad.value,
      summaries: [
        ...scratchpad.value.summaries.filter(s => s.chapter !== summary.chapter),
        {
          ...summary,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    onSave?.('scratchpad', scratchpad.value);
  }

  /**
   * 获取章节摘要
   */
  function getChapterSummary(chapter: number): ChapterSummary | undefined {
    return scratchpad.value.summaries.find(s => s.chapter === chapter);
  }

  /**
   * 获取多个章节摘要
   */
  function getChapterSummaries(chapters: number[]): ChapterSummary[] {
    return scratchpad.value.summaries
      .filter(s => chapters.includes(s.chapter))
      .sort((a, b) => a.chapter - b.chapter);
  }

  /**
   * 获取摘要文本
   */
  function getSummariesText(chapters: number[]): string {
    const summaries = getChapterSummaries(chapters);
    return summaries
      .map(s => `【第${s.chapter}章】${s.summary}`)
      .join('\n\n');
  }

  // ============================================================
  // 临时笔记
  // ============================================================

  /**
   * 添加临时笔记
   */
  function addTempNote(
    content: string,
    chapter: number,
    type: 'idea' | 'reminder' | 'question' | 'todo' = 'idea'
  ): void {
    const note = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      content,
      createdAt: new Date().toISOString(),
      createdChapter: chapter,
      type,
      resolved: false,
    };

    scratchpad.value = {
      ...scratchpad.value,
      tempNotes: [...scratchpad.value.tempNotes, note],
    };

    onSave?.('scratchpad', scratchpad.value);
  }

  /**
   * 标记笔记已解决
   */
  function resolveNote(noteId: string): void {
    scratchpad.value = {
      ...scratchpad.value,
      tempNotes: scratchpad.value.tempNotes.map(n =>
        n.id === noteId ? { ...n, resolved: true } : n
      ),
    };
    onSave?.('scratchpad', scratchpad.value);
  }

  /**
   * 获取未解决的笔记
   */
  function getUnresolvedNotes(): typeof scratchpad.value.tempNotes {
    return scratchpad.value.tempNotes.filter(n => !n.resolved);
  }

  // ============================================================
  // 导出/导入
  // ============================================================

  /**
   * 导出所有数据
   */
  function exportAll(): {
    state: ProjectState | null;
    index: EntityIndex;
    scratchpad: MemoryScratchpad;
  } {
    return {
      state: state.value,
      index: index.value,
      scratchpad: scratchpad.value,
    };
  }

  /**
   * 获取内存摘要（用于上下文注入）
   */
  function getMemorySummary(chapters: number[]): string {
    if (!state.value) return '';

    const lines: string[] = [];

    // 当前进度
    lines.push(`【当前进度】第${state.value.meta.currentChapter}章 / 共${state.value.meta.totalWordCount.toLocaleString()}字`);

    // 已解锁地点
    if (state.value.unlockedSettings.locations.length > 0) {
      lines.push(`【已到达地点】${state.value.unlockedSettings.locations.join('、')}`);
    }

    // 活跃伏笔
    const activeFores = Object.entries(state.value.foreshadowStatus)
      .filter(([_, f]) => f.status === 'buried' || f.status === 'developed')
      .slice(0, 3);

    if (activeFores.length > 0) {
      lines.push('【活跃伏笔】');
      for (const [id, f] of activeFores) {
        lines.push(`- ${id}（埋于第${f.buriedChapter}章）`);
      }
    }

    // 最近章节摘要
    const recentSummaries = getChapterSummaries(
      chapters.filter(c => c >= state.value!.meta.currentChapter - 5)
    );

    if (recentSummaries.length > 0) {
      lines.push('\n【近几章摘要】');
      for (const s of recentSummaries.slice(-3)) {
        lines.push(`- 第${s.chapter}章：${s.summary.slice(0, 100)}...`);
      }
    }

    return lines.join('\n');
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 状态
    state,
    index,
    scratchpad,

    // 计算属性
    totalWordCount,
    currentChapter,
    unlockedLocations,
    unlockedCharacters,
    activeForeshadows,
    entityList,
    recentEvents,

    // 初始化
    initialize,
    loadFromData,
    createDefaultState,

    // 状态更新
    updateProgress,
    unlockSetting,
    unlockSettings,

    // 伏笔追踪
    addForeshadow,
    updateForeshadowStatus,
    mentionForeshadow,
    getForeshadowStatus,

    // 角色状态
    updateCharacterStatus,
    getCharacterStatus,

    // 实体索引
    addEntity,
    findEntity,
    incrementMentions,
    addRelation,
    addEvent,
    queryEntities,

    // 章节摘要
    addChapterSummary,
    getChapterSummary,
    getChapterSummaries,
    getSummariesText,

    // 临时笔记
    addTempNote,
    resolveNote,
    getUnresolvedNotes,

    // 导出/导入
    exportAll,
    getMemorySummary,
  };
}

// ============================================================
// 类型导出（必须在函数定义之后）
// ============================================================

export type UseMemorySystemReturn = ReturnType<typeof useMemorySystem>;
