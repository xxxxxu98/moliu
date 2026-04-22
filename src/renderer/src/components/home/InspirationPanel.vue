<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Sparkles, RefreshCw, ArrowRight, Check, X, Feather } from 'lucide-vue-next';
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
  { id: '7', name: '奇幻', color: '#3b82f6', icon: '✨', gradient: 'from-blue-500 to-indigo-600' },
  { id: '8', name: '悬疑', color: '#ef4444', icon: '🔮', gradient: 'from-red-500 to-rose-600' },
];

const settingElements: (SettingElement & { icon: string })[] = [
  { id: '1', name: '资质平平的主角', icon: '💫' },
  { id: '2', name: '退婚羞辱', icon: '💔' },
  { id: '3', name: '神秘老爷爷', icon: '👴' },
  { id: '4', name: '家族测试', icon: '📊' },
  { id: '5', name: '宗门崛起', icon: '🏯' },
  { id: '6', name: '天才流', icon: '⭐' },
  { id: '7', name: '系统流', icon: '🤖' },
  { id: '8', name: '凡人流', icon: '🌱' },
];

const storyNuclei: (StoryNucleus & { gradient: string })[] = [
  {
    id: '1',
    title: '废物流的逆袭之路',
    premise: '在一个以灵根资质论英雄的修仙世界，主角天生废灵根，被所有人嘲笑...',
    conflict: '主角必须在被所有人看不起的情况下，找到属于自己的修炼之路...',
    characters: [
      { role: '主角', name: '林风', traits: ['坚韧', '善良', '机智'] },
      { role: '未婚妻', name: '苏婉儿', traits: ['高傲', '天赋极高'] },
      { role: '导师', name: '神秘老者', traits: ['神秘', '强大'] },
    ],
    foreshadows: ['隐藏的血脉', '上古传承', '宿命的相遇'],
    genreTags: ['修仙', '热血'],
    gradient: 'from-indigo-500/20 to-purple-500/20',
  },
  {
    id: '2',
    title: '系统觉醒的都市传奇',
    premise: '普通大学生意外获得超级系统，从此人生逆袭，走上巅峰...',
    conflict: '在都市的暗流涌动中，主角如何平衡力量与道德的考验...',
    characters: [
      { role: '主角', name: '陈昊', traits: ['冷静', '腹黑', '重情'] },
      { role: '女主', name: '林诗雨', traits: ['温柔', '聪明', '独立'] },
    ],
    foreshadows: ['系统的真相', '隐藏的敌人', '前世记忆'],
    genreTags: ['都市', '系统流'],
    gradient: 'from-emerald-500/20 to-cyan-500/20',
  },
  {
    id: '3',
    title: '宗门大师兄的崛起',
    premise: '作为宗门大师兄，主角不仅天赋异禀，还拥有最强背景...',
    conflict: '在宗门争斗和外界威胁中，主角如何守护自己的宗门和爱人...',
    characters: [
      { role: '主角', name: '萧云', traits: ['稳重', '担当', '深情'] },
      { role: '师妹', name: '小师妹', traits: ['活泼', '可爱', '天才'] },
    ],
    foreshadows: ['上古遗迹', '禁忌之术', '宗门秘辛'],
    genreTags: ['修仙', '爽文'],
    gradient: 'from-orange-500/20 to-amber-500/20',
  },
];

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
  await new Promise((resolve) => setTimeout(resolve, 800));
  isGenerating.value = false;
}

async function refreshElements() {
  if (inspirationStore.selectedTags.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, 800));
  isGenerating.value = false;
}

async function refreshNuclei() {
  if (inspirationStore.selectedTags.length === 0 && inspirationStore.selectedElements.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  inspirationStore.setStoryNuclei(storyNuclei);
  isGenerating.value = false;
}

async function generateOutlines() {
  inspirationStore.setGenerating(true, 'generating-outlines');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  inspirationStore.setGenerating(false);
}

function clearSelection() {
  inspirationStore.reset();
}

onMounted(() => {
  inspirationStore.setStoryNuclei(storyNuclei);
});
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-10">
    <!-- Header -->
    <div class="text-center space-y-4">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30 mb-4">
        <Sparkles class="w-8 h-8 text-white" />
      </div>
      <h2 class="text-3xl font-bold bg-gradient-to-r from-gray-900 via-amber-700 to-orange-600 dark:from-white dark:via-amber-300 dark:to-orange-400 bg-clip-text text-transparent">
        {{ t('inspiration.title') }}
      </h2>
      <p class="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
        {{ t('inspiration.startJourneyDesc') }}
      </p>
    </div>

    <!-- Step 1: Genre Tags -->
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span class="text-lg font-bold text-white">1</span>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('inspiration.step1Title') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('inspiration.step1Desc') }}</p>
          </div>
        </div>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          @click="refreshTags"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t('inspiration.refresh') }}
        </button>
      </div>

      <div class="relative">
        <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-xl"></div>
        <div class="relative flex flex-wrap gap-3 p-6 bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-3xl border border-gray-200/50 dark:border-gray-700/50">
          <button
            v-for="tag in genreTags"
            :key="tag.id"
            class="group relative px-5 py-3 rounded-2xl font-medium transition-all duration-300 hover:scale-105"
            :class="[
              inspirationStore.selectedTags.includes(tag.id)
                ? 'text-white shadow-lg scale-105'
                : 'bg-gray-50 dark:bg-gray-900/50 text-gray-700 dark:text-gray-300 hover:shadow-md'
            ]"
            @click="toggleTag(tag.id)"
          >
            <!-- Active background -->
            <div
              v-if="inspirationStore.selectedTags.includes(tag.id)"
              class="absolute inset-0 rounded-2xl bg-gradient-to-r"
              :class="tag.gradient"
            ></div>
            <span class="relative flex items-center gap-2">
              <span class="text-lg">{{ tag.icon }}</span>
              {{ tag.name }}
              <Check
                v-if="inspirationStore.selectedTags.includes(tag.id)"
                class="w-4 h-4 ml-1"
              />
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Step 2: Setting Elements -->
    <div v-if="inspirationStore.selectedTags.length > 0" class="space-y-6 animate-fade-in">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
            <span class="text-lg font-bold text-white">2</span>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('inspiration.step2Title') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('inspiration.step2Desc') }}</p>
          </div>
        </div>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          @click="refreshElements"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t('inspiration.refresh') }}
        </button>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          v-for="element in settingElements"
          :key="element.id"
          class="px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105"
          :class="[
            inspirationStore.selectedElements.includes(element.id)
              ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/50'
              : 'bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
          ]"
          @click="toggleElement(element.id)"
        >
          <span class="mr-1.5">{{ element.icon }}</span>
          {{ element.name }}
        </button>
      </div>
    </div>

    <!-- Step 3: Story Nuclei -->
    <div v-if="inspirationStore.canGenerateNuclei" class="space-y-6 animate-fade-in">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <span class="text-lg font-bold text-white">3</span>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ t('inspiration.step3Title') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('inspiration.step3Desc') }}</p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="clearSelection"
          >
            <X class="w-4 h-4" />
            {{ t('inspiration.reset') }}
          </button>
          <button
            class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            @click="refreshNuclei"
          >
            <RefreshCw class="w-4 h-4" />
            {{ t('inspiration.refresh') }}
          </button>
        </div>
      </div>

      <!-- Story Nuclei Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div
          v-for="nucleus in storyNuclei"
          :key="nucleus.id"
          class="group relative bg-gradient-to-br rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
          :class="[
            inspirationStore.selectedNucleus?.id === nucleus.id
              ? 'ring-4 ring-amber-500/50 shadow-xl'
              : 'hover:shadow-lg'
          ]"
          @click="selectNucleus(nucleus)"
        >
          <!-- Gradient background -->
          <div class="absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity"
               :class="nucleus.gradient.replace('/20', '/30')"></div>

          <div class="relative">
            <!-- Selection indicator -->
            <div
              v-if="inspirationStore.selectedNucleus?.id === nucleus.id"
              class="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"
            >
              <Check class="w-5 h-5 text-white" />
            </div>

            <!-- Title -->
            <h4 class="font-bold text-lg text-gray-900 dark:text-white mb-3 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              {{ nucleus.title }}
            </h4>

            <!-- Premise -->
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
              {{ nucleus.premise }}
            </p>

            <!-- Conflict -->
            <div class="mb-4">
              <span class="text-xs font-medium text-gray-500 dark:text-gray-500 uppercase tracking-wider">{{ t('inspiration.coreConflict') }}</span>
              <p class="text-sm text-gray-700 dark:text-gray-300 mt-1">{{ nucleus.conflict }}</p>
            </div>

            <!-- Tags -->
            <div class="flex flex-wrap gap-1.5 mb-4">
              <span
                v-for="tag in nucleus.genreTags"
                :key="tag"
                class="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium"
              >
                {{ tag }}
              </span>
            </div>

            <!-- Characters -->
            <div class="pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <span class="text-xs font-medium text-gray-500 dark:text-gray-500">{{ t('inspiration.coreCharacters') }}</span>
              <div class="flex flex-wrap gap-2 mt-2">
                <span
                  v-for="char in nucleus.characters.slice(0, 3)"
                  :key="char.name"
                  class="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  {{ char.name }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Generate Button -->
      <div v-if="inspirationStore.canGenerateOutlines" class="flex justify-center pt-4">
        <button
          class="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white font-bold text-lg shadow-2xl shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:scale-105 transition-all"
          @click="generateOutlines"
        >
          <Sparkles class="w-6 h-6" />
          {{ t('inspiration.generateOutline') }}
          <ArrowRight class="w-6 h-6" />
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div class="flex flex-col items-center justify-center py-16">
      <div class="w-24 h-24 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 flex items-center justify-center mb-6">
        <Feather class="w-12 h-12 text-amber-400 dark:text-amber-600" />
      </div>
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">{{ t('inspiration.startJourney') }}</h3>
      <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
        {{ t('inspiration.startJourneyDesc') }}
      </p>
    </div>
  </div>
</template>

<style>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.4s ease-out;
}
</style>
