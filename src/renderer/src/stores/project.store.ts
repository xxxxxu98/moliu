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
