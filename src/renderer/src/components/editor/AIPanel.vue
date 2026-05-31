<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  NScrollbar,
  NInput,
  NSpin,
  NTag,
  NSelect,
  useMessage,
  useDialog,
  NDropdown,
  type DropdownOption,
} from "naive-ui";
import {
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Wand2,
  Lightbulb,
  Database,
  AlertCircle,
  ChevronDown,
  Zap,
  Play,
  Pause,
  Square,
  Sparkle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  FileText,
  TrendingUp,
  SkipForward,
  Download,
  FileJson,
  File,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useAIService } from "@/services/ai/useAIService";
import { useChapterWriter } from "@/composables/useChapterWriter";
import { DeAIService } from "@/services/writing/de-ai-service";
import BatchWritingPanel from "./BatchWritingPanel.vue";
import ProgressPerceptionPanel from "./ProgressPerceptionPanel.vue";
import type { AISuggestion } from "@/services/ai/base.service";

const { t } = useI18n();
const projectStore = useProjectStore();
const settingsStore = useSettingsStore();
const message = useMessage();
const dialog = useDialog();

// Props
const props = defineProps<{
  editorRef?: {
    insertText: (text: string) => void;
    appendText: (text: string) => void;
    replaceSelectedText: (text: string) => void;
    getSelectedText: () => string;
    getContent: () => string;
    getCursorPosition: () => { start: number; end: number } | null;
    saveChapter: () => Promise<void>;
  };
}>();

// AI Service
const {
  isGenerating,
  isAnalyzing,
  isLoadingMemory,
  isStreaming,
  generatedText,
  suggestions,
  memoryContext,
  error,
  activeProvider,
  currentModel,
  generate,
  generateStream,
  analyzeChapter,
  loadMemoryContext,
  clearResult,
  initAIService,
} = useAIService();

// UI State
const selectedMode = ref<
  "continue" | "suggestions" | "memory" | "batch" | "deai" | "progress"
>("continue");
const selectedSubMode = ref<"smartContinue" | "polish">("smartContinue");
const customPrompt = ref("");
const copied = ref(false);
const showSettingsTip = ref(false);

// 去AI味相关状态
const isDeAIDetecting = ref(false);
const isDeAIFixing = ref(false);
const deAIResult = ref<{
  level: string;
  issues: Array<{
    type: string;
    severity: string;
    position: { start: number; end: number };
    original: string;
    suggestion?: string;
  }>;
  suggestions: string[];
} | null>(null);
const deAIFixedContent = ref<string>("");
const selectedTextForDeAI = ref("");

// 写作风格相关状态
const selectedWritingStyle = ref<'concise' | 'elegant' | 'humorous' | 'ancient'>('humorous');
const writingStyleOptions = [
  { label: '简洁有力', value: 'concise' },
  { label: '文笔华丽', value: 'elegant' },
  { label: '幽默风趣', value: 'humorous' },
  { label: '古风典雅', value: 'ancient' },
];

// 一键续写相关
const selectedWordCount = ref<number>(2500);
const showWordCountDropdown = ref(false);

const wordCountOptions = [
  { label: "续写 1000 字", value: 1000 },
  { label: "续写 2500 字", value: 2500 },
  { label: "续写 3500 字", value: 3500 },
  { label: "续写 5500 字", value: 5500 },
  { label: "续写 7500 字", value: 7500 },
  { label: "续写 10000 字", value: 10000 },
];

// 使用单章写作 composable
const {
  isGenerating: isOneClickGenerating,
  progress: oneClickProgress,
  error: oneClickError,
  generatedContent: oneClickGeneratedContent,
  currentStep,
  blockingIssues,
  reviewResult,
  actualWordCount,
  targetWordCount,
  isSupplementing,
  supplementRound,
  latestReport,
  writeChapter,
  applyGeneratedContent,
  copyToClipboard: copyOneClickContent,
  reset: resetChapterWriter,
  retryCurrentStep,
  skipBlockingIssues,
  supplementContinue,
  checkAndSupplement,
  exportReport: exportChapterReport,
  getReport,
} = useChapterWriter();

// Computed
const hasContent = computed(
  () => projectStore.currentChapter && projectStore.currentChapter.content,
);
const hasProvider = computed(() => !!activeProvider.value);

// 默认选中模式：没有 provider 时选中记忆标签
const effectiveSelectedMode = computed(() => {
  if (
    !hasProvider.value &&
    (selectedMode.value === "continue" || selectedMode.value === "suggestions")
  ) {
    return "memory";
  }
  return selectedMode.value;
});

const tabOptions = computed(() => [
  {
    key: "continue" as const,
    label: t("editor.continueWriting"),
    icon: Sparkles,
  },
  {
    key: "progress" as const,
    label: "进度感知",
    icon: TrendingUp,
  },
  {
    key: "deai" as const,
    label: "去AI味",
    icon: Sparkle,
  },
  {
    key: "batch" as const,
    label: "批量写作",
    icon: Zap,
  },
  {
    key: "suggestions" as const,
    label: t("editor.suggestions"),
    icon: Lightbulb,
  },
  { key: "memory" as const, label: t("editor.memory"), icon: Database },
]);

// Watch for tab changes
watch(selectedMode, (newMode) => {
  if (newMode === "memory" && !memoryContext.value.location) {
    loadMemoryContext();
  }
});

// Watch for chapter changes to reset generated content
watch(() => projectStore.currentChapterId, () => {
  resetChapterWriter();
  clearResult();
});

// 切换标签页
function handleTabChange(
  tabKey: "continue" | "suggestions" | "memory" | "batch" | "deai" | "progress",
) {
  if (
    !hasProvider.value &&
    (tabKey === "continue" || tabKey === "suggestions")
  ) {
    message.warning("请先在设置中配置 AI 服务", {
      duration: 2000000,
    });
    return;
  }
  selectedMode.value = tabKey;
}

// Initialize on mount
onMounted(() => {
  initAIService();
  if (settingsStore.aiProviders.length === 0 || !activeProvider.value) {
    showSettingsTip.value = true;
  }
});

// Methods
// 自定义续写的默认字数（用于没有字数选择器的场景）
const customWritingWordCount = ref<number>(3000);

async function handleGenerate() {
  if (!hasProvider.value) {
    message.warning("请先在设置中配置 AI 服务");
    return;
  }

  if (!hasContent.value) {
    message.warning("当前章节内容为空");
    return;
  }

  try {
    if (settingsStore.streamOutput && !isGenerating.value) {
      // Stream mode - 传递目标字数
      await generateStream(
        selectedSubMode.value,
        customPrompt.value || undefined,
        customWritingWordCount.value,
      );
    } else {
      // Non-stream mode - 传递目标字数
      await generate(
        selectedSubMode.value,
        customPrompt.value || undefined,
        customWritingWordCount.value,
      );
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : "生成失败");
  }
}

async function handleAccept() {
  if (!generatedText.value) return;

  // Insert the generated text
  props.editorRef?.appendText(generatedText.value);
  message.success("已采纳生成内容");

  // Clear result
  clearResult();
  customPrompt.value = "";
}

async function handleAcceptAndSave() {
  if (!generatedText.value) return;

  // Insert the generated text
  props.editorRef?.appendText(generatedText.value);

  // Save immediately
  await props.editorRef?.saveChapter();
  message.success("已采纳并保存");

  // Clear result
  clearResult();
  customPrompt.value = "";
}

function handleCopy() {
  navigator.clipboard.writeText(generatedText.value);
  copied.value = true;
  message.success("已复制到剪贴板");
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function handleDiscard() {
  dialog.warning({
    title: "确认放弃",
    content: "确定要放弃当前生成的内容吗？",
    positiveText: "确定",
    negativeText: "取消",
    onPositiveClick: () => {
      clearResult();
      customPrompt.value = "";
    },
  });
}

async function handleReAnalyze() {
  if (!hasProvider.value) {
    message.warning("请先在设置中配置 AI 服务");
    return;
  }

  if (!hasContent.value) {
    message.warning("当前章节内容为空");
    return;
  }

  try {
    await analyzeChapter();
    if (suggestions.value.length > 0) {
      message.success(`分析完成，发现 ${suggestions.value.length} 条建议`);
    } else {
      message.info("未发现问题，文章写得很好！");
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : "分析失败");
  }
}

function handleSuggestionApply(suggestion: AISuggestion) {
  if (suggestion.suggestion) {
    // 暂时只复制建议内容
    navigator.clipboard.writeText(suggestion.suggestion);
    message.success("建议已复制到剪贴板");
  } else if (suggestion.description) {
    navigator.clipboard.writeText(suggestion.description);
    message.success("建议已复制到剪贴板");
  }
}

function handleRefreshMemory() {
  loadMemoryContext();
  message.success("记忆上下文已刷新");
}

function handleOpenSettings() {
  // Navigate to settings page
  window.location.hash = "#/settings?tab=aiProviders";
}

function getSeverityColor(severity: string): "info" | "warning" | "error" {
  switch (severity) {
    case "warning":
      return "warning";
    case "error":
      return "error";
    default:
      return "info";
  }
}

function getSeverityBg(severity: string) {
  switch (severity) {
    case "warning":
      return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50";
    case "error":
      return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:red-800/50";
    default:
      return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50";
  }
}

function getSeverityLabel(type: string): string {
  const labels: Record<string, string> = {
    characterConsistency: "人物一致性",
    foreshadowReminder: "伏笔提醒",
    paceSuggestion: "节奏建议",
    logicGap: "逻辑漏洞",
    styleConsistency: "风格一致性",
  };
  return labels[type] || type;
}

function getForeshadowStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    buried: "已埋设",
    hinted: "已暗示",
    foreshadowed: "已铺垫",
    resolved: "已揭示",
  };
  return statusMap[status] || status;
}

function getForeshadowStatusType(
  status: string,
): "default" | "info" | "success" | "warning" | "error" {
  const typeMap: Record<
    string,
    "default" | "info" | "success" | "warning" | "error"
  > = {
    buried: "default",
    hinted: "info",
    foreshadowed: "warning",
    resolved: "success",
  };
  return typeMap[status] || "default";
}

// 一键续写相关方法
async function handleOneClickWrite() {
  if (isOneClickGenerating.value) return;

  try {
    const result = await writeChapter({
      targetWordCount: selectedWordCount.value,
      writingStyle: selectedWritingStyle.value,
    });
    if (result) {
      message.success("生成完成，请查看生成内容");
    }
  } catch (err) {
    message.error(err instanceof Error ? err.message : "生成失败");
  }
}

async function handleApplyOneClickContent() {
  const success = await applyGeneratedContent();
  if (success) {
    message.success("已应用到章节");
  }
}

function handleCopyOneClickContent() {
  copyOneClickContent();
  message.success("已复制到剪贴板");
}

function handleExportReport(format: 'json' | 'markdown') {
  const report = getReport();
  if (!report) {
    message.warning("暂无审查报告");
    return;
  }
  
  const content = exportChapterReport(format);
  if (!content) {
    message.warning("导出失败");
    return;
  }
  
  // 下载文件
  const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `审查报告_第${report.meta.chapterNumber}章_${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'md'}`;
  a.click();
  URL.revokeObjectURL(url);
  message.success(`报告已导出为 ${format === 'json' ? 'JSON' : 'Markdown'} 格式`);
}

// 是否有报告可导出
const hasReport = computed(() => !!latestReport.value || !!reviewResult.value);

async function handleSupplementContinue() {
  if (isSupplementing.value) return;

  try {
    await supplementContinue();
    message.info("补充续写完成");
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    message.error(errorMessage || "补充续写失败");
  }
}

function handleStopOneClickWrite() {
  // 实际停止生成
  resetChapterWriter();
  message.info("已停止生成");
}

// 去AI味相关方法
async function handleDeAIDetect() {
  if (!selectedTextForDeAI.value) {
    message.warning("请先选择要检测的文本");
    return;
  }

  isDeAIDetecting.value = true;
  deAIResult.value = null;

  try {
    const result = await DeAIService.detect(selectedTextForDeAI.value);
    deAIResult.value = {
      level: result.level,
      issues: result.issues,
      suggestions: result.suggestions,
    };
    message.success(`检测完成，AI味等级：${result.level}`);
  } catch (err) {
    message.error(err instanceof Error ? err.message : "检测失败");
  } finally {
    isDeAIDetecting.value = false;
  }
}

async function handleDeAIFix() {
  if (!selectedTextForDeAI.value) {
    message.warning("请先选择要处理的文本");
    return;
  }

  isDeAIFixing.value = true;

  try {
    const result = await DeAIService.fix(selectedTextForDeAI.value);
    deAIFixedContent.value = result.content;
    message.success(`处理完成，已修复 ${result.fixedCount} 处问题`);
  } catch (err) {
    message.error(err instanceof Error ? err.message : "处理失败");
  } finally {
    isDeAIFixing.value = false;
  }
}

function handleApplyDeAIContent() {
  if (deAIFixedContent.value) {
    props.editorRef?.replaceSelectedText(deAIFixedContent.value);
    message.success("已应用修改");
  }
}

function handleCopyDeAIContent() {
  if (deAIFixedContent.value) {
    navigator.clipboard.writeText(deAIFixedContent.value);
    copied.value = true;
    message.success("已复制到剪贴板");
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
}

function handleDeAISelectText() {
  const text = props.editorRef?.getSelectedText();
  if (text) {
    selectedTextForDeAI.value = text;
    deAIResult.value = null;
    deAIFixedContent.value = "";
    message.success("已选中要处理的文本");
  } else {
    message.warning("请先在编辑器中选择文本");
  }
}

function getDeAILevelColor(level: string): string {
  const colors: Record<string, string> = {
    none: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    mild: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    moderate:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    severe: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return colors[level] || colors.mild;
}

// 流水线步骤配置
const pipelineSteps = [
  { name: '任务书', key: 'taskbook' },
  { name: '起草', key: 'draft' },
  { name: '补充', key: 'supplement' },
  { name: '审查', key: 'review' },
  { name: '润色', key: 'polish' },
  { name: '保存', key: 'save' },
];

// 流水线步骤颜色
const stepColors: Record<string, string> = {
  idle: 'text-gray-400',
  taskbook: 'text-blue-500',
  draft: 'text-indigo-500',
  supplement: 'text-cyan-500',
  review: 'text-purple-500',
  polish: 'text-amber-500',
  save: 'text-emerald-500',
};

// 获取步骤状态
function getStepStatus(stepName: string): 'pending' | 'active' | 'completed' {
  const current = currentStep.value;
  if (current === 'idle') return 'pending';

  const order = ['taskbook', 'draft', 'review', 'polish', 'save'];
  const currentIndex = order.indexOf(current);
  const stepIndex = order.indexOf(stepName);

  if (currentIndex === stepIndex) return 'active';
  if (currentIndex > stepIndex) return 'completed';
  return 'pending';
}

// 是否有阻塞问题
const hasBlockingIssues = computed(() => blockingIssues.value.length > 0);

// 获取问题严重度
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

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'medium':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Settings Tip -->
    <div
      v-if="showSettingsTip && !hasProvider"
      class="p-3 mx-3 mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50"
    >
      <div class="flex items-start gap-3">
        <AlertCircle
          class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
        />
        <div class="flex-1">
          <p class="text-sm text-amber-800 dark:text-amber-300 font-medium">
            请先配置 AI 服务
          </p>
          <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
            点击下方按钮前往设置页面配置您的 AI API
          </p>
          <NButton
            class="mt-2"
            size="small"
            type="warning"
            @click="handleOpenSettings"
          >
            前往设置
          </NButton>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-100 dark:border-gray-800">
      <button
        v-for="tab in tabOptions"
        :key="tab.key"
        class="flex-1 py-3 flex flex-col items-center gap-1 text-xs transition-colors relative"
        :class="[
          effectiveSelectedMode === tab.key
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
        ]"
        @click="handleTabChange(tab.key)"
      >
        <component :is="tab.icon" class="w-5 h-5" />
        <span>{{ tab.label }}</span>
        <div
          v-if="effectiveSelectedMode === tab.key"
          class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
        ></div>
      </button>
    </div>

    <NScrollbar class="flex-1 p-4">
      <!-- Continue Tab -->
      <div v-show="effectiveSelectedMode === 'continue'" class="space-y-4">
        <!-- 一键续写区域 -->
        <div
          class="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Zap class="w-5 h-5 text-indigo-500" />
              <span class="font-semibold text-sm text-gray-900 dark:text-white"
                >一键续写</span
              >
            </div>
            <!-- TaskBook 标识 -->
            <div class="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <FileText class="w-3 h-3 text-indigo-500" />
              <span class="text-xs text-indigo-600 dark:text-indigo-400">TaskBook</span>
            </div>
          </div>

          <!-- 流水线状态 -->
          <div v-if="isOneClickGenerating || oneClickGeneratedContent" class="mb-3 p-2 rounded-lg bg-white/50 dark:bg-gray-800/50">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-gray-500 dark:text-gray-400">流水线</span>
              <span
                class="text-xs font-medium"
                :class="stepColors[currentStep] || 'text-gray-500'"
              >
                {{ currentStep === 'idle' ? '就绪' : currentStep }}
              </span>
            </div>
            <div class="flex items-center gap-1">
              <template v-for="(step, index) in pipelineSteps" :key="step.key">
                <div
                  class="flex-1 h-1 rounded-full transition-all"
                  :class="{
                    'bg-indigo-500': getStepStatus(step.key) === 'completed' || getStepStatus(step.key) === 'active',
                    'bg-gray-200 dark:bg-gray-700': getStepStatus(step.key) === 'pending',
                  }"
                />
              </template>
            </div>
          </div>

          <!-- Blocking 闸门警告 -->
          <div v-if="hasBlockingIssues" class="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div class="flex items-center gap-2 mb-2">
              <ShieldAlert class="w-4 h-4 text-red-500" />
              <span class="text-xs font-medium text-red-600 dark:text-red-400">
                {{ blockingIssues.length }} 个阻断问题
              </span>
            </div>
            <div class="space-y-1 max-h-24 overflow-y-auto">
              <div
                v-for="(issue, index) in blockingIssues"
                :key="index"
                class="text-xs"
              >
                <span class="font-medium text-red-500">[{{ issue.category }}]</span>
                {{ issue.description }}
              </div>
            </div>
            <div class="mt-2 flex gap-2">
              <NButton size="tiny" @click="retryCurrentStep">
                <template #icon><RefreshCw class="w-3 h-3" /></template>
                重试
              </NButton>
              <NButton size="tiny" quaternary @click="skipBlockingIssues">
                <template #icon><SkipForward class="w-3 h-3" /></template>
                强制继续
              </NButton>
            </div>
          </div>

          <div class="flex items-center gap-2 mb-3">
            <NSelect
              v-model:value="selectedWordCount"
              :options="wordCountOptions"
              size="small"
              class="flex-1"
              :disabled="isOneClickGenerating"
            />
            <NSelect
              v-model:value="selectedWritingStyle"
              :options="writingStyleOptions"
              size="small"
              class="flex-1"
              :disabled="isOneClickGenerating"
            />
          </div>

          <button
            v-if="!isOneClickGenerating"
            class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all"
            :disabled="!hasProvider"
            @click="handleOneClickWrite"
          >
            <Play class="w-5 h-5" />
            一键续写 {{ selectedWordCount }} 字
          </button>

          <div v-else class="space-y-2">
            <div class="flex items-center gap-3">
              <div class="flex-1">
                <div
                  class="h-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full overflow-hidden"
                >
                  <div
                    class="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all"
                    :style="{ width: `${oneClickProgress}%` }"
                  ></div>
                </div>
              </div>
              <span class="text-sm text-indigo-600 dark:text-indigo-400"
                >{{ oneClickProgress }}%</span
              >
            </div>
            <button
              class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              @click="handleStopOneClickWrite"
            >
              <Square class="w-4 h-4" />
              停止
            </button>
          </div>

          <!-- 生成进度显示 -->
          <div
            v-if="isOneClickGenerating && oneClickGeneratedContent"
            class="mt-3 p-3 rounded-lg bg-white/50 dark:bg-gray-800/50"
          >
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
              生成中...
            </div>
            <div
              class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3"
            >
              {{ oneClickGeneratedContent.slice(-200) }}...
            </div>
          </div>

          <!-- 生成结果 -->
          <div
            v-if="!isOneClickGenerating && oneClickGeneratedContent"
            class="mt-3 space-y-2"
          >
            <!-- 字数统计显示 -->
            <div class="p-3 rounded-lg bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs text-gray-500 dark:text-gray-400">字数统计</span>
                <span
                  class="text-xs font-medium"
                  :class="actualWordCount >= targetWordCount ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
                >
                  {{ actualWordCount }} / {{ targetWordCount }} 字
                  <template v-if="actualWordCount < targetWordCount">
                    ({{ ((actualWordCount / targetWordCount) * 100).toFixed(0) }}%)
                  </template>
                  <template v-else>
                    (达标)
                  </template>
                </span>
              </div>
              <!-- 字数进度条 -->
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full transition-all duration-300 rounded-full"
                  :class="actualWordCount >= targetWordCount ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-amber-400 to-amber-500'"
                  :style="{ width: `${Math.min(100, (actualWordCount / targetWordCount) * 100)}%` }"
                ></div>
              </div>
              <!-- 补充轮次提示 -->
              <div v-if="supplementRound > 0" class="mt-1.5 flex items-center gap-1">
                <RefreshCw class="w-3 h-3 text-indigo-500" />
                <span class="text-xs text-indigo-600 dark:text-indigo-400">
                  已补充 {{ supplementRound }} 轮
                </span>
              </div>
            </div>

            <div class="p-3 rounded-lg bg-white/50 dark:bg-gray-800/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                生成结果
              </div>
              <div
                class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto"
              >
                {{ oneClickGeneratedContent }}
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                @click="handleApplyOneClickContent"
              >
                <Check class="w-4 h-4" />
                应用
              </button>
              <button
                class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                @click="handleCopyOneClickContent"
              >
                <Copy class="w-4 h-4" />
                复制
              </button>
            </div>
            <!-- 补充续写按钮 -->
            <button
              v-if="actualWordCount < targetWordCount"
              class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
              @click="handleSupplementContinue"
            >
              <Zap class="w-4 h-4" />
              补充续写 ({{ Math.ceil(targetWordCount - actualWordCount) }}字不足)
            </button>
          </div>

          <!-- 错误提示 -->
          <div
            v-if="oneClickError"
            class="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          >
            <p class="text-xs text-red-600 dark:text-red-400">
              {{ oneClickError }}
            </p>
          </div>

          <!-- 报告导出按钮 -->
          <div v-if="hasReport && !isOneClickGenerating" class="mt-3 p-2 rounded-lg bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-500 dark:text-gray-400">审查报告</span>
              <div class="flex gap-1">
                <NButton size="tiny" @click="handleExportReport('markdown')">
                  <template #icon><File class="w-3 h-3" /></template>
                  MD
                </NButton>
                <NButton size="tiny" @click="handleExportReport('json')">
                  <template #icon><FileJson class="w-3 h-3" /></template>
                  JSON
                </NButton>
              </div>
            </div>
            <!-- 报告摘要 -->
            <div v-if="latestReport?.overview" class="text-xs space-y-1">
              <div class="flex items-center gap-2">
                <span class="text-gray-500">总分：</span>
                <span class="font-medium" :class="latestReport.overview.overallScore >= 70 ? 'text-emerald-600' : 'text-amber-600'">
                  {{ latestReport.overview.overallScore }}
                </span>
                <NTag size="tiny" :type="latestReport.overview.verdict === 'accepted' ? 'success' : latestReport.overview.verdict === 'needs_revision' ? 'warning' : 'error'">
                  {{ latestReport.overview.verdict === 'accepted' ? '通过' : latestReport.overview.verdict === 'needs_revision' ? '需修改' : '拒绝' }}
                </NTag>
              </div>
              <div class="flex items-center gap-2 text-gray-500">
                <span>问题：{{ latestReport.overview.totalIssues }}</span>
                <span v-if="latestReport.overview.blockingCount > 0" class="text-red-500">阻断：{{ latestReport.overview.blockingCount }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 分隔线 -->
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div
              class="w-full border-t border-gray-200 dark:border-gray-700"
            ></div>
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500"
              >自定义续写</span
            >
          </div>
        </div>

        <!-- Provider Info -->
        <div
          v-if="hasProvider"
          class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400"
        >
          <span>{{ activeProvider?.name }}</span>
          <span class="text-indigo-600 dark:text-indigo-400">{{
            currentModel
          }}</span>
        </div>

        <!-- Mode Selection -->
        <div class="grid grid-cols-2 gap-2">
          <button
            class="p-4 rounded-xl border-2 transition-all text-left"
            :class="[
              selectedSubMode === 'smartContinue'
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700',
            ]"
            @click="selectedSubMode = 'smartContinue'"
          >
            <div
              class="font-semibold text-sm text-gray-900 dark:text-white mb-1"
            >
              {{ t("editor.smartContinue") }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ t("editor.smartContinueDesc") }}
            </div>
          </button>
          <button
            class="p-4 rounded-xl border-2 transition-all text-left"
            :class="[
              selectedSubMode === 'polish'
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700',
            ]"
            @click="selectedSubMode = 'polish'"
          >
            <div
              class="font-semibold text-sm text-gray-900 dark:text-white mb-1"
            >
              {{ t("editor.polish") }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ t("editor.polishDesc") }}
            </div>
          </button>
        </div>

        <!-- Writing Style Selection -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">写作风格</span>
          <NSelect
            v-model:value="selectedWritingStyle"
            :options="writingStyleOptions"
            size="small"
            class="flex-1"
            :disabled="isGenerating"
          />
        </div>

        <!-- Custom Prompt -->
        <div>
          <NInput
            v-model:value="customPrompt"
            type="textarea"
            :placeholder="`${t('editor.promptPlaceholder')}\n${t('editor.promptExample')}`"
            :rows="3"
            :maxlength="500"
            :disabled="isGenerating"
          />
        </div>

        <!-- Generate Button -->
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isGenerating || !hasProvider || !hasContent"
          @click="handleGenerate"
        >
          <Sparkles v-if="!isGenerating" class="w-5 h-5" />
          <span
            v-if="isGenerating"
            class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
          ></span>
          {{
            isGenerating
              ? isStreaming
                ? t("editor.generating") + "..."
                : t("editor.generating")
              : t("editor.startGenerate")
          }}
        </button>

        <!-- Loading State -->
        <div
          v-if="isGenerating && !generatedText"
          class="flex items-center justify-center py-8"
        >
          <NSpin size="medium" />
          <span class="ml-3 text-sm text-gray-500 dark:text-gray-400"
            >AI 正在创作中...</span
          >
        </div>

        <!-- Error State -->
        <div
          v-if="error"
          class="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50"
        >
          <div class="flex items-start gap-3">
            <AlertCircle
              class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
            />
            <div class="flex-1">
              <p class="text-sm text-red-800 dark:text-red-300">{{ error }}</p>
            </div>
          </div>
        </div>

        <!-- Generated Result -->
        <div v-if="generatedText" class="space-y-3">
          <div
            class="p-4 rounded-xl bg-gradient-to-br from-gray-50 to-indigo-50/30 dark:from-gray-800 dark:to-indigo-900/20 border border-gray-100 dark:border-gray-700"
          >
            <div
              class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed"
            >
              {{ generatedText }}
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              class="px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center gap-1"
              @click="handleAccept"
            >
              <Check class="w-4 h-4" />
              {{ t("editor.accept") }}
            </button>
            <button
              class="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-1"
              @click="handleCopy"
            >
              <component :is="copied ? Check : Copy" class="w-4 h-4" />
              {{ copied ? "已复制" : t("editor.copy") }}
            </button>
            <button
              class="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              @click="handleDiscard"
            >
              {{ t("editor.discard") }}
            </button>
          </div>
          <button
            class="w-full px-3 py-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors flex items-center justify-center gap-1"
            @click="handleAcceptAndSave"
          >
            <Check class="w-4 h-4" />
            {{ t("editor.accept") }} + 保存
          </button>
        </div>
      </div>

      <!-- Suggestions Tab -->
      <div v-show="effectiveSelectedMode === 'suggestions'" class="space-y-3">
        <div v-if="suggestions.length === 0" class="text-center py-8">
          <Lightbulb
            class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3"
          />
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t("editor.noSuggestions") || "点击下方按钮开始分析" }}
          </p>
        </div>

        <div
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          class="p-4 rounded-xl border transition-all hover:shadow-md"
          :class="getSeverityBg(suggestion.severity)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <NTag
                :type="getSeverityColor(suggestion.severity)"
                size="small"
                class="mb-2"
              >
                {{ getSeverityLabel(suggestion.type) }}
              </NTag>
              <p class="text-sm font-medium text-gray-900 dark:text-white mb-1">
                {{ suggestion.title }}
              </p>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                {{ suggestion.description }}
              </p>
              <div
                v-if="suggestion.suggestion"
                class="mt-2 p-2 rounded bg-white/50 dark:bg-gray-800/50"
              >
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  修改建议：
                </p>
                <p class="text-sm text-indigo-600 dark:text-indigo-400">
                  {{ suggestion.suggestion }}
                </p>
              </div>
            </div>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
              :title="suggestion.suggestion ? '应用建议' : '复制建议'"
              @click="handleSuggestionApply(suggestion)"
            >
              <Wand2 class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>
          </div>
        </div>

        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm font-medium hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isAnalyzing || !hasProvider || !hasContent"
          @click="handleReAnalyze"
        >
          <RefreshCw v-if="!isAnalyzing" class="w-4 h-4" />
          <span
            v-if="isAnalyzing"
            class="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin"
          ></span>
          {{ isAnalyzing ? "分析中..." : t("editor.reAnalyze") }}
        </button>
      </div>

      <!-- Memory Tab -->
      <div v-show="effectiveSelectedMode === 'memory'" class="space-y-4">
        <div
          v-if="isLoadingMemory"
          class="flex items-center justify-center py-8"
        >
          <NSpin size="medium" />
          <span class="ml-3 text-sm text-gray-500 dark:text-gray-400"
            >加载中...</span
          >
        </div>

        <template v-else>
          <!-- Current Scene Memory -->
          <div
            class="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/30 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/50"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm font-medium text-blue-900 dark:text-blue-300">
                {{ t("editor.currentChapterMemory") }}
              </div>
              <button
                class="w-6 h-6 flex items-center justify-center rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
                title="刷新"
                @click="handleRefreshMemory"
              >
                <RefreshCw class="w-3 h-3 text-blue-600 dark:text-blue-400" />
              </button>
            </div>
            <div class="space-y-2">
              <!-- Characters -->
              <div
                class="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400"
              >
                <span
                  class="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5"
                ></span>
                <div>
                  <span class="font-medium"
                    >{{ t("editor.charactersInScene") }}：</span
                  >
                  <span v-if="memoryContext.charactersInScene.length > 0">
                    {{
                      memoryContext.charactersInScene
                        .map((c) => c.name)
                        .join("、")
                    }}
                  </span>
                  <span v-else class="text-gray-400">未检测到</span>
                </div>
              </div>
              <!-- Location -->
              <div
                class="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400"
              >
                <span
                  class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5"
                ></span>
                <div>
                  <span class="font-medium">{{ t("editor.location") }}：</span>
                  <span v-if="memoryContext.location">{{
                    memoryContext.location
                  }}</span>
                  <span v-else class="text-gray-400">未检测到</span>
                </div>
              </div>
              <!-- Time -->
              <div
                class="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400"
              >
                <span
                  class="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5"
                ></span>
                <div>
                  <span class="font-medium">{{ t("editor.time") }}：</span>
                  <span v-if="memoryContext.time">{{
                    memoryContext.time
                  }}</span>
                  <span v-else class="text-gray-400">未检测到</span>
                </div>
              </div>
              <!-- Mood -->
              <div
                class="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400"
              >
                <span
                  class="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-1.5"
                ></span>
                <div>
                  <span class="font-medium">氛围：</span>
                  <span v-if="memoryContext.mood">{{
                    memoryContext.mood
                  }}</span>
                  <span v-else class="text-gray-400">未检测到</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Related Foreshadows -->
          <div
            class="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50/30 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800/50"
          >
            <div
              class="text-sm font-medium text-purple-900 dark:text-purple-300 mb-3"
            >
              {{ t("editor.relatedForeshadows") }}
            </div>
            <div
              v-if="projectStore.currentProject?.foreshadows?.length"
              class="space-y-2"
            >
              <div
                v-for="foreshadow in projectStore.currentProject.foreshadows"
                :key="foreshadow.id"
                class="flex items-center justify-between text-sm"
              >
                <span class="text-purple-700 dark:text-purple-400">{{
                  foreshadow.hint
                }}</span>
                <NTag
                  :type="getForeshadowStatusType(foreshadow.status)"
                  size="small"
                >
                  {{ getForeshadowStatusText(foreshadow.status) }}
                </NTag>
              </div>
            </div>
            <div
              v-else
              class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
            >
              暂无伏笔设定
            </div>
          </div>

          <!-- Foreshadow Stats -->
          <div
            class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700"
          >
            <div
              class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              {{ t("editor.foreshadowResolutionRate") }}
            </div>
            <div class="flex items-center gap-4">
              <div class="flex-1">
                <div
                  class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                >
                  <div
                    class="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all"
                    :style="{
                      width: projectStore.currentProject?.foreshadows?.length
                        ? `${(projectStore.currentProject.foreshadows.filter((f) => f.status === 'resolved').length / projectStore.currentProject.foreshadows.length) * 100}%`
                        : '0%',
                    }"
                  ></div>
                </div>
              </div>
              <span
                class="text-sm font-medium text-indigo-600 dark:text-indigo-400"
              >
                {{
                  projectStore.currentProject?.foreshadows?.filter(
                    (f) => f.status === "resolved",
                  ).length || 0
                }}/{{ projectStore.currentProject?.foreshadows?.length || 0 }}
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- Batch Writing Panel -->
      <BatchWritingPanel v-show="effectiveSelectedMode === 'batch'" />

      <!-- Progress Perception Panel -->
      <ProgressPerceptionPanel v-show="effectiveSelectedMode === 'progress'" />

      <!-- DeAI Tab (去AI味) -->
      <div v-show="effectiveSelectedMode === 'deai'" class="space-y-4">
        <!-- 说明卡片 -->
        <div
          class="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800/50"
        >
          <div class="flex items-center gap-2 mb-2">
            <Sparkle class="w-5 h-5 text-purple-500" />
            <span class="font-semibold text-sm text-gray-900 dark:text-white"
              >去AI味工具</span
            >
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400">
            自动检测并修复AI生成文本中的"AI味"，让文字更加自然流畅。
            请先在编辑器中选择要处理的文本。
          </p>
        </div>

        <!-- 选择文本按钮 -->
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 font-medium hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
          @click="handleDeAISelectText"
        >
          <Sparkle class="w-4 h-4" />
          选择编辑器文本
        </button>

        <!-- 已选文本预览 -->
        <div
          v-if="selectedTextForDeAI"
          class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700"
        >
          <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">
            已选择文本
          </div>
          <div
            class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3"
          >
            {{ selectedTextForDeAI.substring(0, 200)
            }}{{ selectedTextForDeAI.length > 200 ? "..." : "" }}
          </div>
          <div class="text-xs text-gray-400 mt-1">
            {{ selectedTextForDeAI.length }} 字符
          </div>
        </div>

        <!-- 操作按钮 -->
        <div v-if="selectedTextForDeAI" class="grid grid-cols-2 gap-2">
          <button
            class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
            :disabled="isDeAIDetecting"
            @click="handleDeAIDetect"
          >
            <Sparkle v-if="!isDeAIDetecting" class="w-4 h-4" />
            <span
              v-else
              class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></span>
            {{ isDeAIDetecting ? "检测中..." : "检测AI味" }}
          </button>
          <button
            class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
            :disabled="isDeAIFixing"
            @click="handleDeAIFix"
          >
            <Wand2 v-if="!isDeAIFixing" class="w-4 h-4" />
            <span
              v-else
              class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
            ></span>
            {{ isDeAIFixing ? "处理中..." : "一键去味" }}
          </button>
        </div>

        <!-- 检测结果 -->
        <div v-if="deAIResult" class="space-y-3">
          <!-- AI味等级 -->
          <div
            class="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
                >AI味检测结果</span
              >
              <span
                class="px-2 py-1 rounded-full text-xs font-medium"
                :class="getDeAILevelColor(deAIResult.level)"
              >
                {{
                  deAIResult.level === "none"
                    ? "无AI味"
                    : deAIResult.level === "mild"
                      ? "轻度"
                      : deAIResult.level === "moderate"
                        ? "中度"
                        : "重度"
                }}
              </span>
            </div>
            <!-- 问题统计 -->
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div
                class="p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              >
                禁用词:
                {{
                  deAIResult.issues.filter((i) => i.type === "banned_word")
                    .length
                }}
                处
              </div>
              <div
                class="p-2 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
              >
                AI句式:
                {{
                  deAIResult.issues.filter((i) => i.type === "ai_pattern")
                    .length
                }}
                处
              </div>
              <div
                class="p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
              >
                过度解释:
                {{
                  deAIResult.issues.filter((i) => i.type === "over_explanation")
                    .length
                }}
                处
              </div>
              <div
                class="p-2 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400"
              >
                节奏问题:
                {{
                  deAIResult.issues.filter((i) => i.type === "rhythm_issue")
                    .length
                }}
                处
              </div>
            </div>
          </div>

          <!-- 问题列表 -->
          <div v-if="deAIResult.issues.length > 0" class="space-y-2">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
              问题详情
            </div>
            <div
              v-for="(issue, index) in deAIResult.issues.slice(0, 10)"
              :key="index"
              class="p-3 rounded-lg border"
              :class="
                issue.severity === 'high'
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50'
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50'
              "
            >
              <div class="flex items-center gap-2 mb-1">
                <span
                  class="text-xs px-1.5 py-0.5 rounded"
                  :class="getSeverityClass(issue.severity)"
                >
                  {{
                    issue.severity === "high"
                      ? "严重"
                      : issue.severity === "medium"
                        ? "中等"
                        : "轻微"
                  }}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{
                  issue.position
                }}</span>
              </div>
              <div
                class="text-xs text-gray-600 dark:text-gray-400 mb-1 truncate"
              >
                {{ issue.original }}
              </div>
              <div class="text-xs text-purple-600 dark:text-purple-400">
                {{ issue.suggestion }}
              </div>
            </div>
            <div
              v-if="deAIResult.issues.length > 10"
              class="text-xs text-gray-500 dark:text-gray-400 text-center"
            >
              还有 {{ deAIResult.issues.length - 10 }} 处问题...
            </div>
          </div>

          <!-- 改进建议 -->
          <div
            v-if="deAIResult.suggestions.length > 0"
            class="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50"
          >
            <div
              class="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1"
            >
              改进建议
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              <div
                v-for="(suggestion, index) in deAIResult.suggestions"
                :key="index"
              >
                {{ index + 1 }}. {{ suggestion }}
              </div>
            </div>
          </div>
        </div>

        <!-- 修复结果 -->
        <div v-if="deAIFixedContent" class="space-y-2">
          <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
            修复后内容
          </div>
          <div
            class="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800/50"
          >
            <div
              class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto"
            >
              {{ deAIFixedContent }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
              @click="handleApplyDeAIContent"
            >
              <Check class="w-4 h-4" />
              应用
            </button>
            <button
              class="flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              @click="handleCopyDeAIContent"
            >
              <component :is="copied ? Check : Copy" class="w-4 h-4" />
              {{ copied ? "已复制" : "复制" }}
            </button>
          </div>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>
