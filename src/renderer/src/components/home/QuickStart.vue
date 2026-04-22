<script setup lang="ts">
import { ref } from 'vue';
import { Sparkles, ArrowRight, Check, Wand2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { GeneratedOutline } from '@/types/inspiration';
import { timing } from '@/config/timing';

const { t } = useI18n();
const router = useRouter();

const prompt = ref('');
const isGenerating = ref(false);
const generatedOutlines = ref<GeneratedOutline[]>([]);
const selectedOutline = ref<GeneratedOutline | null>(null);

const outlineOptions = [
  { label: t('quickStart.structures.threeAct'), value: 'three-act' },
  { label: t('quickStart.structures.heroJourney'), value: 'hero-journey' },
  { label: t('quickStart.structures.fourPart'), value: 'four-part' },
];

const selectedStructure = ref<string | null>(null);

async function generateOutlines() {
  if (!prompt.value.trim()) return;

  isGenerating.value = true;
  selectedOutline.value = null;

  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.verySlow));

  generatedOutlines.value = [
    {
      id: '1',
      title: `${prompt.value.slice(0, 10)}...的命运之旅`,
      synopsis: `这是一个发生在${prompt.value}背景下的史诗故事，讲述主角在命运的漩涡中挣扎求存...`,
      structure: {
        act1: '主角在一个平凡的世界中生活，突然遭遇了改变命运的变故...',
        act2a: '主角踏上了冒险之旅，在这个过程中结识了伙伴...',
        act2b: '主角面临最大的挑战，必须做出艰难的选择...',
        act3: '主角克服困难，实现了成长...',
      },
      characters: [
        { name: '主角', role: '主人公', description: '一个平凡但不甘平凡的年轻人' },
        { name: '导师', role: '引路人', description: '神秘的前辈，指引主角成长' },
      ],
      foreshadows: ['神秘力量的觉醒', '隐藏的血脉', '命运的预言'],
      estimatedWordCount: 500000,
    },
    {
      id: '2',
      title: `${prompt.value.slice(0, 10)}...的热血传奇`,
      synopsis: `在 ${prompt.value} 的世界中，热血与梦想交织，每一个平凡的灵魂都有机会成为传奇...`,
      structure: {
        act1: '一个充满挑战的时代，主角立下了远大的志向...',
        act2a: '在追求梦想的道路上，主角不断突破自我...',
        act2b: '危机降临，主角必须证明自己的价值...',
        act3: '经过不懈努力，主角终于站在了巅峰...',
      },
      characters: [
        { name: '热血少年', role: '主人公', description: '充满激情和正义感的年轻人' },
        { name: '亦敌亦友', role: '竞争对手', description: '既是对手又是挚友的存在' },
      ],
      foreshadows: ['隐藏的真相', '意外的联盟', '觉醒的力量'],
      estimatedWordCount: 800000,
    },
  ];

  isGenerating.value = false;
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function createProject() {
  if (!selectedOutline.value) return;

  isGenerating.value = true;
  await new Promise((resolve) => setTimeout(resolve, timing.mockApi.standard));
  isGenerating.value = false;

  router.push(`/project/${selectedOutline.value.id}`);
}

function formatWordCount(count: number) {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(0)}${t('quickStart.tenThousands', { count })}`;
  }
  return `${count}${t('quickStart.characters', { count })}`;
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
        <Wand2 class="w-4 h-4 text-white" />
      </div>
      <div>
        <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('quickStart.title') }}</h3>
      </div>
    </div>

    <!-- Prompt Input -->
    <div>
      <textarea
        v-model="prompt"
        class="w-full h-24 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
        :placeholder="t('quickStart.placeholder')"
      ></textarea>
      <div class="text-xs text-gray-400 text-right mt-1">
        {{ prompt.length }} / 2000
      </div>
    </div>

    <!-- Generate Button -->
    <button
      class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="!prompt.trim() || isGenerating"
      @click="generateOutlines"
    >
      <Sparkles v-if="!isGenerating" class="w-4 h-4" />
      <span v-if="isGenerating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
      {{ isGenerating ? t('quickStart.generating') : t('quickStart.generate') }}
    </button>

    <!-- Generated Outlines -->
    <div v-if="generatedOutlines.length > 0" class="space-y-3">
      <div class="flex items-center gap-2">
        <div class="w-1 h-4 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500"></div>
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ t('quickStart.preparedOutlines') }}
        </h4>
      </div>

      <div class="space-y-2">
        <div
          v-for="outline in generatedOutlines"
          :key="outline.id"
          class="p-3 rounded-xl border-2 cursor-pointer transition-all duration-200"
          :class="[
            selectedOutline?.id === outline.id
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700 bg-white dark:bg-gray-800'
          ]"
          @click="selectOutline(outline)"
        >
          <div class="flex items-start gap-2">
            <div
              v-if="selectedOutline?.id === outline.id"
              class="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0"
            >
              <Check class="w-3 h-3 text-white" />
            </div>
            <div class="flex-1 min-w-0">
              <h5 class="font-medium text-sm text-gray-900 dark:text-white truncate">
                {{ outline.title }}
              </h5>
              <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                {{ outline.synopsis }}
              </p>
              <div class="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                <span>{{ formatWordCount(outline.estimatedWordCount) }}</span>
                <span>{{ outline.characters.length }} {{ t('quickStart.characters') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Button -->
      <button
        v-if="selectedOutline"
        class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
        @click="createProject"
      >
        <span>{{ t('quickStart.createFromOutline') }}</span>
        <ArrowRight class="w-4 h-4" />
      </button>
    </div>

    <!-- Empty State -->
    <div v-if="generatedOutlines.length === 0 && !isGenerating" class="text-center py-4">
      <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ t('quickStart.emptyDesc') }}</p>
    </div>
  </div>
</template>
