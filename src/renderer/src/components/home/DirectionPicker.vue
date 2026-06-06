<script setup lang="ts">
import type { Component } from 'vue';
import { AlertTriangle, ArrowRight } from 'lucide-vue-next';
import { NButton } from 'naive-ui';
import type { OutlineDirection } from '@/services/outline/types/direction';

interface DirectionCardViewModel {
  id: string;
  icon: Component;
  accent: string;
  direction: OutlineDirection;
}

interface Props {
  title?: string;
  description?: string;
  cards: DirectionCardViewModel[];
  selectedDirection: OutlineDirection | null;
  isProcessing: boolean;
  progress?: string;
  error?: string | null;
  canExpand: boolean;
  compact?: boolean;
}

interface Emits {
  (e: 'regenerate'): void;
  (e: 'select', direction: OutlineDirection): void;
  (e: 'expand'): void;
}

const props = withDefaults(defineProps<Props>(), {
  title: '候选方向',
  description: '选择一个方向后展开主方案，再创建项目。',
  progress: '',
  error: null,
  compact: false,
});

const emit = defineEmits<Emits>();

function handleRegenerate() {
  emit('regenerate');
}

function handleSelect(direction: OutlineDirection) {
  emit('select', direction);
}

function handleExpand() {
  emit('expand');
}
</script>

<template>
  <div class="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/70">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">{{ title }}</h4>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ description }}</p>
      </div>
      <NButton size="small" secondary :disabled="isProcessing" @click="handleRegenerate">
        换一批方向
      </NButton>
    </div>

    <div
      v-if="isProcessing && cards.length === 0"
      class="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-gray-800/60 dark:text-gray-400"
    >
      {{ progress || '正在生成创作方向...' }}
    </div>

    <div
      v-else-if="error"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ error }}
    </div>

    <div v-else class="space-y-3">
      <button
        v-for="card in cards"
        :key="card.id"
        type="button"
        class="w-full rounded-2xl border-[2px] p-4 text-left transition-all duration-200"
        :class="selectedDirection?.id === card.direction.id
          ? 'border-indigo-500 bg-indigo-50/60 shadow-sm dark:bg-indigo-900/20'
          : 'border-gray-200 bg-white hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-800/60 dark:hover:border-indigo-600'"
        @click="handleSelect(card.direction)"
      >
        <template v-if="compact">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-gray-900 dark:text-white">{{ card.direction.title }}</div>
              <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{{ card.direction.oneLiner }}</p>
            </div>
            <div class="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {{ card.direction.recommendationScore }}分
            </div>
          </div>
          <div class="mt-3 text-xs text-gray-600 dark:text-gray-300">{{ card.direction.recommendedReason }}</div>
        </template>

        <template v-else>
          <div class="flex items-start gap-3">
            <div :class="`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.accent} text-white`">
              <component :is="card.icon" class="h-5 w-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-gray-900 dark:text-white">
                    {{ card.direction.title }}
                  </div>
                  <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {{ card.direction.oneLiner }}
                  </p>
                </div>
                <div class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {{ card.direction.recommendationScore }}分
                </div>
              </div>

              <p class="text-xs leading-5 text-gray-600 dark:text-gray-300">
                {{ card.direction.premise }}
              </p>

              <div class="mt-3 grid gap-2 md:grid-cols-2">
                <div>
                  <div class="text-[11px] font-medium uppercase tracking-wide text-gray-400">成长路径</div>
                  <div class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ card.direction.protagonistArc }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-medium uppercase tracking-wide text-gray-400">核心冲突</div>
                  <div class="mt-1 text-xs text-gray-600 dark:text-gray-300">{{ card.direction.coreConflict }}</div>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="tag in card.direction.coolPointStyle"
                  :key="`${card.id}-${tag}`"
                  class="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-600 dark:bg-orange-900/20 dark:text-orange-300"
                >
                  {{ tag }}
                </span>
              </div>

              <div
                v-if="card.direction.riskNotes.length > 0"
                class="mt-3 flex items-start gap-2 rounded-xl bg-amber-50/70 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              >
                <AlertTriangle class="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{{ card.direction.riskNotes.join('；') }}</span>
              </div>
            </div>
          </div>
        </template>
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <NButton type="primary" :disabled="!canExpand" :loading="isProcessing && !!selectedDirection" @click="handleExpand">
        <template #icon>
          <ArrowRight class="h-4 w-4" />
        </template>
        展开主方案
      </NButton>
      <span v-if="selectedDirection" class="text-xs text-gray-500 dark:text-gray-400">
        已选择：{{ selectedDirection.title }}
      </span>
    </div>
  </div>
</template>
