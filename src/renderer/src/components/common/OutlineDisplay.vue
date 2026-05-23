<script setup lang="ts">
/**
 * 大纲列表展示组件
 * 封装大纲生成进度、列表展示、选中状态等通用 UI 逻辑
 */
import { computed, ref } from "vue";
import { ArrowRight, BookOpen, RefreshCw, Eye, LayoutGrid } from "lucide-vue-next";
import { NTooltip } from "naive-ui";
import { useI18n } from "vue-i18n";
import type { GeneratedOutline } from "@/types/inspiration";
import OutlineVisualizer from './OutlineVisualizer.vue';

const { t } = useI18n();

interface Props {
  /** 大纲列表 */
  outlines: GeneratedOutline[];
  /** 选中的大纲 */
  selectedOutline: GeneratedOutline | null;
  /** 是否正在生成 */
  isGenerating: boolean;
  /** 生成进度消息 */
  progress?: string;
  /** 错误消息 */
  error?: string | null;
  /** 是否禁用重新生成按钮 */
  disableRegenerate?: boolean;
  /** 是否显示预估字数 */
  showWordCount?: boolean;
  /** 是否显示流式预览（生成过程中实时显示进度） */
  showStreamingPreview?: boolean;
  /** 自定义类名 */
  customClass?: string;
}

interface Emits {
  (e: "select", outline: GeneratedOutline): void;
  (e: "regenerate"): void;
  (e: "create"): void;
}

const props = withDefaults(defineProps<Props>(), {
  progress: "",
  error: null,
  disableRegenerate: false,
  showWordCount: true,
  showStreamingPreview: true,
  customClass: "",
});

const emit = defineEmits<Emits>();

/** 是否有大纲 */
const hasOutlines = computed(() => props.outlines.length > 0);

/** 是否显示可视化视图 */
const showVisualization = ref(false);

/** 是否有可视化数据 */
const hasVisualizationData = computed(() => {
  if (!props.selectedOutline) return false;
  const outline = props.selectedOutline;
  return !!(outline.worldSetting || outline.characters?.length || outline.foreshadows?.length);
});

/** 是否显示流式预览（有进度消息且正在生成） */
const showStreaming = computed(
  () =>
    props.isGenerating &&
    props.showStreamingPreview &&
    props.outlines.length === 0 &&
    props.progress,
);

/** 是否显示加载状态（无大纲、无进度消息时） */
const showLoading = computed(
  () => props.isGenerating && props.outlines.length === 0 && !props.progress,
);

/** 是否显示错误 */
const showError = computed(() => props.error && !props.isGenerating);

/** 是否显示空状态 */
const showEmpty = computed(
  () =>
    !props.isGenerating &&
    !props.error &&
    props.outlines.length === 0,
);

/**
 * 格式化预估字数显示
 */
function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(0)}万字`;
  }
  return `${count}字`;
}

function handleSelectOutline(outline: GeneratedOutline) {
  emit("select", outline);
}

function handleRegenerate() {
  emit("regenerate");
}

function handleCreate() {
  emit("create");
}
</script>

<template>
  <div :class="customClass">
    <!-- 加载状态（无进度消息时） -->
    <div v-if="showLoading" class="py-8 text-center">
      <div
        class="w-12 h-12 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse"
      >
        <BookOpen class="w-6 h-6 text-white" />
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ progress || t("quickStart.generating") }}
      </p>
    </div>

    <!-- 流式预览（有进度消息时） -->
    <div v-if="showStreaming" class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-2 mb-2">
        <div
          class="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"
        ></div>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ t("quickStart.generating") }}
        </span>
      </div>
      <div class="text-xs text-gray-400 dark:text-gray-500 whitespace-pre-wrap">
        {{ progress }}
      </div>
    </div>

    <!-- 错误提示 -->
    <div
      v-if="showError"
      class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
    >
      <p class="text-sm text-red-600 dark:text-red-400">
        {{ error }}
      </p>
    </div>

    <!-- 大纲列表 -->
    <div v-if="hasOutlines" class="space-y-3">
      <!-- 列表头部 -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div
            class="w-1 h-4 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500"
          ></div>
          <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
            {{ t("quickStart.preparedOutlines") }}
          </h4>
          <span class="text-xs text-gray-400 dark:text-gray-500"
            >({{ outlines.length }}{{ t("quickStart.plans") }})</span
          >
        </div>
        <NTooltip trigger="hover">
          <template #trigger>
            <button
              class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="disableRegenerate || isGenerating"
              @click="handleRegenerate"
            >
              <RefreshCw
                class="w-4 h-4 text-gray-500 dark:text-gray-400"
                :class="{ 'animate-spin': isGenerating }"
              />
            </button>
          </template>
          换一批大纲
        </NTooltip>
      </div>

      <!-- 大纲卡片列表 -->
      <div class="space-y-2">
        <div
          v-for="outline in outlines"
          :key="outline.id"
          class="p-3 rounded-xl border-2 cursor-pointer transition-all duration-200"
          :class="[
            selectedOutline?.id === outline.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700 bg-white dark:bg-gray-800',
          ]"
          @click="handleSelectOutline(outline)"
        >
          <div class="flex items-start gap-2">
            <!-- 选中指示器 -->
            <div
              v-if="selectedOutline?.id === outline.id"
              class="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"
            >
              <svg
                class="w-3 h-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="3"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <!-- 标题 -->
              <h5
                class="font-medium text-sm text-gray-900 dark:text-white truncate"
              >
                {{ outline.title }}
              </h5>
              <!-- 简介（悬停显示完整内容） -->
              <NTooltip trigger="hover">
                <template #trigger>
                  <p
                    class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1 cursor-help"
                  >
                    {{ outline.synopsis }}
                  </p>
                </template>
                <div
                  class="max-w-sm max-h-48 overflow-y-auto text-sm text-gray-300 dark:text-gray-700 whitespace-pre-wrap"
                >
                  {{ outline.synopsis }}
                </div>
              </NTooltip>
              <!-- 元信息 -->
              <div
                v-if="showWordCount && outline.estimatedWordCount"
                class="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500"
              >
                <span>{{ formatWordCount(outline.estimatedWordCount) }}</span>
                <span
                  >{{ outline.characters?.length ||
                  0 }}{{ t("quickStart.characters") }}</span
                >
                <!-- 增强字段标签 -->
                <span v-if="outline.emotionGoal?.primary" class="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                  {{ outline.emotionGoal.primary }}
                </span>
                <span v-if="outline.coolPointDesign?.patterns?.length" class="px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                  {{ outline.coolPointDesign.patterns.slice(0, 2).join('、') }}
                </span>
                <span v-if="outline.conflictDesign?.source" class="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                  {{ outline.conflictDesign.source }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 可视化视图切换按钮 -->
      <div v-if="selectedOutline && hasVisualizationData" class="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <span class="text-xs text-gray-500 dark:text-gray-400">视图模式</span>
        <div class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
          <button
            class="px-2 py-1 rounded text-xs transition-colors"
            :class="!showVisualization 
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="showVisualization = false"
          >
            列表
          </button>
          <button
            class="px-2 py-1 rounded text-xs transition-colors"
            :class="showVisualization 
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            @click="showVisualization = true"
          >
            可视化
          </button>
        </div>
      </div>

      <!-- 可视化视图 -->
      <div v-if="showVisualization && selectedOutline" class="mt-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
        <OutlineVisualizer :outline="selectedOutline" />
      </div>

      <!-- 创建项目按钮 -->
      <button
        v-if="selectedOutline"
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        :disabled="isGenerating"
        @click="handleCreate"
      >
        <span v-if="!isGenerating">{{
          t("quickStart.createFromOutline")
        }}</span>
        <span
          v-else
          class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
        ></span>
        <ArrowRight v-if="!isGenerating" class="w-4 h-4" />
      </button>
    </div>

    <!-- 空状态 -->
    <div v-if="showEmpty" class="text-center py-4">
      <BookOpen class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">
        {{ t("quickStart.emptyDesc") }}
      </p>
    </div>
  </div>
</template>
