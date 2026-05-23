<script setup lang="ts">
/**
 * 批量写作面板 - 增强版
 * 
 * 核心改进：
 * 1. 显示流水线状态（TaskBook → 起草 → 审查 → 润色 → 提交）
 * 2. 显示 Blocking 闸门状态
 * 3. 自适应审查严格度 - 失败时逐步降低
 * 4. 自动化程度高 - 无需人工干预
 */
import { ref, computed } from "vue";
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
  NTooltip,
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
  FileText,
  Sparkles,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  Gauge,
  ChevronDown,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useBatchWriter } from "@/composables/useBatchWriter";
import { useProjectStore } from "@/stores/project.store";
import type { UseBatchWriterReturn } from "@/composables/useBatchWriter";
import type { ReviewStrictness } from "@/services/review/blocking-review.service";

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
  // 自适应审查相关
  currentStrictness,
  initialStrictness,
  reviewAttempts,
  strictnessHistory,
  lowerStrictness,
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
  useTaskBook: true,
  useReview: true,
  requireBlockingPass: true,
  initialStrictness: 'normal' as ReviewStrictness,
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

// 审查严格度选项
const strictnessOptions = [
  { label: '宽松', value: 'relaxed', desc: 'AI味等问题自动通过', icon: ShieldCheck },
  { label: '正常', value: 'normal', desc: '中等严格，平衡质量与效率', icon: Shield },
  { label: '严格', value: 'strict', desc: '所有问题都会阻断', icon: ShieldAlert },
];

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

// 是否达到最大跳过限制
const reachedMaxSkips = computed(() => consecutiveSkips.value >= batchConfig.value.maxConsecutiveSkips);

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

// 获取严格度显示标签
function getStrictnessLabel(strictness: ReviewStrictness): string {
  switch (strictness) {
    case 'strict': return '严格';
    case 'normal': return '正常';
    case 'relaxed': return '宽松';
    default: return strictness;
  }
}

// 获取严格度颜色
function getStrictnessColor(strictness: ReviewStrictness): string {
  switch (strictness) {
    case 'strict': return 'text-red-500';
    case 'normal': return 'text-purple-500';
    case 'relaxed': return 'text-emerald-500';
    default: return 'text-gray-500';
  }
}

// 获取严格度背景色
function getStrictnessBg(strictness: ReviewStrictness): string {
  switch (strictness) {
    case 'strict': return 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
    case 'normal': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400';
    case 'relaxed': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400';
    default: return 'bg-gray-100 text-gray-600';
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
        <div class="flex items-center gap-2">
          <!-- 审查严格度指示器 -->
          <div class="flex items-center gap-1 px-2 py-1 rounded-full" :class="getStrictnessBg(currentStrictness)">
            <Shield class="w-3 h-3" />
            <span class="text-xs font-medium">{{ getStrictnessLabel(currentStrictness) }}</span>
          </div>
          <span 
            class="text-xs font-medium"
            :class="stepColors[currentPipelineStep] || 'text-gray-500'"
          >
            {{ currentPipelineStep }}
          </span>
        </div>
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
      <!-- 审查尝试次数 -->
      <div v-if="reviewAttempts > 0" class="mt-2 text-xs text-gray-500">
        审查尝试: {{ reviewAttempts }} 次
      </div>
    </div>

    <!-- 严格度降级提示 -->
    <div v-if="isWriting && reviewAttempts > 1" class="mb-4">
      <NAlert type="info" size="small" :show-icon="false">
        <div class="flex items-center gap-2">
          <RefreshCw class="w-3 h-3 text-blue-500 animate-spin" />
          <span class="text-xs">审查未通过，正在降低严格度继续...</span>
        </div>
      </NAlert>
    </div>

    <!-- 章节完成提示 -->
    <div v-if="error" class="mb-4">
      <NAlert type="warning" size="small">
        {{ error }}
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

            <!-- 审查严格度 -->
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <Gauge class="w-4 h-4 text-purple-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">初始审查严格度</span>
              </div>
              <div class="text-xs text-gray-400 mb-2">
                失败时会自动降低严格度，下一章重置
              </div>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="option in strictnessOptions"
                  :key="option.value"
                  class="p-2 rounded-lg border-2 transition-all text-center"
                  :class="[
                    batchConfig.initialStrictness === option.value
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                  ]"
                  @click="batchConfig.initialStrictness = option.value as ReviewStrictness"
                >
                  <component :is="option.icon" class="w-4 h-4 mx-auto mb-1" :class="batchConfig.initialStrictness === option.value ? 'text-purple-500' : 'text-gray-400'" />
                  <div class="text-xs font-medium" :class="batchConfig.initialStrictness === option.value ? 'text-purple-600 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400'">
                    {{ option.label }}
                  </div>
                  <div class="text-[10px] text-gray-400 mt-1">
                    {{ option.desc }}
                  </div>
                </button>
              </div>
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

            <!-- 自适应审查说明 -->
            <div class="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50">
              <div class="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 mb-1">
                <FileText class="w-3 h-3" />
                <span>自适应审查策略</span>
              </div>
              <div class="text-[10px] text-indigo-500 dark:text-indigo-400 space-y-1">
                <div>1. 审查失败时自动降低严格度</div>
                <div>2. 每章不跳过，直到通过或最低严格度</div>
                <div>3. 下一章自动重置为初始严格度</div>
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
