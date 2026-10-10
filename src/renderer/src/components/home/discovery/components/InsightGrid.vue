<script setup lang="ts">
/**
 * 题材雷达洞察卡列表。
 * 脚注由父组件传入：有榜单样本时说明采集时间，否则沿用经验判断文案。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { RefreshCw } from 'lucide-vue-next';
import {
  ENTRY_DIFFICULTY_LABEL,
  LENGTH_LABEL,
  PLATFORM_LABEL,
} from '@/services/inspiration/prompts/topic-discovery-prompts';
import { lifecycleLabel, riskLabel, shortPlatformLabel } from '../labels';
import type { GenreInsightCard } from '@/types/topic-discovery';

const props = defineProps<{
  insights: GenreInsightCard[];
  isRefreshing: boolean;
  selectedInsightId: string | null;
  disabled: boolean;
  refreshLabel: string;
  disclaimer?: string;
}>();

const emit = defineEmits<{
  select: [insight: GenreInsightCard];
  refresh: [];
}>();

const { t } = useI18n();
const disclaimerText = computed(
  () => props.disclaimer?.trim() || t('topicDiscovery.radarDisclaimer'),
);
</script>

<template>
  <div class="space-y-3 w-full">
    <div
      v-if="isRefreshing && insights.length === 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full"
    >
      <div
        v-for="n in 4"
        :key="n"
        class="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
      />
    </div>

    <div
      v-else-if="!isRefreshing && insights.length === 0"
      class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center w-full"
    >
      <p class="text-base text-gray-600 dark:text-gray-300 mb-1">
        {{ t('topicDiscovery.emptyRadarTitle') }}
      </p>
      <p class="text-sm text-gray-400 mb-4">{{ t('topicDiscovery.emptyRadarDesc') }}</p>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
        :disabled="isRefreshing || disabled"
        @click="emit('refresh')"
      >
        <RefreshCw class="w-4 h-4" />
        {{ refreshLabel }}
      </button>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      <button
        v-for="insight in props.insights"
        :key="insight.id"
        type="button"
        class="w-full text-left p-4 rounded-xl border-2 transition-all h-full"
        :class="
          selectedInsightId === insight.id
            ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 bg-white dark:bg-gray-800/50'
        "
        :disabled="isRefreshing || disabled"
        @click="emit('select', insight)"
      >
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <h4 class="font-semibold text-base text-gray-900 dark:text-white">{{ insight.name }}</h4>
          <div class="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            <span
              class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
            >
              {{ lifecycleLabel[insight.lifecycle] || insight.lifecycle }}
            </span>
            <span
              v-if="insight.entryDifficulty"
              class="text-xs px-1.5 py-0.5 rounded"
              :class="
                insight.entryDifficulty === 'low'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : insight.entryDifficulty === 'high'
                    ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
              "
            >
              {{ ENTRY_DIFFICULTY_LABEL[insight.entryDifficulty] }}
            </span>
            <span
              class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
            >
              {{ riskLabel[insight.riskLevel] || insight.riskLevel }}
            </span>
          </div>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300 mb-1.5">{{ insight.reason }}</p>
        <p class="text-sm text-teal-700 dark:text-teal-300">{{ insight.opportunity }}</p>
        <p
          v-if="Array.isArray(insight.namePatterns) && insight.namePatterns.length"
          class="text-xs text-gray-500 dark:text-gray-400 mt-1.5"
        >
          {{ t('topicDiscovery.namePatternLabel') }}：{{ insight.namePatterns.join(' · ') }}
        </p>
        <div class="flex flex-wrap gap-1.5 mt-2.5">
          <span
            v-for="p in insight.platformBias?.length ? insight.platformBias : insight.platform ? [insight.platform] : []"
            :key="`${insight.id}-${p}`"
            class="px-1.5 py-0.5 text-xs rounded bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
          >
            {{ shortPlatformLabel[p] || PLATFORM_LABEL[p] || p }}
          </span>
          <span
            v-if="insight.length"
            class="px-1.5 py-0.5 text-xs rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
          >
            {{ LENGTH_LABEL[insight.length] }}
          </span>
          <span
            v-for="tag in insight.hotTags"
            :key="tag"
            class="px-1.5 py-0.5 text-xs rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
          >
            #{{ tag }}
          </span>
        </div>
      </button>
    </div>
    <p class="text-sm text-center text-gray-400">
      {{ t('topicDiscovery.radarHint') }}
      · {{ disclaimerText }}
    </p>
  </div>
</template>
