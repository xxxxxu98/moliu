<script setup lang="ts">
/**
 * 开题中心 · 元素混搭面板：按分类展示题材标签与设定元素，供用户挑选碰撞组合。
 *
 * 约束：选中状态按 name 判定（数据层保证 name 全局唯一）；首个选中题材视为主题材。
 * 筛选栏锁定男生 / 女生受众时，默认只展示通用 + 对应受众的标签，已选项始终可见。
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { GENRE_TAG_CATEGORIES, genreTags } from '@/data/genre-tags';
import { SETTING_ELEMENT_CATEGORIES, settingElements } from '@/data/setting-elements';
import { BRAIN_GENRES } from '@/services/inspiration/fallback/genre-pool';
import { AUDIENCE_LABEL } from '@/services/inspiration/prompts/topic-discovery-prompts';
import type { SettingElementCategory } from '@/types/inspiration';
import type { TopicAudience } from '@/types/topic-discovery';

interface MixOption {
  id: string;
  name: string;
  icon?: string;
  audience: TopicAudience;
}

interface MixGroup {
  id: string;
  label: string;
  items: MixOption[];
}

const props = defineProps<{
  selectedTags: string[];
  selectedElements: string[];
  maxGenrePicks: number;
  maxElementPicks: number;
  disabled: boolean;
  /** 筛选栏锁定的受众；仅 male / female 触发标签过滤 */
  audience: TopicAudience | null;
}>();

const emit = defineEmits<{
  toggleTag: [name: string];
  toggleElement: [name: string];
}>();

const { t } = useI18n();

/** 收起时仍展示的设定分组 */
const PRIMARY_ELEMENT_GROUPS: ReadonlySet<string> = new Set<SettingElementCategory>([
  'character',
  'goldfinger',
]);

/** 题材分组：脑洞新题材在前，其余按数据层分类顺序 */
const GENRE_GROUPS: MixGroup[] = [
  {
    id: 'brain',
    label: '🧠 脑洞新题材',
    items: BRAIN_GENRES.map(g => ({ id: `brain-${g.id}`, name: g.name, audience: g.audience })),
  },
  ...GENRE_TAG_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.label,
    items: genreTags
      .filter(tag => tag.category === cat.id)
      .map(tag => ({ id: tag.id, name: tag.name, icon: tag.icon, audience: tag.audience })),
  })),
];

const ELEMENT_GROUPS: MixGroup[] = SETTING_ELEMENT_CATEGORIES.map(cat => ({
  id: cat.id,
  label: cat.label,
  items: settingElements
    .filter(el => el.category === cat.id)
    .map(el => ({ id: el.id, name: el.name, icon: el.icon, audience: el.audience ?? 'general' })),
}));

/** 次要设定分组折叠控制，默认展开 */
const showAllGroups = ref(true);
/** 锁定受众时是否临时显示全部受众的标签 */
const showAllAudience = ref(false);

const audienceFilter = computed<TopicAudience | null>(() =>
  props.audience === 'male' || props.audience === 'female' ? props.audience : null,
);
const isAudienceFiltering = computed(() => !!audienceFilter.value && !showAllAudience.value);

function filterGroups(groups: MixGroup[], selected: string[]): MixGroup[] {
  if (!isAudienceFiltering.value) return groups;
  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(
        item =>
          item.audience === 'general' ||
          item.audience === audienceFilter.value ||
          selected.includes(item.name),
      ),
    }))
    .filter(group => group.items.length > 0);
}

const visibleGenreGroups = computed(() => filterGroups(GENRE_GROUPS, props.selectedTags));
const visibleElementGroups = computed(() => filterGroups(ELEMENT_GROUPS, props.selectedElements));

function countItems(groups: MixGroup[]): number {
  return groups.reduce((sum, group) => sum + group.items.length, 0);
}

const visibleGenreCount = computed(() => countItems(visibleGenreGroups.value));
const visibleElementCount = computed(() => countItems(visibleElementGroups.value));
</script>

<template>
  <div class="w-full rounded-xl border border-indigo-200/70 dark:border-indigo-800/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-4 space-y-4">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ t('topicDiscovery.mixTitle') }}
        </h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('topicDiscovery.mixDesc', { genres: maxGenrePicks, elements: maxElementPicks }) }}
        </p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="audienceFilter"
          type="button"
          class="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30"
          @click="showAllAudience = !showAllAudience"
        >
          {{
            showAllAudience
              ? t('topicDiscovery.mixAudienceOnly', { audience: AUDIENCE_LABEL[audienceFilter] })
              : t('topicDiscovery.mixAudienceAll')
          }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30"
          @click="showAllGroups = !showAllGroups"
        >
          <ChevronUp v-if="showAllGroups" class="w-3.5 h-3.5" />
          <ChevronDown v-else class="w-3.5 h-3.5" />
          {{ showAllGroups ? t('topicDiscovery.mixCollapse') : t('topicDiscovery.mixExpand') }}
        </button>
      </div>
    </div>

    <p
      v-if="isAudienceFiltering && audienceFilter"
      class="text-xs text-indigo-600/80 dark:text-indigo-300/80"
    >
      {{ t('topicDiscovery.mixAudienceFiltered', { audience: AUDIENCE_LABEL[audienceFilter] }) }}
    </p>

    <!-- 题材标签：按分类分组 -->
    <div class="space-y-3">
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ t('topicDiscovery.mixGenres') }}
        <span class="text-xs text-gray-400">({{ selectedTags.length }}/{{ maxGenrePicks }} · {{ visibleGenreCount }} 项)</span>
      </p>
      <div v-for="group in visibleGenreGroups" :key="group.id">
        <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          {{ group.label }}（{{ group.items.length }}）
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in group.items"
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
            <span
              v-if="selectedTags[0] === tag.name"
              class="mr-1 px-1 rounded bg-indigo-500 text-white text-[10px] leading-4"
            >{{ t('topicDiscovery.mixPrimaryBadge') }}</span>
            <span v-if="tag.icon" class="mr-0.5">{{ tag.icon }}</span>
            {{ tag.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- 设定元素：按类别分组 -->
    <div class="space-y-3">
      <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ t('topicDiscovery.mixElements') }}
        <span class="text-xs text-gray-400"
          >({{ selectedElements.length }}/{{ maxElementPicks }} · {{ visibleElementCount }} 项)</span
        >
      </p>
      <div
        v-for="group in visibleElementGroups"
        v-show="showAllGroups || PRIMARY_ELEMENT_GROUPS.has(group.id)"
        :key="group.id"
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
