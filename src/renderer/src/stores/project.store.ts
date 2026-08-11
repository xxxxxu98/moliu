import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { 
  Project, Volume, Chapter, Character, WorldSchema, Foreshadow, PlotNode, LocationLevel, RuleCategory, FactionRelation,
  EmotionGoal, ConflictDesign, CoolPointDesign, StoryLines
} from '@/types/project';
import type { ChapterMemory, PlotThread, CharacterArc, MemoryConfig } from '@/types/project';
import { DEFAULT_MEMORY_CONFIG } from '@/types/project';

export const useProjectStore = defineStore('project', () => {
  // State
  const currentProject = ref<Project | null>(null);
  const projects = ref<Project[]>([]);
  const chapters = ref<Chapter[]>([]);
  const volumes = ref<Volume[]>([]);
  const characters = ref<Character[]>([]);
  const worldSchema = ref<WorldSchema>({ locations: [], rules: [], factions: [] });
  const foreshadows = ref<Foreshadow[]>([]);
  const plotOutline = ref<PlotNode[]>([]);
  const currentChapterId = ref<string | null>(null);
  const isLoading = ref(false);

  // 记忆系统状态
  const chapterMemories = ref<ChapterMemory[]>([]);
  const plotThreads = ref<PlotThread[]>([]);
  const characterArcs = ref<CharacterArc[]>([]);
  const memoryConfig = ref<MemoryConfig>(DEFAULT_MEMORY_CONFIG);

  // 大纲增强系统状态
  const emotionGoal = ref<EmotionGoal | null>(null);
  const conflictDesign = ref<ConflictDesign | null>(null);
  const coolPointDesign = ref<CoolPointDesign | null>(null);
  const storyLines = ref<StoryLines | null>(null);

  // Getters
  const totalWordCount = computed(() => {
    return chapters.value.reduce(
      (sum, ch) => sum + (ch.content?.length ?? ch.wordCount ?? 0),
      0
    );
  });

  const currentChapter = computed(() => {
    return chapters.value.find(c => c.id === currentChapterId.value) || chapters.value[0] || null;
  });

  const sortedVolumes = computed(() => {
    return [...volumes.value].sort((a, b) => a.orderIndex - b.orderIndex);
  });

  const sortedChapters = computed(() => {
    return [...chapters.value].sort((a, b) => a.orderIndex - b.orderIndex);
  });

  const resolvedForeshadowCount = computed(() => {
    return foreshadows.value.filter(f => f.status === 'resolved').length;
  });

  const foreshadowResolutionRate = computed(() => {
    if (foreshadows.value.length === 0) return 0;
    return Math.round((resolvedForeshadowCount.value / foreshadows.value.length) * 100);
  });

  // Actions
  async function loadProjects() {
    isLoading.value = true;
    try {
      const result = await window.electronAPI.listProjects() as Project[];
      projects.value = result || [];
      // 自动计算每个项目的 wordCount（与编辑器一致：content.length）
      projects.value.forEach(p => {
        (p.chapters || []).forEach(ch => {
          if (typeof ch.content === 'string') {
            ch.wordCount = ch.content.length;
          }
        });
        p.wordCount = (p.chapters || []).reduce(
          (sum, ch) => sum + (ch.content?.length ?? ch.wordCount ?? 0),
          0
        );
      });
    } catch (error) {
      console.error('Failed to load projects:', error);
      projects.value = [];
    } finally {
      isLoading.value = false;
    }
  }

  async function loadProject(id: string) {
    isLoading.value = true;
    try {
      const result = await window.electronAPI.getProject(id) as Project | null;
      if (result) {
        currentProject.value = result;
        volumes.value = result.volumes || [];
        chapters.value = (result.chapters || []).map(ch => ({
          ...ch,
          wordCount: typeof ch.content === 'string' ? ch.content.length : (ch.wordCount || 0),
        }));
        characters.value = result.characters || [];
        worldSchema.value = result.worldSchema || { locations: [], rules: [], factions: [] };
        foreshadows.value = result.foreshadows || [];
        plotOutline.value = result.plotOutline || [];
        chapterMemories.value = result.chapterMemories || [];
        // 加载大纲增强系统数据
        emotionGoal.value = result.emotionGoal || null;
        conflictDesign.value = result.conflictDesign || null;
        coolPointDesign.value = result.coolPointDesign || null;
        storyLines.value = result.storyLines || null;
        // Set first chapter as current
        if (chapters.value.length > 0) {
          currentChapterId.value = sortedChapters.value[0]?.id || null;
        } else {
          currentChapterId.value = null;
        }
      }
      return result;
    } catch (error) {
      console.error('Failed to load project:', error);
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveCurrentProject(): Promise<Project | null> {
    if (!currentProject.value) return null;
    
    // 同步章节字数与项目总字数（与编辑器一致：content.length）
    chapters.value.forEach(ch => {
      if (typeof ch.content === 'string') {
        ch.wordCount = ch.content.length;
      }
    });
    const calculatedWordCount = chapters.value.reduce(
      (sum, ch) => sum + (ch.content?.length ?? ch.wordCount ?? 0),
      0
    );
    
    const projectToSave: Project = JSON.parse(JSON.stringify({
      ...currentProject.value,
      wordCount: calculatedWordCount,
      volumes: volumes.value,
      chapters: chapters.value,
      characters: characters.value,
      worldSchema: worldSchema.value,
      foreshadows: foreshadows.value,
      chapterMemories: chapterMemories.value,
      emotionGoal: emotionGoal.value,
      conflictDesign: conflictDesign.value,
      coolPointDesign: coolPointDesign.value,
      storyLines: storyLines.value,
    }));
    
    try {
      await window.electronAPI.saveProject(projectToSave);
      // 保存成功后的规范化快照才是 renderer 唯一真源，避免 currentProject 与独立 refs 分叉。
      currentProject.value = projectToSave;
      // Update local list
      const index = projects.value.findIndex(p => p.id === projectToSave.id);
      if (index >= 0) {
        projects.value[index] = projectToSave;
      } else {
        projects.value.unshift(projectToSave);
      }
      return projectToSave;
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  // Chapter operations
  function setCurrentChapter(chapterId: string | null) {
    currentChapterId.value = chapterId;
  }

  async function createChapter(volumeId: string): Promise<Chapter | null> {
    if (!currentProject.value) return null;
    
    const volumeChapters = chapters.value.filter(c => c.volumeId === volumeId);
    const newChapter: Chapter = {
      id: `chapter-${Date.now()}`,
      volumeId,
      title: `第${volumeChapters.length + 1}章`,
      content: '',
      wordCount: 0,
      orderIndex: volumeChapters.length,
      version: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      writeStatus: 'pending',
    };
    
    chapters.value.push(newChapter);
    currentChapterId.value = newChapter.id;
    await saveCurrentProject();
    return newChapter;
  }

  async function updateChapter(id: string, updates: Partial<Chapter>) {
    const index = chapters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      const next: Chapter = {
        ...chapters.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      // 与编辑器口径一致：有正文时以 content.length 为准
      if (typeof next.content === 'string') {
        next.wordCount = next.content.length;
      }
      chapters.value[index] = next;
      // 同步更新当前项目的总字数
      if (currentProject.value) {
        currentProject.value.wordCount = chapters.value.reduce(
          (sum, ch) => sum + (ch.content?.length ?? ch.wordCount ?? 0),
          0
        );
      }
      await saveCurrentProject();
    }
  }

  async function deleteChapter(id: string) {
    const index = chapters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      chapters.value.splice(index, 1);
      if (currentChapterId.value === id) {
        currentChapterId.value = chapters.value[0]?.id || null;
      }
      // 同步更新当前项目的总字数
      if (currentProject.value) {
        currentProject.value.wordCount = chapters.value.reduce(
          (sum, ch) => sum + (ch.content?.length ?? ch.wordCount ?? 0),
          0
        );
      }
      await saveCurrentProject();
    }
  }

  // Character operations
  async function createCharacter(character: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>): Promise<Character | null> {
    if (!currentProject.value) return null;
    
    const newCharacter: Character = {
      ...character,
      id: `char-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    characters.value.push(newCharacter);
    await saveCurrentProject();
    return newCharacter;
  }

  async function updateCharacter(id: string, updates: Partial<Character>) {
    const index = characters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      characters.value[index] = {
        ...characters.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await saveCurrentProject();
    }
  }

  async function deleteCharacter(id: string) {
    const index = characters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      characters.value.splice(index, 1);
      await saveCurrentProject();
    }
  }

  // World Schema operations
  async function addLocation(location: { name: string; description?: string; level?: LocationLevel; parentId?: string }) {
    const newLocation = {
      id: `loc-${Date.now()}`,
      ...location,
      level: location.level || 'city',
    };
    worldSchema.value.locations.push(newLocation);
    await saveCurrentProject();
    return newLocation;
  }

  async function updateLocation(id: string, updates: Partial<{ name: string; description?: string; parentId?: string; level?: LocationLevel }>) {
    const index = worldSchema.value.locations.findIndex(l => l.id === id);
    if (index !== -1) {
      worldSchema.value.locations[index] = { ...worldSchema.value.locations[index], ...updates };
      await saveCurrentProject();
    }
  }

  async function deleteLocation(id: string) {
    worldSchema.value.locations = worldSchema.value.locations.filter(l => l.id !== id);
    await saveCurrentProject();
  }

  async function addFaction(faction: { name: string; description?: string; parentId?: string; relation?: FactionRelation }) {
    const newFaction = {
      id: `faction-${Date.now()}`,
      ...faction,
    };
    worldSchema.value.factions.push(newFaction);
    await saveCurrentProject();
    return newFaction;
  }

  async function updateFaction(id: string, updates: Partial<{ name: string; description?: string; parentId?: string; relation?: FactionRelation }>) {
    const index = worldSchema.value.factions.findIndex(f => f.id === id);
    if (index !== -1) {
      worldSchema.value.factions[index] = { ...worldSchema.value.factions[index], ...updates };
      await saveCurrentProject();
    }
  }

  async function deleteFaction(id: string) {
    worldSchema.value.factions = worldSchema.value.factions.filter(f => f.id !== id);
    await saveCurrentProject();
  }

  async function addWorldRule(rule: { name: string; description: string; locked: boolean; category?: RuleCategory; relatedRuleIds?: string[] }) {
    const newRule = {
      id: `rule-${Date.now()}`,
      ...rule,
      category: rule.category || 'custom',
    };
    worldSchema.value.rules.push(newRule);
    await saveCurrentProject();
    return newRule;
  }

  async function updateWorldRule(id: string, updates: Partial<{ name: string; description: string; locked: boolean; category?: RuleCategory; relatedRuleIds?: string[] }>) {
    const index = worldSchema.value.rules.findIndex(r => r.id === id);
    if (index !== -1) {
      worldSchema.value.rules[index] = { ...worldSchema.value.rules[index], ...updates };
      await saveCurrentProject();
    }
  }

  async function deleteWorldRule(id: string) {
    worldSchema.value.rules = worldSchema.value.rules.filter(r => r.id !== id);
    await saveCurrentProject();
  }

  // PlotNode operations
  async function createPlotNode(plot: Omit<PlotNode, 'id'>): Promise<PlotNode | null> {
    if (!currentProject.value) return null;
    
    const newPlot: PlotNode = {
      ...plot,
      id: `plot-${Date.now()}`,
    };
    
    plotOutline.value.push(newPlot);
    if (currentProject.value) {
      currentProject.value.plotOutline = plotOutline.value;
    }
    await saveCurrentProject();
    return newPlot;
  }

  async function updatePlotNode(id: string, updates: Partial<PlotNode>) {
    const index = plotOutline.value.findIndex(p => p.id === id);
    if (index !== -1) {
      plotOutline.value[index] = { ...plotOutline.value[index], ...updates };
      if (currentProject.value) {
        currentProject.value.plotOutline = plotOutline.value;
      }
      await saveCurrentProject();
    }
  }

  async function deletePlotNode(id: string) {
    plotOutline.value = plotOutline.value.filter(p => p.id !== id);
    if (currentProject.value) {
      currentProject.value.plotOutline = plotOutline.value;
    }
    await saveCurrentProject();
  }

  // Foreshadow operations
  async function createForeshadow(foreshadow: Omit<Foreshadow, 'id'>): Promise<Foreshadow | null> {
    if (!currentProject.value) return null;
    
    const newForeshadow: Foreshadow = {
      ...foreshadow,
      id: `foreshadow-${Date.now()}`,
    };
    
    foreshadows.value.push(newForeshadow);
    await saveCurrentProject();
    return newForeshadow;
  }

  async function updateForeshadow(id: string, updates: Partial<Foreshadow>) {
    const index = foreshadows.value.findIndex(f => f.id === id);
    if (index !== -1) {
      foreshadows.value[index] = { ...foreshadows.value[index], ...updates };
      await saveCurrentProject();
    }
  }

  async function deleteForeshadow(id: string) {
    const index = foreshadows.value.findIndex(f => f.id === id);
    if (index !== -1) {
      foreshadows.value.splice(index, 1);
      await saveCurrentProject();
    }
  }

  // ============================================
  // 记忆系统操作
  // ============================================

  /**
   * 添加章节记忆
   */
  function addChapterMemory(memory: ChapterMemory) {
    // 检查是否已存在，存在则更新
    const existingIndex = chapterMemories.value.findIndex(m => m.chapterId === memory.chapterId);
    if (existingIndex >= 0) {
      chapterMemories.value[existingIndex] = memory;
    } else {
      chapterMemories.value.push(memory);
    }
    // 按章节顺序排序
    chapterMemories.value.sort((a, b) => a.chapterIndex - b.chapterIndex);
  }

  /**
   * 获取章节记忆
   */
  function getChapterMemory(chapterId: string): ChapterMemory | undefined {
    return chapterMemories.value.find(m => m.chapterId === chapterId);
  }

  /**
   * 获取短期记忆（最近N章的完整记忆）
   */
  function getShortTermMemories(): ChapterMemory[] {
    const count = memoryConfig.value.shortTermChapterCount;
    return chapterMemories.value.slice(-count);
  }

  /**
   * 获取中期记忆（更早章节的摘要）
   */
  function getMediumTermMemories(): ChapterMemory[] {
    const shortTermCount = memoryConfig.value.shortTermChapterCount;
    const mediumTermCount = memoryConfig.value.mediumTermChapterCount;
    const start = Math.max(0, chapterMemories.value.length - mediumTermCount - shortTermCount);
    const end = chapterMemories.value.length - shortTermCount;
    return chapterMemories.value.slice(start, end);
  }

  /**
   * 获取长期记忆（所有记忆的摘要）
   */
  function getLongTermSummary(): {
    allKeyEvents: string[];
    allLocations: string[];
    characterStates: { name: string; latestState: string; chapterIndex: number }[];
    activeForeshadows: string[];
    timeline: string[];
  } {
    const memories = chapterMemories.value;
    
    // 收集所有关键事件
    const allKeyEvents = memories.flatMap(m => m.keyEvents);
    
    // 收集所有地点
    const allLocations = [...new Set(memories.flatMap(m => m.locations))];
    
    // 收集角色最新状态
    const characterStateMap = new Map<string, { state: string; chapterIndex: number }>();
    memories.forEach(m => {
      m.characterStateChanges.forEach(change => {
        const existing = characterStateMap.get(change.characterName);
        if (!existing || m.chapterIndex > existing.chapterIndex) {
          characterStateMap.set(change.characterName, { state: change.detail, chapterIndex: m.chapterIndex });
        }
      });
    });
    const characterStates = Array.from(characterStateMap.entries()).map(([name, data]) => ({
      name,
      latestState: data.state,
      chapterIndex: data.chapterIndex,
    }));
    
    // 收集活跃伏笔
    const activeForeshadows = memories.flatMap(m => [...m.newForeshadows]);
    
    // 收集时间线标记
    const timeline = memories.filter(m => m.timelineMark).map(m => `${m.chapterIndex}: ${m.timelineMark}`);
    
    return {
      allKeyEvents,
      allLocations,
      characterStates,
      activeForeshadows,
      timeline,
    };
  }

  /**
   * 更新/创建情节线
   */
  function updatePlotThread(thread: PlotThread) {
    const index = plotThreads.value.findIndex(t => t.id === thread.id);
    if (index >= 0) {
      plotThreads.value[index] = thread;
    } else {
      plotThreads.value.push(thread);
    }
  }

  /**
   * 更新/创建角色弧线
   */
  function updateCharacterArc(arc: CharacterArc) {
    const index = characterArcs.value.findIndex(a => a.characterId === arc.characterId);
    if (index >= 0) {
      characterArcs.value[index] = arc;
    } else {
      characterArcs.value.push(arc);
    }
  }

  /**
   * 清除所有记忆
   */
  function clearMemories() {
    chapterMemories.value = [];
    plotThreads.value = [];
    characterArcs.value = [];
  }

  /**
   * 更新记忆配置
   */
  function updateMemoryConfig(updates: Partial<MemoryConfig>) {
    memoryConfig.value = { ...memoryConfig.value, ...updates };
  }

  /**
   * 根据章节ID列表获取相关记忆
   */
  function getMemoriesForChapters(chapterIds: string[]): ChapterMemory[] {
    return chapterMemories.value.filter(m => chapterIds.includes(m.chapterId));
  }

  /**
   * 解析并填充角色关系中的 characterId
   * 在项目创建后调用，根据 targetName 填充对应的 characterId
   */
  async function resolveCharacterRelationships(): Promise<void> {
    if (!currentProject.value) return;

    // 建立角色名到ID的映射
    const characterNameToId = new Map<string, string>();
    characters.value.forEach(char => {
      characterNameToId.set(char.name, char.id);
    });

    // 遍历所有角色，填充关系中的 characterId
    let hasUpdates = false;
    characters.value.forEach(char => {
      if (char.profile.relationships && char.profile.relationships.length > 0) {
        char.profile.relationships.forEach(rel => {
          if (!rel.characterId && rel.targetName) {
            const targetId = characterNameToId.get(rel.targetName);
            if (targetId) {
              rel.characterId = targetId;
              hasUpdates = true;
            }
          }
        });
      }
    });

    // 如果有更新，保存项目
    if (hasUpdates) {
      currentProject.value.characters = characters.value;
      await saveCurrentProject();
    }
  }

  /**
   * 批量创建项目后初始化
   * 包含角色关系解析等后处理
   */
  async function finalizeProjectCreation(projectId: string) {
    await loadProject(projectId);
    await resolveCharacterRelationships();
  }

  async function createProject(projectData: Partial<Project>): Promise<Project | null> {
    try {
      const newProject = await window.electronAPI.createProject({
        id: `proj-${Date.now()}`,
        name: projectData.name || '新项目',
        description: projectData.description || '',
        genre: projectData.genre || [],
        wordCount: 0,
        status: 'planning',
        volumes: [{
          id: `vol-${Date.now()}`,
          name: '第一卷',
          orderIndex: 0,
        }],
        chapters: [],
        characters: [],
        worldSchema: { locations: [], rules: [], factions: [] },
        foreshadows: [],
        plotOutline: [],
        ...projectData,
      }) as Project;
      
      projects.value.unshift(newProject);
      return newProject;
    } catch (error) {
      console.error('Failed to create project:', error);
      return null;
    }
  }

  async function updateProjectInfo(id: string, updates: Partial<Project>) {
    try {
      const result = await window.electronAPI.updateProject(id, updates) as Project | null;
      if (result) {
        const index = projects.value.findIndex(p => p.id === id);
        if (index >= 0) {
          projects.value[index] = result;
        }
        if (currentProject.value?.id === id) {
          currentProject.value = result;
          // 同步独立 ref，避免续写端读 currentProject.emotionGoal 等时拿到旧值/空值
          // （loadProject 之外唯一更新这些字段的地方，原本只更新 currentProject 不更新 ref）
          if (updates.emotionGoal !== undefined) emotionGoal.value = result.emotionGoal ?? null;
          if (updates.conflictDesign !== undefined) conflictDesign.value = result.conflictDesign ?? null;
          if (updates.coolPointDesign !== undefined) coolPointDesign.value = result.coolPointDesign ?? null;
          if (updates.storyLines !== undefined) storyLines.value = result.storyLines ?? null;
          if (updates.metadata !== undefined) currentProject.value.metadata = result.metadata;
        }
        return result;
      }
      return null;
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  }

  async function deleteProject(id: string) {
    try {
      await window.electronAPI.deleteProject(id);
      projects.value = projects.value.filter(p => p.id !== id);
      if (currentProject.value?.id === id) {
        currentProject.value = null;
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  }

  function setCurrentProject(project: Project | null) {
    currentProject.value = project;
  }

  function setProjects(list: Project[]) {
    projects.value = list;
  }

  function addProject(project: Project) {
    projects.value.unshift(project);
  }

  function updateProject(id: string, updates: Partial<Project>) {
    const index = projects.value.findIndex((p) => p.id === id);
    if (index !== -1) {
      projects.value[index] = { ...projects.value[index], ...updates };
    }
    if (currentProject.value?.id === id) {
      currentProject.value = { ...currentProject.value, ...updates };
    }
  }

  function setChapters(list: Chapter[]) {
    chapters.value = list;
  }

  function setPlotOutline(list: PlotNode[]) {
    plotOutline.value = list;
    if (currentProject.value) {
      currentProject.value.plotOutline = list;
    }
  }

  function setVolumes(list: Volume[]) {
    volumes.value = list;
  }

  function addVolume(volume: Volume) {
    volumes.value.push(volume);
  }

  async function updateVolume(id: string, updates: Partial<Volume>) {
    const index = volumes.value.findIndex(v => v.id === id);
    if (index !== -1) {
      volumes.value[index] = { ...volumes.value[index], ...updates };
      await saveCurrentProject();
    }
  }

  async function deleteVolume(id: string) {
    const index = volumes.value.findIndex(v => v.id === id);
    if (index !== -1) {
      volumes.value.splice(index, 1);
      // Also delete all chapters belonging to this volume
      chapters.value = chapters.value.filter(c => c.volumeId !== id);
      await saveCurrentProject();
    }
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading;
  }

  // ============================================
  // 大纲增强系统操作
  // ============================================

  /**
   * 更新情绪目标
   */
  async function updateEmotionGoal(goal: EmotionGoal) {
    emotionGoal.value = goal;
    if (currentProject.value) {
      currentProject.value.emotionGoal = goal;
    }
    await saveCurrentProject();
  }

  /**
   * 删除情绪目标
   */
  async function deleteEmotionGoal() {
    emotionGoal.value = null;
    if (currentProject.value) {
      currentProject.value.emotionGoal = undefined;
    }
    await saveCurrentProject();
  }

  /**
   * 更新矛盾设计
   */
  async function updateConflictDesign(design: ConflictDesign) {
    conflictDesign.value = design;
    if (currentProject.value) {
      currentProject.value.conflictDesign = design;
    }
    await saveCurrentProject();
  }

  /**
   * 删除矛盾设计
   */
  async function deleteConflictDesign() {
    conflictDesign.value = null;
    if (currentProject.value) {
      currentProject.value.conflictDesign = undefined;
    }
    await saveCurrentProject();
  }

  /**
   * 更新爽点设计
   */
  async function updateCoolPointDesign(design: CoolPointDesign) {
    coolPointDesign.value = design;
    if (currentProject.value) {
      currentProject.value.coolPointDesign = design;
    }
    await saveCurrentProject();
  }

  /**
   * 删除爽点设计
   */
  async function deleteCoolPointDesign() {
    coolPointDesign.value = null;
    if (currentProject.value) {
      currentProject.value.coolPointDesign = undefined;
    }
    await saveCurrentProject();
  }

  /**
   * 更新八条故事线
   */
  async function updateStoryLines(lines: StoryLines) {
    storyLines.value = lines;
    if (currentProject.value) {
      currentProject.value.storyLines = lines;
    }
    await saveCurrentProject();
  }

  /**
   * 删除八条故事线
   */
  async function deleteStoryLines() {
    storyLines.value = null;
    if (currentProject.value) {
      currentProject.value.storyLines = undefined;
    }
    await saveCurrentProject();
  }

  // ============================================
  // 强行完结操作
  // ============================================

  /**
   * 强行完结项目
   * 跳过所有完结条件检查，直接将项目状态设为 completed
   * 会生成完结报告，包含被跳过的伏笔和冲突
   */
  async function forceEndProject(): Promise<{
    success: boolean;
    skippedForeshadows: number;
    skippedConflicts: number;
    totalChapters: number;
    totalWordCount: number;
  } | null> {
    if (!currentProject.value) return null;

    // 统计被跳过的伏笔和冲突
    const skippedForeshadows = foreshadows.value.filter(
      f => f.status !== 'resolved' && f.status !== 'abandoned'
    ).length;

    const skippedConflicts = conflictDesign.value?.majorConflicts?.filter(
      c => c.status === 'pending' || c.status === 'active'
    ).length || 0;

    const totalChapters = chapters.value.length;
    const totalWordCount = chapters.value.reduce(
      (sum, ch) => sum + (ch.content?.length ?? ch.wordCount ?? 0),
      0
    );

    // 更新项目状态
    currentProject.value.status = 'completed';

    // 设置完结元数据
    if (!currentProject.value.metadata) {
      currentProject.value.metadata = {};
    }
    currentProject.value.metadata.endedAt = new Date().toISOString();
    currentProject.value.metadata.endedChapters = totalChapters;
    currentProject.value.metadata.endedWords = totalWordCount;
    currentProject.value.metadata.forceEnded = true;
    currentProject.value.metadata.skippedForeshadows = skippedForeshadows;
    currentProject.value.metadata.skippedConflicts = skippedConflicts;

    await saveCurrentProject();

    return {
      success: true,
      skippedForeshadows,
      skippedConflicts,
      totalChapters,
      totalWordCount,
    };
  }

  /**
   * 取消完结，恢复写作状态
   * 仅当项目状态为 completed 且 forceEnded 为 true 时可用
   */
  async function cancelForceEnd(): Promise<boolean> {
    if (!currentProject.value) return false;
    if (currentProject.value.status !== 'completed') return false;
    if (!currentProject.value.metadata?.forceEnded) return false;

    currentProject.value.status = 'writing';
    if (currentProject.value.metadata) {
      currentProject.value.metadata.endedAt = undefined;
      currentProject.value.metadata.endedChapters = undefined;
      currentProject.value.metadata.endedWords = undefined;
      currentProject.value.metadata.forceEnded = false;
      currentProject.value.metadata.skippedForeshadows = undefined;
      currentProject.value.metadata.skippedConflicts = undefined;
    }

    await saveCurrentProject();
    return true;
  }

  /**
   * 判断项目是否已被强行完结
   */
  const isForceEnded = computed(() => {
    return currentProject.value?.status === 'completed' &&
      currentProject.value?.metadata?.forceEnded === true;
  });

  /**
   * 判断项目是否已完结（自然或强行）
   */
  const isProjectCompleted = computed(() => {
    return currentProject.value?.status === 'completed';
  });

  return {
    currentProject,
    projects,
    chapters,
    volumes,
    characters,
    worldSchema,
    foreshadows,
    plotOutline,
    currentChapterId,
    isLoading,
    totalWordCount,
    currentChapter,
    sortedVolumes,
    sortedChapters,
    resolvedForeshadowCount,
    foreshadowResolutionRate,
    loadProjects,
    loadProject,
    saveCurrentProject,
    createProject,
    updateProjectInfo,
    deleteProject,
    setCurrentProject,
    setProjects,
    addProject,
    updateProject,
    setChapters,
    setPlotOutline,
    updateChapter,
    setVolumes,
    addVolume,
    updateVolume,
    deleteVolume,
    setLoading,
    // Chapter operations
    setCurrentChapter,
    createChapter,
    deleteChapter,
    // Character operations
    createCharacter,
    updateCharacter,
    deleteCharacter,
    // World Schema operations
    addLocation,
    updateLocation,
    deleteLocation,
    addFaction,
    updateFaction,
    deleteFaction,
    addWorldRule,
    updateWorldRule,
    deleteWorldRule,
    // PlotNode operations
    createPlotNode,
    updatePlotNode,
    deletePlotNode,
    // Foreshadow operations
    createForeshadow,
    updateForeshadow,
    deleteForeshadow,
    // Character relationship resolution
    resolveCharacterRelationships,
    finalizeProjectCreation,
    // 记忆系统操作
    chapterMemories,
    plotThreads,
    characterArcs,
    memoryConfig,
    addChapterMemory,
    getChapterMemory,
    getShortTermMemories,
    getMediumTermMemories,
    getLongTermSummary,
    updatePlotThread,
    updateCharacterArc,
    clearMemories,
    updateMemoryConfig,
    getMemoriesForChapters,
    // 大纲增强系统
    emotionGoal,
    conflictDesign,
    coolPointDesign,
    storyLines,
    updateEmotionGoal,
    deleteEmotionGoal,
    updateConflictDesign,
    deleteConflictDesign,
    updateCoolPointDesign,
    deleteCoolPointDesign,
    updateStoryLines,
    deleteStoryLines,
    // 强行完结
    forceEndProject,
    cancelForceEnd,
    isForceEnded,
    isProjectCompleted,
  };
});
