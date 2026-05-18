/**
 * 合同管理器
 * 基于 webnovel-writer-master 的合同驱动架构
 * 
 * 合同系统是整个写作系统的"真理源"
 * MASTER_SETTING.json → Volume_*.json → Chapter_*.json
 */

import { ref, computed, shallowRef } from 'vue';
import type {
  MasterContract,
  VolumeContract,
  ChapterContract,
  ContractStatus,
  ForeshadowContract,
  CharacterContract,
} from '@/types/contract';
import type { GeneratedOutline, GeneratedChapter } from '@/types/inspiration';
import { matchGenreProfile } from '@/data/genre-profiles';

// ============================================================
// Composable 定义
// ============================================================

export interface UseContractManagerOptions {
  projectId: string;
  onSave?: (type: 'master' | 'volume' | 'chapter', data: any) => void;
}

export function useContractManager(options: UseContractManagerOptions) {
  const { projectId, onSave } = options;

  // 状态
  const masterContract = shallowRef<MasterContract | null>(null);
  const volumeContracts = shallowRef<Map<string, VolumeContract>>(new Map());
  const chapterContracts = shallowRef<Map<string, ChapterContract>>(new Map());

  // 计算属性
  const hasContract = computed(() => masterContract.value !== null);

  const volumes = computed(() => Array.from(volumeContracts.value.values()));

  const chapters = computed(() => Array.from(chapterContracts.value.values()).sort(
    (a, b) => a.meta.chapterNumber - b.meta.chapterNumber
  ));

  const activeForeshadows = computed(() => {
    if (!masterContract.value) return [];
    return masterContract.value.coreForeshadows.filter(
      f => f.status !== 'revealed' && f.status !== 'forgotten'
    );
  });

  const activeCharacters = computed(() => {
    if (!masterContract.value) return [];
    return masterContract.value.characters.filter(c => c.role !== 'supporting');
  });

  // ============================================================
  // 初始化
  // ============================================================

  /**
   * 从大纲初始化合同系统
   */
  function initializeFromOutline(outline: GeneratedOutline): void {
    // 创建项目级合同
    masterContract.value = createMasterContract(outline);

    // 创建卷级合同
    const volumeMap = new Map<string, VolumeContract>();
    const chapterCount = outline.chapters?.length || 30;
    const volumeCount = Math.ceil(chapterCount / 30); // 每卷约30章
    
    for (let i = 0; i < volumeCount; i++) {
      const startChapter = i * 30 + 1;
      const endChapter = Math.min((i + 1) * 30, chapterCount);
      const volume = createVolumeContract(i + 1, startChapter, endChapter);
      volumeMap.set(volume.meta.volumeId, volume);
    }
    volumeContracts.value = volumeMap;

    // 创建章节合同
    const chapterMap = new Map<string, ChapterContract>();
    if (outline.chapters) {
      for (const ch of outline.chapters) {
        const volumeId = getVolumeId(ch.number, volumeMap);
        const chapter = createChapterContract(ch, volumeId);
        chapterMap.set(chapter.meta.chapterId, chapter);
      }
    }
    chapterContracts.value = chapterMap;
  }

  /**
   * 创建项目级合同
   */
  function createMasterContract(outline: GeneratedOutline): MasterContract {
    const genreProfile = matchGenreProfile(outline.genres || []);
    
    return {
      meta: {
        projectId,
        title: outline.title,
        genre: genreProfile.id as any,
        targetWordCount: outline.estimatedWordCount,
        chapterCount: outline.chapters?.length || 30,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
      },
      
      genreProfile: {
        id: genreProfile.id,
        name: genreProfile.name,
        hooks: {
          opening: genreProfile.hooks.opening,
          chapterEnd: genreProfile.hooks.chapterEnd,
          pacing: genreProfile.pacing as any,
        },
        coolpoints: {
          types: genreProfile.coolpoints.primary,
          comboInterval: genreProfile.coolpoints.comboInterval,
          density: genreProfile.coolpoints.density.optimal,
        },
        pacingRedLines: genreProfile.pacing as any,
      },
      
      coreSetting: outline.coreSetting as any || {
        worldType: 'urban',
        powerSystem: 'modern',
        goldenFinger: {
          type: 'system',
          name: '系统',
          style: 'game',
          visibility: 'immediate',
          cost: '完成任务',
        },
        timeSetting: {
          era: 'modern',
          timeline: 'linear',
        },
      },
      
      characters: outline.characters?.map((c, i) => createCharacterContract(c, i === 0)) || [],
      
      creativeConstraints: outline.creativeConstraints as any || {
        antiTrope: '',
        hardConstraints: [],
        protagonistFlaw: '',
        antagonistMirror: '',
      },
      
      strands: outline.strands as any || {
        quest: { mainConflict: '', milestones: [] },
        fire: { romanceType: 'mutual', milestones: [] },
        constellation: { revealPlan: [] },
      },
      
      coreForeshadows: outline.foreshadows?.map((f, i) => ({
        id: `fs-${Date.now()}-${i}`,
        hint: f.hint,
        type: f.type || 'mystery',
        buriedChapter: f.suggestedChapter || 1,
        revealChapter: 0,
        status: 'buried' as const,
      })) || [],
      
      powerSystem: {
        levels: [],
        rules: [],
        constraints: [],
      },
    };
  }

  /**
   * 创建角色合同
   */
  function createCharacterContract(char: any, isProtagonist: boolean): CharacterContract {
    return {
      id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: char.name,
      role: isProtagonist ? 'protagonist' : char.role || 'supporting',
      description: char.description || '',
      personality: char.personality || [],
      appearance: char.appearance,
      abilities: char.abilities,
      background: char.background,
      relationships: (char.relationships || []).map((r: any) => ({
        targetName: r.targetName || r.name || '',
        type: r.type || 'neutral',
        description: r.description || '',
        strength: 0.5,
      })),
      growth: {
        currentStage: 1,
        stages: [],
      },
    };
  }

  /**
   * 创建卷级合同
   */
  function createVolumeContract(
    volumeNumber: number,
    startChapter: number,
    endChapter: number
  ): VolumeContract {
    return {
      meta: {
        volumeId: `vol-${volumeNumber}`,
        volumeNumber,
        title: `第${volumeNumber}卷`,
        startChapter,
        endChapter,
        targetWordCount: (endChapter - startChapter + 1) * 3000,
      },
      overview: {
        theme: '',
        mainConflict: '',
        subplots: [],
      },
      characters: {
        added: [],
        arcs: [],
      },
      strandProgress: {
        quest: {
          currentStage: 1,
          stages: [],
          conflicts: [],
        },
        fire: {
          romanceType: 'mutual',
          currentStage: 1,
          milestones: [],
        },
        constellation: {
          revealedRules: [],
          revealedMysteries: [],
          nextReveal: null,
        },
      },
      foreshadows: [],
      climax: {
        chapter: endChapter,
        description: '',
        type: 'battle',
      },
    };
  }

  /**
   * 创建章节合同
   */
  function createChapterContract(
    chapter: GeneratedChapter,
    volumeId: string
  ): ChapterContract {
    return {
      meta: {
        chapterId: `ch-${chapter.number}`,
        chapterNumber: chapter.number,
        volumeId,
        title: chapter.title,
        targetWordCount: chapter.wordCount || 3000,
        status: 'draft',
      },
      cbn: {
        situation: chapter.cbn?.situation || '',
        characterStatus: chapter.cbn?.characterStatus || '',
        pendingIssues: [],
        hook: {
          type: 'conflict',
          description: '',
          details: {},
        },
      },
      cpns: (chapter.cpns || []).map((cpn, i) => ({
        id: `cpn-${chapter.number}-${i}`,
        order: i + 1,
        type: cpn.type as any,
        description: cpn.description,
        expectedLength: Math.floor((chapter.wordCount || 3000) / Math.max(1, chapter.cpns?.length || 3)),
        strand: cpn.strand as any,
      })),
      cen: {
        resolution: chapter.cen?.resolution || '',
        newHook: {
          type: 'cliffhanger',
          description: '',
          details: {},
        },
      },
      charactersPresent: [],
      location: '',
      constraints: {
        mustInclude: [],
        mustNotInclude: [],
        callbacks: [],
      },
      foreshadowOps: (chapter.foreshadowOps || []).map((op, i) => ({
        id: `fop-${Date.now()}-${i}`,
        ...op,
        chapter: chapter.number,
      })),
    };
  }

  // ============================================================
  // 卷级操作
  // ============================================================

  /**
   * 获取当前卷
   */
  function getCurrentVolume(): VolumeContract | null {
    const volumes = Array.from(volumeContracts.value.values());
    return volumes.find(v => v.meta.volumeNumber === 1) || volumes[0] || null;
  }

  /**
   * 获取指定卷
   */
  function getVolume(volumeId: string): VolumeContract | undefined {
    return volumeContracts.value.get(volumeId);
  }

  /**
   * 更新卷合同
   */
  function updateVolume(volumeId: string, updates: Partial<VolumeContract>): void {
    const volume = volumeContracts.value.get(volumeId);
    if (volume) {
      const updated = { ...volume, ...updates };
      const newMap = new Map(volumeContracts.value);
      newMap.set(volumeId, updated);
      volumeContracts.value = newMap;
      onSave?.('volume', updated);
    }
  }

  // ============================================================
  // 章节级操作
  // ============================================================

  /**
   * 获取章节合同
   */
  function getChapter(chapterId: string): ChapterContract | undefined {
    return chapterContracts.value.get(chapterId);
  }

  /**
   * 获取指定章节
   */
  function getChapterByNumber(chapterNumber: number): ChapterContract | undefined {
    return Array.from(chapterContracts.value.values()).find(
      c => c.meta.chapterNumber === chapterNumber
    );
  }

  /**
   * 更新章节合同
   */
  function updateChapter(chapterId: string, updates: Partial<ChapterContract>): void {
    const chapter = chapterContracts.value.get(chapterId);
    if (chapter) {
      const updated = { ...chapter, ...updates };
      const newMap = new Map(chapterContracts.value);
      newMap.set(chapterId, updated);
      chapterContracts.value = newMap;
      onSave?.('chapter', updated);
    }
  }

  /**
   * 更新章节合同状态
   */
  function updateChapterStatus(chapterId: string, status: ContractStatus): void {
    updateChapter(chapterId, {
      meta: { ...chapterContracts.value.get(chapterId)?.meta, status },
    });
  }

  /**
   * 锁定章节合同
   */
  function lockChapter(chapterId: string): void {
    updateChapterStatus(chapterId, 'locked');
  }

  /**
   * 标记章节完成
   */
  function completeChapter(chapterId: string): void {
    updateChapterStatus(chapterId, 'completed');
  }

  // ============================================================
  // 持久化操作（需要外部实现存储）
  // ============================================================

  /**
   * 保存主合同
   */
  async function saveMasterContract(contract: MasterContract): Promise<void> {
    onSave?.('master', contract);
  }

  /**
   * 保存卷合同
   */
  async function saveVolumeContract(contract: VolumeContract): Promise<void> {
    onSave?.('volume', contract);
  }

  /**
   * 保存章节合同
   */
  async function saveChapterContract(contract: ChapterContract): Promise<void> {
    onSave?.('chapter', contract);
  }

  /**
   * 加载主合同
   */
  async function loadMasterContract(projectId: string): Promise<MasterContract | null> {
    return masterContract.value;
  }

  /**
   * 加载所有章节合同
   */
  async function loadAllChapterContracts(projectId: string): Promise<ChapterContract[]> {
    return Array.from(chapterContracts.value.values());
  }

  // ============================================================
  // 伏笔操作
  // ============================================================

  /**
   * 添加伏笔
   */
  function addForeshadow(foreshadow: Omit<ForeshadowContract, 'id'>): void {
    if (!masterContract.value) return;
    
    const newForeshadow: ForeshadowContract = {
      ...foreshadow,
      id: `fs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    
    masterContract.value = {
      ...masterContract.value,
      coreForeshadows: [...masterContract.value.coreForeshadows, newForeshadow],
    };
    
    onSave?.('master', masterContract.value);
  }

  /**
   * 更新伏笔状态
   */
  function updateForeshadowStatus(
    foreshadowId: string,
    status: ForeshadowContract['status'],
    revealChapter?: number
  ): void {
    if (!masterContract.value) return;
    
    const foreshadows = masterContract.value.coreForeshadows.map(f => {
      if (f.id === foreshadowId) {
        return {
          ...f,
          status,
          revealChapter: revealChapter || f.revealChapter,
        };
      }
      return f;
    });
    
    masterContract.value = {
      ...masterContract.value,
      coreForeshadows: foreshadows,
    };
    
    onSave?.('master', masterContract.value);
  }

  /**
   * 揭示伏笔
   */
  function revealForeshadow(foreshadowId: string, chapterNumber: number): void {
    updateForeshadowStatus(foreshadowId, 'revealed', chapterNumber);
  }

  // ============================================================
  // 角色操作
  // ============================================================

  /**
   * 添加角色
   */
  function addCharacter(character: Omit<CharacterContract, 'id'>): void {
    if (!masterContract.value) return;
    
    const newCharacter: CharacterContract = {
      ...character,
      id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
    
    masterContract.value = {
      ...masterContract.value,
      characters: [...masterContract.value.characters, newCharacter],
    };
    
    onSave?.('master', masterContract.value);
  }

  /**
   * 更新角色
   */
  function updateCharacter(characterId: string, updates: Partial<CharacterContract>): void {
    if (!masterContract.value) return;
    
    const characters = masterContract.value.characters.map(c => {
      if (c.id === characterId) {
        return { ...c, ...updates };
      }
      return c;
    });
    
    masterContract.value = {
      ...masterContract.value,
      characters,
    };
    
    onSave?.('master', masterContract.value);
  }

  /**
   * 获取角色
   */
  function getCharacter(characterId: string): CharacterContract | undefined {
    return masterContract.value?.characters.find(c => c.id === characterId);
  }

  /**
   * 获取主角
   */
  function getProtagonist(): CharacterContract | undefined {
    return masterContract.value?.characters.find(c => c.role === 'protagonist');
  }

  // ============================================================
  // 导出/导入
  // ============================================================

  /**
   * 导出项目合同JSON
   */
  function exportMasterContract(): string {
    return JSON.stringify(masterContract.value, null, 2);
  }

  /**
   * 导入项目合同JSON
   */
  function importMasterContract(json: string): void {
    try {
      masterContract.value = JSON.parse(json);
    } catch (e) {
      console.error('Failed to import master contract:', e);
    }
  }

  /**
   * 获取合同摘要（用于上下文注入）
   */
  function getContractSummary(): string {
    if (!masterContract.value) return '';

    const contract = masterContract.value;
    const lines: string[] = [];

    lines.push(`【项目】${contract.meta.title}`);
    lines.push(`【题材】${contract.genreProfile.name}`);
    lines.push(`【目标】${contract.meta.targetWordCount}字 / ${contract.meta.chapterCount}章`);

    // 核心设定
    lines.push('\n【核心设定】');
    lines.push(`- 世界：${contract.coreSetting.worldType}`);
    lines.push(`- 力量体系：${contract.coreSetting.powerSystem}`);
    lines.push(`- 金手指：${contract.coreSetting.goldenFinger.name}（${contract.coreSetting.goldenFinger.style}风格）`);

    // 主要角色
    const mainChars = contract.characters.filter(c => 
      c.role === 'protagonist' || c.role === 'antagonist' || c.role === 'love_interest'
    );
    lines.push('\n【主要角色】');
    for (const char of mainChars) {
      lines.push(`- ${char.name}（${char.role}）：${char.description.slice(0, 50)}...`);
    }

    // 活跃伏笔
    const activeForeshadows = contract.coreForeshadows.filter(f => f.status === 'buried');
    if (activeForeshadows.length > 0) {
      lines.push('\n【活跃伏笔】');
      for (const f of activeForeshadows.slice(0, 5)) {
        lines.push(`- ${f.hint}（埋于第${f.buriedChapter}章）`);
      }
    }

    return lines.join('\n');
  }

  // ============================================================
  // 辅助函数
  // ============================================================

  function getVolumeId(chapterNumber: number, volumeMap?: Map<string, VolumeContract>): string {
    const map = volumeMap || volumeContracts.value;
    for (const volume of map.values()) {
      if (chapterNumber >= volume.meta.startChapter && chapterNumber <= volume.meta.endChapter) {
        return volume.meta.volumeId;
      }
    }
    return 'vol-1';
  }

  // ============================================================
  // 返回
  // ============================================================

  return {
    // 状态
    masterContract,
    volumeContracts,
    chapterContracts,

    // 计算属性
    hasContract,
    volumes,
    chapters,
    activeForeshadows,
    activeCharacters,

    // 初始化
    initializeFromOutline,

    // 卷操作
    getCurrentVolume,
    getVolume,
    updateVolume,

    // 章节操作
    getChapter,
    getChapterByNumber,
    updateChapter,
    updateChapterStatus,
    lockChapter,
    completeChapter,

    // 持久化
    saveMasterContract,
    saveVolumeContract,
    saveChapterContract,
    loadMasterContract,
    loadAllChapterContracts,

    // 伏笔操作
    addForeshadow,
    updateForeshadowStatus,
    revealForeshadow,

    // 角色操作
    addCharacter,
    updateCharacter,
    getCharacter,
    getProtagonist,

    // 导出/导入
    exportMasterContract,
    importMasterContract,
    getContractSummary,
  };
}
