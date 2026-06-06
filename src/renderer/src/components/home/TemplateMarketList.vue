<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';

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
  searchQuery: string;
  selectedCategory: string | null;
  categories: string[];
  templates: WritingTemplate[];
  selectedTemplateId: string | null;
}

interface Emits {
  (e: 'update:searchQuery', value: string): void;
  (e: 'select-category', category: string | null): void;
  (e: 'clear-search'): void;
  (e: 'select-template', template: WritingTemplate): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        :value="searchQuery"
        type="text"
        placeholder="搜索模板..."
        class="w-full pl-10 pr-8 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500"
        @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="searchQuery"
        class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
        @click="emit('clear-search')"
      >
        <X class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
        :class="selectedCategory === null
          ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
        @click="emit('select-category', null)"
      >
        全部
      </button>
      <button
        v-for="cat in categories"
        :key="cat"
        class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
        :class="selectedCategory === cat
          ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
        @click="emit('select-category', cat)"
      >
        {{ cat }}
      </button>
    </div>

    <div class="text-xs text-gray-400 dark:text-gray-500">
      共 {{ templates.length }} 个模板
    </div>

    <div class="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1">
      <div
        v-for="template in templates"
        :key="template.id"
        class="p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer relative"
        :class="selectedTemplateId === template.id
          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
          : 'border-gray-100 dark:border-gray-800 hover:border-indigo-200 dark:hover:border-indigo-800'"
        @click="emit('select-template', template)"
      >
        <div class="absolute top-2 right-2 flex gap-1">
          <span v-if="template.isHot" class="px-1.5 py-0.5 rounded text-xs bg-orange-500 text-white">
            热
          </span>
          <span v-if="template.isNew" class="px-1.5 py-0.5 rounded text-xs bg-green-500 text-white">
            新
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div
            class="w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl flex-shrink-0"
            :class="`bg-gradient-to-br ${template.gradient}`"
          >
            {{ template.icon }}
          </div>
          <div class="flex-1 min-w-0">
            <h4 class="font-semibold text-gray-900 dark:text-white">{{ template.name }}</h4>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ template.category }}</p>
          </div>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-3 leading-relaxed">
          {{ template.description }}
        </p>

        <div class="flex items-center justify-between">
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in template.tags.slice(0, 4)"
              :key="tag"
              class="px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="templates.length === 0" class="text-center py-8">
        <Search class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400">
          未找到匹配的模板
        </p>
        <button
          class="mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          @click="emit('clear-search')"
        >
          清除搜索
        </button>
      </div>
    </div>
  </div>
</template>
