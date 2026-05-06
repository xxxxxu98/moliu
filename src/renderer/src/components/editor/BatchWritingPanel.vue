<script setup lang="ts">
/**
 * 批量写作面板 - 简化版
 * 从第一个空章节开始，自动连续续写
 */
import { ref, computed, watch } from "vue";
import {
  NButton,
  NProgress,
  NInputNumber,
  useMessage,
  NRadioGroup,
  NRadio,
} from "naive-ui";
import {
  Play,
  Pause,
  Square,
  Zap,
  Clock,
  BookOpen,
  Check,
  AlertCircle,
  Settings,
  Type,
} from "lucide-vue-next";
import {
  NSelect,
  NCollapse,
  NCollapseItem,
} from "naive-ui";
import { useI18n } from "vue-i18n";
import { useBatchWriter } from "@/composables/useBatchWriter";
import { useProjectStore } from "@/stores/project.store";
import type { UseBatchWriterReturn } from "@/composables/useBatchWriter";

const { t } = useI18n();
const message = useMessage();
const projectStore = useProjectStore();

const batchWriter = useBatchWriter();

const {
  isWriting,
  isPaused,
  currentChapterTitle,
  error,
  totalChapters,
  writtenChapters,
  remainingChapters,
  writtenWordCount,
  target,
  config,
  pauseWriting,
  resumeWriting,
  stopWriting,
} = batchWriter;

const startBatchWriting: UseBatchWriterReturn['startBatchWriting'] = batchWriter.startBatchWriting;

// 目标数量
const targetCount = ref(10);

// 写作模式
const writingMode = ref<'specific' | 'finish'>('specific');

// 批量写作配置
const batchConfig = ref({
  wordsPerChapter: 2000,
  writingStyle: 'humorous' as 'concise' | 'elegant' | 'humorous' | 'ancient',
});

// 下一章编号
const nextChapterNumber = computed(() => writtenChapters.value + 1);

// 预估时间
const estimatedTime = computed(() => {
  let chapters = writingMode.value === 'specific' ? targetCount.value : 10;
  if (chapters === 0) return '';
  const avgSecondsPerChapter = 45;
  const seconds = chapters * avgSecondsPerChapter;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `约 ${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `约 ${minutes} 分钟`;
  return `约 ${seconds} 秒`;
});

// 当前进度百分比
const progressPercentage = computed(() => {
  if (totalChapters.value === 0) return 0;
  return Math.round((writtenChapters.value / totalChapters.value) * 100);
});

// 开始写作
async function handleStart() {
  if (writingMode.value === 'specific') {
    target.value = 'specific';
    await startBatchWriting(targetCount.value, batchConfig.value);
  } else {
    target.value = 'finish';
    await startBatchWriting(undefined, batchConfig.value);
  }
}

// 暂停/继续
function handlePauseResume() {
  if (isPaused.value) {
    resumeWriting();
    message.success('已继续');
  } else {
    pauseWriting();
    message.info('已暂停');
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 标题 -->
    <div class="flex items-center gap-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
        <Zap class="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 class="font-semibold text-gray-900 dark:text-white">批量写作</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400">自动连续续写空章节</p>
      </div>
    </div>

    <!-- 进度卡片 -->
    <div class="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50 mb-6">
      <!-- 进度条 -->
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">写作进度</span>
          <span class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {{ writtenChapters }} / {{ totalChapters }} 章
          </span>
        </div>
        <NProgress
          type="line"
          :percentage="progressPercentage"
          :height="12"
          :border-radius="6"
          color="linear-gradient(90deg, #6366f1, #8b5cf6)"
          rail-color="rgba(99, 102, 241, 0.2)"
          :show-indicator="false"
        />
      </div>

      <!-- 统计 -->
      <div class="grid grid-cols-3 gap-3">
        <div class="text-center p-2 rounded-lg bg-white/60 dark:bg-gray-800/60">
          <div class="text-lg font-bold text-gray-900 dark:text-white">{{ writtenChapters }}</div>
          <div class="text-xs text-gray-500">已写</div>
        </div>
        <div class="text-center p-2 rounded-lg bg-white/60 dark:bg-gray-800/60">
          <div class="text-lg font-bold text-amber-600 dark:text-amber-400">{{ remainingChapters }}</div>
          <div class="text-xs text-gray-500">待写</div>
        </div>
        <div class="text-center p-2 rounded-lg bg-white/60 dark:bg-gray-800/60">
          <div class="text-lg font-bold text-indigo-600 dark:text-indigo-400">{{ writtenWordCount.toLocaleString() }}</div>
          <div class="text-xs text-gray-500">字数</div>
        </div>
      </div>
    </div>

    <!-- 当前状态 -->
    <div v-if="isWriting" class="mb-6 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
        <span class="text-sm font-medium text-amber-700 dark:text-amber-400">
          {{ isPaused ? '已暂停' : '正在写入' }}：第 {{ writtenChapters + 1 }} 章
        </span>
      </div>
    </div>

    <!-- 写作模式选择 -->
    <div v-if="!isWriting" class="mb-6">
      <div class="mb-3">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">写作目标</h4>
        <NRadioGroup v-model:value="writingMode" class="flex gap-4">
          <NRadio value="specific" label="写指定数量" />
          <NRadio value="finish" label="写到完结" />
        </NRadioGroup>
      </div>

      <!-- 指定数量输入 -->
      <div v-if="writingMode === 'specific'" class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-600 dark:text-gray-400">连续写</span>
          <NInputNumber
            v-model:value="targetCount"
            :min="1"
            :max="100"
            size="small"
            class="w-24"
          />
          <span class="text-sm text-gray-600 dark:text-gray-400">章</span>
        </div>
        <div class="mt-2 text-xs text-gray-400">
          从第 {{ nextChapterNumber }} 章开始 · 当前 {{ totalChapters }} 章（写完自动创建新章节）
        </div>
      </div>

      <!-- 写到完结 -->
      <div v-else class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          从第 {{ nextChapterNumber }} 章开始，写完现有章节后自动创建新章节
        </div>
        <div class="mt-1 text-xs text-gray-400">
          直到标记为"完结"为止
        </div>
      </div>

      <!-- 写作配置 -->
      <NCollapse class="mt-4" :default-expanded-names="['config']">
        <NCollapseItem title="写作配置" name="config">
          <div class="space-y-4">
            <!-- 每章字数 -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Type class="w-4 h-4 text-gray-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300 text-nowrap">每章字数</span>
              </div>
              <NSelect
                v-model:value="batchConfig.wordsPerChapter"
                :options="[
                  { label: '2000字', value: 2000 },
                  { label: '3000字', value: 3000 },
                  { label: '4000字', value: 4000 },
                  { label: '5000字', value: 5000 },
                ]"
                size="small"
                class="w-28"
              />
            </div>

            <!-- 写作风格 -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Settings class="w-4 h-4 text-gray-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300 text-nowrap">写作风格</span>
              </div>
              <NSelect
                v-model:value="batchConfig.writingStyle"
                :options="[
                  { label: '简洁流畅', value: 'concise' },
                  { label: '华丽典雅', value: 'elegant' },
                  { label: '幽默风趣', value: 'humorous' },
                  { label: '古风古韵', value: 'ancient' },
                ]"
                size="small"
                class="w-32"
              />
            </div>
          </div>
        </NCollapseItem>
      </NCollapse>
    </div>

    <!-- 控制按钮 -->
    <div class="flex gap-2 mb-6">
      <NButton
        v-if="!isWriting"
        type="primary"
        class="flex-1"
        @click="handleStart"
      >
        <template #icon>
          <Play class="w-4 h-4" />
        </template>
        {{ writingMode === 'finish' ? '开始写作（写到完结）' : '开始写作' }}
      </NButton>

      <NButton
        v-if="isWriting"
        type="warning"
        @click="handlePauseResume"
      >
        <template #icon>
          <Pause v-if="!isPaused" class="w-4 h-4" />
          <Play v-else class="w-4 h-4" />
        </template>
        {{ isPaused ? '继续' : '暂停' }}
      </NButton>

      <NButton
        v-if="isWriting"
        type="error"
        @click="stopWriting"
      >
        <template #icon>
          <Square class="w-4 h-4" />
        </template>
        停止
      </NButton>
    </div>

    <!-- 预估时间 -->
    <div v-if="!isWriting" class="mb-6 text-center">
      <div class="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Clock class="w-4 h-4" />
        <span>预计 {{ estimatedTime }}</span>
      </div>
    </div>

    <!-- 章节列表 -->
    <div class="flex-1 overflow-hidden flex flex-col">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">章节列表</h4>
      <div class="flex-1 overflow-y-auto space-y-2">
        <div
          v-for="(chapter, index) in projectStore.sortedChapters"
          :key="chapter.id"
          class="flex items-center gap-3 p-2 rounded-lg border transition-all text-sm"
          :class="[
            chapter.content && chapter.content.trim().length > 0
              ? 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30'
              : index === writtenChapters
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600'
                : 'bg-gray-50/50 dark:bg-gray-800/30 border-gray-200/50 dark:border-gray-700/30',
          ]"
        >
          <!-- 状态图标 -->
          <div class="w-5 h-5 flex items-center justify-center flex-shrink-0">
            <Check
              v-if="chapter.content && chapter.content.trim().length > 0"
              class="w-4 h-4 text-emerald-500"
            />
            <div
              v-else-if="index === writtenChapters"
              class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"
            />
            <span
              v-else
              class="text-xs text-gray-400"
            >
              {{ index + 1 }}
            </span>
          </div>

          <!-- 章节信息 -->
          <div class="flex-1 min-w-0">
            <div class="truncate text-gray-900 dark:text-white">
              {{ chapter.title }}
            </div>
          </div>

          <!-- 字数 -->
          <div class="text-xs text-gray-400">
            {{ chapter.wordCount || 0 }} 字
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="totalChapters === 0" class="text-center py-8">
          <BookOpen class="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p class="text-sm text-gray-500 dark:text-gray-400">暂无章节</p>
        </div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
      <div class="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
        <AlertCircle class="w-4 h-4 flex-shrink-0" />
        <span>{{ error }}</span>
      </div>
    </div>
  </div>
</template>
