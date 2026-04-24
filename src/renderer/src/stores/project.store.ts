import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project, Volume, Chapter, Character, WorldSchema, Foreshadow, PlotNode, LocationLevel, RuleCategory, FactionRelation } from '@/types/project';

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

  // Getters
  const totalWordCount = computed(() => {
    return chapters.value.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
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
        chapters.value = result.chapters || [];
        characters.value = result.characters || [];
        worldSchema.value = result.worldSchema || { locations: [], rules: [], factions: [] };
        foreshadows.value = result.foreshadows || [];
        plotOutline.value = result.plotOutline || [];
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

  async function saveCurrentProject() {
    if (!currentProject.value) return;
    
    const projectToSave: Project = JSON.parse(JSON.stringify({
      ...currentProject.value,
      volumes: volumes.value,
      chapters: chapters.value,
      characters: characters.value,
      worldSchema: worldSchema.value,
      foreshadows: foreshadows.value,
    }));
    
    try {
      await window.electronAPI.saveProject(projectToSave);
      // Update local list
      const index = projects.value.findIndex(p => p.id === projectToSave.id);
      if (index >= 0) {
        projects.value[index] = projectToSave;
      } else {
        projects.value.unshift(projectToSave);
      }
    } catch (error) {
      console.error('Failed to save project:', error);
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
    };
    
    chapters.value.push(newChapter);
    currentChapterId.value = newChapter.id;
    await saveCurrentProject();
    return newChapter;
  }

  async function updateChapter(id: string, updates: Partial<Chapter>) {
    const index = chapters.value.findIndex(c => c.id === id);
    if (index !== -1) {
      chapters.value[index] = {
        ...chapters.value[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
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

  /**
   * 解析并填充角色关系中的 characterId
   * 在项目创建后调用，根据 targetName 填充对应的 characterId
   */
  function resolveCharacterRelationships() {
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
      saveCurrentProject();
    }
  }

  /**
   * 批量创建项目后初始化
   * 包含角色关系解析等后处理
   */
  async function finalizeProjectCreation(projectId: string) {
    await loadProject(projectId);
    resolveCharacterRelationships();
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
        }
        return result;
      }
      return null;
    } catch (error) {
      console.error('Failed to update project:', error);
      return null;
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
  };
});
