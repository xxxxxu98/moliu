<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Bookmark, BookmarkCheck, RefreshCw } from 'lucide-vue-next';
import { LENGTH_LABEL, PLATFORM_LABEL } from '@/services/inspiration/prompts/topic-discovery-prompts';
import type { StorySeedCard, TopicDiscoverySource } from '@/types/topic-discovery';

/** 种子卡数据：附收藏标记（Board 组装时注入） */
export type SeedCardItem = StorySeedCard & { _favorite?: boolean };

const props = defineProps<{
  seeds: SeedCardItem[];
  source: TopicDiscoverySource | null;
  isRefreshing: boolean;
  selectedSeedId: string | null;
  isProcessing: boolean;
  /** 空态标题/描述（区分 seeds 与 twist 玩法） */
  emptyTitle: string;
  emptyDesc: string;
  refreshLabel: string;
  /** 是否展示空态引导（mix/dice 不展示，等用户操作） */
  showEmptyGuide: boolean;
}>();

const emit = defineEmits<{
  select: [seed: StorySeedCard];
  favorite: [seed: StorySeedCard];
  refresh: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-3 w-full">
    <!-- skeleton -->
    <div
      v-if="isRefreshing && seeds.length === 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full"
    >
      <div
        v-for="n in 4"
        :key="n"
        class="h-28 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
      />
    </div>

    <!-- empty guide -->
    <div
      v-else-if="!isRefreshing && seeds.length === 0 && showEmptyGuide"
      class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-8 text-center w-full"
    >
      <p class="text-base text-gray-600 dark:text-gray-300 mb-1">{{ emptyTitle }}</p>
      <p class="text-sm text-gray-400 mb-4">{{ emptyDesc }}</p>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-base font-medium text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-50"
        :disabled="isRefreshing || isProcessing"
        @click="emit('refresh')"
      >
        <RefreshCw class="w-4 h-4" />
        {{ refreshLabel }}
      </button>
    </div>

    <!-- seed cards -->
    <div v-else-if="seeds.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      <div
        v-for="seed in seeds"
        :key="`${selectedSeedId}-${seed.id}`"
        class="relative w-full text-left p-4 rounded-xl border-2 transition-all h-full cursor-pointer"
        :class="
          selectedSeedId === seed.id
            ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-teal-300 bg-white dark:bg-gray-800/50'
        "
        :aria-disabled="isProcessing"
        @click="!isProcessing && emit('select', seed)"
      >
        <button
          type="button"
          class="absolute top-2.5 right-2.5 p-1.5 rounded-md transition-colors z-10"
          :class="
            seed._favorite
              ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/40 hover:bg-amber-100'
              : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30'
          "
          :title="seed._favorite ? t('topicDiscovery.unfavorite') : t('topicDiscovery.favorite')"
          @click.stop="emit('favorite', seed)"
        >
          <BookmarkCheck v-if="seed._favorite" class="w-4 h-4" />
          <Bookmark v-else class="w-4 h-4" />
        </button>
        <div class="flex items-start justify-between gap-2 mb-1.5 pr-8">
          <h4 class="font-semibold text-base text-gray-900 dark:text-white">{{ seed.title }}</h4>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span
              v-if="source === 'fallback'"
              class="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
            >
              {{ t('topicDiscovery.sourceLocal') }}
            </span>
            <span
              v-else-if="source === 'ai'"
              class="text-xs px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
            >
              {{ t('topicDiscovery.sourceAI') }}
            </span>
            <span
              class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500"
            >
              {{ seed.genre }}
            </span>
          </div>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2.5">
          {{ seed.oneLiner }}
        </p>
        <div class="flex flex-wrap gap-1.5 text-xs text-gray-500">
          <span
            v-if="seed.platform"
            class="px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
          >
            {{ PLATFORM_LABEL[seed.platform] }}
          </span>
          <span
            v-if="seed.length"
            class="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
          >
            {{ LENGTH_LABEL[seed.length] }}
          </span>
          <span
            class="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300"
          >
            钩子：{{ seed.hook }}
          </span>
          <span
            class="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300"
          >
            爽点：{{ seed.coolPoint }}
          </span>
          <span
            v-if="seed.sellPoint"
            class="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
          >
            卖点：{{ seed.sellPoint }}
          </span>
          <span
            v-if="seed.mechanism"
            class="px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
          >
            机制：{{ seed.mechanism }}
          </span>
          <span
            v-if="seed.brokenTrope"
            class="px-1.5 py-0.5 rounded bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300"
          >
            破梗：{{ seed.brokenTrope }}
          </span>
        </div>
      </div>
    </div>
    <p v-if="seeds.length > 0" class="text-sm text-center text-gray-400">
      {{ t('topicDiscovery.seedHint') }}
    </p>
  </div>
</template>
