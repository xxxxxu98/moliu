<script setup lang="ts">
import { BookOpen, RotateCcw, Sparkles, Wand2 } from 'lucide-vue-next';
import { NButton } from 'naive-ui';

type ActiveTab = 'wizard' | 'templates' | 'custom';

interface SavedDraft {
  prompt: string;
  templateId: string | null;
  timestamp: number;
  wordCountRange: string;
}

interface Props {
  title: string;
  description: string;
  activeTab: ActiveTab;
  savedDraft: SavedDraft | null;
  showDraftMenu: boolean;
}

interface Emits {
  (e: 'toggle-draft-menu'): void;
  (e: 'load-draft'): void;
  (e: 'clear-draft'): void;
  (e: 'switch-tab', tab: ActiveTab): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div
          class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <Wand2 class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">
            {{ title }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ description }}
          </p>
        </div>
      </div>
      <div class="relative">
        <NButton
          v-if="savedDraft"
          quaternary
          circle
          @click="emit('toggle-draft-menu')"
        >
          <template #icon>
            <BookOpen class="w-4 h-4 text-amber-500" />
          </template>
        </NButton>
        <div
          v-if="showDraftMenu"
          class="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10"
        >
          <NButton
            quaternary
            block
            @click="emit('load-draft')"
          >
            <template #icon>
              <BookOpen class="w-4 h-4" />
            </template>
            加载草稿
          </NButton>
          <NButton
            quaternary
            block
            @click="emit('clear-draft')"
          >
            <template #icon>
              <RotateCcw class="w-4 h-4" />
            </template>
            清除草稿
          </NButton>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'wizard' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="emit('switch-tab', 'wizard')"
      >
        <Sparkles class="w-4 h-4" />
        三步法
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'templates' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="emit('switch-tab', 'templates')"
      >
        模板市场
      </button>
      <button
        class="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="activeTab === 'custom' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
        @click="emit('switch-tab', 'custom')"
      >
        自定义输入
      </button>
    </div>
  </div>
</template>
