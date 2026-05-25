import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { GlobalThemeOverrides } from 'naive-ui';
import { setLocale, type LocaleType } from '@/i18n';
import { defaultProviders, providerNameMap, type ProviderType } from '@/config/ai-providers';
import { UnifiedAIService } from '@/services/ai/unified.service';

export type ThemeMode = 'light' | 'dark';

/**
 * AI 生成参数配置
 */
export interface AIGenerationConfig {
  /** 温度参数，控制创造性 (0-2)，默认 0.8 */
  temperature: number;
  /** 核采样参数 (0-1)，默认 0.9 */
  topP: number;
  /** 频率惩罚，减少重复 (-2 to 2)，默认 0 */
  frequencyPenalty: number;
  /** 存在惩罚，增加话题多样性 (-2 to 2)，默认 0 */
  presencePenalty: number;
}

export interface AIProvider {
  id: string;
  name: string;
  provider: ProviderType;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  modelName: string;
  maxTokens?: number;
  generationConfig?: AIGenerationConfig;
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
  /** 是否启用去AI味润色，默认为 true */
  enableDeAI: boolean;
}

const defaultSettings: Settings = {
  theme: 'light',
  accentColor: '#6366f1',
  locale: 'zh-CN',
  contentLanguage: 'zh-CN',
  autoSave: true,
  autoSaveInterval: 30,
  streamOutput: true,
  fontSize: 16,
  lineHeight: 1.8,
  defaultModel: 'openai-gpt-4o',
  enableDeAI: true,
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
  const enableDeAI = ref(defaultSettings.enableDeAI);
  const aiProviders = ref<AIProvider[]>([]);
  const isInitialized = ref(false);

  function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(mode);
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
      enableDeAI.value = settings.enableDeAI ?? defaultSettings.enableDeAI;
      }

      // Load AI providers
      const providers = await window.electronAPI.getAIProviders() as AIProvider[];
      if (providers && providers.length > 0) {
        aiProviders.value = providers;
      }
      // 默认不加载任何厂商，用户需要手动配置

      applyTheme(theme.value);
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
      enableDeAI: enableDeAI.value,
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

  function setEnableDeAI(value: boolean) {
    enableDeAI.value = value;
    saveAllSettings();
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

  // Reset all testing states - useful for cleanup on page mount
  function resetTestingStates() {
    let hasChanges = false;
    aiProviders.value.forEach(p => {
      if (p.isTesting) {
        p.isTesting = false;
        hasChanges = true;
      }
    });
    return hasChanges;
  }

  async function testAIProvider(provider: AIProvider, signal?: AbortSignal): Promise<{ success: boolean; error?: string; errorCode?: string; models?: string[] }> {
    try {
      const service = new UnifiedAIService(
        provider.provider,
        provider.apiKey,
        provider.baseUrl,
        provider.modelName,
        provider.maxTokens,
        provider.generationConfig
      );

      const result = await service.testConnection(signal);
      provider.isValid = result.success;
      
      if (result.success) {
        return { success: true };
      } else {
        // Check if aborted
        if (signal?.aborted) {
          return { 
            success: false, 
            error: 'Test cancelled',
            errorCode: 'CANCELLED'
          };
        }
        return { 
          success: false, 
          error: result.error,
          errorCode: mapErrorToCode(result.error || 'Unknown error')
        };
      }
    } catch (error) {
      // Check if aborted
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
        provider.isTesting = false;
        return { 
          success: false, 
          error: 'Test cancelled',
          errorCode: 'CANCELLED'
        };
      }
      
      provider.isValid = false;
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      return { 
        success: false, 
        error: errorMessage,
        errorCode: mapErrorToCode(errorMessage)
      };
    }
  }
  
  function mapErrorToCode(errorMessage: string): string {
    const msg = errorMessage.toLowerCase();
    if (msg.includes('api key') || msg.includes('invalid') || msg.includes('unauthorized') || msg.includes('401')) {
      return 'INVALID_API_KEY';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
      return 'NETWORK_ERROR';
    }
    if (msg.includes('rate') || msg.includes('429')) {
      return 'RATE_LIMITED';
    }
    return 'UNKNOWN';
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
    enableDeAI,
    aiProviders,
    isInitialized,
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
    setEnableDeAI,
    addAIProvider,
    updateAIProvider,
    removeAIProvider,
    resetTestingStates,
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
