/**
 * Contract Store v2
 * Moliu v2.0 - 基于合同驱动架构的合同状态管理
 * 
 * 职责：
 * 1. 管理 MasterContract、VolumeContract、ChapterContract
 * 2. 合同版本控制
 * 3. 与 composables 集成
 */

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  MasterContract,
  VolumeContract,
  ChapterContract,
  ProjectMeta,
} from "@/types/contract";
import { useContractManager } from "@/composables/new/useContractManager";

// ============================================================
// Types
// ============================================================

export interface ContractState {
  masterContract: MasterContract | null;
  volumeContracts: Map<string, VolumeContract>;
  chapterContracts: Map<number, ChapterContract>;
  currentVolumeId: string | null;
  currentChapterNumber: number | null;
  isDirty: boolean;
  lastSaved: string | null;
}

// ============================================================
// Store
// ============================================================

export const useContractStore = defineStore("contract-v2", () => {
  // 项目ID（需要在 loadContracts 时设置）
  const projectId = ref<string | null>(null);

  // 创建 contractManager 实例
  const contractManager = useContractManager({
    projectId: projectId.value || "default",
  });

  // State
  const masterContract = ref<MasterContract | null>(null);
  const volumeContracts = ref<Map<string, VolumeContract>>(new Map());
  const chapterContracts = ref<Map<number, ChapterContract>>(new Map());
  const currentVolumeId = ref<string | null>(null);
  const currentChapterNumber = ref<number | null>(null);
  const isDirty = ref(false);
  const lastSaved = ref<string | null>(null);
  const isLoading = ref(false);

  // Getters
  const hasMasterContract = computed(() => masterContract.value !== null);

  const currentVolume = computed(() => {
    if (!currentVolumeId.value) return null;
    return volumeContracts.value.get(currentVolumeId.value) || null;
  });

  const currentChapter = computed(() => {
    if (currentChapterNumber.value === null) return null;
    return chapterContracts.value.get(currentChapterNumber.value) || null;
  });

  const allChapters = computed(() => {
    return Array.from(chapterContracts.value.values()).sort(
      (a, b) => a.meta.chapterNumber - b.meta.chapterNumber
    );
  });

  const allVolumes = computed(() => {
    return Array.from(volumeContracts.value.values()).sort((a, b) => a.meta.volumeNumber - b.meta.volumeNumber);
  });

  const totalChapters = computed(() => chapterContracts.value.size);

  const unsavedChanges = computed(() => isDirty.value);

  // Actions
  function setMasterContract(contract: MasterContract | null) {
    masterContract.value = contract;
    isDirty.value = true;
  }

  function updateMasterContract(updates: Partial<MasterContract>) {
    if (masterContract.value) {
      masterContract.value = { ...masterContract.value, ...updates };
      isDirty.value = true;
    }
  }

  function addVolumeContract(contract: VolumeContract) {
    volumeContracts.value.set(contract.meta.volumeId, contract);
    isDirty.value = true;
  }

  function updateVolumeContract(volumeId: string, updates: Partial<VolumeContract>) {
    const existing = volumeContracts.value.get(volumeId);
    if (existing) {
      volumeContracts.value.set(volumeId, { ...existing, ...updates });
      isDirty.value = true;
    }
  }

  function removeVolumeContract(volumeId: string) {
    volumeContracts.value.delete(volumeId);
    isDirty.value = true;
  }

  function setChapterContract(chapterNumber: number, contract: ChapterContract) {
    chapterContracts.value.set(chapterNumber, contract);
    isDirty.value = true;
  }

  function updateChapterContract(chapterNumber: number, updates: Partial<ChapterContract>) {
    const existing = chapterContracts.value.get(chapterNumber);
    if (existing) {
      chapterContracts.value.set(chapterNumber, { ...existing, ...updates });
      isDirty.value = true;
    }
  }

  function removeChapterContract(chapterNumber: number) {
    chapterContracts.value.delete(chapterNumber);
    isDirty.value = true;
  }

  function setCurrentVolume(volumeId: string | null) {
    currentVolumeId.value = volumeId;
  }

  function setCurrentChapter(chapterNumber: number | null) {
    currentChapterNumber.value = chapterNumber;
  }

  async function saveAll() {
    if (!masterContract.value) return;

    isLoading.value = true;
    try {
      // 这里应该调用存储服务保存数据
      // 目前只是标记为已保存
      console.log('[ContractStore] 保存主合同:', masterContract.value.meta.title);
      
      // 保存卷合同
      for (const volume of volumeContracts.value.values()) {
        console.log('[ContractStore] 保存卷合同:', volume.meta.title);
      }

      // 保存章合同
      for (const chapter of chapterContracts.value.values()) {
        console.log('[ContractStore] 保存章合同:', chapter.meta.title);
      }

      isDirty.value = false;
      lastSaved.value = new Date().toISOString();
    } catch (error) {
      console.error("Failed to save contracts:", error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  async function loadContracts(id: string) {
    projectId.value = id;
    isLoading.value = true;
    try {
      // 加载主合同
      // TODO: 从存储服务加载
      console.log('[ContractStore] 加载项目:', id);
      
      // 加载卷合同
      // TODO: 从存储服务加载

      // 加载章合同
      // TODO: 从存储服务加载

      isDirty.value = false;
    } catch (error) {
      console.error("Failed to load contracts:", error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  function clear() {
    masterContract.value = null;
    volumeContracts.value.clear();
    chapterContracts.value.clear();
    currentVolumeId.value = null;
    currentChapterNumber.value = null;
    isDirty.value = false;
    lastSaved.value = null;
  }

  function markClean() {
    isDirty.value = false;
  }

  return {
    // State
    masterContract,
    volumeContracts,
    chapterContracts,
    currentVolumeId,
    currentChapterNumber,
    isDirty,
    lastSaved,
    isLoading,

    // Getters
    hasMasterContract,
    currentVolume,
    currentChapter,
    allChapters,
    allVolumes,
    totalChapters,
    unsavedChanges,

    // Actions
    setMasterContract,
    updateMasterContract,
    addVolumeContract,
    updateVolumeContract,
    removeVolumeContract,
    setChapterContract,
    updateChapterContract,
    removeChapterContract,
    setCurrentVolume,
    setCurrentChapter,
    saveAll,
    loadContracts,
    clear,
    markClean,
  };
});
