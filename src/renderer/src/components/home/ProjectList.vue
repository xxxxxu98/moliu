<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Clock, FileText, MoreHorizontal, Feather, BookOpen, Filter, ArrowUpDown } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import type { Project } from '@/types/project';

const { t } = useI18n();
const router = useRouter();
const projectStore = useProjectStore();

const emit = defineEmits<{
  (e: 'create-project'): void;
}>();

const searchQuery = ref('');
const statusFilter = ref<Project['status'] | 'all'>('all');
const sortBy = ref<'updated' | 'created' | 'name' | 'wordCount'>('updated');

// Filter and sort projects
const filteredProjects = computed(() => {
  let projects = [...projectStore.projects];
  
  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    projects = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
    );
  }
  
  // Apply status filter
  if (statusFilter.value !== 'all') {
    projects = projects.filter((p) => p.status === statusFilter.value);
  }
  
  // Apply sorting
  projects.sort((a, b) => {
    switch (sortBy.value) {
      case 'updated':
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case 'created':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'name':
        return a.name.localeCompare(b.name);
      case 'wordCount':
        return b.wordCount - a.wordCount;
      default:
        return 0;
    }
  });
  
  return projects;
});

// Recent projects (always show latest 3 regardless of filter)
const recentProjects = computed(() => {
  return [...projectStore.projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);
});

function openProject(project: Project) {
  router.push(`/project/${project.id}`);
}

function createNewProject() {
  emit('create-project');
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return t('projectList.today');
  if (days === 1) return t('projectList.yesterday');
  if (days < 7) return t('projectList.daysAgo', { days });
  return date.toLocaleDateString('zh-CN');
}

function formatWordCount(count: number) {
  if (count < 10000) return `${count.toLocaleString()}${t('projectList.words', { count })}`;
  return `${(count / 10000).toFixed(1)}${t('projectList.tenThousands', { count })}`;
}

function getStatusConfig(status: Project['status']) {
  const configs = {
    writing: { color: 'bg-emerald-500', text: t('projectList.status.writing'), gradient: 'from-emerald-400 to-teal-500' },
    planning: { color: 'bg-blue-500', text: t('projectList.status.planning'), gradient: 'from-blue-400 to-indigo-500' },
    paused: { color: 'bg-amber-500', text: t('projectList.status.paused'), gradient: 'from-amber-400 to-orange-500' },
    completed: { color: 'bg-slate-500', text: t('projectList.status.completed'), gradient: 'from-slate-400 to-gray-500' },
  };
  return configs[status] || { color: 'bg-gray-500', text: t('projectList.status.unknown'), gradient: 'from-gray-400 to-gray-500' };
}

// Project card background gradients based on project index
const cardGradients = [
  'from-indigo-500/5 to-purple-500/5 dark:from-indigo-500/10 dark:to-purple-500/10',
  'from-emerald-500/5 to-cyan-500/5 dark:from-emerald-500/10 dark:to-cyan-500/10',
  'from-orange-500/5 to-amber-500/5 dark:from-orange-500/10 dark:to-amber-500/10',
  'from-pink-500/5 to-rose-500/5 dark:from-pink-500/10 dark:to-rose-500/10',
];

function getCardGradient(index: number) {
  return cardGradients[index % cardGradients.length];
}
</script>

<template>
  <div class="space-y-8">
    <!-- Header with stats -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">{{ t('projectList.myCreations') }}</h2>
        <p class="text-gray-500 dark:text-gray-400">{{ t('projectList.projectCount', { count: projectStore.projects.length }) }}</p>
      </div>
      
      <div class="flex items-center gap-3">
        <!-- Search -->
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('projectList.searchPlaceholder')"
            class="w-56 pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          <Feather class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
        
        <!-- Filter dropdown -->
        <div class="relative group">
          <button
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          >
            <Filter class="w-4 h-4" />
            <span v-if="statusFilter === 'all'">{{ t('projectList.status.all') }}</span>
            <span v-else>{{ t(`projectList.status.${statusFilter}`) }}</span>
          </button>
          <div class="absolute right-0 top-full mt-2 w-40 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button
              v-for="status in ['all', 'writing', 'planning', 'paused', 'completed'] as const"
              :key="status"
              class="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              :class="statusFilter === status ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-700 dark:text-gray-300'"
              @click="statusFilter = status"
            >
              {{ t(`projectList.status.${status}`) }}
            </button>
          </div>
        </div>
        
        <!-- Sort dropdown -->
        <div class="relative group">
          <button
            class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
          >
            <ArrowUpDown class="w-4 h-4" />
            {{ t('projectList.sortOptions.' + sortBy) }}
          </button>
          <div class="absolute right-0 top-full mt-2 w-40 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button
              v-for="option in ['updated', 'created', 'name', 'wordCount'] as const"
              :key="option"
              class="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              :class="sortBy === option ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-700 dark:text-gray-300'"
              @click="sortBy = option"
            >
              {{ t(`projectList.sortOptions.${option}`) }}
            </button>
          </div>
        </div>
        
        <!-- New Project Button -->
        <button
          @click="createNewProject"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-105 transition-all"
        >
          <Plus class="w-4 h-4" />
          {{ t('projectList.newProject') }}
        </button>
      </div>
    </div>

    <!-- Recent Projects -->
    <div v-if="recentProjects.length > 0 && statusFilter === 'all' && !searchQuery">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('projectList.recentEdits') }}</h3>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          v-for="(project, index) in recentProjects"
          :key="project.id"
          class="group relative bg-gradient-to-br rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
          :class="getCardGradient(index)"
          @click="openProject(project)"
        >
          <!-- Gradient border effect -->
          <div class="absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10" 
               :class="'bg-gradient-to-br ' + getStatusConfig(project.status).gradient + ' blur-xl opacity-30'"></div>
          
          <div class="relative">
            <!-- Header -->
            <div class="flex justify-between items-start mb-4">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <BookOpen class="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  <h4 class="font-semibold text-lg text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {{ project.name }}
                  </h4>
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                  {{ project.description || t('projectList.noDescription') }}
                </p>
              </div>
              <button class="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-700/50 transition-colors opacity-0 group-hover:opacity-100">
                <MoreHorizontal class="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <!-- Stats -->
            <div class="flex items-center justify-between pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <FileText class="w-4 h-4" />
                  {{ formatWordCount(project.wordCount) }}
                </span>
              </div>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    :class="getStatusConfig(project.status).color + ' text-white'">
                <span class="w-1.5 h-1.5 rounded-full bg-white/80"></span>
                {{ getStatusConfig(project.status).text }}
              </span>
            </div>

            <!-- Footer -->
            <div class="flex items-center gap-1.5 mt-3 text-xs text-gray-400 dark:text-gray-500">
              <Clock class="w-3 h-3" />
              {{ formatDate(project.updatedAt) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- All Projects -->
    <div>
      <div class="flex items-center gap-3 mb-6">
        <div class="w-1 h-6 rounded-full bg-gradient-to-b from-purple-500 to-pink-500"></div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('projectList.allProjects') }}</h3>
      </div>

      <div v-if="filteredProjects.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="(project, index) in filteredProjects"
          :key="project.id"
          class="group bg-white dark:bg-gray-800/50 rounded-xl p-5 border border-gray-100 dark:border-gray-700/50 cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-700/50 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-300"
          @click="openProject(project)"
        >
          <div class="flex justify-between items-start mb-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center">
              <BookOpen class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="getStatusConfig(project.status).color + '/10 text-' + getStatusConfig(project.status).color.replace('bg-', '')">
              {{ getStatusConfig(project.status).text }}
            </span>
          </div>

          <h4 class="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {{ project.name }}
          </h4>
          <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
            {{ project.description || t('projectList.noDescription') }}
          </p>
          <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>{{ formatWordCount(project.wordCount) }}</span>
            <span>{{ formatDate(project.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-16">
        <div class="w-20 h-20 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mb-6">
          <BookOpen class="w-10 h-10 text-gray-300 dark:text-gray-600" />
        </div>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">{{ t('projectList.emptyTitle') }}</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">{{ t('projectList.emptyDesc') }}</p>
        <button
          @click="createNewProject"
          class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
        >
          <Plus class="w-5 h-5" />
          {{ t('projectList.createFirstProject') }}
        </button>
      </div>
    </div>
  </div>
</template>
