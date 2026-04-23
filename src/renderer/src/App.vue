<script setup lang="ts">
import { RouterView } from "vue-router";
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  darkTheme,
  lightTheme,
} from "naive-ui";
import { computed } from "vue";
import { useSettingsStore } from "./stores/settings.store";

const settingsStore = useSettingsStore();
const theme = computed(() => {
  if (settingsStore.theme === "dark") return darkTheme;
  if (settingsStore.theme === "light") return lightTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? darkTheme
    : lightTheme;
});
</script>

<template>
  <NConfigProvider :theme="theme">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <RouterView />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
