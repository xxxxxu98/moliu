<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Sparkles, RefreshCw, Check, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useInspirationStore } from '@/stores/inspiration.store';
import type { GenreTag, SettingElement, StoryNucleus } from '@/types/inspiration';

const { t } = useI18n();
const inspirationStore = useInspirationStore();

const isGenerating = ref(false);

// Genre tags with icons and colors
const genreTags: (GenreTag & { icon: string; gradient: string })[] = [
  { id: '1', name: '修仙', color: '#6366f1', icon: '⚡', gradient: 'from-indigo-500 to-purple-600' },
  { id: '2', name: '玄幻', color: '#8b5cf6', icon: '🔥', gradient: 'from-purple-500 to-pink-600' },
  { id: '3', name: '都市', color: '#ec4899', icon: '🌆', gradient: 'from-pink-500 to-rose-600' },
  { id: '4', name: '科幻', color: '#06b6d4', icon: '🚀', gradient: 'from-cyan-500 to-blue-600' },
  { id: '5', name: '历史', color: '#f59e0b', icon: '🏯', gradient: 'from-amber-500 to-orange-600' },
  { id: '6', name: '武侠', color: '#10b981', icon: '⚔️', gradient: 'from-emerald-500 to-teal-600' },
];

const settingElements: (SettingElement & { icon: string })[] = [
  { id: '1', name: '资质平平的主角', icon: '💫' },
  { id: '2', name: '退婚羞辱', icon: '💔' },
  { id: '3', name: '神秘老爷爷', icon: '👴' },
  { id: '4', name: '家族测试', icon: '📊' },
  { id: '5', name: '宗门崛起', icon: '🏯' },
  { id: '6', name: '天才流', icon: '⭐' },
];

const storyNuclei: (StoryNucleus & { gradient: string })[] = [
  {
    id: '1',
    title: '废物流的逆袭之路',
    premise: '在一个以灵根资质论英雄的修仙世界，主角天生废灵根，被所有人嘲笑...',
    conflict: '主角必须在被所有人看不起的情况下，找到属于自己的修炼之路...',
    characters: [
      { role: '主角', name: '林风', traits: ['坚韧', '善良'] },
      { role: '导师', name: '神秘老者', traits: ['神秘', '强大'] },
    ],
    foreshadows: ['隐藏的血脉', '上古传承'],
    genreTags: ['修仙', '热血'],
    gradient: 'from-indigo-500/20 to-purple-500/20',
  },
  {
    id: '2',
    title: '系统觉醒的都市传奇',
    premise: '普通大学生意外获得超级系统，从此人生逆袭，走上巅峰...',
    conflict: '在都市的暗流涌动中，主角如何平衡力量与道德的考验...',
    characters: [
      { role: '主角', name: '陈昊', traits: ['冷静', '腹黑'] },
    ],
    foreshadows: ['系统的真相', '隐藏的敌人'],
    genreTags: ['都市', '系统流'],
    gradient: 'from-emerald-500/20 to-cyan-500/20',
  },
];

const currentStep = computed(() => {
  if (inspirationStore.selectedNucleus) return 3;
  if (inspirationStore.selectedElements.length > 0) return 2;
  if (inspirationStore.selectedTags.length > 0) return 1;
  return 0;
});

function toggleTag(tagId: string) {
  inspirationStore.toggleTag(tagId);
}

function toggleElement(elementId: string) {
  inspirationStore.toggleElement(elementId);
}

function selectNucleus(nucleus: StoryNucleus) {
  inspirationStore.selectNucleus(nucleus);
}

async function refreshTags() {
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, 500));
  isGenerating.value = false;
}

async function refreshElements() {
  if (inspirationStore.selectedTags.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, 500));
  isGenerating.value = false;
}

async function refreshNuclei() {
  if (inspirationStore.selectedTags.length === 0 && inspirationStore.selectedElements.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, 800));
  inspirationStore.setStoryNuclei(storyNuclei);
  isGenerating.value = false;
}

function clearSelection() {
  inspirationStore.reset();
}

async function generateOutlines() {
  inspirationStore.setGenerating(true, 'generating-outlines');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  inspirationStore.setGenerating(false);
}

onMounted(() => {
  inspirationStore.setStoryNuclei(storyNuclei);
});
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <Sparkles class="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('inspiration.title') }}</h3>
        </div>
      </div>
      <button
        v-if="currentStep > 0"
        class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        @click="clearSelection"
      >
        <X class="w-4 h-4 text-gray-400" />
      </button>
    </div>

    <!-- Step 1: Genre Tags -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span class="text-xs font-bold text-white">1</span>
          </div>
          <span class="text-sm text-gray-700 dark:text-gray-300">{{ t('inspiration.step1Title') }}</span>
        </div>
        <button
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="refreshTags"
        >
          <RefreshCw class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in genreTags"
          :key="tag.id"
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
          :class="inspirationStore.selectedTags.includes(tag.id) ? 'text-white shadow-sm ' + (tag.id === '1' ? 'bg-indigo-500 hover:bg-indigo-600' : tag.id === '2' ? 'bg-purple-500 hover:bg-purple-600' : tag.id === '3' ? 'bg-pink-500 hover:bg-pink-600' : tag.id === '4' ? 'bg-cyan-500 hover:bg-cyan-600' : tag.id === '5' ? 'bg-amber-500 hover:bg-amber-600' : tag.id === '6' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-500 hover:bg-indigo-600') : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'"
          @click="toggleTag(tag.id)"
        >
          <span class="mr-1">{{ tag.icon }}</span>
          {{ tag.name }}
        </button>
      </div>
    </div>

    <!-- Step 2: Setting Elements -->
    <div v-if="inspirationStore.selectedTags.length > 0" class="animate-fade-in">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <span class="text-xs font-bold text-white">2</span>
          </div>
          <span class="text-sm text-gray-700 dark:text-gray-300">{{ t('inspiration.step2Title') }}</span>
        </div>
        <button
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="refreshElements"
        >
          <RefreshCw class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="element in settingElements"
          :key="element.id"
          class="px-3 py-1.5 rounded-lg text-sm transition-all duration-200"
          :class="[
            inspirationStore.selectedElements.includes(element.id)
              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/50'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
          ]"
          @click="toggleElement(element.id)"
        >
          <span class="mr-1">{{ element.icon }}</span>
          {{ element.name }}
        </button>
      </div>
    </div>

    <!-- Step 3: Story Nuclei -->
    <div v-if="inspirationStore.canGenerateNuclei" class="animate-fade-in">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <span class="text-xs font-bold text-white">3</span>
          </div>
          <span class="text-sm text-gray-700 dark:text-gray-300">{{ t('inspiration.step3Title') }}</span>
        </div>
        <button
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="refreshNuclei"
        >
          <RefreshCw class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      <!-- Story Nuclei Cards -->
      <div class="space-y-2">
        <div
          v-for="nucleus in storyNuclei"
          :key="nucleus.id"
          class="p-3 rounded-xl border-2 cursor-pointer transition-all duration-200"
          :class="[
            inspirationStore.selectedNucleus?.id === nucleus.id
              ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-900/20'
              : 'border-gray-100 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-700 bg-white dark:bg-gray-800'
          ]"
          @click="selectNucleus(nucleus)"
        >
          <div class="flex items-start gap-2">
            <div
              v-if="inspirationStore.selectedNucleus?.id === nucleus.id"
              class="w-5 h-5 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0"
            >
              <Check class="w-3 h-3 text-white" />
            </div>
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-sm text-gray-900 dark:text-white">
                {{ nucleus.title }}
              </h4>
              <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                {{ nucleus.premise }}
              </p>
              <div class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="tag in nucleus.genreTags"
                  :key="tag"
                  class="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generate Button -->
    <div v-if="inspirationStore.canGenerateOutlines" class="animate-fade-in pt-2">
      <button
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        @click="generateOutlines"
      >
        <Sparkles class="w-4 h-4" />
        {{ t('inspiration.generateOutline') }}
      </button>
    </div>

    <!-- Empty State -->
    <div v-if="currentStep === 0" class="text-center py-4">
      <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ t('inspiration.startJourneyDesc') }}</p>
    </div>
  </div>
</template>

<style>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}
</style>
