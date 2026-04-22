<script setup lang="ts">
import { NSelect } from 'naive-ui';
import { useSettingsStore } from '@/stores/settings.store';
import { useI18n } from 'vue-i18n';
import { Globe, Languages, Info } from 'lucide-vue-next';

const { t } = useI18n();
const settingsStore = useSettingsStore();

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
];

const contentLanguageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
];

function handleLanguageChange(value: 'zh-CN' | 'en-US') {
  settingsStore.setLocale(value);
}

function handleContentLanguageChange(value: string) {
  settingsStore.setContentLanguage(value);
}
</script>

<template>
  <div class="space-y-8">
    <!-- UI Language Card -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
            <Globe class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('settings.language.uiLanguage') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.language.uiLanguageDesc') }}</p>
          </div>
        </div>

        <NSelect
          :value="settingsStore.locale"
          :options="languageOptions"
          class="max-w-xs"
          @update:value="handleLanguageChange"
        />
      </div>
    </div>

    <!-- Content Language Card -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
            <Languages class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('settings.language.contentLanguage') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.language.contentLanguageDesc') }}</p>
          </div>
        </div>

        <NSelect
          :value="settingsStore.contentLanguage"
          :options="contentLanguageOptions"
          class="max-w-xs"
          @update:value="handleContentLanguageChange"
        />
      </div>
    </div>

    <!-- Info Alert -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800/50">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg flex-shrink-0">
            <Info class="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 class="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">{{ t('settings.language.infoTitle') }}</h4>
            <ul class="text-sm text-indigo-700 dark:text-indigo-400 space-y-1">
              <li>• {{ t('settings.language.infoItem1') }}</li>
              <li>• {{ t('settings.language.infoItem2') }}</li>
              <li>• {{ t('settings.language.infoItem3') }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
