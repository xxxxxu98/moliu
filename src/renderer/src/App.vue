<script setup lang="ts">
import { RouterView } from "vue-router";
import { computed } from "vue";
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  darkTheme,
  lightTheme,
  zhCN,
  dateZhCN,
  enUS,
  dateEnUS,
} from "naive-ui";
import { useSettingsStore } from "./stores/settings.store";

const settingsStore = useSettingsStore();
const theme = computed(() => {
  if (settingsStore.theme === "dark") return darkTheme;
  if (settingsStore.theme === "light") return lightTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? darkTheme
    : lightTheme;
});

const naiveLocale = computed(() => {
  return settingsStore.locale === "en-US" ? enUS : zhCN;
});

const naiveDateLocale = computed(() => {
  return settingsStore.locale === "en-US" ? dateEnUS : dateZhCN;
});
</script>

<template>
  <NConfigProvider :theme="theme" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <RouterView />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
