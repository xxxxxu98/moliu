<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppHeader from '@/components/layout/AppHeader.vue';
import ProjectList from '@/components/home/ProjectList.vue';
import TopicDiscoveryPanel from '@/components/home/TopicDiscoveryPanel.vue';
import CreateProjectDialog from '@/components/home/CreateProjectDialog.vue';
import { BarChart3, BookOpen, Compass } from 'lucide-vue-next';
import { useProjectStore } from '@/stores/project.store';

type HomeTab = 'bookshelf' | 'discovery';

const HOME_TAB_STORAGE_KEY = 'moliu:home:active-tab';

const { t } = useI18n();
const projectStore = useProjectStore();

const showCreateDialog = ref(false);
const activeTab = ref<HomeTab>('bookshelf');

onMounted(async () => {
  const saved = localStorage.getItem(HOME_TAB_STORAGE_KEY);
  if (saved === 'bookshelf' || saved === 'discovery') {
    activeTab.value = saved;
  }
  await projectStore.loadProjects();
});

watch(activeTab, (tab) => {
  try {
    localStorage.setItem(HOME_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
});

const totalWordCount = computed(() => {
  return projectStore.projects.reduce((sum, p) => sum + p.wordCount, 0);
});

function formatWordCount(count: number): string {
  if (count < 10000) return count.toLocaleString();
  return (count / 10000).toFixed(1) + '万';
}

function openCreateDialog(): void {
  showCreateDialog.value = true;
}

function switchTab(tab: HomeTab): void {
  activeTab.value = tab;
}
</script>

<template>
  <div class="h-screen flex flex-col">
    <div class="fixed inset-0 bg-slate-50 dark:bg-gray-900 pointer-events-none -z-10" />

    <div
      class="flex-shrink-0 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50"
    >
      <AppHeader />
    </div>

    <!-- Home Tabs -->
    <div
      class="flex-shrink-0 border-b border-gray-200/60 dark:border-gray-700/50 bg-white/70 dark:bg-gray-900/70 backdrop-blur-md"
    >
      <div class="max-w-6xl mx-auto px-6 py-3 flex items-center gap-4">
        <div class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all min-w-[120px]"
            :class="
              activeTab === 'bookshelf'
                ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-200 dark:ring-indigo-600/50'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/50'
            "
            @click="switchTab('bookshelf')"
          >
            <BookOpen class="w-4 h-4" />
            {{ t('home.tabs.bookshelf') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all min-w-[120px]"
            :class="
              activeTab === 'discovery'
                ? 'bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-300 shadow-sm ring-1 ring-teal-200 dark:ring-teal-600/50'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700/50'
            "
            @click="switchTab('discovery')"
          >
            <Compass class="w-4 h-4" />
            {{ t('home.tabs.discovery') }}
          </button>
        </div>

        <div
          v-if="activeTab === 'bookshelf'"
          class="hidden sm:flex items-center gap-4 ml-auto text-xs text-gray-500 dark:text-gray-400"
        >
          <span class="inline-flex items-center gap-1.5">
            <BarChart3 class="w-3.5 h-3.5 text-indigo-500" />
            {{ t('home.stats.totalProjects') }}
            <strong class="text-gray-800 dark:text-gray-200">{{ projectStore.projects.length }}</strong>
          </span>
          <span>
            {{ t('home.stats.totalWords') }}
            <strong class="text-gray-800 dark:text-gray-200">{{ formatWordCount(totalWordCount) }}</strong>
          </span>
        </div>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto overscroll-contain">
      <!-- Bookshelf -->
      <div v-show="activeTab === 'bookshelf'" class="max-w-6xl mx-auto px-6 py-8">
        <div class="text-center mb-8">
          <div
            class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-4"
          >
            <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            {{ t('home.badge') }}
          </div>
          <h1 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            {{ t('home.subtitle') }}
          </h1>
          <p class="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto text-sm md:text-base">
            {{ t('home.description') }}
          </p>
        </div>

        <ProjectList @create-project="openCreateDialog" />
      </div>

      <!-- Topic Discovery -->
      <div v-show="activeTab === 'discovery'" class="max-w-7xl mx-auto px-6 py-8 w-full">
        <div
          class="bg-white dark:bg-gray-800 rounded-2xl p-5 md:p-6 shadow-sm border border-gray-200 dark:border-gray-700"
        >
          <TopicDiscoveryPanel />
        </div>
      </div>
    </div>

    <div
      class="flex-shrink-0 px-4 py-2 bg-white/80 dark:bg-gray-900/80 border-t border-gray-200/50 dark:border-gray-700/50"
    >
      <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <div class="flex items-center gap-4">
          <span>{{ t('home.stats.totalProjects') }}: {{ projectStore.projects.length }}</span>
          <span>{{ t('home.stats.totalWords') }}: {{ formatWordCount(totalWordCount) }}</span>
        </div>
        <span>{{ t('app.name') }} {{ t('app.version') }}</span>
      </div>
    </div>

    <CreateProjectDialog v-model:show="showCreateDialog" />
  </div>
</template>
