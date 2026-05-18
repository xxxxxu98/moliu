<script setup lang="ts">
import { ref, computed, h } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Clock, FileText, MoreHorizontal, Feather, BookOpen, Filter, ArrowUpDown, Pencil, Trash2, ExternalLink } from 'lucide-vue-next';
import { NDropdown, NModal, NCard, NInput, NButton, NPopconfirm } from 'naive-ui';
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

// Add this for dropdown menu - separate states for recent and all projects sections
const activeMenuProjectRecent = ref<string | null>(null);
const activeMenuProjectAll = ref<string | null>(null);

// Rename modal state
const showRenameModal = ref(false);
const renameProjectId = ref<string | null>(null);
const renameProjectName = ref('');

// Delete confirmation
const projectToDelete = ref<Project | null>(null);
const showDeleteModal = ref(false);

const menuOptions = computed(() => [
  {
    label: () => h('div', { class: 'flex items-center gap-2' }, [
      h(ExternalLink, { class: 'w-4 h-4' }),
      '打开项目',
    ]),
    key: 'open',
  },
  {
    label: () => h('div', { class: 'flex items-center gap-2' }, [
      h(Pencil, { class: 'w-4 h-4' }),
      '重命名',
    ]),
    key: 'rename',
  },
  {
    type: 'divider',
    key: 'd1',
  },
  {
    label: () => h('div', { class: 'flex items-center gap-2 text-red-500' }, [
      h(Trash2, { class: 'w-4 h-4' }),
      '删除项目',
    ]),
    key: 'delete',
  },
]);

function handleMenuSelect(key: string, project: Project, section: 'recent' | 'all') {
  // Close the menu for the correct section
  if (section === 'recent') {
    activeMenuProjectRecent.value = null;
  } else {
    activeMenuProjectAll.value = null;
  }
  
  switch (key) {
    case 'open':
      openProject(project);
      break;
    case 'rename':
      startRename(project);
      break;
    case 'delete':
      confirmDelete(project);
      break;
  }
}

function toggleMenu(projectId: string, event: Event, section: 'recent' | 'all') {
  event.stopPropagation();
  if (section === 'recent') {
    activeMenuProjectRecent.value = activeMenuProjectRecent.value === projectId ? null : projectId;
  } else {
    activeMenuProjectAll.value = activeMenuProjectAll.value === projectId ? null : projectId;
  }
}

// Rename functions
function startRename(project: Project) {
  renameProjectId.value = project.id;
  renameProjectName.value = project.name;
  showRenameModal.value = true;
}

async function handleRename() {
  if (!renameProjectId.value || !renameProjectName.value.trim()) return;
  
  await projectStore.updateProjectInfo(renameProjectId.value, {
    name: renameProjectName.value.trim(),
  });
  
  showRenameModal.value = false;
  renameProjectId.value = null;
  renameProjectName.value = '';
}

function cancelRename() {
  showRenameModal.value = false;
  renameProjectId.value = null;
  renameProjectName.value = '';
}

// Delete functions
function confirmDelete(project: Project) {
  projectToDelete.value = project;
  showDeleteModal.value = true;
}

async function handleDelete() {
  if (!projectToDelete.value) return;
  
  await projectStore.deleteProject(projectToDelete.value.id);
  projectToDelete.value = null;
  showDeleteModal.value = false;
}

function cancelDelete() {
  projectToDelete.value = null;
  showDeleteModal.value = false;
}

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

// Filter options for dropdown
const filterOptions = computed(() => [
  { label: t('projectList.status.all'), key: 'all' },
  { label: t('projectList.status.writing'), key: 'writing' },
  { label: t('projectList.status.planning'), key: 'planning' },
  { label: t('projectList.status.paused'), key: 'paused' },
  { label: t('projectList.status.completed'), key: 'completed' },
]);

// Sort options for dropdown
const sortOptions = computed(() => [
  { label: t('projectList.sortOptions.updated'), key: 'updated' },
  { label: t('projectList.sortOptions.created'), key: 'created' },
  { label: t('projectList.sortOptions.name'), key: 'name' },
  { label: t('projectList.sortOptions.wordCount'), key: 'wordCount' },
]);

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
          <NInput
            v-model:value="searchQuery"
            :placeholder="t('projectList.searchPlaceholder')"
            class="w-56"
            clearable
          >
            <template #prefix>
              <Feather class="w-4 h-4 text-gray-400" />
            </template>
          </NInput>
        </div>
        
        <!-- Filter dropdown -->
        <NDropdown
          :options="filterOptions"
          @select="(key: string) => statusFilter = key as any"
          trigger="click"
        >
          <NButton>
            <template #icon>
              <Filter class="w-4 h-4" />
            </template>
            <span v-if="statusFilter === 'all'">{{ t('projectList.status.all') }}</span>
            <span v-else>{{ t(`projectList.status.${statusFilter}`) }}</span>
          </NButton>
        </NDropdown>
        
        <!-- Sort dropdown -->
        <NDropdown
          :options="sortOptions"
          @select="(key: string) => sortBy = key as any"
          trigger="click"
        >
          <NButton>
            <template #icon>
              <ArrowUpDown class="w-4 h-4" />
            </template>
            {{ t('projectList.sortOptions.' + sortBy) }}
          </NButton>
        </NDropdown>
        
        <!-- New Project Button -->
        <NButton
          type="primary"
          @click="createNewProject"
        >
          <template #icon>
            <Plus class="w-4 h-4" />
          </template>
          {{ t('projectList.newProject') }}
        </NButton>
      </div>
    </div>

    <!-- Recent Projects -->
    <div v-if="recentProjects.length > 0 && statusFilter === 'all' && !searchQuery">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div class="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500"></div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('projectList.recentEdits') }}</h3>
        </div>
        <span class="text-sm text-gray-400 dark:text-gray-500">最近 {{ recentProjects.length }} 个项目</span>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(project, index) in recentProjects"
          :key="project.id"
          class="group relative bg-white dark:bg-gray-800 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 border border-gray-100 dark:border-gray-700/50 overflow-hidden"
          :style="{
            '--accent-color': getStatusConfig(project.status).gradient.split(' ')[1]
          }"
          @click="openProject(project)"
        >
          <!-- Top accent line -->
          <div 
            class="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
            :class="'bg-gradient-to-r ' + getStatusConfig(project.status).gradient"
          ></div>
          
          <!-- Background decoration -->
          <div class="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-5 group-hover:opacity-10 transition-opacity duration-300"
               :class="'bg-gradient-to-br ' + getStatusConfig(project.status).gradient">
          </div>
          
          <div class="relative">
            <!-- Header -->
            <div class="flex justify-between items-start mb-5">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-400/20 dark:to-purple-400/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <BookOpen class="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                </div>
                <div>
                  <h4 class="font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1">
                    {{ project.name }}
                  </h4>
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        :class="getStatusConfig(project.status).color + '/10 text-' + getStatusConfig(project.status).color.replace('bg-', '')">
                    {{ getStatusConfig(project.status).text }}
                  </span>
                </div>
              </div>
              <NDropdown
                :show="activeMenuProjectRecent === project.id"
                :options="menuOptions"
                @select="(key: string) => handleMenuSelect(key, project, 'recent')"
                @clickoutside="activeMenuProjectRecent = null"
                placement="bottom-end"
                trigger="manual"
              >
                <button 
                  class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                  @click="toggleMenu(project.id, $event, 'recent')"
                >
                  <MoreHorizontal class="w-5 h-5 text-gray-400" />
                </button>
              </NDropdown>
            </div>

            <!-- Description -->
            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-5 min-h-[2.5rem]">
              {{ project.description || t('projectList.noDescription') }}
            </p>

            <!-- Stats Row -->
            <div class="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50">
              <div class="flex items-center gap-4">
                <span class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                    <FileText class="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <span class="font-medium">{{ formatWordCount(project.wordCount) }}</span>
                </span>
              </div>
              <span class="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <Clock class="w-3.5 h-3.5" />
                {{ formatDate(project.updatedAt) }}
              </span>
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
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 flex items-center justify-center">
                <BookOpen class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h4 class="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {{ project.name }}
                </h4>
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="getStatusConfig(project.status).color + '/10 text-' + getStatusConfig(project.status).color.replace('bg-', '')">
                  {{ getStatusConfig(project.status).text }}
                </span>
              </div>
            </div>
            <NDropdown
              :show="activeMenuProjectAll === project.id"
              :options="menuOptions"
              @select="(key: string) => handleMenuSelect(key, project, 'all')"
              @clickoutside="activeMenuProjectAll = null"
              placement="bottom-end"
              trigger="manual"
            >
              <button 
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                @click="toggleMenu(project.id, $event, 'all')"
              >
                <MoreHorizontal class="w-4 h-4 text-gray-400" />
              </button>
            </NDropdown>
          </div>

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

  <!-- Rename Modal -->
  <NModal
    v-model:show="showRenameModal"
    preset="card"
    title="重命名项目"
    class="max-w-md w-full"
    :bordered="false"
  >
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          项目名称
        </label>
        <NInput
          v-model:value="renameProjectName"
          placeholder="输入新名称"
          @keydown.enter="handleRename"
        />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-3">
        <NButton @click="cancelRename">
          取消
        </NButton>
        <NButton
          type="primary"
          :disabled="!renameProjectName.trim()"
          @click="handleRename"
        >
          确定
        </NButton>
      </div>
    </template>
  </NModal>

  <!-- Delete Confirmation Modal -->
  <NModal
    v-model:show="showDeleteModal"
    preset="card"
    title="删除项目"
    class="max-w-md w-full"
    :bordered="false"
    @after-leave="projectToDelete = null"
  >
    <div class="space-y-4">
      <div class="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
        <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
          <Trash2 class="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">确定要删除此项目吗？</h4>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            项目名称：<span class="font-medium">{{ projectToDelete?.name }}</span>
          </p>
          <p class="text-sm text-red-500 dark:text-red-400 mt-2">
            此操作不可撤销，所有项目数据将被永久删除。
          </p>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-3">
        <NButton @click="cancelDelete">
          取消
        </NButton>
        <NButton
          type="error"
          @click="handleDelete"
        >
          <template #icon>
            <Trash2 class="w-4 h-4" />
          </template>
          删除
        </NButton>
      </div>
    </template>
  </NModal>
</template>
