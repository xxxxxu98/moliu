<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { NLayout, NLayoutSider, NLayoutContent, NScrollbar, NButton, NTag } from 'naive-ui';
import {
  Plus,
  FileText,
  BookOpen,
  Users,
  Globe,
  Lightbulb,
  ChevronDown,
  ChevronLeft,
  Sparkles,
} from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import AppHeader from '@/components/layout/AppHeader.vue';
import EditorCore from '@/components/editor/EditorCore.vue';
import AIPanel from '@/components/editor/AIPanel.vue';
import CharacterPanel from '@/components/memory/CharacterPanel.vue';
import WorldPanel from '@/components/memory/WorldPanel.vue';
import ForeshadowPanel from '@/components/memory/ForeshadowPanel.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();

const projectId = computed(() => route.params.id as string);
const leftSiderCollapsed = ref(false);
const rightSiderCollapsed = ref(false);
const activeSidePanel = ref<'chapters' | 'characters' | 'world' | 'foreshadows'>('chapters');
const expandedVolumes = ref<Set<string>>(new Set(['v1']));

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

const sideTabs = computed(() => [
  { key: 'chapters', icon: FileText, label: t('editor.title') },
  { key: 'characters', icon: Users, label: t('editor.characters') },
  { key: 'world', icon: Globe, label: t('editor.world') },
  { key: 'foreshadows', icon: Lightbulb, label: t('editor.foreshadows') },
] as const);

function toggleVolume(volumeId: string) {
  if (expandedVolumes.value.has(volumeId)) {
    expandedVolumes.value.delete(volumeId);
  } else {
    expandedVolumes.value.add(volumeId);
  }
}

function selectChapter(chapterId: string) {
  // Update selected chapter
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

onMounted(() => {
  projectStore.setCurrentProject({
    id: projectId.value,
    name: '仙侠世界',
    description: '一个关于修仙的奇幻故事',
    genre: [],
    wordCount: 125000,
    status: 'writing',
    volumes: [
      { id: 'v1', name: '第一卷 觉醒', orderIndex: 0 },
      { id: 'v2', name: '第二卷 崛起', orderIndex: 1 },
    ],
    chapters: [],
    characters: [],
    worldSchema: { locations: [], rules: [], factions: [] },
    foreshadows: [],
    plotOutline: [],
    createdAt: '2026-01-15',
    updatedAt: '2026-04-20',
  });

  projectStore.setChapters([
    {
      id: 'c1',
      volumeId: 'v1',
      title: '第一章 废物少年',
      content: '',
      wordCount: 3200,
      orderIndex: 0,
      version: 1,
      status: 'final',
      createdAt: '2026-01-15',
      updatedAt: '2026-04-20',
    },
    {
      id: 'c2',
      volumeId: 'v1',
      title: '第二章 意外觉醒',
      content: '',
      wordCount: 4500,
      orderIndex: 1,
      version: 1,
      status: 'editing',
      createdAt: '2026-01-16',
      updatedAt: '2026-04-19',
    },
    {
      id: 'c3',
      volumeId: 'v1',
      title: '第三章 宗门测试',
      content: '',
      wordCount: 2800,
      orderIndex: 2,
      version: 1,
      status: 'draft',
      createdAt: '2026-01-17',
      updatedAt: '2026-04-18',
    },
    {
      id: 'c4',
      volumeId: 'v2',
      title: '第一章 新的开始',
      content: '',
      wordCount: 1500,
      orderIndex: 0,
      version: 1,
      status: 'draft',
      createdAt: '2026-03-01',
      updatedAt: '2026-04-15',
    },
  ]);
});
</script>

<template>
  <NLayout class="h-full">
    <!-- Header -->
    <div class="sticky top-0 z-50 backdrop-blur-xl bg-white/90 dark:bg-gray-900/90 border-b border-gray-200/50 dark:border-gray-700/50">
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

    <NLayoutContent class="h-[calc(100%-4rem)]">
      <div class="flex h-full">
        <!-- Left Sidebar: Navigation -->
        <div
          class="h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col transition-all duration-300"
          :class="leftSiderCollapsed ? 'w-16' : 'w-72'"
        >
          <!-- Collapse Button -->
          <div class="h-12 flex items-center justify-end px-3 border-b border-gray-100 dark:border-gray-800">
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                  class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
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
                  <NTag size="small" round :bordered="false" type="info">
                    {{ chaptersByVolume[volume.id]?.length || 0 }}
                  </NTag>
                </button>

                <div v-if="expandedVolumes.has(volume.id)" class="ml-4 mt-1 space-y-1 pb-2">
                  <button
                    v-for="chapter in chaptersByVolume[volume.id]"
                    :key="chapter.id"
                    class="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                  >
                    <span class="text-sm text-gray-600 dark:text-gray-400 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                      {{ chapter.title }}
                    </span>
                    <span
                      class="px-1.5 py-0.5 rounded text-xs font-medium"
                      :class="getStatusConfig(chapter.status).textColor + ' bg-opacity-10'"
                      style="{ backgroundColor: getStatusConfig(chapter.status).color + '15' }"
                    >
                      {{ chapter.wordCount }}{{ t('projectList.words') }}
                    </span>
                  </button>
                </div>
              </div>

              <button
                class="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                <Plus class="w-4 h-4" />
                {{ t('editor.newChapter') }}
              </button>
            </div>

            <!-- Characters -->
            <div v-show="activeSidePanel === 'characters'" class="p-3">
              <CharacterPanel />
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
        <NLayoutContent class="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-900/50">
          <EditorCore />
        </NLayoutContent>

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
              <ChevronLeft
                class="w-4 h-4 text-gray-500 transition-transform duration-200"
                :class="rightSiderCollapsed ? 'rotate-180' : ''"
              />
            </button>
          </div>

          <!-- AI Panel Content -->
          <div v-if="!rightSiderCollapsed" class="flex-1 overflow-hidden">
            <AIPanel />
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
    </NLayoutContent>
  </NLayout>
</template>
