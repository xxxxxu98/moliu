<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Eraser, Lock } from 'lucide-vue-next';
import WordCountSelector from '@/components/common/WordCountSelector.vue';
import { LENGTH_LABEL } from '@/services/inspiration/prompts/topic-discovery-prompts';
import type {
  InsightSeedContext,
  TopicAudience,
  TopicLength,
  TopicPlatform,
} from '@/types/topic-discovery';

defineProps<{
  lockedGenre: string | null;
  lockedAudience: TopicAudience | null;
  lockedPlatform: TopicPlatform | null;
  lockedLength: TopicLength | null;
  activeInsightContext: InsightSeedContext | null;
  hasActiveFilters: boolean;
  disabled: boolean;
  wordCountRange: string;
}>();

const emit = defineEmits<{
  audience: [value: TopicAudience | null];
  platform: [value: TopicPlatform | null];
  length: [value: TopicLength | null];
  clear: [];
  'update:wordCountRange': [value: string];
}>();

const { t } = useI18n();

const audienceOptions: { id: TopicAudience; label: string }[] = [
  { id: 'general', label: '大众' },
  { id: 'male', label: '男生' },
  { id: 'female', label: '女生' },
];

const platformOptions: { id: TopicPlatform; label: string }[] = [
  { id: 'general', label: '不限平台' },
  { id: 'qidian', label: '起点' },
  { id: 'fanqie', label: '番茄' },
  { id: 'jinjiang', label: '晋江' },
  { id: 'qimao', label: '七猫' },
  { id: 'zhihu', label: '盐言' },
];

const lengthOptions: { id: TopicLength; label: string }[] = [
  { id: 'long', label: LENGTH_LABEL.long },
  { id: 'short', label: LENGTH_LABEL.short },
];
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 w-full">
    <div class="flex items-center gap-1">
      <button
        v-for="opt in audienceOptions"
        :key="opt.id"
        type="button"
        class="px-2.5 py-1.5 rounded-md text-sm border transition-colors"
        :class="
          lockedAudience === opt.id
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-teal-300'
        "
        @click="emit('audience', lockedAudience === opt.id ? null : opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>
    <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
    <div class="flex items-center gap-1 flex-wrap">
      <button
        v-for="opt in platformOptions"
        :key="opt.id"
        type="button"
        class="px-2.5 py-1.5 rounded-md text-sm border transition-colors"
        :class="
          lockedPlatform === opt.id
            ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-cyan-300'
        "
        @click="emit('platform', lockedPlatform === opt.id ? null : opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>
    <div class="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
    <div class="flex items-center gap-1">
      <button
        v-for="opt in lengthOptions"
        :key="opt.id"
        type="button"
        class="px-2.5 py-1.5 rounded-md text-sm border transition-colors"
        :class="
          lockedLength === opt.id
            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-violet-300'
        "
        @click="emit('length', lockedLength === opt.id ? null : opt.id)"
      >
        {{ opt.label }}
      </button>
    </div>
    <button
      v-if="hasActiveFilters"
      type="button"
      class="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      @click="emit('clear')"
    >
      <Eraser class="w-3.5 h-3.5" />
      {{ t('topicDiscovery.clearLocks') }}
    </button>
    <div
      v-if="lockedGenre"
      class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
    >
      <Lock class="w-3.5 h-3.5" />
      {{ lockedGenre }}
    </div>
    <div
      v-if="activeInsightContext"
      class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-sm bg-amber-50/80 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 max-w-[280px] truncate"
      :title="activeInsightContext.opportunity"
    >
      {{ t('topicDiscovery.insightContextHint') }}
      · {{ activeInsightContext.hotTags.slice(0, 2).join(' / ') || activeInsightContext.name }}
    </div>
    <div class="ml-auto min-w-[160px]">
      <WordCountSelector
        :model-value="wordCountRange"
        :disabled="disabled"
        @update:model-value="emit('update:wordCountRange', $event)"
      />
    </div>
  </div>
</template>
