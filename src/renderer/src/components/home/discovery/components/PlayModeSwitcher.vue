<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { TopicDiscoveryTab } from '@/types/topic-discovery';
import type { PlayModeOption } from '../types';

const props = defineProps<{
  modes: PlayModeOption[];
  activeTab: TopicDiscoveryTab;
}>();

const emit = defineEmits<{
  select: [tab: TopicDiscoveryTab];
}>();

const { t } = useI18n();

function modeAccentClass(mode: PlayModeOption, active: boolean): string {
  if (!active) {
    return 'border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:border-teal-300 hover:bg-teal-50/40 dark:hover:bg-teal-900/10';
  }
  const map: Record<string, string> = {
    teal: 'border-teal-500 bg-teal-50 dark:bg-teal-900/25 text-teal-700 dark:text-teal-300 ring-1 ring-teal-200 dark:ring-teal-700/50',
    amber:
      'border-amber-500 bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-700/50',
    indigo:
      'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/25 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-700/50',
    rose: 'border-rose-500 bg-rose-50 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-700/50',
    violet:
      'border-violet-500 bg-violet-50 dark:bg-violet-900/25 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-700/50',
    cyan: 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/25 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-200 dark:ring-cyan-700/50',
  };
  return map[mode.accent] ?? map.teal;
}
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 w-full">
    <button
      v-for="mode in props.modes"
      :key="mode.id"
      type="button"
      class="flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-all"
      :class="modeAccentClass(mode, activeTab === mode.id)"
      @click="emit('select', mode.id)"
    >
      <span class="inline-flex items-center gap-1.5 text-sm font-semibold">
        <component :is="mode.icon" class="w-4 h-4" />
        {{ t(`topicDiscovery.tabs.${mode.id}`) }}
      </span>
      <span class="text-xs opacity-75 leading-snug">
        {{ t(`topicDiscovery.tabHints.${mode.id}`) }}
      </span>
    </button>
  </div>
</template>
