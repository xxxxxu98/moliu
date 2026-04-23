<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Sparkles, RefreshCw, Check, X, Shuffle, Save, BookOpen } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useInspirationStore } from '@/stores/inspiration.store';
import type { GenreTag, SettingElement, StoryNucleus } from '@/types/inspiration';
import { genreTags as configGenreTags, settingElements as configSettingElements, storyNuclei as configStoryNuclei } from '@/data/inspirations';
import { timing } from '@/config/timing';

const { t } = useI18n();
const inspirationStore = useInspirationStore();

const isGenerating = ref(false);

// Use config data
const genreTags = configGenreTags;
const settingElements = configSettingElements;
const storyNuclei = configStoryNuclei;

// Draft state
const savedDraft = ref<{
  selectedTags: string[];
  selectedElements: string[];
  timestamp: number;
} | null>(null);

const currentStep = computed(() => {
  if (inspirationStore.selectedNucleus) return 4;
  if (inspirationStore.selectedElements.length > 0) return 3;
  if (inspirationStore.selectedTags.length > 0) return 2;
  return 1;
});

function toggleTag(tagId: string) {
  inspirationStore.toggleTag(tagId);
  saveDraft();
}

function toggleElement(elementId: string) {
  inspirationStore.toggleElement(elementId);
  // Restore nuclei after element selection (store clears them)
  inspirationStore.setStoryNuclei(shuffledStoryNuclei.value.length > 0 ? shuffledStoryNuclei.value : storyNuclei);
  saveDraft();
}

function selectNucleus(nucleus: typeof storyNuclei[0]) {
  inspirationStore.selectNucleus(nucleus);
  saveDraft();
}

// Shuffled data for refresh functionality
const shuffledGenreTags = ref<typeof genreTags>([]);
const shuffledSettingElements = ref<typeof settingElements>([]);
const shuffledStoryNuclei = ref<typeof storyNuclei>([]);

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function refreshTags() {
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.quick));
  shuffledGenreTags.value = shuffleArray(genreTags);
  isGenerating.value = false;
}

async function refreshElements() {
  if (inspirationStore.selectedTags.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.quick));
  shuffledSettingElements.value = shuffleArray(settingElements);
  isGenerating.value = false;
}

async function refreshNuclei() {
  if (inspirationStore.selectedTags.length === 0 && inspirationStore.selectedElements.length === 0) return;
  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.animation.long));
  shuffledStoryNuclei.value = shuffleArray(storyNuclei);
  inspirationStore.setStoryNuclei(shuffledStoryNuclei.value);
  isGenerating.value = false;
}

async function randomPick() {
  isGenerating.value = true;
  
  // Simulate thinking
  await new Promise((resolve) => setTimeout(resolve, 800));
  
  // Random pick one tag
  const randomTag = genreTags[Math.floor(Math.random() * genreTags.length)];
  const randomElement = settingElements[Math.floor(Math.random() * settingElements.length)];
  
  inspirationStore.reset();
  inspirationStore.toggleTag(randomTag.id);
  inspirationStore.toggleElement(randomElement.id);
  
  // Refresh nuclei
  await new Promise((resolve) => setTimeout(resolve, 300));
  inspirationStore.setStoryNuclei(storyNuclei);
  
  isGenerating.value = false;
}

function clearSelection() {
  inspirationStore.reset();
  clearDraft();
  shuffledGenreTags.value = [];
  shuffledSettingElements.value = [];
  shuffledStoryNuclei.value = [];
}

async function generateOutlines() {
  inspirationStore.setGenerating(true, 'generating-outlines');
  
  // Simulate generating outlines based on selected nucleus
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.slow));
  
  // Generate mock outlines based on selected nucleus
  if (inspirationStore.selectedNucleus) {
    const nucleus = inspirationStore.selectedNucleus;
    const mockOutlines: { 
      id: string; 
      title: string; 
      synopsis: string;
      structure: { act1: string; act2a: string; act2b: string; act3: string };
      characters: { name: string; role: string; description: string }[];
    }[] = [
      {
        id: '1',
        title: nucleus.title,
        synopsis: nucleus.premise + '\n\n' + nucleus.conflict,
        structure: {
          act1: `故事开篇：${nucleus.characters[0]?.name || '主角'}在一个平凡的日子里遭遇了改变命运的转折点...`,
          act2a: `冲突升级：主角面临前所未有的挑战，必须快速成长以应对危机...`,
          act2b: `高潮前夕：真相逐渐浮出水面，主角必须做出艰难的选择...`,
          act3: `结局：主角克服困难，实现成长，故事圆满落幕...`,
        },
        characters: nucleus.characters.map(c => ({
          name: c.name,
          role: c.role,
          description: `${c.name}是一个${c.traits.join('、')}的角色`,
        })),
      },
    ];
    inspirationStore.setGeneratedOutlines(mockOutlines);
  }
  
  inspirationStore.setGenerating(false);
}

function saveDraft() {
  const draft = {
    selectedTags: [...inspirationStore.selectedTags],
    selectedElements: [...inspirationStore.selectedElements],
    timestamp: Date.now(),
  };
  localStorage.setItem('inspirationDraft', JSON.stringify(draft));
  savedDraft.value = draft;
}

function loadDraft() {
  const draft = localStorage.getItem('inspirationDraft');
  if (draft) {
    try {
      const parsed = JSON.parse(draft);
      inspirationStore.reset();
      parsed.selectedTags.forEach((id: string) => inspirationStore.toggleTag(id));
      parsed.selectedElements.forEach((id: string) => inspirationStore.toggleElement(id));
      inspirationStore.setStoryNuclei(storyNuclei);
      savedDraft.value = parsed;
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
  }
}

function clearDraft() {
  localStorage.removeItem('inspirationDraft');
  savedDraft.value = null;
}

onMounted(() => {
  inspirationStore.setStoryNuclei(storyNuclei);
  
  // Load saved draft
  const draft = localStorage.getItem('inspirationDraft');
  if (draft) {
    try {
      savedDraft.value = JSON.parse(draft);
    } catch (e) {
      console.error('Failed to parse saved draft:', e);
    }
  }
});

// Quick scenario cards
const quickScenarios = [
  {
    id: '1',
    title: '废物流逆袭',
    tags: ['修仙', '玄幻'],
    elements: ['资质平平', '神秘导师'],
    icon: '💫',
    gradient: 'from-indigo-500 to-purple-600',
  },
  {
    id: '2',
    title: '都市系统流',
    tags: ['都市', '言情'],
    elements: ['系统流', '校花/总裁'],
    icon: '🎮',
    gradient: 'from-pink-500 to-rose-600',
  },
  {
    id: '3',
    title: '星际探险',
    tags: ['科幻'],
    elements: ['星际争霸', '穿越异界'],
    icon: '🚀',
    gradient: 'from-cyan-500 to-blue-600',
  },
  {
    id: '4',
    title: '重生复仇',
    tags: ['都市'],
    elements: ['重生复仇', '天才流'],
    icon: '⏰',
    gradient: 'from-amber-500 to-orange-600',
  },
];

function applyQuickScenario(scenario: typeof quickScenarios[0]) {
  inspirationStore.reset();
  
  // Map tag names to IDs
  scenario.tags.forEach(tagName => {
    const tag = genreTags.find(g => g.name === tagName);
    if (tag) inspirationStore.toggleTag(tag.id);
  });
  
  // Map element names to IDs
  scenario.elements.forEach(elementName => {
    const element = settingElements.find(e => e.name === elementName);
    if (element) inspirationStore.toggleElement(element.id);
  });
  
  inspirationStore.setStoryNuclei(storyNuclei);
  saveDraft();
}
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
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('inspiration.description') }}</p>
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-if="savedDraft"
          class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="加载草稿"
          @click="loadDraft"
        >
          <BookOpen class="w-4 h-4 text-amber-500" />
        </button>
        <button
          v-if="currentStep > 1"
          class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          @click="clearSelection"
        >
          <X class="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>

    <!-- Quick Scenarios -->
    <div v-if="currentStep === 1" class="mb-4">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ t('inspiration.quickStart') }}</span>
        <button
          class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
          @click="randomPick"
        >
          <Shuffle class="w-3 h-3" />
          {{ t('inspiration.randomPick') }}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="scenario in quickScenarios"
          :key="scenario.id"
          class="p-3 rounded-xl bg-gradient-to-br text-left transition-all duration-200 hover:scale-[1.02]"
          :class="scenario.gradient"
          @click="applyQuickScenario(scenario)"
        >
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-lg">{{ scenario.icon }}</span>
            <span class="font-medium text-sm text-white">{{ scenario.title }}</span>
          </div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tag in scenario.tags"
              :key="tag"
              class="px-1.5 py-0.5 text-xs bg-white/20 rounded text-white/90"
            >
              {{ tag }}
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Progress Indicator -->
    <div class="flex items-center gap-1 mb-3">
      <div
        v-for="step in 4"
        :key="step"
        class="h-1 flex-1 rounded-full transition-all duration-300"
        :class="step <= currentStep ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gray-200 dark:bg-gray-700'"
      ></div>
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
          :class="{ 'animate-spin': isGenerating }"
          @click="refreshTags"
        >
          <RefreshCw class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in (shuffledGenreTags.length > 0 ? shuffledGenreTags : genreTags)"
          :key="tag.id"
          class="px-3 py-1.5 rounded-lg text-sm transition-all duration-200 relative group"
          :class="[
            inspirationStore.selectedTags.includes(tag.id)
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/50'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
          ]"
          @click="toggleTag(tag.id)"
        >
          <span class="mr-1">{{ tag.icon }}</span>
          {{ tag.name }}
          <span
            v-if="tag.description && inspirationStore.selectedTags.includes(tag.id)"
            class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-gray-900 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10"
          >
            {{ tag.description }}
          </span>
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
          :class="{ 'animate-spin': isGenerating }"
          @click="refreshElements"
        >
          <RefreshCw class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      <div class="space-y-2">
        <!-- Group by category -->
        <div v-for="category in ['character', 'plot', 'world', 'conflict']" :key="category">
          <div v-if="(shuffledSettingElements.length > 0 ? shuffledSettingElements : settingElements).filter(e => e.category === category).length > 0" class="mb-2">
            <span class="text-xs text-gray-400 dark:text-gray-500 capitalize">{{
              category === 'character' ? '角色设定' :
              category === 'plot' ? '剧情元素' :
              category === 'world' ? '世界观' : '核心冲突'
            }}</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="element in (shuffledSettingElements.length > 0 ? shuffledSettingElements : settingElements).filter(e => e.category === category)"
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
          :class="{ 'animate-spin': isGenerating }"
          @click="refreshNuclei"
        >
          <RefreshCw class="w-3.5 h-3.5 text-gray-400" />
        </button>
      </div>

      <!-- Story Nuclei Cards -->
      <div class="space-y-2">
        <div
          v-for="nucleus in inspirationStore.storyNuclei"
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
        :disabled="isGenerating"
        @click="generateOutlines"
      >
        <Sparkles v-if="!isGenerating" class="w-4 h-4" />
        <span v-if="isGenerating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        {{ t('inspiration.generateOutline') }}
      </button>
    </div>

    <!-- Empty State -->
    <div v-if="currentStep === 1" class="text-center py-4">
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
