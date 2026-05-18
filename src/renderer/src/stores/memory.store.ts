/**
 * Memory Store v2
 * Moliu v2.0 - 基于记忆系统的状态管理
 * 
 * 职责：
 * 1. 管理项目状态 (state.json)
 * 2. 管理实体索引 (index.db)
 * 3. 管理章节摘要 (summaries/)
 * 4. 管理便笺 (memory_scratchpad/)
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  ProjectState,
  EntityIndex,
  ChapterSummary,
  MemoryScratchpad,
  MemoryType,
} from "@/types/memory";
import { useMemorySystem } from "@/composables/new/useMemorySystem";

// ============================================================
// Store
// ============================================================

export const useMemoryStore = defineStore("memory-v2", () => {
  // Composables
  const memorySystem = useMemorySystem();

  // State
  const projectState = ref<ProjectState | null>(null);
  const entityIndexes = ref<EntityIndex[]>([]);
  const chapterSummaries = ref<ChapterSummary[]>([]);
  const scratchpads = ref<Map<string, MemoryScratchpad>>(new Map());
  const currentProjectId = ref<string | null>(null);
  const isLoading = ref(false);
  const isDirty = ref(false);

  // Getters
  const hasProject = computed(() => projectState.value !== null);

  const activeForeshadows = computed(() => {
    if (!projectState.value) return [];
    return projectState.value.foreshadows.filter((f) => f.status === "active");
  });

  const activeCharacters = computed(() => {
    if (!projectState.value) return [];
    return projectState.value.characters.filter((c) => c.status === "active");
  });

  const recentChapters = computed(() => {
    return [...chapterSummaries.value]
      .sort((a, b) => b.chapterNumber - a.chapterNumber)
      .slice(0, 5);
  });

  const totalWordCount = computed(() => {
    return chapterSummaries.value.reduce((sum, cs) => sum + cs.wordCount, 0);
  });

  const hasUnsavedChanges = computed(() => isDirty.value);

  // Actions
  async function loadProject(projectId: string) {
    isLoading.value = true;
    currentProjectId.value = projectId;

    try {
      // 加载项目状态
      const state = await memorySystem.getProjectState(projectId);
      projectState.value = state;

      // 加载实体索引
      const indexes = await memorySystem.getEntityIndexes(projectId);
      entityIndexes.value = indexes;

      // 加载章节摘要
      const summaries = await memorySystem.getChapterSummaries(projectId, 1, 9999);
      chapterSummaries.value = summaries;

      isDirty.value = false;
    } catch (error) {
      console.error("Failed to load project memory:", error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveProject() {
    if (!currentProjectId.value || !projectState.value) return;

    isLoading.value = true;
    try {
      await memorySystem.saveProjectState(projectState.value);
      isDirty.value = false;
    } catch (error) {
      console.error("Failed to save project memory:", error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  async function saveChapterSummary(summary: ChapterSummary) {
    if (!currentProjectId.value) return;

    try {
      await memorySystem.saveChapterSummary(currentProjectId.value, summary);

      // 更新本地缓存
      const index = chapterSummaries.value.findIndex(
        (cs) => cs.chapterNumber === summary.chapterNumber
      );
      if (index >= 0) {
        chapterSummaries.value[index] = summary;
      } else {
        chapterSummaries.value.push(summary);
      }

      isDirty.value = true;
    } catch (error) {
      console.error("Failed to save chapter summary:", error);
      throw error;
    }
  }

  async function updateEntityState(
    entityType: "character" | "foreshadow" | "location" | "event",
    entity: any
  ) {
    if (!currentProjectId.value) return;

    try {
      await memorySystem.updateEntityState(
        currentProjectId.value,
        entityType,
        entity
      );

      // 更新本地状态
      if (projectState.value) {
        const collection = getEntityCollection(entityType);
        const index = collection.findIndex((e: any) => e.id === entity.id);
        if (index >= 0) {
          collection[index] = entity;
        } else {
          collection.push(entity);
        }
      }

      isDirty.value = true;
    } catch (error) {
      console.error("Failed to update entity state:", error);
      throw error;
    }
  }

  async function addMemory(
    memoryType: MemoryType,
    content: string,
    metadata?: Record<string, any>
  ) {
    if (!currentProjectId.value) return;

    try {
      await memorySystem.addMemory(
        currentProjectId.value,
        memoryType,
        content,
        metadata
      );
      isDirty.value = true;
    } catch (error) {
      console.error("Failed to add memory:", error);
      throw error;
    }
  }

  async function searchMemories(query: string, limit?: number) {
    if (!currentProjectId.value) return [];

    try {
      return await memorySystem.searchMemories(
        currentProjectId.value,
        query,
        limit
      );
    } catch (error) {
      console.error("Failed to search memories:", error);
      return [];
    }
  }

  async function createBackup() {
    if (!currentProjectId.value) return null;

    try {
      return await memorySystem.createBackup(currentProjectId.value);
    } catch (error) {
      console.error("Failed to create backup:", error);
      throw error;
    }
  }

  async function restoreBackup(backupId: string) {
    if (!currentProjectId.value) return;

    try {
      await memorySystem.restoreBackup(currentProjectId.value, backupId);
      await loadProject(currentProjectId.value);
    } catch (error) {
      console.error("Failed to restore backup:", error);
      throw error;
    }
  }

  function getChapterSummary(chapterNumber: number): ChapterSummary | undefined {
    return chapterSummaries.value.find(
      (cs) => cs.chapterNumber === chapterNumber
    );
  }

  function getEntityCollection(entityType: string): any[] {
    if (!projectState.value) return [];

    switch (entityType) {
      case "character":
        return projectState.value.characters;
      case "foreshadow":
        return projectState.value.foreshadows;
      case "location":
        return projectState.value.locations;
      case "event":
        return projectState.value.events || [];
      default:
        return [];
    }
  }

  function clear() {
    projectState.value = null;
    entityIndexes.value = [];
    chapterSummaries.value = [];
    scratchpads.value.clear();
    currentProjectId.value = null;
    isDirty.value = false;
  }

  return {
    // State
    projectState,
    entityIndexes,
    chapterSummaries,
    scratchpads,
    currentProjectId,
    isLoading,
    isDirty,

    // Getters
    hasProject,
    activeForeshadows,
    activeCharacters,
    recentChapters,
    totalWordCount,
    hasUnsavedChanges,

    // Actions
    loadProject,
    saveProject,
    saveChapterSummary,
    updateEntityState,
    addMemory,
    searchMemories,
    createBackup,
    restoreBackup,
    getChapterSummary,
    getEntityCollection,
    clear,
  };
});
