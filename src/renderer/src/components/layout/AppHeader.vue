<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Settings, Home, BookOpen } from 'lucide-vue-next';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const currentRoute = computed(() => route.path);

const navItems = [
  { path: '/home', label: '首页', icon: Home },
  { path: '/settings', label: t('nav.settings'), icon: Settings },
];

function navigate(path: string) {
  router.push(path);
}

function goToHome() {
  router.push('/home');
}
</script>

<template>
  <div class="w-full h-full flex items-center justify-between px-6 py-2">
    <!-- Left: Logo -->
    <div class="flex items-center gap-3 cursor-pointer group" @click="goToHome">
      <div class="relative">
        <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:shadow-xl group-hover:shadow-indigo-500/40 transition-all">
          <BookOpen class="w-5 h-5 text-white" />
        </div>
        <div class="absolute -inset-1 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl blur opacity-30 group-hover:opacity-50 transition-opacity -z-10"></div>
      </div>
      <div>
        <h1 class="text-xl font-bold bg-gradient-to-r from-gray-900 via-indigo-700 to-purple-600 dark:from-white dark:via-indigo-300 dark:to-purple-400 bg-clip-text text-transparent">
          {{ t('app.name') }}
        </h1>
        <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('app.tagline') }}</p>
      </div>
    </div>

    <!-- Center: Navigation Tabs (shown in project view) -->
    <slot name="center"></slot>

    <!-- Right: Navigation -->
    <div class="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800">
      <button
        v-for="item in navItems"
        :key="item.path"
        class="relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200"
        :class="[
          currentRoute === item.path
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        ]"
        @click="navigate(item.path)"
      >
        <component
          :is="item.icon"
          class="w-4 h-4"
          :class="[
            currentRoute === item.path
              ? 'text-indigo-600 dark:text-indigo-400'
              : ''
          ]"
        />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </div>
</template>
