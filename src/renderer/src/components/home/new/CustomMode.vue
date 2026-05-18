<script setup lang="ts">
/**
 * CustomMode - 自定义模式
 * Moliu v2.0 - 完全自定义的创作模式
 */
import { ref, computed, watch } from "vue";
import {
  Settings,
  Sliders,
  PenTool,
  Layers,
  FileText,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  GripVertical,
  Copy,
  Sparkles,
} from "lucide-vue-next";
import TabSwitcher from "./TabSwitcher.vue";
import RetentionScoreCard from "./RetentionScoreCard.vue";

// ============================================================
// Types
// ============================================================

interface CustomChapter {
  id: string;
  title: string;
  synopsis: string;
  wordCount: number;
  status: "planning" | "writing" | "review" | "completed";
}

interface CustomSettings {
  writing: {
    temperature: number;
    maxTokens: number;
    style: "vivid" | "concise" | "balanced";
    perspective: "first" | "third";
  };
  quality: {
    enableCheck: boolean;
    minScore: number;
    enableDeAI: boolean;
  };
  outline: {
    depth: "brief" | "detailed" | "chapter";
    includeCharacters: boolean;
    includeSettings: boolean;
  };
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  projectData?: any;
}

interface Emits {
  (e: "save", data: { chapters: CustomChapter[]; settings: CustomSettings }): void;
  (e: "generate", chapter: CustomChapter): void;
  (e: "back"): void;
}

const props = withDefaults(defineProps<Props>(), {
  projectData: null,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const activeTab = ref("chapters");
const chapters = ref<CustomChapter[]>([
  {
    id: "1",
    title: "",
    synopsis: "",
    wordCount: 0,
    status: "planning",
  },
]);
const expandedChapterId = ref<string | null>(null);

const settings = ref<CustomSettings>({
  writing: {
    temperature: 0.7,
    maxTokens: 2000,
    style: "vivid",
    perspective: "third",
  },
  quality: {
    enableCheck: true,
    minScore: 70,
    enableDeAI: true,
  },
  outline: {
    depth: "detailed",
    includeCharacters: true,
    includeSettings: true,
  },
});

// 追读力评分预览
const previewScore = computed(() => ({
  hookScore: 70,
  coolpointScore: 65,
  microFulfillment: 60,
  suspenseDebt: 55,
  rhythmHealth: 65,
  originality: 60,
}));

// ============================================================
// Tabs
// ============================================================

const tabs = [
  { id: "chapters", label: "章节管理", icon: FileText },
  { id: "settings", label: "写作设置", icon: Settings },
  { id: "preview", label: "预览", icon: PenTool },
];

// ============================================================
// Methods
// ============================================================

function addChapter() {
  chapters.value.push({
    id: Date.now().toString(),
    title: "",
    synopsis: "",
    wordCount: 0,
    status: "planning",
  });
  expandedChapterId.value = chapters.value[chapters.value.length - 1].id;
}

function removeChapter(id: string) {
  const index = chapters.value.findIndex((c) => c.id === id);
  if (index > -1) {
    chapters.value.splice(index, 1);
    if (expandedChapterId.value === id) {
      expandedChapterId.value = null;
    }
  }
}

function duplicateChapter(chapter: CustomChapter) {
  const newChapter: CustomChapter = {
    ...chapter,
    id: Date.now().toString(),
    title: chapter.title ? `${chapter.title} (副本)` : "",
    status: "planning",
  };
  const index = chapters.value.findIndex((c) => c.id === chapter.id);
  chapters.value.splice(index + 1, 0, newChapter);
}

function toggleChapter(id: string) {
  expandedChapterId.value = expandedChapterId.value === id ? null : id;
}

function generateChapter(chapter: CustomChapter) {
  emit("generate", chapter);
}

function save() {
  emit("save", {
    chapters: chapters.value,
    settings: settings.value,
  });
}

function resetSettings() {
  settings.value = {
    writing: {
      temperature: 0.7,
      maxTokens: 2000,
      style: "vivid",
      perspective: "third",
    },
    quality: {
      enableCheck: true,
      minScore: 70,
      enableDeAI: true,
    },
    outline: {
      depth: "detailed",
      includeCharacters: true,
      includeSettings: true,
    },
  };
}

function getStatusColor(status: CustomChapter["status"]): string {
  switch (status) {
    case "planning":
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
    case "writing":
      return "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400";
    case "review":
      return "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400";
    case "completed":
      return "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400";
  }
}

function getStatusText(status: CustomChapter["status"]): string {
  switch (status) {
    case "planning":
      return "规划中";
    case "writing":
      return "写作中";
    case "review":
      return "审核中";
    case "completed":
      return "已完成";
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-white dark:bg-gray-900">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center gap-3">
        <div class="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white">
          <Sliders class="w-5 h-5" />
        </div>
        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">自定义创作</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">完全掌控你的创作过程</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          @click="resetSettings"
        >
          <RotateCcw class="w-4 h-4" />
          <span>重置</span>
        </button>
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium shadow-md hover:shadow-lg transition-all"
          @click="save"
        >
          <Save class="w-4 h-4" />
          <span>保存</span>
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="px-6 pt-4">
      <TabSwitcher
        v-model="activeTab"
        :tabs="tabs"
        variant="card"
        size="sm"
      />
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Chapters Tab -->
      <div v-if="activeTab === 'chapters'" class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-gray-900 dark:text-white">
            章节列表 ({{ chapters.length }})
          </h3>
          <button
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
            @click="addChapter"
          >
            <Plus class="w-4 h-4" />
            <span>添加章节</span>
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="(chapter, index) in chapters"
            :key="chapter.id"
            class="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
          >
            <!-- Chapter Header -->
            <div
              class="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              @click="toggleChapter(chapter.id)"
            >
              <GripVertical class="w-4 h-4 text-gray-400 cursor-grab" />
              <span class="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium flex items-center justify-center">
                {{ index + 1 }}
              </span>
              <div class="flex-1 min-w-0">
                <input
                  v-model="chapter.title"
                  type="text"
                  placeholder="章节标题..."
                  class="w-full bg-transparent font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                />
                <input
                  v-model="chapter.synopsis"
                  type="text"
                  placeholder="章节简介..."
                  class="w-full mt-0.5 bg-transparent text-sm text-gray-500 dark:text-gray-400 placeholder-gray-400 focus:outline-none"
                />
              </div>
              <span
                class="px-2 py-0.5 rounded text-xs font-medium"
                :class="getStatusColor(chapter.status)"
              >
                {{ getStatusText(chapter.status) }}
              </span>
              <component
                :is="expandedChapterId === chapter.id ? ChevronUp : ChevronDown"
                class="w-4 h-4 text-gray-400"
              />
            </div>

            <!-- Chapter Detail -->
            <div
              v-if="expandedChapterId === chapter.id"
              class="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30"
            >
              <div class="flex items-center gap-2 mb-3">
                <select
                  v-model="chapter.status"
                  class="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300"
                >
                  <option value="planning">规划中</option>
                  <option value="writing">写作中</option>
                  <option value="review">审核中</option>
                  <option value="completed">已完成</option>
                </select>
                <div class="flex-1" />
                <button
                  class="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 transition-colors"
                  title="复制"
                  @click="duplicateChapter(chapter)"
                >
                  <Copy class="w-4 h-4" />
                </button>
                <button
                  class="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-colors"
                  title="删除"
                  @click="removeChapter(chapter.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>

              <div class="flex gap-3">
                <button
                  class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-md hover:shadow-lg transition-all"
                  @click="generateChapter(chapter)"
                >
                  <Sparkles class="w-4 h-4" />
                  <span>生成内容</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Tab -->
      <div v-else-if="activeTab === 'settings'" class="max-w-2xl space-y-6">
        <!-- Writing Settings -->
        <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <PenTool class="w-5 h-5 text-indigo-500" />
            <h3 class="font-medium text-gray-900 dark:text-white">写作设置</h3>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">温度参数</label>
              <div class="flex items-center gap-3">
                <input
                  v-model.number="settings.writing.temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  class="w-32"
                />
                <span class="w-8 text-sm text-gray-500">{{ settings.writing.temperature }}</span>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">最大Token</label>
              <input
                v-model.number="settings.writing.maxTokens"
                type="number"
                min="500"
                max="8000"
                step="500"
                class="w-24 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-sm"
              />
            </div>

            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">写作风格</label>
              <div class="flex gap-1">
                <button
                  v-for="style in ['vivid', 'concise', 'balanced']"
                  :key="style"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  :class="
                    settings.writing.style === style
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  "
                  @click="settings.writing.style = style as any"
                >
                  {{ style === "vivid" ? "生动" : style === "concise" ? "简洁" : "平衡" }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">叙事视角</label>
              <div class="flex gap-1">
                <button
                  v-for="p in ['first', 'third']"
                  :key="p"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  :class="
                    settings.writing.perspective === p
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  "
                  @click="settings.writing.perspective = p as any"
                >
                  {{ p === "first" ? "第一人称" : "第三人称" }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Quality Settings -->
        <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <Layers class="w-5 h-5 text-amber-500" />
            <h3 class="font-medium text-gray-900 dark:text-white">质量控制</h3>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">启用质量检查</label>
              <button
                class="w-12 h-6 rounded-full transition-colors relative"
                :class="settings.quality.enableCheck ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="settings.quality.enableCheck = !settings.quality.enableCheck"
              >
                <span
                  class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  :class="settings.quality.enableCheck ? 'translate-x-7' : 'translate-x-1'"
                />
              </button>
            </div>

            <div v-if="settings.quality.enableCheck" class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">最低评分</label>
              <div class="flex items-center gap-3">
                <input
                  v-model.number="settings.quality.minScore"
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  class="w-32"
                />
                <span class="w-12 text-sm text-gray-500">{{ settings.quality.minScore }}分</span>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">启用去AI味</label>
              <button
                class="w-12 h-6 rounded-full transition-colors relative"
                :class="settings.quality.enableDeAI ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="settings.quality.enableDeAI = !settings.quality.enableDeAI"
              >
                <span
                  class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  :class="settings.quality.enableDeAI ? 'translate-x-7' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>
        </div>

        <!-- Outline Settings -->
        <div class="p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div class="flex items-center gap-2 mb-4">
            <FileText class="w-5 h-5 text-violet-500" />
            <h3 class="font-medium text-gray-900 dark:text-white">大纲设置</h3>
          </div>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">详细程度</label>
              <div class="flex gap-1">
                <button
                  v-for="d in ['brief', 'detailed', 'chapter']"
                  :key="d"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  :class="
                    settings.outline.depth === d
                      ? 'bg-indigo-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  "
                  @click="settings.outline.depth = d as any"
                >
                  {{ d === "brief" ? "简略" : d === "detailed" ? "详细" : "章节" }}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">包含角色设定</label>
              <button
                class="w-12 h-6 rounded-full transition-colors relative"
                :class="settings.outline.includeCharacters ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="settings.outline.includeCharacters = !settings.outline.includeCharacters"
              >
                <span
                  class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  :class="settings.outline.includeCharacters ? 'translate-x-7' : 'translate-x-1'"
                />
              </button>
            </div>

            <div class="flex items-center justify-between">
              <label class="text-sm text-gray-700 dark:text-gray-300">包含世界观设定</label>
              <button
                class="w-12 h-6 rounded-full transition-colors relative"
                :class="settings.outline.includeSettings ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="settings.outline.includeSettings = !settings.outline.includeSettings"
              >
                <span
                  class="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  :class="settings.outline.includeSettings ? 'translate-x-7' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Tab -->
      <div v-else class="max-w-xl">
        <h3 class="font-medium text-gray-900 dark:text-white mb-4">追读力评分</h3>
        <RetentionScoreCard :score="previewScore" />

        <h3 class="font-medium text-gray-900 dark:text-white mt-6 mb-4">章节预览</h3>
        <div class="space-y-3">
          <div
            v-for="(chapter, index) in chapters"
            :key="chapter.id"
            class="p-4 rounded-xl border border-gray-200 dark:border-gray-700"
          >
            <div class="flex items-center gap-3">
              <span class="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium flex items-center justify-center">
                {{ index + 1 }}
              </span>
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white">
                  {{ chapter.title || "无标题" }}
                </h4>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ chapter.synopsis || "暂无简介" }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
