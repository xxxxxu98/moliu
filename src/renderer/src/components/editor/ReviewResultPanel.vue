<script setup lang="ts">
/**
 * 审查结果面板组件
 * 显示增强版审查结果（包含章尾钩子、爽点密度、Show Don't Tell 等专项检查）
 * 参考 oh-story 和 webnovel-writer 的审查 UI 设计
 */

import { computed, ref } from 'vue';
import { NButton, NCollapse, NCollapseItem, NTag, NProgress, NTooltip } from 'naive-ui';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  RefreshCw,
  Eye,
  Lightbulb,
  Zap,
} from 'lucide-vue-next';
import type { ReviewIssue, ReviewCategory } from '@/types/writing-task';
import { DIMENSION_NAMES } from '@/types/writing-task';
import {
  canOverrideIssue,
  generateOverrideConfirmation,
} from '@/services/review/blocking-override-rules';

interface SpecialCheckScore {
  dimension: string;
  score: number;
  label: string;
}

// Props
const props = defineProps<{
  issues: ReviewIssue[];
  totalScore?: number;
  specialScores?: SpecialCheckScore[];
  blockingCount: number;
  showOverrideButton?: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  skip: [];
  override: [issues: ReviewIssue[]];
  viewDetail: [issue: ReviewIssue];
}>();

// 计算问题统计
const issueStats = computed(() => {
  const stats: Record<string, { total: number; blocking: number; critical: number }> = {};

  for (const issue of props.issues) {
    const category = issue.category;
    if (!stats[category]) {
      stats[category] = { total: 0, blocking: 0, critical: 0 };
    }
    stats[category].total++;
    if (issue.blocking) stats[category].blocking++;
    if (issue.severity === 'critical') stats[category].critical++;
  }

  return stats;
});

// 按分类分组问题
const issuesByCategory = computed(() => {
  const grouped: Record<ReviewCategory, ReviewIssue[]> = {} as any;

  for (const issue of props.issues) {
    if (!grouped[issue.category]) {
      grouped[issue.category] = [];
    }
    grouped[issue.category].push(issue);
  }

  return grouped;
});

// Override 确认状态
const showOverrideConfirm = ref(false);
const overrideInfo = computed(() => {
  return generateOverrideConfirmation(props.issues);
});

// 获取严重度类型
function getSeverityType(severity: string): 'error' | 'warning' | 'info' | 'success' {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'high':
      return 'warning';
    case 'medium':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'info';
  }
}

// 获取严重度标签颜色
function getSeverityTagType(severity: string): 'error' | 'warning' | 'info' | 'success' {
  return getSeverityType(severity);
}

// 获取严重度中文
function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return '严重';
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
      return '低';
    default:
      return severity;
  }
}

// 获取分类中文名
function getCategoryLabel(category: ReviewCategory): string {
  return DIMENSION_NAMES[category] || category;
}

// 获取 Override 状态
function getOverrideStatus(issue: ReviewIssue) {
  return canOverrideIssue(issue);
}

// 处理 Override
function handleOverride() {
  if (overrideInfo.value.nonOverridableIssues.length > 0) {
    showOverrideConfirm.value = true;
    return;
  }
  emit('override', overrideInfo.value.overridableIssues);
}

// 处理确认 Override
function confirmOverride() {
  showOverrideConfirm.value = false;
  emit('override', overrideInfo.value.overridableIssues);
}
</script>

<template>
  <div class="review-result-panel">
    <!-- 头部状态 -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <ShieldAlert v-if="blockingCount > 0" class="w-5 h-5 text-red-500" />
        <CheckCircle v-else class="w-5 h-5 text-green-500" />
        <span class="font-semibold text-gray-800 dark:text-gray-200">
          {{ blockingCount > 0 ? '存在阻断问题' : '审查通过' }}
        </span>
        <NTag v-if="blockingCount > 0" type="error" size="small">
          {{ blockingCount }} 个阻断
        </NTag>
      </div>

      <div class="flex items-center gap-2">
        <!-- 总分 -->
        <div v-if="totalScore !== undefined" class="flex items-center gap-1">
          <span class="text-sm text-gray-500">总分:</span>
          <NTag
            :type="totalScore >= 80 ? 'success' : totalScore >= 60 ? 'warning' : 'error'"
            size="small"
          >
            {{ totalScore }}
          </NTag>
        </div>

        <!-- 专项评分 -->
        <NTooltip v-if="specialScores && specialScores.length > 0">
          <template #trigger>
            <div class="flex items-center gap-1 cursor-help">
              <Eye class="w-4 h-4 text-gray-400" />
              <span class="text-xs text-gray-500">专项检查</span>
            </div>
          </template>
          <div class="space-y-2 min-w-48">
            <div v-for="score in specialScores" :key="score.dimension" class="flex items-center gap-2">
              <span class="text-sm w-20">{{ score.label }}</span>
              <NProgress
                type="line"
                :percentage="score.score"
                :color="score.score >= 80 ? '#52c41a' : score.score >= 60 ? '#faad14' : '#ff4d4f'"
                :show-indicator="false"
                class="flex-1"
                :height="8"
              />
              <span class="text-xs w-8 text-right">{{ score.score }}</span>
            </div>
          </div>
        </NTooltip>

        <!-- 操作按钮 -->
        <NButton size="tiny" @click="$emit('retry')">
          <template #icon><RefreshCw class="w-3 h-3" /></template>
          重试
        </NButton>
        <NButton
          v-if="blockingCount > 0"
          size="tiny"
          quaternary
          type="warning"
          @click="$emit('skip')"
        >
          跳过
        </NButton>
      </div>
    </div>

    <!-- 问题统计 -->
    <div class="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <div class="text-xs text-gray-500 mb-2">问题分类统计</div>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="(stat, category) in issueStats"
          :key="category"
          class="flex items-center gap-1 px-2 py-1 rounded text-xs"
          :class="{
            'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400': stat.blocking > 0,
            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400': stat.blocking === 0 && stat.critical > 0,
            'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300': stat.blocking === 0 && stat.critical === 0,
          }"
        >
          <span>{{ getCategoryLabel(category as ReviewCategory) }}</span>
          <span class="font-medium">{{ stat.total }}</span>
          <span v-if="stat.blocking > 0" class="text-red-500">({{ stat.blocking }})</span>
        </div>
      </div>
    </div>

    <!-- 问题列表 -->
    <NCollapse class="review-issues-collapse">
      <NCollapseItem
        v-for="(issues, category) in issuesByCategory"
        :key="category"
        :title="`${getCategoryLabel(category as ReviewCategory)} (${issues.length})`"
        name="category"
      >
        <template #header-extra>
          <div class="flex items-center gap-1">
            <NTag
              v-if="issueStats[category]?.blocking > 0"
              type="error"
              size="tiny"
            >
              {{ issueStats[category].blocking }} 阻断
            </NTag>
            <NTag type="default" size="tiny">
              {{ issues.length }}
            </NTag>
          </div>
        </template>

        <div class="space-y-3">
          <div
            v-for="issue in issues"
            :key="issue.id"
            class="p-3 rounded-lg border"
            :class="{
              'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20': issue.blocking,
              'border-yellow-300 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20': !issue.blocking && issue.severity === 'critical',
              'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800': !issue.blocking && issue.severity !== 'critical',
            }"
          >
            <!-- 问题头部 -->
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-center gap-2">
                <NTag :type="getSeverityTagType(issue.severity)" size="tiny">
                  {{ getSeverityLabel(issue.severity) }}
                </NTag>
                <span v-if="issue.blocking" class="text-xs text-red-500 font-medium">
                  [阻断]
                </span>
                <span v-if="issue.optional" class="text-xs text-gray-400">
                  [可选]
                </span>
              </div>
              <div class="flex items-center gap-1">
                <!-- Override 状态 -->
                <NTooltip v-if="!issue.blocking">
                  <template #trigger>
                    <span
                      class="text-xs cursor-help"
                      :class="getOverrideStatus(issue).allowed ? 'text-green-500' : 'text-gray-400'"
                    >
                      {{ getOverrideStatus(issue).allowed ? '可跳过' : '不可跳' }}
                    </span>
                  </template>
                  {{ getOverrideStatus(issue).reason }}
                </NTooltip>

                <!-- 查看详情 -->
                <NButton
                  size="tiny"
                  quaternary
                  @click="$emit('viewDetail', issue)"
                >
                  <Eye class="w-3 h-3" />
                </NButton>
              </div>
            </div>

            <!-- 问题描述 -->
            <div class="text-sm text-gray-800 dark:text-gray-200 mb-1">
              {{ issue.description }}
            </div>

            <!-- 位置 -->
            <div class="text-xs text-gray-500 mb-1">
              {{ issue.location }}
            </div>

            <!-- 证据 -->
            <div
              v-if="issue.evidence"
              class="text-xs text-gray-600 dark:text-gray-400 p-2 rounded bg-gray-100 dark:bg-gray-700/50 mb-1 font-mono"
            >
              "{{ issue.evidence }}"
            </div>

            <!-- 修复建议 -->
            <div
              v-if="issue.fixHint"
              class="flex items-start gap-1 text-xs text-blue-600 dark:text-blue-400"
            >
              <Lightbulb class="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{{ issue.fixHint }}</span>
            </div>
          </div>
        </div>
      </NCollapseItem>
    </NCollapse>

    <!-- Override 确认对话框 -->
    <div
      v-if="showOverrideConfirm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showOverrideConfirm = false"
    >
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md shadow-xl">
        <div class="flex items-center gap-2 mb-3">
          <AlertTriangle class="w-5 h-5 text-yellow-500" />
          <span class="font-semibold">确认 Override</span>
        </div>

        <div class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          <p v-if="overrideInfo.nonOverridableIssues.length > 0" class="text-red-500 mb-2">
            存在 {{ overrideInfo.nonOverridableIssues.length }} 个不可 override 的问题：
          </p>
          <ul class="list-disc list-inside space-y-1">
            <li
              v-for="issue in overrideInfo.nonOverridableIssues"
              :key="issue.id"
              class="text-red-500"
            >
              {{ issue.description }}
            </li>
          </ul>
          <p v-if="overrideInfo.nonOverridableIssues.length > 0" class="mt-2">
            这些问题需要先修复才能继续。
          </p>
          <p v-else class="mt-2">
            确认 override {{ overrideInfo.overridableIssues.length }} 个问题？
          </p>
        </div>

        <div class="flex justify-end gap-2">
          <NButton size="small" @click="showOverrideConfirm = false">
            取消
          </NButton>
          <NButton
            v-if="overrideInfo.nonOverridableIssues.length === 0"
            type="warning"
            size="small"
            @click="confirmOverride"
          >
            确认 Override
          </NButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-result-panel {
  @apply text-sm;
}

.review-issues-collapse :deep(.n-collapse-item__header) {
  @apply px-3 py-2 rounded;
}

.review-issues-collapse :deep(.n-collapse-item__content-inner) {
  @apply pt-3;
}
</style>
