<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Dices } from 'lucide-vue-next';
import type { TopicDiceRoll } from '@/types/topic-discovery';

defineProps<{
  diceRoll: TopicDiceRoll | null;
  isRolling: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  roll: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="w-full rounded-xl border border-rose-200/70 dark:border-rose-800/50 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-4">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div class="min-w-0 flex-1">
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ t('topicDiscovery.diceTitle') }}
        </h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('topicDiscovery.diceDesc') }}
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 border border-rose-600/30 shadow-sm bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="isRolling || disabled"
        @click="emit('roll')"
      >
        <Dices class="w-4 h-4" :class="{ 'animate-spin': isRolling }" />
        {{ isRolling ? t('topicDiscovery.diceRolling') : t('topicDiscovery.diceRoll') }}
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
      <div class="rounded-xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 p-4 text-center">
        <p class="text-xs text-gray-400 mb-2">{{ t('topicDiscovery.diceGenre') }}</p>
        <p class="text-lg font-semibold text-rose-600 dark:text-rose-300 min-h-[1.75rem]">
          {{ diceRoll?.genre || '—' }}
        </p>
      </div>
      <div class="rounded-xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 p-4 text-center">
        <p class="text-xs text-gray-400 mb-2">{{ t('topicDiscovery.diceHook') }}</p>
        <p class="text-lg font-semibold text-orange-600 dark:text-orange-300 min-h-[1.75rem]">
          {{ diceRoll?.hook || '—' }}
        </p>
      </div>
      <div class="rounded-xl border border-white/70 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 p-4 text-center">
        <p class="text-xs text-gray-400 mb-2">{{ t('topicDiscovery.diceTwist') }}</p>
        <p class="text-lg font-semibold text-fuchsia-600 dark:text-fuchsia-300 min-h-[1.75rem]">
          {{ diceRoll?.twist || '—' }}
        </p>
      </div>
    </div>
    <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.diceHint') }}</p>
  </div>
</template>
