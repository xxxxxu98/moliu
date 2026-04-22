<script setup lang="ts">
import { NSelect } from 'naive-ui';
import { useSettingsStore } from '@/stores/settings.store';
import { Globe, Languages, Info } from 'lucide-vue-next';

const settingsStore = useSettingsStore();

const languageOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: '繁體中文', value: 'zh-TW' },
  { label: 'English', value: 'en-US' },
];

function handleLanguageChange(value: 'zh-CN' | 'en-US') {
  settingsStore.setLocale(value);
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
            <h3 class="font-semibold text-gray-900 dark:text-white">界面语言</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">选择应用的界面显示语言</p>
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
            <h3 class="font-semibold text-gray-900 dark:text-white">内容语言偏好</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">设置 AI 生成内容的默认语言风格</p>
          </div>
        </div>

        <NSelect
          :value="'zh-CN'"
          :options="[
            { label: '简体中文', value: 'zh-CN' },
            { label: '繁體中文', value: 'zh-TW' },
            { label: 'English', value: 'en' },
          ]"
          class="max-w-xs"
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
            <h4 class="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">语言切换说明</h4>
            <ul class="text-sm text-indigo-700 dark:text-indigo-400 space-y-1">
              <li>• 界面语言设置将立即生效，无需重启应用</li>
              <li>• 用户生成内容（如项目名称、章节标题等）不受此设置影响</li>
              <li>• AI 生成内容的语言风格由「内容语言偏好」控制</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
