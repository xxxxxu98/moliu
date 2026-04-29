<script setup lang="ts">
/**
 * 批量写作面板组件
 * 提供批量写作的控制界面
 */
import { ref, computed, watch, onMounted } from "vue";
import {
  NButton,
  NProgress,
  NTag,
  NSwitch,
  NInputNumber,
  useMessage,
  NRadioGroup,
  NRadioButton,
} from "naive-ui";
import {
  Play,
  Pause,
  Square,
  SkipForward,
  RefreshCw,
  BookOpen,
  Check,
  AlertCircle,
  Clock,
  Zap,
  Target,
  ListOrdered,
  FileText,
  Info,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useBatchWriter } from "@/composables/useBatchWriter";

const { t } = useI18n();
const message = useMessage();

const {
  isWriting,
  isPaused,
  currentChapterTitle,
  progress,
  queue,
  error,
  completedCount,
  totalCount,
  pendingCount,
  progressPercentage,
  writingScope,
  config,
  initializeQueue,
  setWritingScope,
  startBatchWriting,
  pauseWriting,
  resumeWriting,
  stopWriting,
  skipChapter,
  retryFailedChapters,
  resetQueue,
} = useBatchWriter();

// 写作模式
type WritingModeType = 'all' | 'remaining' | 'specific';

const writingMode = ref<WritingModeType>('remaining');

// 写作配置
const localConfig = ref({
  wordsPerChapter: 3000,
  style: 'concise' as 'concise' | 'elegant' | 'humorous' | 'ancient',
  temperature: 0.7,
  chapterCount: 10, // 指定要写的章节数
});

// 写作模式选项
const writingModeOptions = [
  { 
    value: 'remaining', 
    label: '待写章节', 
    description: '继续写未完成的章节',
    icon: ListOrdered,
  },
  { 
    value: 'all', 
    label: '全部章节', 
    description: '重写所有章节（会覆盖已有内容）',
    icon: FileText,
  },
  { 
    value: 'specific', 
    label: '指定数量', 
    description: '写指定数量的新章节',
    icon: Target,
  },
];

const styleOptions = [
  { label: '简洁有力', value: 'concise' },
  { label: '文笔华丽', value: 'elegant' },
  { label: '幽默风趣', value: 'humorous' },
  { label: '古风典雅', value: 'ancient' },
];

const wordCountOptions = [
  { label: '2000字/章', value: 2000 },
  { label: '3000字/章', value: 3000 },
  { label: '4000字/章', value: 4000 },
  { label: '5000字/章', value: 5000 },
];

// 监听写作模式变化
watch(writingMode, (newMode) => {
  if (newMode === 'remaining') {
    setWritingScope('remaining');
  } else if (newMode === 'all') {
    setWritingScope('all');
  }
});

// 获取待写章节数
const remainingChapters = computed(() => {
  return queue.tasks.filter(t => t.status === 'idle' || t.status === 'failed').length;
});

// 获取目标描述
const targetDescription = computed(() => {
  const total = queue.tasks.length;
  const completed = completedCount.value;
  const remaining = pendingCount.value;
  
  if (remaining === 0) {
    return `目标已完成（${completed}/${total} 章）`;
  }
  
  switch (writingMode.value) {
    case 'remaining':
      return `目标：写完 ${remaining} 章待写章节`;
    case 'all':
      return `目标：重写全部 ${total} 章`;
    case 'specific':
      return `目标：写 ${localConfig.value.chapterCount} 章`;
    default:
      return `目标：写 ${remaining} 章`;
  }
});

// 获取实际要写的章节数
const chaptersToWrite = computed(() => {
  switch (writingMode.value) {
    case 'remaining':
      return pendingCount.value;
    case 'all':
      return queue.tasks.length;
    case 'specific':
      return Math.min(localConfig.value.chapterCount, queue.tasks.length);
    default:
      return pendingCount.value;
  }
});

// 计算预估时间（假设每章约需 30-60 秒）
const estimatedTime = computed(() => {
  const remaining = chaptersToWrite.value;
  const avgSecondsPerChapter = 45; // 平均每章 45 秒
  const seconds = remaining * avgSecondsPerChapter;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `约 ${hours} 小时 ${minutes} 分钟`;
  }
  if (minutes > 0) {
    return `约 ${minutes} 分钟`;
  }
  return `约 ${seconds} 秒`;
});

// 获取状态标签类型
function getStatusType(status: string): "default" | "success" | "warning" | "error" | "info" {
  const typeMap: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
    idle: 'default',
    preparing: 'info',
    writing: 'warning',
    completed: 'success',
    failed: 'error',
    paused: 'default',
  };
  return typeMap[status] || 'default';
}

function getStatusText(status: string): string {
  const textMap: Record<string, string> = {
    idle: '待写',
    preparing: '准备中',
    writing: '写作中',
    completed: '已完成',
    failed: '失败',
    paused: '已暂停',
  };
  return textMap[status] || status;
}

// 处理开始写作
async function handleStartWriting() {
  if (chaptersToWrite.value === 0) {
    message.warning('没有可写的章节');
    return;
  }

  // 先设置写作范围
  if (writingMode.value === 'specific') {
    setWritingScope('specific', localConfig.value.chapterCount);
  } else {
    setWritingScope(writingMode.value as 'remaining' | 'all');
  }

  await startBatchWriting({
    wordsPerChapter: localConfig.value.wordsPerChapter,
    writingStyle: localConfig.value.style,
    temperature: localConfig.value.temperature,
  });
}

// 处理重置队列
function handleResetQueue() {
  resetQueue();
  message.success('队列已重置');
}

// 处理暂停/继续
function handlePauseResume() {
  if (isPaused.value) {
    resumeWriting();
    message.success('已继续写作');
  } else {
    pauseWriting();
    message.info('已暂停写作');
  }
}

// 初始化队列
onMounted(() => {
  initializeQueue();
});
</script>

<template>
  <div class="flex flex-col h-full space-y-4 overflow-y-auto">
    <!-- 批量写作控制区 -->
    <div class="mb-6">
      <!-- 标题 -->
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Zap class="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">批量写作</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">AI 辅助批量创作章节</p>
        </div>
      </div>

      <!-- 目标设定卡片 -->
      <div class="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50 mb-4">
        <!-- 目标描述 -->
        <div class="flex items-center gap-2 mb-3">
          <Target class="w-4 h-4 text-indigo-500" />
          <span class="text-sm font-medium text-indigo-700 dark:text-indigo-400">
            {{ targetDescription }}
          </span>
        </div>
        
        <!-- 进度条 -->
        <div class="mb-3">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-gray-500 dark:text-gray-400">总体进度</span>
            <span class="text-sm text-indigo-600 dark:text-indigo-400 font-semibold">{{ progressPercentage }}%</span>
          </div>
          <NProgress
            type="line"
            :percentage="progressPercentage"
            :height="10"
            :border-radius="5"
            :fill-border-radius="5"
            color="linear-gradient(90deg, #6366f1, #8b5cf6)"
            rail-color="rgba(99, 102, 241, 0.2)"
            :show-indicator="false"
          />
        </div>

        <!-- 统计信息 -->
        <div class="grid grid-cols-4 gap-2">
          <div class="text-center p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
            <div class="text-lg font-bold text-gray-900 dark:text-white">{{ queue.tasks.length }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">总章节</div>
          </div>
          <div class="text-center p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/20">
            <div class="text-lg font-bold text-emerald-600 dark:text-emerald-400">{{ completedCount }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">已完成</div>
          </div>
          <div class="text-center p-2 rounded-lg bg-amber-50/50 dark:bg-amber-900/20">
            <div class="text-lg font-bold text-amber-600 dark:text-amber-400">{{ pendingCount }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">待写</div>
          </div>
          <div class="text-center p-2 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/20">
            <div class="text-lg font-bold text-indigo-600 dark:text-indigo-400">{{ queue.totalWordCount.toLocaleString() }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">已写字数</div>
          </div>
        </div>
      </div>

      <!-- 当前章节状态 -->
      <div v-if="isWriting" class="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 mb-4">
        <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
          <span class="text-sm font-medium">
            {{ isPaused ? '已暂停' : '正在写入' }}：{{ currentChapterTitle || '加载中...' }}
          </span>
        </div>
      </div>

      <!-- 控制按钮 -->
      <div class="flex items-center gap-2 mb-4">
        <!-- 开始/继续写作 -->
        <NButton
          v-if="!isWriting"
          type="primary"
          class="flex-1"
          :disabled="chaptersToWrite === 0"
          @click="handleStartWriting"
        >
          <template #icon>
            <Play class="w-4 h-4" />
          </template>
          {{ chaptersToWrite === 0 ? '无可写章节' : `开始写作（${chaptersToWrite} 章）` }}
        </NButton>

        <!-- 暂停/继续 -->
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

        <!-- 停止 -->
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

        <!-- 跳过当前 -->
        <NButton
          v-if="isWriting && !isPaused"
          quaternary
          @click="skipChapter"
        >
          <template #icon>
            <SkipForward class="w-4 h-4" />
          </template>
        </NButton>

        <!-- 重试失败 -->
        <NButton
          v-if="queue.tasks.some(t => t.status === 'failed') && !isWriting"
          type="info"
          @click="retryFailedChapters"
        >
          <template #icon>
            <RefreshCw class="w-4 h-4" />
          </template>
          重试
        </NButton>

        <!-- 重置队列 -->
        <NButton
          v-if="!isWriting && (completedCount > 0 || queue.tasks.length > 0)"
          quaternary
          @click="handleResetQueue"
        >
          <template #icon>
            <RefreshCw class="w-4 h-4" />
          </template>
          重置
        </NButton>
      </div>

      <!-- 预估时间 -->
      <div v-if="!isWriting && chaptersToWrite > 0" class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Clock class="w-4 h-4" />
        <span>{{ estimatedTime }}</span>
        <span class="text-gray-400">·</span>
        <span>预计每章 30-60 秒</span>
      </div>
    </div>

    <!-- 写作范围设置 -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <ListOrdered class="w-4 h-4 text-gray-500" />
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">写作范围</h4>
      </div>
      
      <!-- 写作模式选择 -->
      <div class="space-y-2 mb-3">
        <div
          v-for="option in writingModeOptions"
          :key="option.value"
          class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
          :class="[
            writingMode === option.value
              ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700',
            isWriting ? 'opacity-50 cursor-not-allowed' : ''
          ]"
          @click="!isWriting && (writingMode = option.value as WritingModeType)"
        >
          <div
            class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
            :class="[
              writingMode === option.value
                ? 'border-indigo-500 bg-indigo-500'
                : 'border-gray-300 dark:border-gray-600'
            ]"
          >
            <div
              v-if="writingMode === option.value"
              class="w-2 h-2 rounded-full bg-white"
            ></div>
          </div>
          <component :is="option.icon" class="w-4 h-4 text-gray-400" />
          <div class="flex-1">
            <div class="text-sm font-medium text-gray-900 dark:text-white">{{ option.label }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ option.description }}</div>
          </div>
          <div v-if="option.value === 'remaining'" class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {{ remainingChapters }} 章
          </div>
        </div>
      </div>

      <!-- 指定数量输入 -->
      <div v-if="writingMode === 'specific'" class="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-600 dark:text-gray-400">要写的章节数：</span>
          <NInputNumber
            v-model:value="localConfig.chapterCount"
            :min="1"
            :max="queue.tasks.length || 100"
            size="small"
            class="w-24"
            :disabled="isWriting"
          />
          <span class="text-xs text-gray-400">章</span>
        </div>
      </div>
    </div>

    <!-- 配置选项 -->
    <div class="mb-6">
      <div class="flex items-center gap-2 mb-3">
        <Info class="w-4 h-4 text-gray-500" />
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">写作配置</h4>
      </div>
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400 text-nowrap">每章字数</span>
          <NSelect
            v-model:value="localConfig.wordsPerChapter"
            :options="wordCountOptions"
            size="small"
            class="w-32"
            :disabled="isWriting"
          />
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400 text-nowrap">写作风格</span>
          <NSelect
            v-model:value="localConfig.style"
            :options="styleOptions"
            size="small"
            class="w-32"
            :disabled="isWriting"
          />
        </div>
      </div>
    </div>

    <!-- 章节列表 -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">章节列表</h4>
        <span class="text-xs text-gray-400">{{ queue.tasks.filter(t => t.status === 'completed').length }}/{{ queue.tasks.length }} 完成</span>
      </div>
      <div class="space-y-2 max-h-64 overflow-y-auto">
        <div
          v-for="(task, index) in queue.tasks"
          :key="task.id"
          class="flex items-center gap-3 p-3 rounded-xl border transition-all"
          :class="[
            task.status === 'completed'
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
              : task.status === 'failed'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50'
                : task.status === 'writing'
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
          ]"
        >
          <!-- 状态图标 -->
          <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">
            <Check v-if="task.status === 'completed'" class="w-4 h-4 text-emerald-500" />
            <AlertCircle v-else-if="task.status === 'failed'" class="w-4 h-4 text-red-500" />
            <div v-else-if="task.status === 'writing'" class="w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin"></div>
            <span v-else class="text-xs text-gray-400">{{ index + 1 }}</span>
          </div>

          <!-- 章节信息 -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
              {{ task.chapterTitle }}
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <NTag :type="getStatusType(task.status)" size="small" round>
                {{ getStatusText(task.status) }}
              </NTag>
              <span v-if="task.status === 'writing'" class="text-xs text-amber-600 dark:text-amber-400">
                {{ task.progress }}%
              </span>
              <span v-if="task.error" class="text-xs text-red-500 truncate max-w-[100px]">
                {{ task.error }}
              </span>
            </div>
          </div>

          <!-- 进度条（写作中） -->
          <div v-if="task.status === 'writing'" class="w-16">
            <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-amber-500 rounded-full transition-all"
                :style="{ width: `${task.progress}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="queue.tasks.length === 0" class="text-center py-8">
        <BookOpen class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p class="text-sm text-gray-500 dark:text-gray-400">暂无章节</p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">请先在左侧创建章节</p>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50">
      <div class="flex items-start gap-2">
        <AlertCircle class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p class="text-sm text-red-700 dark:text-red-400 font-medium">写作出错</p>
          <p class="text-xs text-red-600 dark:text-red-500 mt-1">{{ error }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
