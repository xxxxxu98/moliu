<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Sparkles, ArrowRight, Check, Wand2 } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings.store';
import { useProjectStore } from '@/stores/project.store';
import type { GeneratedOutline } from '@/types/inspiration';

const { t } = useI18n();
const router = useRouter();
const settingsStore = useSettingsStore();
const projectStore = useProjectStore();

const prompt = ref('');
const isGenerating = ref(false);
const generatedOutlines = ref<GeneratedOutline[]>([]);
const selectedOutline = ref<GeneratedOutline | null>(null);
const streamingContent = ref('');
const streamingError = ref<string | null>(null);

// Event listeners cleanup
let unsubscribeChunk: (() => void) | null = null;
let unsubscribeDone: (() => void) | null = null;
let unsubscribeComplete: (() => void) | null = null;
let unsubscribeError: (() => void) | null = null;

onMounted(() => {
  // Set up streaming event listeners
  unsubscribeChunk = window.electronAPI.onOutlineChunk(({ content, fullContent }) => {
    streamingContent.value = fullContent;
    
    // Try to parse partial JSON to show progress
    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*$/);
      if (jsonMatch) {
        const partialJson = jsonMatch[0];
        // Try to extract outlines from partial JSON
        const outlinesMatch = partialJson.match(/"outlines"\s*:\s*\[([\s\S]*?)\](?=\s*\}[,\]]|$)/);
        if (outlinesMatch) {
          const partialOutlines = JSON.parse(`{"outlines":[${outlinesMatch[1]}]}`);
          if (partialOutlines.outlines && partialOutlines.outlines.length > 0) {
            generatedOutlines.value = partialOutlines.outlines.map((o: any, i: number) => ({
              id: `streaming-${i}-${Date.now()}`,
              title: o.title || '生成中...',
              synopsis: o.synopsis || '',
              structure: o.structure || { act1: '', act2a: '', act2b: '', act3: '' },
              characters: o.characters || [],
              foreshadows: o.foreshadows || [],
              estimatedWordCount: o.estimatedWordCount || 500000,
            }));
          }
        }
      }
    } catch (e) {
      // Ignore parsing errors during streaming
    }
  });

  unsubscribeDone = window.electronAPI.onOutlineDone(() => {
    // Streaming completed, waiting for final parse
  });

  unsubscribeComplete = window.electronAPI.onOutlineComplete(({ result }) => {
    if (result && result.outlines) {
      generatedOutlines.value = result.outlines.map((o: any, i: number) => ({
        id: `outline-${i}-${Date.now()}`,
        title: o.title,
        synopsis: o.synopsis,
        structure: o.structure,
        characters: o.characters,
        foreshadows: o.foreshadows,
        estimatedWordCount: o.estimatedWordCount,
      }));
    }
    isGenerating.value = false;
    streamingContent.value = '';
  });

  unsubscribeError = window.electronAPI.onOutlineError(({ error }) => {
    streamingError.value = error;
    isGenerating.value = false;
    streamingContent.value = '';
  });
});

onUnmounted(() => {
  unsubscribeChunk?.();
  unsubscribeDone?.();
  unsubscribeComplete?.();
  unsubscribeError?.();
});

const outlineOptions = [
  { label: t('quickStart.structures.threeAct'), value: 'three-act' },
  { label: t('quickStart.structures.heroJourney'), value: 'hero-journey' },
  { label: t('quickStart.structures.fourPart'), value: 'four-part' },
];

const selectedStructure = ref<string | null>(null);

async function generateOutlines() {
  if (!prompt.value.trim()) return;

  // Check if AI provider is configured
  const enabledProvider = settingsStore.aiProviders.find(p => p.enabled && p.apiKey);
  if (!enabledProvider) {
    streamingError.value = '请先在设置中配置 AI 提供商';
    return;
  }

  isGenerating.value = true;
  selectedOutline.value = null;
  generatedOutlines.value = [];
  streamingContent.value = '';
  streamingError.value = null;

  try {
    await window.electronAPI.generateOutline({
      prompt: prompt.value,
      provider: enabledProvider.provider,
      config: {
        apiKey: enabledProvider.apiKey,
        baseUrl: enabledProvider.baseUrl,
      },
    });
  } catch (error) {
    streamingError.value = String(error);
    isGenerating.value = false;
  }
}

function selectOutline(outline: GeneratedOutline) {
  selectedOutline.value = outline;
}

async function createProject() {
  if (!selectedOutline.value) return;

  isGenerating.value = true;

  try {
    // Create project from selected outline
    const newProject = await projectStore.createProject({
      name: selectedOutline.value.title,
      description: selectedOutline.value.synopsis,
      plotOutline: selectedOutline.value.structure,
      characters: selectedOutline.value.characters.map(c => ({
        id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: c.name,
        role: c.role,
        description: c.description,
      })),
      foreshadows: selectedOutline.value.foreshadows.map((f, i) => ({
        id: `foreshadow-${Date.now()}-${i}`,
        content: f,
        status: 'pending',
      })),
    });

    if (newProject) {
      router.push(`/project/${newProject.id}`);
    }
  } catch (error) {
    console.error('Failed to create project:', error);
  } finally {
    isGenerating.value = false;
  }
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

    <!-- Streaming Content Preview -->
    <div v-if="streamingContent" class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('quickStart.generating') }}</div>
      <div class="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap line-clamp-6">
        {{ streamingContent }}
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="streamingError" class="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <div class="text-sm text-red-600 dark:text-red-400">{{ streamingError }}</div>
    </div>

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
    <div v-if="generatedOutlines.length === 0 && !isGenerating && !streamingError" class="text-center py-4">
      <Sparkles class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ t('quickStart.emptyDesc') }}</p>
    </div>
  </div>
</template>
