import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project, Volume, Chapter } from '@/types/project';

export const useProjectStore = defineStore('project', () => {
  // State
  const currentProject = ref<Project | null>(null);
  const projects = ref<Project[]>([]);
  const chapters = ref<Chapter[]>([]);
  const volumes = ref<Volume[]>([]);
  const isLoading = ref(false);

  // Getters
  const totalWordCount = computed(() => {
    return chapters.value.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
  });

  const currentChapter = computed(() => {
    return chapters.value[0] || null;
  });

  const sortedVolumes = computed(() => {
    return [...volumes.value].sort((a, b) => a.orderIndex - b.orderIndex);
  });

  const sortedChapters = computed(() => {
    return [...chapters.value].sort((a, b) => a.orderIndex - b.orderIndex);
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
    
    const projectToSave: Project = {
      ...currentProject.value,
      volumes: volumes.value,
      chapters: chapters.value,
    };
    
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

  function addChapter(chapter: Chapter) {
    chapters.value.push(chapter);
  }

  function updateChapter(id: string, updates: Partial<Chapter>) {
    const index = chapters.value.findIndex((c) => c.id === id);
    if (index !== -1) {
      chapters.value[index] = { ...chapters.value[index], ...updates };
    }
  }

  function setVolumes(list: Volume[]) {
    volumes.value = list;
  }

  function addVolume(volume: Volume) {
    volumes.value.push(volume);
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading;
  }

  return {
    currentProject,
    projects,
    chapters,
    volumes,
    isLoading,
    totalWordCount,
    currentChapter,
    sortedVolumes,
    sortedChapters,
    loadProjects,
    loadProject,
    saveCurrentProject,
    createProject,
    deleteProject,
    setCurrentProject,
    setProjects,
    addProject,
    updateProject,
    setChapters,
    addChapter,
    updateChapter,
    setVolumes,
    addVolume,
    setLoading,
  };
});
