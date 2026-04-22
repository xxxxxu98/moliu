<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppHeader from '@/components/layout/AppHeader.vue';
import AppearanceSettings from '@/pages/settings/AppearanceSettings.vue';
import LanguageSettings from '@/pages/settings/LanguageSettings.vue';
import AIModelConfig from '@/pages/settings/AIModelConfig.vue';
import GeneralSettings from '@/pages/settings/GeneralSettings.vue';
import { useSettingsStore } from '@/stores/settings.store';
import { useI18n } from 'vue-i18n';
import {
  Palette,
  Globe,
  Cpu,
  Settings,
} from 'lucide-vue-next';

const { t } = useI18n();
const settingsStore = useSettingsStore();
const activeKey = ref('appearance');

onMounted(() => {
  settingsStore.initializeSettings();
});

const menuItems = computed(() => [
  { key: 'appearance', label: t('settings.tabs.appearance'), icon: Palette, description: t('settings.appearance.themeModeDesc') },
  { key: 'language', label: t('settings.tabs.language'), icon: Globe, description: t('settings.language.uiLanguageDesc') },
  { key: 'ai-providers', label: t('settings.tabs.aiProviders'), icon: Cpu, description: t('settings.aiProviders.titleDesc') },
  { key: 'general', label: t('settings.tabs.general'), icon: Settings, description: t('settings.general.editorSettingsDesc') },
]);

const activeIndex = computed(() => {
  return menuItems.value.findIndex(m => m.key === activeKey.value);
});

function handleMenuClick(key: string) {
  activeKey.value = key;
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-indigo-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-indigo-950/30">
    <!-- Header -->
    <div class="flex-shrink-0 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50">
      <AppHeader />
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-4xl mx-auto px-6 py-8">
        <!-- Page Header -->
        <div class="text-center mb-10">
          <h1 class="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-700 to-purple-600 dark:from-white dark:via-indigo-300 dark:to-purple-400 bg-clip-text text-transparent mb-3">
            {{ t('settings.title') }}
          </h1>
          <p class="text-gray-500 dark:text-gray-400">{{ t('settings.subtitle') }}</p>
        </div>

        <!-- Compact Tab Navigation -->
        <div class="flex justify-center mb-10">
          <div class="relative p-1 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 flex">
            <!-- Sliding background -->
            <div
              class="absolute top-1 bottom-1 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out shadow-lg shadow-indigo-500/30"
              :style="{
                width: `calc(${100 / menuItems.length}% - 4px)`,
                left: `calc(${activeIndex * (100 / menuItems.length)}% + 2px)`,
              }"
            ></div>

            <!-- Tab buttons -->
            <button
              v-for="item in menuItems"
              :key="item.key"
              class="relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 min-w-[100px] justify-center"
              :class="[
                activeKey === item.key
                  ? 'text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              ]"
              @click="handleMenuClick(item.key)"
            >
              <component :is="item.icon" class="w-4 h-4" />
              {{ item.label }}
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="space-y-6">
          <!-- Appearance Settings -->
          <div v-show="activeKey === 'appearance'">
            <AppearanceSettings />
          </div>

          <!-- Language Settings -->
          <div v-show="activeKey === 'language'">
            <LanguageSettings />
          </div>

          <!-- AI Providers Settings -->
          <div v-show="activeKey === 'ai-providers'">
            <AIModelConfig />
          </div>

          <!-- General Settings -->
          <div v-show="activeKey === 'general'">
            <GeneralSettings />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
