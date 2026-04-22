<script setup lang="ts">
import { ref } from "vue";
import AppHeader from "@/components/layout/AppHeader.vue";
import ProjectList from "@/components/home/ProjectList.vue";
import QuickStart from "@/components/home/QuickStart.vue";
import InspirationPanel from "@/components/home/InspirationPanel.vue";
import { useI18n } from "vue-i18n";
import { BookOpen, Sparkles, Lightbulb } from "lucide-vue-next";

type TabName = "projects" | "quickstart" | "inspiration";

const { t } = useI18n();
const activeTab = ref<TabName>("projects");

const tabs = [
  { key: "projects", label: t("home.tabs.projects"), icon: BookOpen },
  { key: "quickstart", label: t("home.tabs.quickstart"), icon: Sparkles },
  { key: "inspiration", label: t("home.tabs.inspiration"), icon: Lightbulb },
] as const;
</script>

<template>
  <div class="h-screen flex flex-col">
    <!-- Background Gradient Layer -->
    <div
      class="fixed inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-indigo-950 pointer-events-none -z-10"
    ></div>

    <!-- Header -->
    <div
      class="flex-shrink-0 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50"
    >
      <AppHeader />
    </div>

    <!-- Main Content Container -->
    <div
      class="flex-1 flex flex-col relative overflow-y-auto overscroll-contain"
    >
      <!-- Scrollable Content Area -->
      <div class="flex-1">
        <div class="max-w-7xl mx-auto px-6 py-8">
          <!-- Hero Section -->
          <div class="text-center mb-12">
            <div
              class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-6"
            >
              <span
                class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"
              ></span>
              {{ t("home.badge") }}
            </div>
            <h1
              class="text-4xl md:text-5xl font-bold bg-gradient-to-r from-gray-900 via-indigo-700 to-purple-600 dark:from-white dark:via-indigo-300 dark:to-purple-400 bg-clip-text text-transparent mb-4"
            >
              {{ t("home.subtitle") }}
            </h1>
            <p
              class="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto"
            >
              {{ t("home.description") }}
            </p>
          </div>

          <!-- Tab Navigation -->
          <div class="flex justify-center mb-10">
            <div
              class="relative p-1 rounded-2xl bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 flex"
            >
              <!-- Sliding background -->
              <div
                class="absolute top-1 bottom-1 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out shadow-lg shadow-indigo-500/30"
                :style="{
                  width: `calc(${100 / tabs.length}% - 4px)`,
                  left: `calc(${tabs.findIndex((t) => t.key === activeTab) * (100 / tabs.length)}% + 2px)`,
                }"
              ></div>

              <!-- Tab buttons -->
              <button
                v-for="tab in tabs"
                :key="tab.key"
                class="relative z-10 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 min-w-[120px] justify-center"
                :class="[
                  activeTab === tab.key
                    ? 'text-white'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                ]"
                @click="activeTab = tab.key"
              >
                <component :is="tab.icon" class="w-4 h-4" />
                {{ tab.label }}
              </button>
            </div>
          </div>

          <!-- Content -->
          <div :key="activeTab" class="animate-fade-in">
            <div v-show="activeTab === 'projects'">
              <ProjectList />
            </div>
            <div v-show="activeTab === 'quickstart'">
              <QuickStart />
            </div>
            <div v-show="activeTab === 'inspiration'">
              <InspirationPanel />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Decorative Elements (fixed position, doesn't scroll) -->
  <div
    class="fixed top-0 left-0 right-0 bottom-0 pointer-events-none overflow-hidden -z-10"
  >
    <div
      class="absolute top-20 left-10 w-72 h-72 bg-indigo-200/30 dark:bg-indigo-500/10 rounded-full blur-3xl"
    ></div>
    <div
      class="absolute top-40 right-20 w-96 h-96 bg-purple-200/20 dark:bg-purple-500/10 rounded-full blur-3xl"
    ></div>
    <div
      class="absolute bottom-20 left-1/3 w-80 h-80 bg-cyan-200/20 dark:bg-cyan-500/10 rounded-full blur-3xl"
    ></div>
  </div>
</template>

<style>
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.4s ease-out;
}
</style>
