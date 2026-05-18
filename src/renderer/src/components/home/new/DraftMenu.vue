<script setup lang="ts">
/**
 * DraftMenu - 草稿菜单组件
 * Moliu v2.0 - 管理草稿列表和操作
 */
import { ref, computed } from "vue";
import {
  FileText,
  Clock,
  MoreVertical,
  Trash2,
  Copy,
  Download,
  Star,
  StarOff,
  ChevronRight,
  FolderOpen,
} from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

interface Draft {
  id: string;
  title: string;
  synopsis: string;
  genre: string[];
  createdAt: number;
  updatedAt: number;
  wordCount: number;
  status: "draft" | "outlined" | "completed";
  isFavorite: boolean;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  drafts: Draft[];
  selectedId?: string;
}

interface Emits {
  (e: "select", draft: Draft): void;
  (e: "delete", id: string): void;
  (e: "duplicate", draft: Draft): void;
  (e: "export", draft: Draft): void;
  (e: "favorite", id: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  drafts: () => [],
  selectedId: undefined,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const openMenuId = ref<string | null>(null);
const filterStatus = ref<Draft["status"] | "all">("all");
const sortBy = ref<"updated" | "created" | "title">("updated");
const searchQuery = ref("");

// ============================================================
// Computed
// ============================================================

const filteredDrafts = computed(() => {
  let result = [...props.drafts];

  // 状态过滤
  if (filterStatus.value !== "all") {
    result = result.filter((d) => d.status === filterStatus.value);
  }

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (d) =>
        d.title.toLowerCase().includes(query) ||
        d.synopsis.toLowerCase().includes(query) ||
        d.genre.some((g) => g.toLowerCase().includes(query))
    );
  }

  // 排序
  switch (sortBy.value) {
    case "updated":
      result.sort((a, b) => b.updatedAt - a.updatedAt);
      break;
    case "created":
      result.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "title":
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }

  // 收藏优先
  const favorites = result.filter((d) => d.isFavorite);
  const nonFavorites = result.filter((d) => !d.isFavorite);
  return [...favorites, ...nonFavorites];
});

const statusCounts = computed(() => {
  return {
    all: props.drafts.length,
    draft: props.drafts.filter((d) => d.status === "draft").length,
    outlined: props.drafts.filter((d) => d.status === "outlined").length,
    completed: props.drafts.filter((d) => d.status === "completed").length,
  };
});

// ============================================================
// Methods
// ============================================================

function toggleMenu(id: string) {
  openMenuId.value = openMenuId.value === id ? null : id;
}

function selectDraft(draft: Draft) {
  emit("select", draft);
}

function deleteDraft(id: string) {
  openMenuId.value = null;
  emit("delete", id);
}

function duplicateDraft(draft: Draft) {
  openMenuId.value = null;
  emit("duplicate", draft);
}

function exportDraft(draft: Draft) {
  openMenuId.value = null;
  emit("export", draft);
}

function toggleFavorite(id: string) {
  openMenuId.value = null;
  emit("favorite", id);
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

function formatWordCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万字`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}千字`;
  return `${count}字`;
}

function getStatusColor(status: Draft["status"]): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    case "outlined":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "completed":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
}

function getStatusText(status: Draft["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "outlined":
      return "已提纲";
    case "completed":
      return "已完成";
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <FolderOpen class="w-5 h-5 text-indigo-500" />
        <h3 class="font-semibold text-gray-900 dark:text-white">草稿箱</h3>
        <span class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500">
          {{ statusCounts.all }}
        </span>
      </div>
    </div>

    <!-- Search & Filter -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800 space-y-3">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索草稿..."
          class="w-full px-3 py-2 pl-9 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <!-- Status Filter -->
      <div class="flex gap-1 overflow-x-auto pb-1">
        <button
          v-for="(count, status) in statusCounts"
          :key="status"
          class="px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          :class="[
            filterStatus === status
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
          ]"
          @click="filterStatus = status as any"
        >
          {{ status === 'all' ? '全部' : getStatusText(status as Draft['status']) }}
          <span class="ml-1 opacity-60">{{ count }}</span>
        </button>
      </div>
    </div>

    <!-- Sort -->
    <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
      <select
        v-model="sortBy"
        class="w-full px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
      >
        <option value="updated">最近更新</option>
        <option value="created">创建时间</option>
        <option value="title">标题</option>
      </select>
    </div>

    <!-- Draft List -->
    <div class="flex-1 overflow-y-auto">
      <div v-if="filteredDrafts.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
        <FileText class="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ searchQuery ? "未找到匹配的草稿" : "暂无草稿" }}
        </p>
      </div>

      <div v-else class="divide-y divide-gray-50 dark:divide-gray-800">
        <div
          v-for="draft in filteredDrafts"
          :key="draft.id"
          class="relative group"
          @mouseenter="openMenuId === null && (openMenuId = draft.id)"
          @mouseleave="openMenuId = null"
        >
          <!-- Draft Item -->
          <div
            class="px-4 py-3 cursor-pointer transition-colors"
            :class="[
              selectedId === draft.id
                ? 'bg-indigo-50 dark:bg-indigo-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
            ]"
            @click="selectDraft(draft)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <!-- Title Row -->
                <div class="flex items-center gap-2 mb-1">
                  <button
                    class="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    @click.stop="toggleFavorite(draft.id)"
                  >
                    <Star
                      v-if="draft.isFavorite"
                      class="w-4 h-4 text-amber-500 fill-current"
                    />
                    <StarOff v-else class="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  </button>
                  <h4 class="font-medium text-gray-900 dark:text-white truncate">
                    {{ draft.title || "无标题" }}
                  </h4>
                </div>

                <!-- Synopsis -->
                <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                  {{ draft.synopsis || "暂无简介" }}
                </p>

                <!-- Meta -->
                <div class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                  <span class="flex items-center gap-1">
                    <Clock class="w-3 h-3" />
                    {{ formatDate(draft.updatedAt) }}
                  </span>
                  <span>{{ formatWordCount(draft.wordCount) }}</span>
                  <span
                    class="px-1.5 py-0.5 rounded text-xs"
                    :class="getStatusColor(draft.status)"
                  >
                    {{ getStatusText(draft.status) }}
                  </span>
                </div>

                <!-- Genre Tags -->
                <div v-if="draft.genre.length > 0" class="flex flex-wrap gap-1 mt-2">
                  <span
                    v-for="g in draft.genre.slice(0, 3)"
                    :key="g"
                    class="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  >
                    {{ g }}
                  </span>
                  <span v-if="draft.genre.length > 3" class="text-xs text-gray-400">
                    +{{ draft.genre.length - 3 }}
                  </span>
                </div>
              </div>

              <!-- Arrow -->
              <ChevronRight class="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-6" />
            </div>
          </div>

          <!-- Actions Menu -->
          <div
            v-if="openMenuId === draft.id"
            class="absolute right-2 top-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
          >
            <button
              class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              @click.stop="toggleFavorite(draft.id)"
            >
              <Star v-if="draft.isFavorite" class="w-4 h-4 text-amber-500" />
              <StarOff v-else class="w-4 h-4" />
              {{ draft.isFavorite ? "取消收藏" : "收藏" }}
            </button>
            <button
              class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              @click.stop="duplicateDraft(draft)"
            >
              <Copy class="w-4 h-4" />
              复制
            </button>
            <button
              class="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              @click.stop="exportDraft(draft)"
            >
              <Download class="w-4 h-4" />
              导出
            </button>
            <hr class="my-1 border-gray-200 dark:border-gray-700" />
            <button
              class="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
              @click.stop="deleteDraft(draft.id)"
            >
              <Trash2 class="w-4 h-4" />
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
