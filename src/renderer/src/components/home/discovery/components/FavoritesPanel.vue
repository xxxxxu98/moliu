<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { BookmarkCheck } from 'lucide-vue-next';
import type { FavoriteSeed, StorySeedCard, TopicDiscoveryTab } from '@/types/topic-discovery';

defineProps<{
  favorites: FavoriteSeed[];
  maxFavorites: number;
}>();

const emit = defineEmits<{
  adopt: [seed: StorySeedCard, fromTab: TopicDiscoveryTab];
  remove: [seed: StorySeedCard, fromTab: TopicDiscoveryTab];
  clear: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="w-full rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3"
  >
    <div class="flex items-center justify-between gap-2">
      <div>
        <h4 class="text-base font-semibold text-gray-900 dark:text-white">
          {{ t('topicDiscovery.favoritesTitle') }}
        </h4>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {{ t('topicDiscovery.favoritesDesc', { max: maxFavorites }) }}
        </p>
      </div>
      <button
        v-if="favorites.length > 0"
        type="button"
        class="text-sm text-gray-500 hover:text-rose-600 dark:hover:text-rose-400"
        @click="emit('clear')"
      >
        {{ t('topicDiscovery.clearFavorites') }}
      </button>
    </div>

    <div
      v-if="favorites.length === 0"
      class="rounded-lg border border-dashed border-amber-200 dark:border-amber-800 px-4 py-6 text-center text-sm text-gray-500"
    >
      {{ t('topicDiscovery.emptyFavorites') }}
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      <div
        v-for="item in favorites"
        :key="`fav-${item.seed.id}-${item.savedAt}`"
        class="relative w-full text-left p-4 rounded-xl border-2 border-amber-200 dark:border-amber-800/60 bg-white dark:bg-gray-800/50 hover:border-amber-400 transition-all cursor-pointer"
        @click="emit('adopt', item.seed, item.fromTab)"
      >
        <button
          type="button"
          class="absolute top-2.5 right-2.5 p-1.5 rounded-md text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
          :title="t('topicDiscovery.unfavorite')"
          @click.stop="emit('remove', item.seed, item.fromTab)"
        >
          <BookmarkCheck class="w-4 h-4" />
        </button>
        <div class="pr-8 mb-1.5">
          <h4
            class="font-semibold text-base text-gray-900 dark:text-white leading-snug line-clamp-2"
            :title="item.seed.title"
          >
            {{ item.seed.title }}
          </h4>
          <p class="text-xs text-gray-400 mt-0.5">
            {{ t(`topicDiscovery.tabs.${item.fromTab}`) }} · {{ item.seed.genre }}
          </p>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
          {{ item.seed.oneLiner }}
        </p>
      </div>
    </div>
    <p class="text-sm text-center text-gray-400">{{ t('topicDiscovery.favoritesHint') }}</p>
  </div>
</template>
