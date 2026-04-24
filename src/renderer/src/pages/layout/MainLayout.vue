<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NLayout, NLayoutContent, NScrollbar, NButton, NTag, useMessage, NEmpty, NModal, NInput, NSelect, type InputInst } from 'naive-ui';
import {
  Plus,
  FileText,
  BookOpen,
  Users,
  Globe,
  Lightbulb,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
  Edit3,
  PanelLeft,
  ChevronUp,
  Info,
  Map,
} from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import AppHeader from '@/components/layout/AppHeader.vue';
import EditorCore from '@/components/editor/EditorCore.vue';
import AIPanel from '@/components/editor/AIPanel.vue';
import CharacterPanel from '@/components/memory/CharacterPanel.vue';
import WorldPanel from '@/components/memory/WorldPanel.vue';
import ForeshadowPanel from '@/components/memory/ForeshadowPanel.vue';
import PlotOutlinePanel from '@/components/memory/PlotOutlinePanel.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const message = useMessage();

const projectId = computed(() => route.params.id as string);
const leftSiderCollapsed = ref(false);
const rightSiderCollapsed = ref(false);
const activeSidePanel = ref<'chapters' | 'plotOutline' | 'characters' | 'world' | 'foreshadows'>('chapters');
const expandedVolumes = ref<Set<string>>(new Set(['v1']));
const isLoadingProject = ref(false);
const editorCoreRef = ref<InstanceType<typeof EditorCore> | null>(null);

// Chapter dialog state
const showChapterDialog = ref(false);
const chapterDialogMode = ref<'create' | 'edit'>('create');
const editingChapter = ref<{ id: string; title: string } | null>(null);
const newChapterTitle = ref('');
const newChapterVolumeId = ref('');
const chapterTitleInputRef = ref<InputInst | null>(null);

// Volume dialog state
const showVolumeDialog = ref(false);
const volumeDialogMode = ref<'create' | 'edit'>('create');
const newVolumeName = ref('');
const editingVolume = ref<{ id: string; name: string } | null>(null);
const volumeNameInputRef = ref<InputInst | null>(null);

// Synopsis dialog state
const showSynopsisDialog = ref(false);
const synopsisContent = ref('');
const synopsisEditMode = ref(false);
const tempSynopsis = ref('');

const currentProject = computed(() => projectStore.currentProject);

const chaptersByVolume = computed(() => {
  const grouped: Record<string, typeof projectStore.chapters> = {};
  for (const chapter of projectStore.sortedChapters) {
    const volumeId = chapter.volumeId || 'default';
    if (!grouped[volumeId]) grouped[volumeId] = [];
    grouped[volumeId].push(chapter);
  }
  return grouped;
});

const volumeOptions = computed(() => {
  return projectStore.sortedVolumes.map(v => ({
    label: v.name,
    value: v.id,
  }));
});

const sideTabs = computed(() => [
  { key: 'chapters', icon: FileText, label: t('editor.title') },
  { key: 'plotOutline', icon: Map, label: '大纲' },
  { key: 'characters', icon: Users, label: t('editor.characters') },
  { key: 'world', icon: Globe, label: t('editor.world') },
  { key: 'foreshadows', icon: Lightbulb, label: t('editor.foreshadows') },
] as const);

// Load project data when projectId changes
watch(() => projectId.value, async (newId) => {
  if (newId) {
    await loadProject(newId);
  }
}, { immediate: true });

async function loadProject(id: string) {
  isLoadingProject.value = true;
  try {
    await projectStore.loadProject(id);
    // Expand first volume by default
    if (projectStore.sortedVolumes.length > 0) {
      expandedVolumes.value.clear();
      expandedVolumes.value.add(projectStore.sortedVolumes[0].id);
      newChapterVolumeId.value = projectStore.sortedVolumes[0].id;
    }
  } catch (error) {
    console.error('Failed to load project:', error);
    message.error('加载项目失败');
    router.push('/home');
  } finally {
    isLoadingProject.value = false;
  }
}

function toggleVolume(volumeId: string) {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId);
  } else {
    expandedVolumes.value.add(volumeId);
  }
}

function selectChapter(chapterId: string) {
  projectStore.setCurrentChapter(chapterId);
}

function openCreateChapterDialog() {
  chapterDialogMode.value = 'create';
  newChapterTitle.value = '';
  newChapterVolumeId.value = projectStore.sortedVolumes[0]?.id || '';
  editingChapter.value = null;
  showChapterDialog.value = true;
  nextTick(() => {
    chapterTitleInputRef.value?.focus();
  });
}

function openEditChapterDialog(chapter: { id: string; title: string }) {
  chapterDialogMode.value = 'edit';
  newChapterTitle.value = chapter.title;
  editingChapter.value = chapter;
  showChapterDialog.value = true;
  nextTick(() => {
    chapterTitleInputRef.value?.focus();
  });
}

async function handleChapterDialogConfirm() {
  if (!newChapterTitle.value.trim()) {
    message.warning('请输入章节标题');
    return;
  }
  
  if (chapterDialogMode.value === 'create') {
    if (!newChapterVolumeId.value) {
      message.warning('请选择所属卷');
      return;
    }
    await projectStore.createChapter(newChapterVolumeId.value);
    const newChapter = projectStore.chapters.find(c => c.title === `第${projectStore.chapters.filter(ch => ch.volumeId === newChapterVolumeId.value).length}章`);
    if (newChapter) {
      await projectStore.updateChapter(newChapter.id, { title: newChapterTitle.value.trim() });
    }
    message.success('章节创建成功');
  } else {
    if (editingChapter.value) {
      await projectStore.updateChapter(editingChapter.value.id, { title: newChapterTitle.value.trim() });
      message.success('章节标题已更新');
    }
  }
  showChapterDialog.value = false;
}

async function handleDeleteChapter(chapterId: string, event: Event) {
  event.stopPropagation();
  try {
    await projectStore.deleteChapter(chapterId);
    message.success('章节已删除');
  } catch (error) {
    message.error('删除失败');
  }
}

async function handleCreateVolume() {
  if (!newVolumeName.value.trim()) {
    message.warning('请输入卷名');
    return;
  }
  
  if (volumeDialogMode.value === 'create') {
    const newVolume = {
      id: `vol-${Date.now()}`,
      name: newVolumeName.value.trim(),
      orderIndex: projectStore.volumes.length,
    };
    projectStore.volumes.push(newVolume);
    message.success('卷创建成功');
  } else if (editingVolume.value) {
    await projectStore.updateVolume(editingVolume.value.id, { name: newVolumeName.value.trim() });
    message.success('卷名已更新');
  }
  
  await projectStore.saveCurrentProject();
  newVolumeName.value = '';
  editingVolume.value = null;
  showVolumeDialog.value = false;
}

function openEditVolumeDialog(volume: { id: string; name: string }) {
  volumeDialogMode.value = 'edit';
  newVolumeName.value = volume.name;
  editingVolume.value = volume;
  showVolumeDialog.value = true;
  nextTick(() => {
    volumeNameInputRef.value?.focus();
  });
}

function openCreateVolumeDialog() {
  volumeDialogMode.value = 'create';
  newVolumeName.value = '';
  editingVolume.value = null;
  showVolumeDialog.value = true;
  nextTick(() => {
    volumeNameInputRef.value?.focus();
  });
}

async function handleDeleteVolume(volumeId: string, event: Event) {
  event.stopPropagation();
  try {
    await projectStore.deleteVolume(volumeId);
    message.success('卷已删除');
  } catch (error) {
    message.error('删除失败');
  }
}

// Synopsis functions
function openSynopsisDialog() {
  synopsisContent.value = currentProject.value?.description || '';
  tempSynopsis.value = synopsisContent.value;
  showSynopsisDialog.value = true;
  synopsisEditMode.value = false;
}

function toggleSynopsisEditMode() {
  if (synopsisEditMode.value) {
    // Save changes
    synopsisContent.value = tempSynopsis.value;
    // Update project description
    if (currentProject.value) {
      // Update local state immediately
      projectStore.updateProject(currentProject.value.id, { description: tempSynopsis.value });
      // Persist to backend
      projectStore.updateProjectInfo(currentProject.value.id, { description: tempSynopsis.value });
    }
    synopsisEditMode.value = false;
    message.success('简介已保存');
  } else {
    // Enter edit mode
    tempSynopsis.value = synopsisContent.value;
    synopsisEditMode.value = true;
  }
}

function cancelSynopsisEdit() {
  synopsisEditMode.value = false;
  tempSynopsis.value = synopsisContent.value;
}


function formatWordCount(count: number) {
  if (count < 10000) return `${count}${t('projectList.words')}`;
  return `${(count / 10000).toFixed(1)}${t('projectList.tenThousands')}`;
}

function getStatusConfig(status: string) {
  const statusMap: Record<string, { color: string; text: string; textColor: string }> = {
    final: { color: 'bg-emerald-500', text: t('projectList.status.completed'), textColor: 'text-emerald-600' },
    editing: { color: 'bg-amber-500', text: t('projectList.status.writing'), textColor: 'text-amber-600' },
    draft: { color: 'bg-blue-500', text: t('projectList.status.planning'), textColor: 'text-blue-600' },
  };
  const config = statusMap[status] || { color: 'bg-gray-500', text: t('projectList.status.unknown'), textColor: 'text-gray-600' };
  return config;
}
</script>

<template>
  <NLayout class="h-screen overflow-hidden">
    <!-- Header -->
    <div class="shrink-0 z-50 backdrop-blur-xl bg-white/90 dark:bg-gray-900/90 border-b border-gray-200/50 dark:border-gray-700/50">
      <!-- Main Header Row -->
      <div class="h-16 flex items-center px-4">
        <AppHeader>
          <template #center>
            <div v-if="currentProject" class="flex items-center gap-3 px-4">
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <BookOpen class="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 class="font-semibold text-sm text-gray-900 dark:text-white">{{ currentProject.name }}</h2>
                <p class="text-xs text-gray-500">{{ formatWordCount(projectStore.totalWordCount) }}</p>
              </div>
            </div>
          </template>
        </AppHeader>
      </div>
      
      <!-- Synopsis Bar (only show if project has description) -->
      <div 
        v-if="currentProject?.description && !synopsisEditMode"
        class="px-4 pb-2 cursor-pointer group"
        @click="openSynopsisDialog"
      >
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700">
          <Info class="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 flex-1">
            {{ currentProject.description }}
          </p>
          <ChevronUp class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      
      <!-- Synopsis Edit Bar (shown when editing) -->
      <div v-if="synopsisEditMode" class="px-4 pb-2">
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
          <Info class="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <input
            v-model="tempSynopsis"
            class="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none"
            placeholder="输入项目简介..."
            @keydown.enter="toggleSynopsisEditMode"
          />
          <div class="flex items-center gap-1">
            <button
              class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              @click="cancelSynopsisEdit"
            >
              取消
            </button>
            <button
              class="px-2 py-1 text-xs text-white bg-indigo-500 rounded hover:bg-indigo-600"
              @click="toggleSynopsisEditMode"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="flex-1 flex min-h-0">
      <!-- Left Sidebar: Navigation -->
      <div
        class="h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300"
        :class="leftSiderCollapsed ? 'w-16' : 'w-72'"
      >
        <!-- Collapse Button -->
        <div class="h-12 flex items-center justify-between px-3 border-b border-gray-100 dark:border-gray-800">
          <div v-if="!leftSiderCollapsed" class="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <PanelLeft class="w-4 h-4" />
            {{ t('projectList.myCreations') }}
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            :class="leftSiderCollapsed ? 'ml-auto' : ''"
            @click="leftSiderCollapsed = !leftSiderCollapsed"
          >
            <ChevronLeft
              class="w-4 h-4 text-gray-500 transition-transform duration-200"
              :class="leftSiderCollapsed ? 'rotate-180' : ''"
            />
          </button>
        </div>

        <!-- Side Tabs -->
        <div v-if="!leftSiderCollapsed" class="flex border-b border-gray-100 dark:border-gray-800">
          <button
            v-for="tab in sideTabs"
            :key="tab.key"
            class="flex-1 py-3 flex flex-col items-center gap-1 text-xs transition-colors relative"
            :class="[
              activeSidePanel === tab.key
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            ]"
            @click="activeSidePanel = tab.key"
          >
            <component :is="tab.icon" class="w-5 h-5" />
            <span>{{ tab.label }}</span>
            <div
              v-if="activeSidePanel === tab.key"
              class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
            ></div>
          </button>
        </div>

        <!-- Content -->
        <NScrollbar v-if="!leftSiderCollapsed" class="flex-1">
          <!-- Chapters -->
          <div v-show="activeSidePanel === 'chapters'" class="p-3 space-y-2">
            <div
              v-for="volume in projectStore.sortedVolumes"
              :key="volume.id"
              class="rounded-xl overflow-hidden"
            >
              <button
                class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                @click="toggleVolume(volume.id)"
              >
                <div class="flex items-center gap-2">
                  <ChevronDown
                    class="w-4 h-4 text-gray-400 transition-transform"
                    :class="expandedVolumes.has(volume.id) ? '' : '-rotate-90'"
                  />
                  <BookOpen class="w-4 h-4 text-indigo-500" />
                  <span class="font-medium text-sm text-gray-900 dark:text-white">{{ volume.name }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <NTag size="small" round :bordered="false" type="info">
                    {{ chaptersByVolume[volume.id]?.length || 0 }}
                  </NTag>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      @click.stop="openEditVolumeDialog(volume)"
                    >
                      <Edit3 class="w-3 h-3 text-gray-400" />
                    </button>
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                      @click.stop="handleDeleteVolume(volume.id, $event)"
                    >
                      <Trash2 class="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </div>
              </button>

              <div v-if="expandedVolumes.has(volume.id)" class="ml-4 mt-1 space-y-1 pb-2">
                <button
                  v-for="chapter in chaptersByVolume[volume.id]"
                  :key="chapter.id"
                  class="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                  :class="[
                    projectStore.currentChapterId === chapter.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700'
                      : ''
                  ]"
                  @click="selectChapter(chapter.id)"
                >
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="text-sm text-gray-600 dark:text-gray-400 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {{ chapter.title }}
                    </span>
                    <span
                      class="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
                      :class="getStatusConfig(chapter.status).textColor + ' bg-opacity-10'"
                      :style="{ backgroundColor: getStatusConfig(chapter.status).color + '15' }"
                    >
                      {{ chapter.wordCount }}{{ t('projectList.words') }}
                    </span>
                  </div>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                      @click.stop="openEditChapterDialog(chapter)"
                    >
                      <Edit3 class="w-3 h-3 text-gray-400" />
                    </button>
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                      @click.stop="handleDeleteChapter(chapter.id, $event)"
                    >
                      <Trash2 class="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                </button>
                <button
                  class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  @click="openCreateChapterDialog"
                >
                  <Plus class="w-4 h-4" />
                  {{ t('editor.newChapter') }}
                </button>
              </div>
            </div>

            <button
              class="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              @click="openCreateVolumeDialog"
            >
              <Plus class="w-4 h-4" />
              新建卷
            </button>
          </div>

          <!-- Characters -->
          <div v-show="activeSidePanel === 'characters'" class="p-3">
            <CharacterPanel />
          </div>

          <!-- Plot Outline -->
          <div v-show="activeSidePanel === 'plotOutline'" class="p-3">
            <PlotOutlinePanel />
          </div>

          <!-- World -->
          <div v-show="activeSidePanel === 'world'" class="p-3">
            <WorldPanel />
          </div>

          <!-- Foreshadows -->
          <div v-show="activeSidePanel === 'foreshadows'" class="p-3">
            <ForeshadowPanel />
          </div>
        </NScrollbar>

        <!-- Collapsed icons -->
        <div v-if="leftSiderCollapsed" class="flex-1 flex flex-col items-center py-3 gap-2">
          <button
            v-for="tab in sideTabs"
            :key="tab.key"
            class="w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
            :class="[
              activeSidePanel === tab.key
                ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300'
            ]"
            @click="activeSidePanel = tab.key; leftSiderCollapsed = false"
          >
            <component :is="tab.icon" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Main Content: Editor -->
      <div class="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-900/50">
        <EditorCore ref="editorCoreRef" />
      </div>

      <!-- Right Sidebar: AI Panel -->
        <div
          class="h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300"
          :class="rightSiderCollapsed ? 'w-12' : 'w-80'"
        >
          <!-- Collapse Button -->
          <div class="h-12 flex items-center justify-between px-3 border-b border-gray-100 dark:border-gray-800">
            <button
              v-if="!rightSiderCollapsed"
              class="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400"
            >
              <Sparkles class="w-4 h-4" />
              {{ t('editor.aiCollaboration') }}
            </button>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ml-auto"
              @click="rightSiderCollapsed = !rightSiderCollapsed"
            >
              <ChevronRight
                class="w-4 h-4 text-gray-500 transition-transform duration-200"
                :class="rightSiderCollapsed ? 'rotate-180' : ''"
              />
            </button>
          </div>

          <!-- AI Panel Content -->
          <div v-if="!rightSiderCollapsed" class="flex-1 overflow-hidden">
            <AIPanel :editor-ref="editorCoreRef" />
          </div>

          <!-- Collapsed Icon -->
          <div v-if="rightSiderCollapsed" class="flex-1 flex flex-col items-center py-3">
            <button
              class="w-10 h-10 flex items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg"
              @click="rightSiderCollapsed = false"
            >
              <Sparkles class="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </NLayout>

  <!-- Chapter Dialog -->
  <NModal
    v-model:show="showChapterDialog"
    preset="dialog"
    :title="chapterDialogMode === 'create' ? '新建章节' : '编辑章节'"
    positive-text="确认"
    negative-text="取消"
    @positive-click="handleChapterDialogConfirm"
    @negative-click="showChapterDialog = false"
  >
    <div class="space-y-4 py-4">
      <div v-if="chapterDialogMode === 'create'">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">所属卷</label>
        <NSelect
          v-model:value="newChapterVolumeId"
          :options="volumeOptions"
          placeholder="选择卷"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">章节标题</label>
        <NInput
          ref="chapterTitleInputRef"
          v-model:value="newChapterTitle"
          placeholder="输入章节标题"
        />
      </div>
    </div>
  </NModal>

  <!-- Volume Dialog -->
  <NModal
    v-model:show="showVolumeDialog"
    preset="dialog"
    :title="volumeDialogMode === 'create' ? '新建卷' : '编辑卷'"
    positive-text="确认"
    negative-text="取消"
    @positive-click="handleCreateVolume"
    @negative-click="showVolumeDialog = false; newVolumeName = ''; editingVolume = null"
  >
    <div class="py-4">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">卷名</label>
      <NInput
        ref="volumeNameInputRef"
        v-model:value="newVolumeName"
        placeholder="输入卷名，例如：第一卷"
      />
    </div>
  </NModal>

  <!-- Synopsis Dialog -->
  <NModal
    v-model:show="showSynopsisDialog"
    preset="card"
    :title="synopsisEditMode ? '编辑简介' : '项目简介'"
    style="width: 80%;"
    :segmented="{ content: true, footer: true }"
  >
    <template #header-extra>
      <NButton
        v-if="!synopsisEditMode"
        size="small"
        quaternary
        @click="toggleSynopsisEditMode"
      >
        <template #icon>
          <Edit3 class="w-4 h-4" />
        </template>
        编辑
      </NButton>
    </template>
    <div class="py-2">
      <NInput
        v-if="synopsisEditMode"
        v-model:value="tempSynopsis"
        type="textarea"
        :rows="8"
        placeholder="输入项目简介..."
        class="font-sans"
      />
      <div v-else class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
        {{ synopsisContent || '暂无简介' }}
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <NButton
          v-if="synopsisEditMode"
          @click="cancelSynopsisEdit"
        >
          取消
        </NButton>
        <NButton
          v-if="synopsisEditMode"
          type="primary"
          @click="toggleSynopsisEditMode"
        >
          保存
        </NButton>
        <NButton
          v-else
          @click="showSynopsisDialog = false"
        >
          关闭
        </NButton>
      </div>
    </template>
  </NModal>
</template>
