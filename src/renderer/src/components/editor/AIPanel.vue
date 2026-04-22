<script setup lang="ts">
import { ref, computed } from 'vue';
import { NScrollbar, NButton, NInput, NSpin, NTabs, NTabPane, NCard, NTag } from 'naive-ui';
import { Sparkles, RefreshCw, Copy, Check, Wand2, History, Settings, MessageSquare, Lightbulb, Database } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const isGenerating = ref(false);
const generatedText = ref('');
const showResult = ref(false);
const selectedMode = ref<'continue' | 'polish' | 'suggestions' | 'memory'>('continue');
const customPrompt = ref('');

const suggestions = ref([
  { id: 1, type: 'characterConsistency', text: '建议增加主角面对困难时的内心独白', severity: 'warning' },
  { id: 2, type: 'foreshadowReminder', text: '第三章埋下的神秘物品似乎可以引出', severity: 'info' },
  { id: 3, type: 'paceSuggestion', text: '当前段落较长，建议增加场景描写或对话', severity: 'info' },
]);

const tabOptions = computed(() => [
  { key: 'continue' as const, label: t('editor.continueWriting'), icon: Sparkles },
  { key: 'suggestions' as const, label: t('editor.suggestions'), icon: Lightbulb },
  { key: 'memory' as const, label: t('editor.memory'), icon: Database },
]);

async function generateContinue() {
  isGenerating.value = true;
  showResult.value = false;
  await new Promise(resolve => setTimeout(resolve, 2000));

  generatedText.value = `就在这时，一道耀眼的光芒从天际划过，照亮了整个山谷。

"这是..."主角瞪大了眼睛，难以置信地看着眼前的景象。

一个身着古老长袍的老者缓缓从光芒中走出，他的目光深邃而慈祥，仿佛能够看透世间一切。

"孩子，你终于来了。"老者的声音如同远古的钟声，在山谷中回荡。`;

  showResult.value = true;
  isGenerating.value = false;
}

function acceptResult() {
  showResult.value = false;
  generatedText.value = '';
}

function discardResult() {
  showResult.value = false;
  generatedText.value = '';
}

function copyResult() {
  navigator.clipboard.writeText(generatedText.value);
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

function getSeverityBg(severity: string) {
  switch (severity) {
    case 'warning':
      return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50';
    case 'error':
      return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50';
    default:
      return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50';
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tabs -->
    <div class="flex border-b border-gray-100 dark:border-gray-800">
      <button
        v-for="tab in tabOptions"
        :key="tab.key"
        class="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors relative"
        :class="[
          selectedMode === tab.key
            ? 'text-indigo-600 dark:text-indigo-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        ]"
        @click="selectedMode = tab.key"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
        <div
          v-if="selectedMode === tab.key"
          class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
        ></div>
      </button>
    </div>

    <NScrollbar class="flex-1 p-4">
      <!-- Continue Tab -->
      <div v-show="selectedMode === 'continue'" class="space-y-4">
        <!-- Mode Selection -->
        <div class="grid grid-cols-2 gap-2">
          <button
            class="p-4 rounded-xl border-2 transition-all text-left"
            :class="[
              selectedMode === 'continue'
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700'
            ]"
          >
            <div class="font-semibold text-sm text-gray-900 dark:text-white mb-1">{{ t('editor.smartContinue') }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ t('editor.smartContinueDesc') }}</div>
          </button>
          <button
            class="p-4 rounded-xl border-2 transition-all text-left"
            :class="[
              'border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700'
            ]"
          >
            <div class="font-semibold text-sm text-gray-900 dark:text-white mb-1">{{ t('editor.polish') }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{{ t('editor.polishDesc') }}</div>
          </button>
        </div>

        <!-- Custom Prompt -->
        <div>
          <NInput
            v-model:value="customPrompt"
            type="textarea"
            :placeholder="`${t('editor.promptPlaceholder')}\n${t('editor.promptExample')}`"
            :rows="3"
            :maxlength="500"
          />
        </div>

        <!-- Generate Button -->
        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 transition-all disabled:opacity-50"
          :disabled="isGenerating"
          @click="generateContinue"
        >
          <Sparkles v-if="!isGenerating" class="w-5 h-5" />
          <span v-if="isGenerating" class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ isGenerating ? t('editor.generating') : t('editor.startGenerate') }}
        </button>

        <!-- Generated Result -->
        <div v-if="showResult" class="space-y-3">
          <div class="p-4 rounded-xl bg-gradient-to-br from-gray-50 to-indigo-50/30 dark:from-gray-800 dark:to-indigo-900/20 border border-gray-100 dark:border-gray-700">
            <div class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {{ generatedText }}
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <button
              class="px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
              @click="acceptResult"
            >
              {{ t('editor.accept') }}
            </button>
            <button
              class="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              @click="copyResult"
            >
              {{ t('editor.copy') }}
            </button>
            <button
              class="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              @click="discardResult"
            >
              {{ t('editor.discard') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Suggestions Tab -->
      <div v-show="selectedMode === 'suggestions'" class="space-y-3">
        <div
          v-for="suggestion in suggestions"
          :key="suggestion.id"
          class="p-4 rounded-xl border transition-all hover:shadow-md"
          :class="getSeverityBg(suggestion.severity)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1">
              <NTag :type="getSeverityColor(suggestion.severity)" size="small" class="mb-2">
                {{ suggestion.type }}
              </NTag>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                {{ suggestion.text }}
              </p>
            </div>
            <button class="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
              <Wand2 class="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </button>
          </div>
        </div>

        <button
          class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm font-medium hover:border-indigo-300 dark:hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <RefreshCw class="w-4 h-4" />
          {{ t('editor.reAnalyze') }}
        </button>
      </div>

      <!-- Memory Tab -->
      <div v-show="selectedMode === 'memory'" class="space-y-4">
        <div class="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/30 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/50">
          <div class="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">{{ t('editor.currentChapterMemory') }}</div>
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>{{ t('editor.charactersInScene') }}: 林风、苏婉儿</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{{ t('editor.location') }}: 青木镇郊外</span>
            </div>
            <div class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{{ t('editor.time') }}: 清晨</span>
            </div>
          </div>
        </div>

        <div class="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50/30 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-100 dark:border-purple-800/50">
          <div class="text-sm font-medium text-purple-900 dark:text-purple-300 mb-3">{{ t('editor.relatedForeshadows') }}</div>
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-purple-700 dark:text-purple-400">神秘玉佩</span>
              <NTag type="warning" size="small">{{ t('editor.toBeRevealed') }}</NTag>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-purple-700 dark:text-purple-400">家族测试</span>
              <NTag type="success" size="small">{{ t('editor.revealed') }}</NTag>
            </div>
          </div>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>
