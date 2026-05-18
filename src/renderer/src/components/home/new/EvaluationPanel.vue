<script setup lang="ts">
/**
 * EvaluationPanel - 评估面板组件
 * Moliu v2.0 - 显示内容评估结果
 */
import { computed, ref } from "vue";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Lightbulb,
  Sparkles,
} from "lucide-vue-next";
import RetentionScoreCard from "./RetentionScoreCard.vue";

// ============================================================
// Types
// ============================================================

interface EvaluationResult {
  /** 总体评分 */
  overallScore: number;
  /** 是否通过 */
  passed: boolean;
  /** 追读力评分 */
  retentionScore: {
    hookScore: number;
    coolpointScore: number;
    microFulfillment: number;
    suspenseDebt: number;
    rhythmHealth: number;
    originality: number;
  };
  /** 问题列表 */
  issues: EvaluationIssue[];
  /** 建议列表 */
  suggestions: string[];
  /** AI味等级 */
  aiLevel: "none" | "mild" | "moderate" | "severe";
  /** AI味评分 */
  aiScore: number;
}

interface EvaluationIssue {
  type: "error" | "warning" | "suggestion";
  category: "grammar" | "style" | "consistency" | "contract" | "ai-pattern";
  description: string;
  position?: string;
  suggestion?: string;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  result?: EvaluationResult | null;
  loading?: boolean;
  showDetails?: boolean;
}

interface Emits {
  (e: "recheck"): void;
  (e: "copy"): void;
  (e: "fix", issue: EvaluationIssue): void;
}

const props = withDefaults(defineProps<Props>(), {
  result: null,
  loading: false,
  showDetails: true,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const expandedSections = ref<Set<string>>(new Set(["issues", "suggestions"]));
const selectedIssueType = ref<EvaluationIssue["type"] | "all">("all");

// ============================================================
// Computed
// ============================================================

const filteredIssues = computed(() => {
  if (!props.result) return [];
  if (selectedIssueType.value === "all") {
    return props.result.issues;
  }
  return props.result.issues.filter((i) => i.type === selectedIssueType.value);
});

const issueCounts = computed(() => {
  if (!props.result) return { error: 0, warning: 0, suggestion: 0 };
  return {
    error: props.result.issues.filter((i) => i.type === "error").length,
    warning: props.result.issues.filter((i) => i.type === "warning").length,
    suggestion: props.result.issues.filter((i) => i.type === "suggestion").length,
  };
});

const aiLevelColor = computed(() => {
  if (!props.result) return "text-gray-400";
  switch (props.result.aiLevel) {
    case "none":
      return "text-green-500";
    case "mild":
      return "text-amber-500";
    case "moderate":
      return "text-orange-500";
    case "severe":
      return "text-red-500";
  }
});

const aiLevelText = computed(() => {
  if (!props.result) return "";
  switch (props.result.aiLevel) {
    case "none":
      return "无AI味";
    case "mild":
      return "轻微AI味";
    case "moderate":
      return "中等AI味";
    case "severe":
      return "严重AI味";
  }
});

const aiLevelBg = computed(() => {
  if (!props.result) return "bg-gray-100 dark:bg-gray-800";
  switch (props.result.aiLevel) {
    case "none":
      return "bg-green-100 dark:bg-green-900/30";
    case "mild":
      return "bg-amber-100 dark:bg-amber-900/30";
    case "moderate":
      return "bg-orange-100 dark:bg-orange-900/30";
    case "severe":
      return "bg-red-100 dark:bg-red-900/30";
  }
});

const overallTrend = computed(() => {
  if (!props.result) return "neutral";
  if (props.result.overallScore >= 80) return "up";
  if (props.result.overallScore >= 60) return "neutral";
  return "down";
});

// ============================================================
// Methods
// ============================================================

function toggleSection(section: string) {
  if (expandedSections.value.has(section)) {
    expandedSections.value.delete(section);
  } else {
    expandedSections.value.add(section);
  }
}

function fixIssue(issue: EvaluationIssue) {
  emit("fix", issue);
}

function getIssueIcon(type: EvaluationIssue["type"]) {
  switch (type) {
    case "error":
      return XCircle;
    case "warning":
      return AlertTriangle;
    case "suggestion":
      return Lightbulb;
  }
}

function getIssueColor(type: EvaluationIssue["type"]) {
  switch (type) {
    case "error":
      return "text-red-500 bg-red-100 dark:bg-red-900/30";
    case "warning":
      return "text-amber-500 bg-amber-100 dark:bg-amber-900/30";
    case "suggestion":
      return "text-blue-500 bg-blue-100 dark:bg-blue-900/30";
  }
}
</script>

<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
    <!-- Header -->
    <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles class="w-5 h-5 text-indigo-500" />
          <h3 class="font-semibold text-gray-900 dark:text-white">内容评估</h3>
        </div>

        <div class="flex items-center gap-2">
          <!-- AI Level Badge -->
          <div
            v-if="result"
            class="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
            :class="[aiLevelBg, aiLevelColor]"
          >
            <span>AI味:</span>
            <span>{{ aiLevelText }}</span>
            <span class="ml-1 opacity-70">({{ result.aiScore }}分)</span>
          </div>

          <!-- Actions -->
          <button
            class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="重新检查"
            :disabled="loading"
            @click="emit('recheck')"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          </button>
          <button
            class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            title="复制结果"
            @click="emit('copy')"
          >
            <Copy class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="flex flex-col items-center gap-3">
        <RefreshCw class="w-6 h-6 text-indigo-500 animate-spin" />
        <span class="text-sm text-gray-500 dark:text-gray-400">评估中...</span>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!result" class="flex flex-col items-center justify-center py-12 px-4">
      <Sparkles class="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
      <p class="text-sm text-gray-500 dark:text-gray-400 text-center">
        暂无评估结果
      </p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
        生成内容后将自动进行评估
      </p>
    </div>

    <!-- Results -->
    <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
      <!-- Overall Score -->
      <div class="px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-sm text-gray-500 dark:text-gray-400">综合评分</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ result.overallScore }}
              </span>
              <span class="text-sm text-gray-500">/ 100</span>
              <div
                v-if="overallTrend === 'up'"
                class="flex items-center gap-1 text-green-500"
              >
                <TrendingUp class="w-4 h-4" />
                <span class="text-xs">优秀</span>
              </div>
              <div
                v-else-if="overallTrend === 'down'"
                class="flex items-center gap-1 text-red-500"
              >
                <TrendingDown class="w-4 h-4" />
                <span class="text-xs">需改进</span>
              </div>
              <div v-else class="flex items-center gap-1 text-gray-400">
                <Minus class="w-4 h-4" />
                <span class="text-xs">一般</span>
              </div>
            </div>
          </div>

          <!-- Pass Badge -->
          <div
            class="px-3 py-1.5 rounded-lg text-sm font-medium"
            :class="
              result.passed
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            "
          >
            <span class="flex items-center gap-1">
              <CheckCircle v-if="result.passed" class="w-4 h-4" />
              <XCircle v-else class="w-4 h-4" />
              {{ result.passed ? "通过" : "未通过" }}
            </span>
          </div>
        </div>
      </div>

      <!-- Retention Score Card -->
      <div class="px-4 py-4">
        <RetentionScoreCard :score="result.retentionScore" />
      </div>

      <!-- Issues Section -->
      <div v-if="showDetails && result.issues.length > 0" class="divide-y divide-gray-100 dark:divide-gray-800">
        <!-- Section Header -->
        <button
          class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          @click="toggleSection('issues')"
        >
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-500" />
            <span class="font-medium text-gray-900 dark:text-white">问题列表</span>
            <span class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500">
              {{ result.issues.length }}
            </span>
          </div>
          <component
            :is="expandedSections.has('issues') ? ChevronUp : ChevronDown"
            class="w-4 h-4 text-gray-400"
          />
        </button>

        <!-- Issue List -->
        <div v-if="expandedSections.has('issues')" class="px-4 py-2">
          <!-- Filter -->
          <div class="flex gap-1 mb-3">
            <button
              v-for="type in ['all', 'error', 'warning', 'suggestion'] as const"
              :key="type"
              class="px-2 py-1 rounded text-xs font-medium transition-colors"
              :class="
                selectedIssueType === type
                  ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              "
              @click="selectedIssueType = type"
            >
              {{ type === "all" ? "全部" : type === "error" ? "错误" : type === "warning" ? "警告" : "建议" }}
              <span class="ml-1 opacity-60">
                {{ type === "all" ? issueCounts.error + issueCounts.warning + issueCounts.suggestion : issueCounts[type] }}
              </span>
            </button>
          </div>

          <!-- Issues -->
          <div class="space-y-2">
            <div
              v-for="(issue, index) in filteredIssues"
              :key="index"
              class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
            >
              <div class="flex items-start gap-2">
                <div
                  class="p-1 rounded"
                  :class="getIssueColor(issue.type)"
                >
                  <component :is="getIssueIcon(issue.type)" class="w-3.5 h-3.5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span
                      class="px-1.5 py-0.5 rounded text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                    >
                      {{ issue.category }}
                    </span>
                    <span v-if="issue.position" class="text-xs text-gray-400">
                      {{ issue.position }}
                    </span>
                  </div>
                  <p class="text-sm text-gray-700 dark:text-gray-300">
                    {{ issue.description }}
                  </p>
                  <p v-if="issue.suggestion" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    建议: {{ issue.suggestion }}
                  </p>
                </div>
                <button
                  v-if="issue.suggestion"
                  class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-indigo-500 transition-colors"
                  title="应用修复"
                  @click="fixIssue(issue)"
                >
                  <Sparkles class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Suggestions Section -->
      <div v-if="showDetails && result.suggestions.length > 0" class="divide-y divide-gray-100 dark:divide-gray-800">
        <!-- Section Header -->
        <button
          class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          @click="toggleSection('suggestions')"
        >
          <div class="flex items-center gap-2">
            <Lightbulb class="w-4 h-4 text-blue-500" />
            <span class="font-medium text-gray-900 dark:text-white">改进建议</span>
            <span class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500">
              {{ result.suggestions.length }}
            </span>
          </div>
          <component
            :is="expandedSections.has('suggestions') ? ChevronUp : ChevronDown"
            class="w-4 h-4 text-gray-400"
          />
        </button>

        <!-- Suggestions List -->
        <div v-if="expandedSections.has('suggestions')" class="px-4 py-3">
          <ul class="space-y-2">
            <li
              v-for="(suggestion, index) in result.suggestions"
              :key="index"
              class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <span class="text-blue-500 mt-0.5">•</span>
              {{ suggestion }}
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
