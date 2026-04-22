<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Clock, FileText, MoreHorizontal, Feather, BookOpen } from 'lucide-vue-next';
import { useProjectStore } from '@/stores/project.store';
import type { Project } from '@/types/project';

const router = useRouter();
const projectStore = useProjectStore();

const searchQuery = ref('');

const filteredProjects = computed(() => {
  if (!searchQuery.value) return projectStore.projects;
  const query = searchQuery.value.toLowerCase();
  return projectStore.projects.filter(
    (p) =>
      p.name.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
  );
});

const recentProjects = computed(() => {
  return [...projectStore.projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);
});

function openProject(project: Project) {
  router.push(`/project/${project.id}`);
}

function createNewProject() {
  router.push('/?tab=quickstart');
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

function formatWordCount(count: number) {
  if (count < 10000) return `${count}字`;
  return `${(count / 10000).toFixed(1)}万字`;
}

function getStatusConfig(status: Project['status']) {
  switch (status) {
    case 'writing':
      return { color: 'bg-emerald-500', text: '创作中', gradient: 'from-emerald-400 to-teal-500' };
    case 'planning':
      return { color: 'bg-blue-500', text: '规划中', gradient: 'from-blue-400 to-indigo-500' };
    case 'paused':
      return { color: 'bg-amber-500', text: '已暂停', gradient: 'from-amber-400 to-orange-500' };
    case 'completed':
      return { color: 'bg-slate-500', text: '已完成', gradient: 'from-slate-400 to-gray-500' };
    default:
      return { color: 'bg-gray-500', text: '未知', gradient: 'from-gray-400 to-gray-500' };
  }
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
  <div class="space-y-10">
    <!-- Quick Actions & Stats -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-1">我的创作</h2>
        <p class="text-gray-500 dark:text-gray-400">共 {{ projectStore.projects.length }} 个项目</p>
      </div>
      
      <div class="flex items-center gap-3">
        <!-- Search -->
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索项目..."
            class="w-64 pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
          />
          <Feather class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
        
        <!-- New Project Button -->
        <button
          @click="createNewProject"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-105 transition-all"
        >
          <Plus class="w-4 h-4" />
          新建项目
        </button>
      </div>
    </div>

    <!-- Recent Projects -->
    <div v-if="recentProjects.length > 0">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">最近编辑</h3>
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
                  {{ project.description || '暂无描述' }}
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
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">全部项目</h3>
        <span class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500">
          {{ filteredProjects.length }}
        </span>
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
            {{ project.description || '暂无描述' }}
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
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">开始你的创作之旅</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">创建第一个项目，让 AI 帮你写出精彩故事</p>
        <button
          @click="createNewProject"
          class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
        >
          <Plus class="w-5 h-5" />
          创建第一个项目
        </button>
      </div>
    </div>
  </div>
</template>
