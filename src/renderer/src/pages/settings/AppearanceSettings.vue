<script setup lang="ts">
import { ref, computed } from 'vue';
import { NSwitch } from 'naive-ui';
import { useI18n } from 'vue-i18n';
import { useSettingsStore, type ThemeMode } from '@/stores/settings.store';
import { Sun, Moon, Monitor, Check } from 'lucide-vue-next';

const { t } = useI18n();
const settingsStore = useSettingsStore();

const themeOptions = computed(() => [
  { label: t('settings.appearance.followSystem'), value: 'system', icon: Monitor },
  { label: t('settings.appearance.lightMode'), value: 'light', icon: Sun },
  { label: t('settings.appearance.darkMode'), value: 'dark', icon: Moon },
]);

function handleThemeChange(value: ThemeMode) {
  settingsStore.setTheme(value);
}
</script>

<template>
  <div class="space-y-8">
    <!-- Theme Mode Card -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Monitor class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">{{ t('settings.appearance.themeMode') }}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('settings.appearance.themeModeDesc') }}</p>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="option in themeOptions"
            :key="option.value"
            class="relative p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105"
            :class="[
              settingsStore.theme === option.value
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700'
            ]"
            @click="handleThemeChange(option.value as ThemeMode)"
          >
            <div class="flex flex-col items-center gap-2">
              <div
                class="w-12 h-12 rounded-full flex items-center justify-center"
                :class="[
                  settingsStore.theme === option.value
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-700'
                ]"
              >
                <component
                  :is="option.icon"
                  class="w-6 h-6"
                  :class="settingsStore.theme === option.value ? 'text-white' : 'text-gray-500 dark:text-gray-400'"
                />
              </div>
              <span
                class="text-sm font-medium"
                :class="settingsStore.theme === option.value ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400'"
              >
                {{ option.label }}
              </span>
            </div>
            <div
              v-if="settingsStore.theme === option.value"
              class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg"
            >
              <Check class="w-4 h-4 text-white" />
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Preview Card -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-pink-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-gradient-to-br from-gray-50 to-indigo-50/50 dark:from-gray-800/50 dark:to-indigo-900/30 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">{{ t('settings.appearance.preview') }}</h3>
        <div
          class="p-6 rounded-xl border-2 transition-all duration-300 border-indigo-500/40 bg-indigo-50/30"
        >
          <div
            class="text-2xl font-bold mb-3 text-indigo-600 dark:text-indigo-400"
          >
            {{ t('app.name') }}
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ t('app.tagline') }}
          </p>
          <div class="flex gap-3">
            <button
              class="px-5 py-2.5 rounded-xl text-white font-medium shadow-lg transition-all hover:scale-105 bg-indigo-500"
            >
              {{ t('settings.common.save') }}
            </button>
            <button
              class="px-5 py-2.5 rounded-xl border-2 border-indigo-500 text-indigo-500 font-medium transition-all hover:scale-105"
            >
              {{ t('settings.common.cancel') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
