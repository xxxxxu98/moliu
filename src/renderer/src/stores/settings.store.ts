import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { GlobalThemeOverrides } from 'naive-ui';

export type ThemeMode = 'light' | 'dark' | 'system';

export const useSettingsStore = defineStore('settings', () => {
  // State
  const theme = ref<ThemeMode>('system');
  const accentColor = ref('#6366f1');
  const locale = ref<'zh-CN' | 'en-US'>('zh-CN');

  // Theme overrides based on accent color
  const themeOverrides = computed<GlobalThemeOverrides>(() => ({
    common: {
      primaryColor: accentColor.value,
      primaryColorHover: adjustColor(accentColor.value, 10),
      primaryColorPressed: adjustColor(accentColor.value, -10),
    },
  }));

  // Actions
  function setTheme(newTheme: ThemeMode) {
    theme.value = newTheme;
    applyTheme(newTheme);
  }

  function setAccentColor(color: string) {
    accentColor.value = color;
  }

  function setLocale(newLocale: 'zh-CN' | 'en-US') {
    locale.value = newLocale;
  }

  function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;
    if (mode === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', mode);
    }
  }

  return {
    theme,
    accentColor,
    locale,
    themeOverrides,
    setTheme,
    setAccentColor,
    setLocale,
  };
});

function adjustColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
