<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { genreTags, settingElements, type SettingElementConfig } from '@/data/inspirations';
import { BRAIN_GENRES } from '@/services/inspiration/fallback/genre-pool';

defineProps<{
  selectedTags: string[];
  selectedElements: string[];
  maxGenrePicks: number;
  maxElementPicks: number;
  disabled: boolean;
}>();

const emit = defineEmits<{
  toggleTag: [name: string];
  toggleElement: [name: string];
}>();

const { t } = useI18n();

/** 题材池：脑洞池（🧠 标记）在前 + 老分类全部，按名称去重 */
const mixGenreOptions = [
  ...BRAIN_GENRES.map(g => ({ id: `brain-${g.id}`, name: g.name, icon: '🧠' })),
  ...genreTags,
].filter((item, index, arr) => arr.findIndex(x => x.name === item.name) === index);

const CATEGORY_LABEL: Record<string, string> = {
  character: '主角与人物',
  plot: '剧情与冒险',
  world: '世界观',
  conflict: '核心冲突',
};

/** 设定元素：全量按 category 分组（不再截断） */
const groupedElements = computed(() => {
  const groups: { category: string; label: string; items: SettingElementConfig[] }[] = [];
  for (const cat of ['character', 'plot', 'world', 'conflict'] as const) {
    const items = settingElements.filter(el => el.category === cat);
    groups.push({ category: cat, label: CATEGORY_LABEL[cat], items });
  }
  return groups;
});

/** 次要分组（剧情/世界观/冲突）折叠控制，默认展开 */
const showAllGroups = ref(true);
</script>

<template>
  <div class="w-full rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-4">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ t('topicDiscovery.mixTitle') }}
        </h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('topicDiscovery.mixDesc') }}
        </p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30 shrink-0"
        @click="showAllGroups = !showAllGroups"
      >
        <ChevronUp v-if="showAllGroups" class="w-3.5 h-3.5" />
        <ChevronDown v-else class="w-3.5 h-3.5" />
        {{ showAllGroups ? t('topicDiscovery.mixCollapse') : t('topicDiscovery.mixExpand') }}
      </button>
    </div>

    <!-- 题材标签（含脑洞题材） -->
    <div>
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {{ t('topicDiscovery.mixGenres') }}
        <span class="text-xs text-gray-400">({{ selectedTags.length }}/{{ maxGenrePicks }} · {{ mixGenreOptions.length }} 项)</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in mixGenreOptions"
          :key="tag.id"
          type="button"
          class="px-2.5 py-1 rounded-lg text-sm border transition-colors"
          :class="
            selectedTags.includes(tag.name)
              ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'
          "
          :disabled="disabled"
          @click="emit('toggleTag', tag.name)"
        >
          <span v-if="tag.icon === '🧠'" class="mr-0.5">🧠</span>
          {{ tag.name }}
        </button>
      </div>
    </div>

    <!-- 设定元素：按类别分组全量展示 -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('topicDiscovery.mixElements') }}
          <span class="text-xs text-gray-400"
            >({{ selectedElements.length }}/{{ maxElementPicks }} · {{ settingElements.length }} 项)</span
          >
        </p>
      </div>
      <div
        v-for="group in groupedElements"
        :key="group.category"
        v-show="showAllGroups || group.category === 'character'"
      >
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          {{ group.label }}（{{ group.items.length }}）
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="el in group.items"
            :key="el.id"
            type="button"
            class="px-2.5 py-1 rounded-lg text-sm border transition-colors"
            :class="
              selectedElements.includes(el.name)
                ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-emerald-300'
            "
            :disabled="disabled"
            @click="emit('toggleElement', el.name)"
          >
            {{ el.icon }} {{ el.name }}
          </button>
        </div>
      </div>
    </div>
    <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.mixHint') }}</p>
  </div>
</template>
