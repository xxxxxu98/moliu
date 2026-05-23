<script setup lang="ts">
/**
 * 批量写作面板 - 增强版
 * 
 * 核心改进：
 * 1. 显示流水线状态（TaskBook → 起草 → 审查 → 润色 → 提交）
 * 2. 显示 Blocking 闸门状态
 * 3. 显示阻塞问题列表
 */
import { ref, computed, watch } from "vue";
import {
  NButton,
  NProgress,
  NInputNumber,
  useMessage,
  NRadioGroup,
  NRadio,
  NTag,
  NCollapse,
  NCollapseItem,
  NAlert,
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
  ChevronRight,
  FileText,
  Sparkles,
  RefreshCw,
  Shield,
  ShieldAlert,
  CheckCircle,
} from "lucide-vue-next";
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
  pipelineStatus,
  currentPipelineStep,
  blockingIssues,
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
  useTaskBook: true,        // 强制为 true
  useReview: true,
  requireBlockingPass: true,
});

// 流水线步骤图标映射
const stepIcons = {
  idle: CheckCircle,
  '生成任务书': FileText,
  'AI起草': Zap,
  '审查（Blocking闸门）': Shield,
  '润色（去AI味）': Sparkles,
  '保存': Check,
  '提交': CheckCircle,
  '提取记忆': BookOpen,
};

// 流水线步骤颜色
const stepColors = {
  idle: 'text-gray-400',
  '生成任务书': 'text-blue-500',
  'AI起草': 'text-indigo-500',
  '审查（Blocking闸门）': 'text-purple-500',
  '润色（去AI味）': 'text-amber-500',
  '保存': 'text-emerald-500',
  '提交': 'text-emerald-500',
  '提取记忆': 'text-gray-500',
};

// 下一章编号
const nextChapterNumber = computed(() => writtenChapters.value + 1);

// 预估时间
const estimatedTime = computed(() => {
  let chapters = writingMode.value === 'specific' ? targetCount.value : 10;
  if (chapters === 0) return '';
  const avgSecondsPerChapter = 60; // 考虑到 TaskBook + 审查，时间更长
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

// 是否有阻塞问题
const hasBlockingIssues = computed(() => blockingIssues.value.length > 0);

// 流水线步骤列表
const pipelineSteps = computed(() => [
  { name: '任务书', key: 'taskbook', status: getStepStatus('生成任务书') },
  { name: '起草', key: 'draft', status: getStepStatus('AI起草') },
  { name: '审查', key: 'review', status: getStepStatus('审查（Blocking闸门）') },
  { name: '润色', key: 'polish', status: getStepStatus('润色（去AI味）') },
  { name: '提交', key: 'commit', status: getStepStatus('提交') },
]);

function getStepStatus(stepName: string): 'pending' | 'active' | 'completed' | 'blocked' {
  const current = currentPipelineStep.value;
  
  if (current === 'idle') return 'pending';
  
  const order = ['生成任务书', 'AI起草', '审查（Blocking闸门）', '润色（去AI味）', '保存', '提交', '提取记忆'];
  const currentIndex = order.indexOf(current);
  const stepIndex = order.indexOf(stepName);
  
  if (currentIndex === stepIndex) return 'active';
  if (currentIndex > stepIndex) return 'completed';
  return 'pending';
}

// 开始写作
async function handleStart() {
  if (writingMode.value === 'specific') {
    target.value = 'specific';
    await startBatchWriting(targetCount.value, {
      ...batchConfig.value,
      useTaskBook: true,  // 强制
    });
  } else {
    target.value = 'finish';
    await startBatchWriting(undefined, {
      ...batchConfig.value,
      useTaskBook: true,  // 强制
    });
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

// 获取问题严重度标签类型
function getSeverityType(severity: string): 'error' | 'warning' | 'info' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    default:
      return 'info';
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

    <!-- 流水线状态 -->
    <div v-if="isWriting" class="mb-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-gray-600 dark:text-gray-400">写作流水线</span>
        <span 
          class="text-xs font-medium"
          :class="stepColors[currentPipelineStep] || 'text-gray-500'"
        >
          {{ currentPipelineStep }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <template v-for="(step, index) in pipelineSteps" :key="step.key">
          <div 
            class="flex-1 h-1 rounded-full transition-all"
            :class="{
              'bg-indigo-500': step.status === 'completed' || step.status === 'active',
              'bg-gray-200 dark:bg-gray-700': step.status === 'pending',
              'bg-red-500': step.status === 'blocked',
            }"
          />
        </template>
      </div>
      <div class="flex justify-between mt-1">
        <span 
          v-for="step in pipelineSteps" 
          :key="step.key"
          class="text-[10px]"
          :class="step.status === 'active' ? 'text-indigo-500 font-medium' : 'text-gray-400'"
        >
          {{ step.name }}
        </span>
      </div>
    </div>

    <!-- Blocking 闸门警告 -->
    <div v-if="hasBlockingIssues" class="mb-4">
      <NAlert type="error" :title="`${blockingIssues.length} 个阻断问题`" size="small">
        <div class="space-y-2 max-h-32 overflow-y-auto">
          <div 
            v-for="(issue, index) in blockingIssues" 
            :key="index"
            class="text-xs"
          >
            <span class="font-medium">{{ issue.category }}:</span>
            {{ issue.description }}
          </div>
        </div>
        <div class="mt-2 flex gap-2">
          <NButton size="tiny" @click="batchWriter.retryCurrentStep">
            <template #icon><RefreshCw class="w-3 h-3" /></template>
            重试
          </NButton>
          <NButton size="tiny" quaternary @click="batchWriter.skipBlockingIssues">
            跳过
          </NButton>
        </div>
      </NAlert>
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
          {{ isPaused ? '已暂停' : '正在写入' }}：{{ currentChapterTitle }}
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
          从第 {{ nextChapterNumber }} 章开始 · 当前 {{ totalChapters }} 章
        </div>
      </div>

      <!-- 写到完结 -->
      <div v-else class="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          从第 {{ nextChapterNumber }} 章开始，写完现有章节后自动创建新章节
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

            <!-- Blocking 闸门配置 -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <Shield class="w-4 h-4 text-purple-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300 text-nowrap">Blocking闸门</span>
              </div>
              <NTag :type="batchConfig.requireBlockingPass ? 'error' : 'default'" size="small">
                {{ batchConfig.requireBlockingPass ? '必须通过' : '可跳过' }}
              </NTag>
            </div>

            <!-- TaskBook 强制提示 -->
            <div class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50">
              <div class="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400">
                <FileText class="w-3 h-3" />
                <span>写作任务书（TaskBook）已作为核心前置步骤</span>
              </div>
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
