<script setup lang="ts">
import { NSwitch, NSlider } from 'naive-ui';
import { Save, Zap, Type } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings.store';

const { t } = useI18n();
const settingsStore = useSettingsStore();

const autoSaveOptions = [
  { label: t('settings.general.interval.30s'), value: 30 },
  { label: t('settings.general.interval.1m'), value: 60 },
  { label: t('settings.general.interval.2m'), value: 120 },
  { label: t('settings.general.interval.5m'), value: 300 },
];

function handleAutoSaveChange(value: boolean) {
  settingsStore.setAutoSave(value);
}

function handleAutoSaveIntervalChange(value: number) {
  settingsStore.setAutoSaveInterval(value);
}

function handleStreamOutputChange(value: boolean) {
  settingsStore.setStreamOutput(value);
}

function handleFontSizeChange(value: number) {
  settingsStore.setFontSize(value);
}

function handleLineHeightChange(value: number) {
  settingsStore.setLineHeight(value);
}
</script>

<template>
  <div class="space-y-8">
    <!-- Auto Save -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
            <Save class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1">
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('settings.general.autoSave') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.general.autoSaveDesc') }}</p>
          </div>
          <NSwitch :value="settingsStore.autoSave" @update:value="handleAutoSaveChange" />
        </div>

        <div v-if="settingsStore.autoSave" class="pl-[3.25rem] space-y-4">
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">{{ t('settings.general.autoSaveInterval') }}：</span>
            <div class="flex gap-2">
              <button
                v-for="option in autoSaveOptions"
                :key="option.value"
                class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                :class="[
                  settingsStore.autoSaveInterval === option.value
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                ]"
                @click="handleAutoSaveIntervalChange(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Output -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
            <Zap class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1">
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('settings.general.aiOutput') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.general.aiOutputDesc') }}</p>
          </div>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">{{ t('settings.general.streamOutput') }}</div>
              <div class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.general.streamOutputDesc') }}</div>
            </div>
            <NSwitch :value="settingsStore.streamOutput" @update:value="handleStreamOutputChange" />
          </div>
        </div>
      </div>
    </div>

    <!-- Editor Settings -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
            <Type class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('settings.general.editorSettings') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.general.editorSettingsDesc') }}</p>
          </div>
        </div>

        <div class="space-y-6">
          <!-- Font Size -->
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('settings.general.fontSize') }}</span>
              <span class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{{ settingsStore.fontSize }}px</span>
            </div>
            <NSlider
              :value="settingsStore.fontSize"
              :min="12"
              :max="24"
              :step="1"
              :marks="{ 12: '12', 16: '16', 20: '20', 24: '24' }"
              @update:value="handleFontSizeChange"
            />
          </div>

          <!-- Line Height -->
          <div class="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/50">
            <div class="flex items-center justify-between mb-3">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('settings.general.lineHeight') }}</span>
              <span class="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{{ settingsStore.lineHeight.toFixed(1) }}</span>
            </div>
            <NSlider
              :value="settingsStore.lineHeight"
              :min="1.2"
              :max="2.5"
              :step="0.1"
              :marks="{ 1.2: t('settings.general.compact'), 1.8: t('settings.general.standard'), 2.5: t('settings.general.relaxed') }"
              @update:value="handleLineHeightChange"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
