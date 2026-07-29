<script setup lang="ts">
import type { Component } from 'vue';
import { AlertTriangle, ArrowRight } from 'lucide-vue-next';
import { NButton } from 'naive-ui';
import type { OutlineDirection } from '@/services/outline/types/direction';

interface DirectionScaleHint {
  targetWordCountLabel: string;
  estimatedChapterCount: number;
  suggestedVolumeCount: number;
  estimatedChaptersPerVolume: number;
  startupPhaseRatio: string;
  longformCapacityScore: number;
  longformCapacityLabel: string;
  longformCapacityTone: 'strong' | 'medium' | 'cautious';
  improvementSuggestions: string[];
  enhancementBrief: string;
}

interface DirectionCardViewModel {
  id: string;
  icon: Component;
  accent: string;
  direction: OutlineDirection;
  scaleHint?: DirectionScaleHint;
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
  enhancingDirectionId?: string | null;
}

interface Emits {
  (e: 'regenerate'): void;
  (e: 'select', direction: OutlineDirection): void;
  (e: 'expand'): void;
  (e: 'enhance', payload: { direction: OutlineDirection; enhancementBrief: string }): void;
  (e: 'cancel'): void;
}

const props = withDefaults(defineProps<Props>(), {
  title: '候选方向',
  description: '选择一个方向后展开主方案，再创建项目。',
  progress: '',
  error: null,
  compact: false,
  enhancingDirectionId: null,
});

const emit = defineEmits<Emits>();

function handleRegenerate() {
  emit('regenerate');
}

function handleSelect(direction: OutlineDirection) {
  if (props.isProcessing) return;
  emit('select', direction);
}

function handleExpand() {
  emit('expand');
}

function handleEnhance(direction: OutlineDirection, enhancementBrief: string) {
  emit('enhance', { direction, enhancementBrief });
}

function handleCancel() {
  emit('cancel');
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

    <!-- 生成中：始终显示进度 + 取消（有旧卡时也不吞掉） -->
    <div
      v-if="isProcessing"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200/80 bg-teal-50/80 px-4 py-3 dark:border-teal-800/50 dark:bg-teal-950/30"
    >
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium text-teal-800 dark:text-teal-200">
          {{ progress || '正在生成…' }}
        </p>
        <p class="mt-0.5 text-xs text-teal-600/80 dark:text-teal-400/80">
          可随时取消，已生成的结果会保留
        </p>
      </div>
      <NButton size="small" secondary type="warning" @click="handleCancel">
        取消生成
      </NButton>
    </div>

    <div
      v-else-if="error"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
    >
      {{ error }}
    </div>

    <div
      v-if="cards.length > 0"
      class="space-y-3"
      :class="{ 'opacity-60 pointer-events-none': isProcessing }"
    >
      <button
        v-for="card in cards"
        :key="card.id"
        type="button"
        class="w-full rounded-2xl border-[2px] p-4 text-left transition-all duration-200"
        :disabled="isProcessing"
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
                <div class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-nowrap">
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

              <div class="mt-3 flex flex-wrap items-center gap-2">
                <span
                  v-if="card.scaleHint"
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                  :class="card.scaleHint.longformCapacityTone === 'strong'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : card.scaleHint.longformCapacityTone === 'medium'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'"
                >
                  {{ card.scaleHint.longformCapacityLabel }} · {{ card.scaleHint.longformCapacityScore }}分
                </span>
                <span
                  v-if="card.direction.longformCapacityNote"
                  class="text-xs text-gray-500 dark:text-gray-400"
                >
                  {{ card.direction.longformCapacityNote }}
                </span>
              </div>

              <div class="mt-3 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-2">
                <div
                  v-if="card.scaleHint"
                  class="rounded-xl bg-slate-50 px-3 py-2 text-slate-600 dark:bg-gray-900/40 dark:text-slate-300"
                >
                  <div class="text-[11px] uppercase tracking-wide text-slate-400">目标规模</div>
                  <div class="mt-1 font-medium">{{ card.scaleHint.targetWordCountLabel }}</div>
                </div>
                <div
                  v-if="card.scaleHint"
                  class="rounded-xl bg-slate-50 px-3 py-2 text-slate-600 dark:bg-gray-900/40 dark:text-slate-300"
                >
                  <div class="text-[11px] uppercase tracking-wide text-slate-400">预计章节</div>
                  <div class="mt-1 font-medium">{{ card.scaleHint.estimatedChapterCount }}章</div>
                </div>
                <div
                  v-if="card.scaleHint"
                  class="rounded-xl bg-slate-50 px-3 py-2 text-slate-600 dark:bg-gray-900/40 dark:text-slate-300"
                >
                  <div class="text-[11px] uppercase tracking-wide text-slate-400">建议卷数</div>
                  <div class="mt-1 font-medium">{{ card.scaleHint.suggestedVolumeCount }}卷 / 每卷约{{ card.scaleHint.estimatedChaptersPerVolume }}章</div>
                </div>
                <div
                  v-if="card.scaleHint"
                  class="rounded-xl bg-slate-50 px-3 py-2 text-slate-600 dark:bg-gray-900/40 dark:text-slate-300"
                >
                  <div class="text-[11px] uppercase tracking-wide text-slate-400">前30章占比</div>
                  <div class="mt-1 font-medium">{{ card.scaleHint.startupPhaseRatio }}</div>
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
                v-if="card.scaleHint"
                class="mt-3 flex flex-wrap items-center gap-2"
              >
                <NButton
                  size="tiny"
                  tertiary
                  type="warning"
                  :loading="enhancingDirectionId === card.direction.id"
                  @click.stop="handleEnhance(card.direction, card.scaleHint.enhancementBrief)"
                >
                  增强此方向的长篇承载力
                </NButton>
              </div>

              <div
                v-if="card.scaleHint?.improvementSuggestions.length"
                class="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
              >
                <div class="font-medium">优化建议</div>
                <ul class="mt-1 space-y-1">
                  <li
                    v-for="suggestion in card.scaleHint.improvementSuggestions"
                    :key="suggestion"
                    class="leading-5"
                  >
                    · {{ suggestion }}
                  </li>
                </ul>
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

    <div
      v-else-if="!isProcessing && !error"
      class="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-400"
    >
      点击上方种子或输入想法后，将在这里生成创作方向
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <NButton
        type="primary"
        :disabled="!canExpand || isProcessing"
        :loading="isProcessing && !!selectedDirection"
        @click="handleExpand"
      >        <template #icon>
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
