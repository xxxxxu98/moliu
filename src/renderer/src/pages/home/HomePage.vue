<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import AppHeader from "@/components/layout/AppHeader.vue";
import ProjectList from "@/components/home/ProjectList.vue";
import QuickStart from "@/components/home/QuickStart.vue";
import InspirationPanel from "@/components/home/InspirationPanel.vue";
import CreateProjectDialog from "@/components/home/CreateProjectDialog.vue";
import { Wand2, Sparkles, BookOpen, BarChart3 } from 'lucide-vue-next';
import { useProjectStore } from '@/stores/project.store';

const { t } = useI18n();
const projectStore = useProjectStore();

type CreationMode = 'guided' | 'inspiration' | null;

const creationMode = ref<CreationMode>(null);
const showCreateDialog = ref(false);

onMounted(async () => {
  await projectStore.loadProjects();
});

// Calculate stats
const totalWordCount = computed(() => {
  return projectStore.projects.reduce((sum, p) => sum + p.wordCount, 0);
});

function formatWordCount(count: number) {
  if (count < 10000) return count.toLocaleString();
  return (count / 10000).toFixed(1) + '万';
}

function selectCreationMode(mode: CreationMode) {
  creationMode.value = creationMode.value === mode ? null : mode;
}

// Listen for create project event from ProjectList
function openCreateDialog() {
  showCreateDialog.value = true;
}
</script>

<template>
  <div class="h-screen flex flex-col">
    <!-- Background - Simplified gradient -->
    <div
      class="fixed inset-0 bg-slate-50 dark:bg-gray-900 pointer-events-none -z-10"
    ></div>

    <!-- Header -->
    <div
      class="flex-shrink-0 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50"
    >
      <AppHeader />
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Left Panel: Project List -->
      <div class="flex-1 overflow-y-auto overscroll-contain">
        <div class="max-w-6xl mx-auto px-6 py-8">
          <!-- Hero Section -->
          <div class="text-center mb-10">
            <div
              class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-4"
            >
              <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
              {{ t("home.badge") }}
            </div>
            <h1
              class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3"
            >
              {{ t("home.subtitle") }}
            </h1>
            <p class="text-gray-500 dark:text-gray-400 max-w-2xl mx-auto text-sm md:text-base">
              {{ t("home.description") }}
            </p>
          </div>

          <!-- Project List -->
          <ProjectList @create-project="openCreateDialog" />
        </div>
      </div>

      <!-- Right Panel: Creation Entry -->
      <div class="w-96 border-l border-gray-200 dark:border-gray-700/50 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
        <div class="p-6">
          <!-- Stats Summary -->
          <div class="mb-8 p-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20">
            <div class="flex items-center gap-2 mb-3">
              <BarChart3 class="w-5 h-5 text-indigo-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">创作统计</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ projectStore.projects.length }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ t('home.stats.totalProjects') }}</div>
              </div>
              <div>
                <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatWordCount(totalWordCount) }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ t('home.stats.totalWords') }}</div>
              </div>
            </div>
          </div>

          <!-- Creation Paths -->
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ t('home.creationPaths.title') }}</h3>
            
            <!-- Guided Creation -->
            <div
              class="mb-4 p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200"
              :class="[
                creationMode === 'guided'
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-lg shadow-indigo-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-800/50'
              ]"
              @click="selectCreationMode('guided')"
            >
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Wand2 class="w-5 h-5 text-white" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-1">{{ t('home.creationPaths.guided') }}</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('home.creationPaths.guidedDesc') }}</p>
                </div>
              </div>
            </div>

            <!-- Inspiration -->
            <div
              class="p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200"
              :class="[
                creationMode === 'inspiration'
                  ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/20 shadow-lg shadow-amber-500/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-700 bg-white dark:bg-gray-800/50'
              ]"
              @click="selectCreationMode('inspiration')"
            >
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles class="w-5 h-5 text-white" />
                </div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900 dark:text-white mb-1">{{ t('home.creationPaths.inspiration') }}</h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('home.creationPaths.inspirationDesc') }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Expanded Creation Panel -->
          <div v-if="creationMode" class="mt-6 animate-fade-in">
            <div v-if="creationMode === 'guided'" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <QuickStart />
            </div>
            <div v-else-if="creationMode === 'inspiration'" class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <InspirationPanel />
            </div>
          </div>

          <!-- Quick Tips when nothing selected -->
          <div v-else class="mt-6 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
            <div class="flex items-start gap-3">
              <BookOpen class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <div class="text-sm text-gray-500 dark:text-gray-400">
                <p class="mb-2">选择一个创作方式开始你的故事之旅。</p>
                <p>有方向创作适合有明确想法的作者，灵感探索适合寻找创作方向的作者。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="flex-shrink-0 px-4 py-2 bg-white/80 dark:bg-gray-900/80 border-t border-gray-200/50 dark:border-gray-700/50">
      <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <div class="flex items-center gap-4">
          <span>{{ t('home.stats.totalProjects') }}: {{ projectStore.projects.length }}</span>
          <span>{{ t('home.stats.totalWords') }}: {{ formatWordCount(totalWordCount) }}</span>
        </div>
        <span>{{ t('app.name') }} {{ t('app.version') }}</span>
      </div>
    </div>

    <!-- Create Project Dialog -->
    <CreateProjectDialog 
      v-model:show="showCreateDialog"
    />
  </div>
</template>

<style>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
