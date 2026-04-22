<script setup lang="ts">
import { ref } from 'vue';
import { Sparkles, ArrowRight, Check, Wand2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { GeneratedOutline } from '@/types/inspiration';

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

  await new Promise((resolve) => setTimeout(resolve, 2000));

  generatedOutlines.value = [
    {
      id: '1',
      title: `${prompt.value.slice(0, 10)}...的命运之旅`,
      synopsis: `这是一个发生在${prompt.value}背景下的史诗故事，讲述主角在命运的漩涡中挣扎求存，最终找到自我价值的热血传奇...`,
      structure: {
        act1: '主角在一个平凡的世界中生活，突然遭遇了改变命运的变故...',
        act2a: '主角踏上了冒险之旅，在这个过程中结识了伙伴...',
        act2b: '主角面临最大的挑战，必须做出艰难的选择...',
        act3: '主角克服困难，实现了成长，收获了友情和爱情...',
      },
      characters: [
        { name: '主角', role: '主人公', description: '一个平凡但不甘平凡的年轻人' },
        { name: '导师', role: '引路人', description: '神秘的前辈，指引主角成长' },
        { name: '反派', role: '对立者', description: '野心勃勃的势力首领' },
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
        { name: '幕后黑手', role: '反派', description: '操控一切的阴谋家' },
      ],
      foreshadows: ['隐藏的真相', '意外的联盟', '觉醒的力量'],
      estimatedWordCount: 800000,
    },
    {
      id: '3',
      title: `${prompt.value.slice(0, 10)}...的修仙之路`,
      synopsis: `在 ${prompt.value} 背景下，讲述修仙者的成长历程，从一介凡人到问鼎巅峰的传奇故事...`,
      structure: {
        act1: '主角意外踏入修仙之路，开始了全新的世界...',
        act2a: '在宗门中修炼，经历各种考验和磨砺...',
        act2b: '与各方势力周旋，实力逐渐增强...',
        act3: '突破极限，成为一代宗师...',
      },
      characters: [
        { name: '修炼者', role: '主人公', description: '天赋异禀的年轻修士' },
        { name: '老爷爷', role: '金手指', description: '神秘的传承者' },
        { name: '天才对手', role: '竞争者', description: '同辈中的天才人物' },
      ],
      foreshadows: ['上古遗迹', '血脉传承', '天地异变'],
      estimatedWordCount: 1000000,
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
  await new Promise((resolve) => setTimeout(resolve, 1000));
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
  <div class="max-w-5xl mx-auto space-y-8">
    <!-- Header -->
    <div class="text-center space-y-4">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 mb-4">
        <Wand2 class="w-8 h-8 text-white" />
      </div>
      <h2 class="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-700 to-purple-600 dark:from-white dark:via-indigo-300 dark:to-purple-400 bg-clip-text text-transparent">
        {{ t('quickStart.title') }}
      </h2>
      <p class="text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
        {{ t('quickStart.description') }}
      </p>
    </div>

    <!-- Prompt Input Card -->
    <div class="relative">
      <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-3xl blur-xl"></div>
      <div class="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl border border-gray-200/50 dark:border-gray-700/50">
        <div class="space-y-6">
          <div class="relative">
            <textarea
              v-model="prompt"
              class="w-full h-40 p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-base leading-relaxed"
              :placeholder="t('quickStart.placeholderExample')"
            ></textarea>
            <div class="absolute bottom-3 right-3 text-xs text-gray-400">
              {{ prompt.length }} / 2000
            </div>
          </div>

          <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-500 dark:text-gray-400">{{ t('quickStart.outlineStyle') }}</span>
              <div class="flex gap-2">
                <button
                  v-for="option in outlineOptions"
                  :key="option.value"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  :class="[
                    selectedStructure === option.value
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  ]"
                  @click="selectedStructure = option.value"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <button
              class="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              :disabled="!prompt.trim() || isGenerating"
              @click="generateOutlines"
            >
              <Sparkles v-if="!isGenerating" class="w-5 h-5" />
              <span v-if="isGenerating" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ isGenerating ? t('quickStart.generating') : t('quickStart.generate') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Generated Outlines -->
    <div v-if="generatedOutlines.length > 0" class="space-y-6">
      <div class="flex items-center gap-3">
        <div class="w-1 h-6 rounded-full bg-gradient-to-b from-purple-500 to-indigo-500"></div>
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
          {{ t('quickStart.preparedOutlines') }}
        </h3>
        <span class="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
          {{ generatedOutlines.length }} {{ t('quickStart.plans') }}
        </span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div
          v-for="(outline, index) in generatedOutlines"
          :key="outline.id"
          class="group relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border-2 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
          :class="[
            selectedOutline?.id === outline.id
              ? 'border-indigo-500 shadow-lg shadow-indigo-500/20 ring-4 ring-indigo-500/10'
              : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700'
          ]"
          @click="selectOutline(outline)"
        >
          <!-- Gradient decoration -->
          <div class="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-bl-full"></div>

          <div class="relative">
            <!-- Selection indicator -->
            <div
              v-if="selectedOutline?.id === outline.id"
              class="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg"
            >
              <Check class="w-5 h-5 text-white" />
            </div>

            <!-- Title -->
            <h4 class="font-bold text-lg text-gray-900 dark:text-white mb-3 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {{ outline.title }}
            </h4>

            <!-- Synopsis -->
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
              {{ outline.synopsis }}
            </p>

            <!-- Stats -->
            <div class="flex items-center gap-4 py-3 border-t border-gray-100 dark:border-gray-700/50">
              <div class="flex items-center gap-1.5 text-sm">
                <span class="px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium">
                  {{ formatWordCount(outline.estimatedWordCount) }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                <span>{{ outline.characters.length }} {{ t('quickStart.characters') }}</span>
              </div>
            </div>

            <!-- Foreshadows -->
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="foreshadow in outline.foreshadows.slice(0, 3)"
                :key="foreshadow"
                class="px-2 py-0.5 text-xs rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
              >
                {{ foreshadow }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Project Button -->
      <div v-if="selectedOutline" class="flex justify-center pt-4">
        <button
          class="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white font-bold text-lg shadow-2xl shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-105 transition-all"
          @click="createProject"
        >
          <span>{{ t('quickStart.createFromOutline') }}</span>
          <ArrowRight class="w-6 h-6" />
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="generatedOutlines.length === 0 && !isGenerating" class="flex flex-col items-center justify-center py-16">
      <div class="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mb-6">
        <Sparkles class="w-12 h-12 text-indigo-400 dark:text-indigo-600" />
      </div>
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">{{ t('quickStart.emptyTitle') }}</h3>
      <p class="text-gray-500 dark:text-gray-400 text-center max-w-md">
        {{ t('quickStart.emptyDesc') }}
      </p>
    </div>
  </div>
</template>
