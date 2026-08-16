import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { GlobalThemeOverrides } from 'naive-ui';
import { setLocale, type LocaleType } from '@/i18n';
import { defaultProviders, providerNameMap, type ProviderType } from '@/config/ai-providers';
import { UnifiedAIService } from '@/services/ai/unified.service';
import { extractErrorMessage } from '@/utils/error-message';

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
  /** 厂商级输出上限（tokens）：厂商侧 K/M 为十进制（128K=128000、1M=1000000） */
  maxTokens?: number;
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

export interface AIDefaultModelSelection {
  providerId: string;
  modelName: string;
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
  defaultModel: AIDefaultModelSelection | null;
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
  defaultModel: null,
  enableDeAI: true,
};

function normalizeDefaultModelSelection(
  value: Settings['defaultModel'] | string | null | undefined,
): AIDefaultModelSelection | null {
  if (!value) return null;

  if (typeof value === 'string') {
    const separatorIndex = value.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }

    const providerId = value.slice(0, separatorIndex);
    const modelName = value.slice(separatorIndex + 1);

    if (!providerId || !modelName) {
      return null;
    }

    return { providerId, modelName };
  }

  if (!value.providerId || !value.modelName) {
    return null;
  }

  return value;
}

/**
 * 存量 maxTokens 的 KiB→十进制迁移。
 * 旧版选项用的是 1024 进制值（1M=1048576 等），而模型厂商的 K/M 全是十进制
 * （OpenAI 128K=128000、Gemini 1M=1000000），发出去会被网关当成超上限拒绝。
 * 精确匹配旧选项值再换算，避免误伤用户手填的任意值。
 */
const KIB_TO_DECIMAL_MAX_TOKENS = new Map<number, number>([
  [4096, 4000],
  [8192, 8000],
  [16384, 16000],
  [32768, 32000],
  [65536, 64000],
  [131072, 128000],
  [196608, 192000],
  [262144, 256000],
  [524288, 512000],
  [1048576, 1000000],
  [2097152, 2000000],
]);

export function migrateMaxTokens(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return KIB_TO_DECIMAL_MAX_TOKENS.get(value) ?? value;
}

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
  const defaultModel = ref<AIDefaultModelSelection | null>(defaultSettings.defaultModel);
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
      const normalizedDefaultModel = normalizeDefaultModelSelection(settings.defaultModel);
      defaultModel.value = normalizedDefaultModel
        ? {
            providerId: normalizedDefaultModel.providerId,
            modelName: normalizedDefaultModel.modelName,
          }
        : defaultSettings.defaultModel;
      enableDeAI.value = settings.enableDeAI ?? defaultSettings.enableDeAI;
      }

      // Load AI providers
      const providers = await window.electronAPI.getAIProviders() as AIProvider[];
      if (providers && providers.length > 0) {
        // KiB→十进制迁移：顶层 maxTokens（UI 字段）与 generationConfig.maxTokens
        // （请求层下发真源）必须各自独立换算——旧实现用 `top ?? gen` 取值，
        // 顶层有值时短路，generationConfig 里的 1048576 从未被迁移，请求层
        // 照传 KiB 值触发网关 400（实测 opencode/DeepSeek 每轮首个请求必踩）。
        // 迁移后以顶层为 UI 真源同步两者，保证「所有地方都是统一的」。
        let maxTokensMigrated = false;
        for (const provider of providers) {
          const topRaw = provider.maxTokens;
          const genRaw = provider.generationConfig?.maxTokens;
          const topMigrated = migrateMaxTokens(topRaw);
          const genMigrated = migrateMaxTokens(genRaw);
          const unified =
            topMigrated ?? genMigrated;
          if (
            (topMigrated !== undefined && topMigrated !== topRaw)
            || (genMigrated !== undefined && genMigrated !== genRaw)
            || (topMigrated !== undefined && genMigrated !== undefined && topMigrated !== genMigrated)
          ) {
            if (unified !== undefined) {
              provider.maxTokens = unified;
              provider.generationConfig = { ...provider.generationConfig, maxTokens: unified };
            }
            maxTokensMigrated = true;
          }
        }
        aiProviders.value = providers;
        if (maxTokensMigrated) {
          await saveAIProviders();
        }
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
      defaultModel: defaultModel.value
        ? {
            providerId: defaultModel.value.providerId,
            modelName: defaultModel.value.modelName,
          }
        : null,
      enableDeAI: enableDeAI.value,
    };

    try {
      const plainSettings = JSON.parse(JSON.stringify(settings)) as Settings;
      await window.electronAPI.saveSettings(plainSettings);
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

function setDefaultModel(selection: AIDefaultModelSelection | null) {
    defaultModel.value = selection
      ? {
          providerId: selection.providerId,
          modelName: selection.modelName,
        }
      : null;
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

  /**
   * 复制已有模型配置，生成新 ID，显示名称追加标识后缀（冲突时递增编号）
   */
  function duplicateAIProvider(id: string, nameSuffix: string): AIProvider | null {
    const source = aiProviders.value.find(p => p.id === id);
    if (!source) return null;

    const existingNames = new Set(aiProviders.value.map(p => p.name));
    let newName = `${source.name}${nameSuffix}`;
    if (existingNames.has(newName)) {
      let counter = 2;
      while (existingNames.has(`${source.name}${nameSuffix} ${counter}`)) {
        counter += 1;
      }
      newName = `${source.name}${nameSuffix} ${counter}`;
    }

    const newProvider: AIProvider = {
      ...source,
      id: `provider-${Date.now()}`,
      name: newName,
      generationConfig: source.generationConfig
        ? { ...source.generationConfig }
        : undefined,
      isTesting: false,
    };
    aiProviders.value.push(newProvider);
    saveAIProviders();
    return newProvider;
  }

  /**
   * 拖拽排序：把厂商从 oldIndex 移动到 newIndex，顺序随数组持久化
   */
  function reorderAIProviders(oldIndex: number, newIndex: number) {
    if (
      oldIndex === newIndex
      || oldIndex < 0
      || newIndex < 0
      || oldIndex >= aiProviders.value.length
      || newIndex >= aiProviders.value.length
    ) {
      return;
    }
    const [moved] = aiProviders.value.splice(oldIndex, 1);
    aiProviders.value.splice(newIndex, 0, moved);
    saveAIProviders();
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
      const errorMessage = extractErrorMessage(error, 'Connection test failed');
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
    if (msg.includes('rate') || msg.includes('429') || msg.includes('limit') || msg.includes('限额') || msg.includes('上限')) {
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
    duplicateAIProvider,
    reorderAIProviders,
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
