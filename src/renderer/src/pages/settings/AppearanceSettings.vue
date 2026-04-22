<script setup lang="ts">
import { ref, computed } from 'vue';
import { NSelect, NColorPicker, NSwitch } from 'naive-ui';
import { useSettingsStore, type ThemeMode } from '@/stores/settings.store';
import { Sun, Moon, Monitor, Check } from 'lucide-vue-next';

const settingsStore = useSettingsStore();

const themeOptions = [
  { label: '跟随系统', value: 'system', icon: Monitor },
  { label: '浅色模式', value: 'light', icon: Sun },
  { label: '深色模式', value: 'dark', icon: Moon },
];

const accentColorOptions = [
  { label: '靛蓝', value: '#6366f1', color: '#6366f1' },
  { label: '青色', value: '#06b6d4', color: '#06b6d4' },
  { label: '紫色', value: '#8b5cf6', color: '#8b5cf6' },
  { label: '粉色', value: '#ec4899', color: '#ec4899' },
  { label: '橙色', value: '#f97316', color: '#f97316' },
  { label: '绿色', value: '#10b981', color: '#10b981' },
  { label: '红色', value: '#ef4444', color: '#ef4444' },
  { label: '蓝色', value: '#3b82f6', color: '#3b82f6' },
];

function handleThemeChange(value: ThemeMode) {
  settingsStore.setTheme(value);
}

function handleAccentColorChange(color: string) {
  settingsStore.setAccentColor(color);
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
            <h3 class="font-semibold text-gray-900 dark:text-white">主题模式</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">选择应用的显示模式</p>
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

    <!-- Accent Color Card -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
            <div class="w-5 h-5 rounded bg-white/30"></div>
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">主题色</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">自定义应用的主题颜色</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-4 mb-6">
          <button
            v-for="option in accentColorOptions"
            :key="option.value"
            class="relative w-12 h-12 rounded-xl transition-all duration-200 hover:scale-110"
            :style="{ backgroundColor: option.color }"
            :class="[
              settingsStore.accentColor === option.value
                ? 'ring-4 ring-offset-4 ring-gray-200 dark:ring-offset-gray-900 scale-110'
                : 'hover:ring-2 hover:ring-offset-2 hover:ring-gray-200 dark:hover:ring-gray-700'
            ]"
            :title="option.label"
            @click="handleAccentColorChange(option.value)"
          >
            <Check
              v-if="settingsStore.accentColor === option.value"
              class="absolute inset-0 m-auto w-6 h-6 text-white drop-shadow-lg"
            />
          </button>
        </div>

        <div class="flex items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
          <span class="text-sm text-gray-500 dark:text-gray-400">自定义颜色：</span>
          <NColorPicker
            :value="settingsStore.accentColor"
            :swatches="accentColorOptions.map(c => c.value)"
            @update:value="handleAccentColorChange"
          />
          <span class="text-sm font-mono text-gray-400 dark:text-gray-500">
            {{ settingsStore.accentColor }}
          </span>
        </div>
      </div>
    </div>

    <!-- Preview Card -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-pink-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-gradient-to-br from-gray-50 to-indigo-50/50 dark:from-gray-800/50 dark:to-indigo-900/30 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">预览效果</h3>
        <div
          class="p-6 rounded-xl border-2 transition-all duration-300"
          :style="{ borderColor: settingsStore.accentColor + '40', backgroundColor: settingsStore.accentColor + '08' }"
        >
          <div
            class="text-2xl font-bold mb-3"
            :style="{ color: settingsStore.accentColor }"
          >
            墨流 AI 写作助手
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            这是一个示例卡片，用于预览主题颜色效果
          </p>
          <div class="flex gap-3">
            <button
              class="px-5 py-2.5 rounded-xl text-white font-medium shadow-lg transition-all hover:scale-105"
              :style="{ backgroundColor: settingsStore.accentColor }"
            >
              主要按钮
            </button>
            <button
              class="px-5 py-2.5 rounded-xl border-2 font-medium transition-all hover:scale-105"
              :style="{ borderColor: settingsStore.accentColor, color: settingsStore.accentColor }"
            >
              次要按钮
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
