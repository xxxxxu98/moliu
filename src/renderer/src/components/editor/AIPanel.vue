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
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useProjectStore } from "@/stores/project.store";
import { useSettingsStore } from "@/stores/settings.store";
import { useAIService } from "@/services/ai/useAIService";
import { useChapterWriter } from "@/composables/useChapterWriter";
import BatchWritingPanel from "./BatchWritingPanel.vue";
import type { AISuggestion } from "@/services/ai/types";

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
const selectedMode = ref<"continue" | "suggestions" | "memory" | "batch">("continue");
const selectedSubMode = ref<"smartContinue" | "polish">("smartContinue");
const customPrompt = ref("");
const copied = ref(false);
const showSettingsTip = ref(false);

// 一键续写相关
const selectedWordCount = ref<number>(3000);
const showWordCountDropdown = ref(false);

const wordCountOptions = [
  { label: '续写 1000 字', value: 1000 },
  { label: '续写 2000 字', value: 2000 },
  { label: '续写 3000 字', value: 3000 },
  { label: '续写 5000 字', value: 5000 },
];

// 使用单章写作 composable
const {
  isGenerating: isOneClickGenerating,
  progress: oneClickProgress,
  error: oneClickError,
  generatedContent: oneClickGeneratedContent,
  writeChapter,
  applyGeneratedContent,
  copyToClipboard: copyOneClickContent,
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

// 切换标签页
function handleTabChange(tabKey: "continue" | "suggestions" | "memory" | "batch") {
  if (
    !hasProvider.value &&
    (tabKey === "continue" || tabKey === "suggestions")
  ) {
    message.warning("请先在设置中配置 AI 服务",{
      duration:2000000
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
      await generate(selectedSubMode.value, customPrompt.value || undefined, customWritingWordCount.value);
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
  if (suggestion.position?.suggestion) {
    // 暂时只复制建议内容
    navigator.clipboard.writeText(suggestion.position.suggestion);
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

function handleStopOneClickWrite() {
  // 停止逻辑
  message.info("已停止生成");
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
          <button
            class="mt-2 px-3 py-1.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
            @click="handleOpenSettings"
          >
            前往设置
          </button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-100 dark:border-gray-800">
      <button
        v-for="tab in tabOptions"
        :key="tab.key"
        class="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors relative"
        :class="[
          effectiveSelectedMode === tab.key
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
        ]"
        @click="handleTabChange(tab.key)"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
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
        <div class="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <Zap class="w-5 h-5 text-indigo-500" />
              <span class="font-semibold text-sm text-gray-900 dark:text-white">一键续写</span>
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
                <div class="h-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all"
                    :style="{ width: `${oneClickProgress}%` }"
                  ></div>
                </div>
              </div>
              <span class="text-sm text-indigo-600 dark:text-indigo-400">{{ oneClickProgress }}%</span>
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
          <div v-if="isOneClickGenerating && oneClickGeneratedContent" class="mt-3 p-3 rounded-lg bg-white/50 dark:bg-gray-800/50">
            <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">生成中...</div>
            <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">
              {{ oneClickGeneratedContent.slice(-200) }}...
            </div>
          </div>

          <!-- 生成结果 -->
          <div v-if="!isOneClickGenerating && oneClickGeneratedContent" class="mt-3 space-y-2">
            <div class="p-3 rounded-lg bg-white/50 dark:bg-gray-800/50">
              <div class="text-xs text-gray-500 dark:text-gray-400 mb-1">生成结果</div>
              <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
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
          </div>

          <!-- 错误提示 -->
          <div v-if="oneClickError" class="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p class="text-xs text-red-600 dark:text-red-400">{{ oneClickError }}</p>
          </div>
        </div>

        <!-- 分隔线 -->
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-200 dark:border-gray-700"></div>
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500">自定义续写</span>
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
                v-if="suggestion.position?.suggestion"
                class="mt-2 p-2 rounded bg-white/50 dark:bg-gray-800/50"
              >
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  修改建议：
                </p>
                <p class="text-sm text-indigo-600 dark:text-indigo-400">
                  {{ suggestion.position.suggestion }}
                </p>
              </div>
            </div>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow flex-shrink-0"
              :title="suggestion.position?.suggestion ? '应用建议' : '复制建议'"
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
    </NScrollbar>
  </div>
</template>
