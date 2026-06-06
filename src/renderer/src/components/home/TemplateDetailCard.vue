<script setup lang="ts">
import { Star, TrendingUp } from 'lucide-vue-next';
import { NButton } from 'naive-ui';

interface WritingTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  tags: string[];
  usageCount: number;
  rating: number;
  isHot?: boolean;
  isNew?: boolean;
  prompt: string;
  gradient: string;
}

interface Props {
  template: WritingTemplate | null;
}

interface Emits {
  (e: 'open-pro-outliner', template: WritingTemplate): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div
    v-if="template"
    class="rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden"
  >
    <div class="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center gap-2">
        <span class="text-lg">{{ template.icon }}</span>
        <span class="font-medium text-sm text-gray-900 dark:text-white">{{ template.name }}</span>
      </div>
      <div class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span>模板详情</span>
      </div>
    </div>

    <div class="p-3 max-h-48 overflow-y-auto">
      <div
        class="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap"
      >
        {{ template.prompt }}
      </div>
    </div>

    <div class="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ template.prompt.length }} 字符
        </span>
        <span class="text-xs text-gray-400 dark:text-gray-500">
          {{ template.tags?.length || 0 }} 个标签
        </span>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1">
          <Star class="w-3.5 h-3.5 text-amber-500" />
          <span class="text-xs text-gray-600 dark:text-gray-400">{{ template.rating }}</span>
        </div>
        <NButton
          size="tiny"
          quaternary
          @click="emit('open-pro-outliner', template)"
        >
          <template #icon>
            <TrendingUp class="w-3.5 h-3.5" />
          </template>
          导入专业大纲
        </NButton>
      </div>
    </div>
  </div>
</template>
