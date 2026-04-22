import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { GlobalThemeOverrides } from 'naive-ui';
import { setLocale, type LocaleType } from '@/i18n';
import { defaultProviders, providerNameMap, type ProviderType } from '@/config/ai-providers';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AIProvider {
  id: string;
  name: string;
  provider: ProviderType;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  models: string[];
  isValid?: boolean;
  isTesting?: boolean;
}

export interface Settings {
  theme: ThemeMode;
  accentColor: string;
  locale: 'zh-CN' | 'en-US';
  contentLanguage: string;
  autoSave: boolean;
  autoSaveInterval: number;
  streamOutput: boolean;
  fontSize: number;
  lineHeight: number;
  defaultModel: string;
}

const defaultSettings: Settings = {
  theme: 'system',
  accentColor: '#6366f1',
  locale: 'zh-CN',
  contentLanguage: 'zh-CN',
  autoSave: true,
  autoSaveInterval: 30,
  streamOutput: true,
  fontSize: 16,
  lineHeight: 1.8,
  defaultModel: 'openai-gpt-4o',
};

export const useSettingsStore = defineStore('settings', () => {
  // State - Initialize with defaults
  const theme = ref<ThemeMode>(defaultSettings.theme);
  const accentColor = ref(defaultSettings.accentColor);
  const locale = ref<'zh-CN' | 'en-US'>(defaultSettings.locale);
  const contentLanguage = ref(defaultSettings.contentLanguage);
  const autoSave = ref(defaultSettings.autoSave);
  const autoSaveInterval = ref(defaultSettings.autoSaveInterval);
  const streamOutput = ref(defaultSettings.streamOutput);
  const fontSize = ref(defaultSettings.fontSize);
  const lineHeight = ref(defaultSettings.lineHeight);
  const defaultModel = ref(defaultSettings.defaultModel);
  const aiProviders = ref<AIProvider[]>([]);
  const isInitialized = ref(false);

  // Theme overrides - use computed to ensure reactive updates
  const themeOverrides = computed<GlobalThemeOverrides>(() => {
    const primaryColor = accentColor.value || '#6366f1';
    const primaryColorHover = adjustColor(primaryColor, 10);
    const primaryColorPressed = adjustColor(primaryColor, -10);

    return {
      common: {
        primaryColor: primaryColor,
        primaryColorHover: primaryColorHover,
        primaryColorPressed: primaryColorPressed,
        primaryColorSuppl: primaryColor,
      },
      Button: {
        // Primary button - colored background with white text
        colorPrimary: primaryColor,
        colorHoverPrimary: primaryColorHover,
        colorPressedPrimary: primaryColorPressed,
        textColorPrimary: '#ffffff',
        textColorHoverPrimary: '#ffffff',
        textColorPressedPrimary: '#ffffff',
        // Default button - gray background with dark text
        color: '#e5e7eb',
        textColor: '#374151',
        border: 'none',
        borderHover: 'none',
        textColorHover: '#111827',
        textColorPressed: '#111827',
      },
      Input: {
        color: '#f3f4f6',
        colorFocus: '#ffffff',
        border: '1px solid #d1d5db',
        borderHover: '1px solid #6366f1',
        borderFocus: '1px solid #6366f1',
        boxShadowFocus: '0 0 0 2px rgba(99, 102, 241, 0.2)',
        textColor: '#111827',
        placeholderColor: '#9ca3af',
      },
      Select: {
        peers: {
          InternalSelection: {
            color: '#f3f4f6',
            colorActive: '#ffffff',
            border: '1px solid #d1d5db',
            borderHover: '1px solid #6366f1',
            borderActive: '1px solid #6366f1',
            borderFocus: '1px solid #6366f1',
            boxShadowFocus: '0 0 0 2px rgba(99, 102, 241, 0.2)',
            textColor: '#111827',
          },
        },
      },
      Dialog: {
        color: '#ffffff',
        textColor: '#111827',
      },
      Modal: {
        color: '#ffffff',
        textColor: '#111827',
      },
      Card: {
        color: '#ffffff',
        textColor: '#111827',
        borderColor: '#e5e7eb',
      },
      Tag: {
        colorBordered: 'transparent',
        textColorBordered: '#111827',
      },
      Tooltip: {
        color: '#111827',
        textColor: '#ffffff',
      },
      Message: {
        colorSuccess: '#10b981',
        colorError: '#ef4444',
        colorWarning: '#f59e0b',
        colorInfo: '#3b82f6',
        textColorSuccess: '#ffffff',
        textColorError: '#ffffff',
        textColorWarning: '#ffffff',
        textColorInfo: '#ffffff',
      },
      Notification: {
        colorSuccess: '#10b981',
        colorError: '#ef4444',
        colorWarning: '#f59e0b',
        colorInfo: '#3b82f6',
        textColorSuccess: '#ffffff',
        textColorError: '#ffffff',
        textColorWarning: '#ffffff',
        textColorInfo: '#ffffff',
      },
    };
  });

  // Listen for system theme changes
  function setupSystemThemeListener() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (theme.value === 'system') {
        applyTheme(theme.value);
      }
    });
  }

  // Initialize settings from electron-store
  async function initializeSettings() {
    if (isInitialized.value) return;

    try {
      const settings = await window.electronAPI.getSettings() as Settings;
      if (settings) {
        theme.value = settings.theme || defaultSettings.theme;
        accentColor.value = settings.accentColor || defaultSettings.accentColor;
        locale.value = settings.locale || defaultSettings.locale;
        contentLanguage.value = settings.contentLanguage || defaultSettings.contentLanguage;
      autoSave.value = settings.autoSave ?? defaultSettings.autoSave;
      autoSaveInterval.value = settings.autoSaveInterval || defaultSettings.autoSaveInterval;
      streamOutput.value = settings.streamOutput ?? defaultSettings.streamOutput;
      fontSize.value = settings.fontSize || defaultSettings.fontSize;
      lineHeight.value = settings.lineHeight || defaultSettings.lineHeight;
      defaultModel.value = settings.defaultModel || defaultSettings.defaultModel;
      }

      // Load AI providers
      const providers = await window.electronAPI.getAIProviders() as AIProvider[];
      if (providers && providers.length > 0) {
        aiProviders.value = providers;
      } else {
        // Set default providers from config
        aiProviders.value = defaultProviders.map(p => ({
          id: `default-${p.provider}`,
          name: providerNameMap[p.provider],
          provider: p.provider,
          apiKey: '',
          baseUrl: p.baseUrl,
          enabled: p.provider === 'openai', // Only enable OpenAI by default
          models: p.models,
        }));
      }

      applyTheme(theme.value);
      setupSystemThemeListener();
      isInitialized.value = true;
    } catch (error) {
      console.error('Failed to initialize settings:', error);
      isInitialized.value = true;
    }
  }

  // Save all settings to electron-store
  async function saveAllSettings() {
    const settings: Settings = {
      theme: theme.value,
      accentColor: accentColor.value,
      locale: locale.value,
      contentLanguage: contentLanguage.value,
      autoSave: autoSave.value,
      autoSaveInterval: autoSaveInterval.value,
      streamOutput: streamOutput.value,
      fontSize: fontSize.value,
      lineHeight: lineHeight.value,
      defaultModel: defaultModel.value,
    };

    try {
      await window.electronAPI.saveSettings(settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  // Save AI providers
  async function saveAIProviders() {
    try {
      // Deep clone to remove reactive proxies before IPC transfer
      const plainProviders = JSON.parse(JSON.stringify(aiProviders.value));
      await window.electronAPI.saveAIProviders(plainProviders);
    } catch (error) {
      console.error('Failed to save AI providers:', error);
    }
  }

  // Actions
  function setTheme(newTheme: ThemeMode) {
    theme.value = newTheme;
    applyTheme(newTheme);
    saveAllSettings();
  }

  function setAccentColor(color: string) {
    accentColor.value = color;
    saveAllSettings();
  }

  function setLocaleAction(newLocale: 'zh-CN' | 'en-US') {
    locale.value = newLocale;
    setLocale(newLocale as LocaleType);
    saveAllSettings();
  }

  function setContentLanguage(lang: string) {
    contentLanguage.value = lang;
    saveAllSettings();
  }

  function setAutoSave(value: boolean) {
    autoSave.value = value;
    saveAllSettings();
  }

  function setAutoSaveInterval(value: number) {
    autoSaveInterval.value = value;
    saveAllSettings();
  }

  function setStreamOutput(value: boolean) {
    streamOutput.value = value;
    saveAllSettings();
  }

  function setFontSize(value: number) {
    fontSize.value = value;
    saveAllSettings();
  }

  function setLineHeight(value: number) {
    lineHeight.value = value;
    saveAllSettings();
  }

  function setDefaultModel(modelId: string) {
    defaultModel.value = modelId;
    saveAllSettings();
  }

  function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    if (mode === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(isDark ? 'dark' : 'light');
    } else {
      root.classList.add(mode);
    }
  }

  // AI Provider actions
  function addAIProvider(provider: Omit<AIProvider, 'id'>) {
    const newProvider: AIProvider = {
      ...provider,
      id: `provider-${Date.now()}`,
    };
    aiProviders.value.push(newProvider);
    saveAIProviders();
  }

  function updateAIProvider(id: string, updates: Partial<AIProvider>) {
    const index = aiProviders.value.findIndex(p => p.id === id);
    if (index >= 0) {
      aiProviders.value[index] = { ...aiProviders.value[index], ...updates };
      saveAIProviders();
    }
  }

  function removeAIProvider(id: string) {
    const index = aiProviders.value.findIndex(p => p.id === id);
    if (index >= 0) {
      aiProviders.value.splice(index, 1);
      saveAIProviders();
    }
  }

  async function testAIProvider(provider: AIProvider): Promise<{ success: boolean; models?: string[]; error?: string; errorCode?: string }> {
    const result = await window.electronAPI.testAIConnection(provider.provider, {
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
    }) as { success: boolean; models?: string[]; error?: string; errorCode?: string };

    provider.isValid = result.success;
    // Update provider with discovered models
    if (result.success && result.models && result.models.length > 0) {
      updateAIProvider(provider.id, { models: result.models });
    }
    return result;
  }

  return {
    // State
    theme,
    accentColor,
    locale,
    contentLanguage,
    autoSave,
    autoSaveInterval,
    streamOutput,
    fontSize,
    lineHeight,
    defaultModel,
    aiProviders,
    isInitialized,
    // Computed
    themeOverrides,
    // Actions
    initializeSettings,
    setTheme,
    setAccentColor,
    setLocale: setLocaleAction,
    setContentLanguage,
    setAutoSave,
    setAutoSaveInterval,
    setStreamOutput,
    setFontSize,
    setLineHeight,
    setDefaultModel,
    addAIProvider,
    updateAIProvider,
    removeAIProvider,
    testAIProvider,
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
