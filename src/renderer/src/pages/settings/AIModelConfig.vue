<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  NButton,
  NInput,
  NSelect,
  NSwitch,
  NTag,
  NModal,
  NForm,
  NFormItem,
  NPopconfirm,
  useMessage,
  useNotification,
} from 'naive-ui';
import {
  Plus,
  Trash2,
  TestTube,
  Key,
  Edit2,
  Copy,
  Shield,
  Zap,
  AlertCircle,
  Cpu,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-vue-next';
import Sortable from 'sortablejs';
import { useI18n } from 'vue-i18n';
import {
  useSettingsStore,
  type AIProvider,
} from '@/stores/settings.store';
import { providerNameMap, defaultProviders } from '@/config/ai-providers';
import { extractErrorMessage } from '@/utils/error-message';

// Test connection timeout in milliseconds
const TEST_TIMEOUT_MS = 30000;

// Track active test controller for cleanup
let activeTestController: AbortController | null = null;

const { t } = useI18n();
const message = useMessage();
const notification = useNotification();
const settingsStore = useSettingsStore();

const showAddModal = ref(false);
const editingProvider = ref<AIProvider | null>(null);
const showAdvancedSettings = ref(false);

// Provider list drag-to-sort
const providerGridRef = ref<HTMLElement | null>(null);
let sortableInstance: Sortable | null = null;

const providerOptions = defaultProviders.map(p => ({
  label: providerNameMap[p.provider],
  value: p.provider,
}));

// Token options based on common AI model context limits
const tokenOptions = [
  { label: '1M (默认)', value: 1048576 },
  { label: '不限制', value: undefined },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
  { label: '192K', value: 196608 },
  { label: '200K', value: 200000 },
  { label: '256K', value: 262144 },
  { label: '512K', value: 524288 },
  { label: '2M', value: 2097152 },
];

// Temperature presets for creative writing (range: 0.1-1.2)
const temperatureOptions = [
  { label: '0.1 (精确)', value: 0.1 },
  { label: '0.3', value: 0.3 },
  { label: '0.5 (平衡)', value: 0.5 },
  { label: '0.7 (创意)', value: 0.7 },
  { label: '0.9', value: 0.9 },
  { label: '1.0', value: 1.0 },
  { label: '1.2 (激进)', value: 1.2 },
];

// Top P presets
const topPOptions = [
  { label: '0.5', value: 0.5 },
  { label: '0.7', value: 0.7 },
  { label: '0.8', value: 0.8 },
  { label: '0.9 (默认)', value: 0.9 },
  { label: '1.0', value: 1.0 },
];

// Frequency penalty presets
const frequencyPenaltyOptions = [
  { label: '-1.0 (高重复)', value: -1.0 },
  { label: '-0.5', value: -0.5 },
  { label: '0.0 (默认)', value: 0 },
  { label: '0.5', value: 0.5 },
  { label: '1.0 (低重复)', value: 1.0 },
  { label: '2.0 (极低重复)', value: 2.0 },
];

// Presence penalty presets
const presencePenaltyOptions = [
  { label: '-1.0', value: -1.0 },
  { label: '0.0 (默认)', value: 0 },
  { label: '0.5', value: 0.5 },
  { label: '1.0', value: 1.0 },
  { label: '2.0 (多话题)', value: 2.0 },
];

// Default generation config
const defaultGenerationConfig = {
  temperature: 0.5,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

interface AvailableModelOption {
  id: string;
  providerId: string;
  modelName: string;
  /** 厂商配置的显示名称 */
  displayName: string;
  provider: string;
  providerName: string;
}

const availableModels = computed<AvailableModelOption[]>(() => {
  const models: AvailableModelOption[] = [];

  settingsStore.aiProviders
    .filter(p => p.enabled && p.apiKey)
    .forEach(provider => {
      if (provider.modelName) {
        models.push({
          id: `${provider.id}:${provider.modelName}`,
          providerId: provider.id,
          modelName: provider.modelName,
          displayName: provider.name?.trim() || provider.modelName,
          provider: provider.provider,
          providerName: providerNameMap[provider.provider] || provider.provider,
        });
      }
    });

  return models;
});

// Effective default model - validates and falls back gracefully
const effectiveDefaultModel = computed(() => {
  const defaultSelection = settingsStore.defaultModel;

  // If no default set, use first available model
  if (!defaultSelection && availableModels.value.length > 0) {
    return availableModels.value[0].id;
  }

  // Validate current default model exists
  const exists = availableModels.value.some(
    m =>
      m.providerId === defaultSelection?.providerId && m.modelName === defaultSelection?.modelName
  );
  if (exists && defaultSelection) {
    return `${defaultSelection.providerId}:${defaultSelection.modelName}`;
  }

  // Fallback to first available model if current default is invalid
  if (availableModels.value.length > 0) {
    return availableModels.value[0].id;
  }

  return null;
});

function maskApiKey(key: string): string {
  if (!key) return t('settings.aiProviders.notSet');
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 12)) + key.slice(-4);
}

async function copyProviderId(providerId: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(providerId);
    message.success('已复制配置 ID');
  } catch {
    message.error('复制失败，请手动选择 ID');
  }
}

function formatTokens(tokens: number | undefined): string {
  if (!tokens) return t('settings.aiProviders.notSet');
  if (tokens >= 1000000) {
    return `${Math.round(tokens / 1000000)}M`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K`;
  }
  return tokens.toString();
}

function getProviderIcon(provider: string) {
  return 'AI';
}

// Validation functions
function validateApiKey(apiKey: string, provider: string): string | null {
  if (!apiKey || !apiKey.trim()) {
    return t('settings.aiProviders.messages.enterApiKey');
  }

  // Ollama doesn't require API key
  if (provider === 'ollama') {
    return null;
  }

  const trimmedKey = apiKey.trim();

  // Minimum length check
  if (trimmedKey.length < 10) {
    return t('settings.aiProviders.messages.apiKeyTooShort');
  }

  // Provider-specific prefix validation
  switch (provider) {
    case 'openai':
      if (!trimmedKey.startsWith('sk-')) {
        return t('settings.aiProviders.messages.openaiKeyFormat');
      }
      break;
    case 'anthropic':
      if (!trimmedKey.startsWith('sk-ant-')) {
        return t('settings.aiProviders.messages.anthropicKeyFormat');
      }
      break;
    case 'google':
      if (trimmedKey.length !== 39 || !/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
        return t('settings.aiProviders.messages.googleKeyFormat');
      }
      break;
    case 'deepseek':
      if (!trimmedKey.startsWith('sk-')) {
        return t('settings.aiProviders.messages.deepseekKeyFormat');
      }
      break;
    case 'moonshot':
      if (!trimmedKey.startsWith('sk-')) {
        return t('settings.aiProviders.messages.moonshotKeyFormat');
      }
      break;
  }

  return null;
}

function validateBaseUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl || !baseUrl.trim()) {
    return null; // Optional field
  }

  try {
    const url = new URL(baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return t('settings.aiProviders.messages.invalidUrlProtocol');
    }
    return null;
  } catch {
    return t('settings.aiProviders.messages.invalidUrlFormat');
  }
}

// Form validation
const formErrors = ref<{
  apiKey?: string;
  baseUrl?: string;
}>({});

function validateForm(): boolean {
  if (!editingProvider.value) return false;

  const errors: typeof formErrors.value = {};

  // Validate Base URL
  const baseUrlError = validateBaseUrl(editingProvider.value.baseUrl);
  if (baseUrlError) {
    errors.baseUrl = baseUrlError;
  }

  formErrors.value = errors;
  return Object.keys(errors).length === 0;
}

function openAddModal() {
  editingProvider.value = {
    id: '',
    name: '',
    provider: 'openai',
    apiKey: '',
    enabled: true,
    modelName: '',
    // 默认 1M：推理型模型的 reasoning 计入输出预算，网关默认上限（常见 4K）会让
    // 长输出大纲必撞 finish_reason=length（9 厂商矩阵实测）；1M 是网关安全上限，
    // 实际输出仍由模型自然长度决定，不会强行拉长
    maxTokens: 1_048_576,
    generationConfig: { ...defaultGenerationConfig },
  };
  showAdvancedSettings.value = false;
  formErrors.value = {};
  showAddModal.value = true;
}

function openEditModal(provider: AIProvider) {
  editingProvider.value = { ...provider };
  showAddModal.value = true;
}

function saveProvider() {
  if (!editingProvider.value) return;

  // Validate form before saving
  if (!validateForm()) {
    message.warning(t('settings.aiProviders.messages.validationFailed'));
    return;
  }

  // Additional required field checks
  if (!editingProvider.value.name.trim()) {
    message.warning(t('settings.aiProviders.messages.enterDisplayName'));
    return;
  }

  // UI 的输出上限存顶层 maxTokens（历史字段）；保存时同步进 generationConfig.maxTokens，
  // 请求层只从 generationConfig 读取下发（正数才生效，undefined = 不限制沿用网关默认）
  const maxTokens = editingProvider.value.maxTokens;
  editingProvider.value.generationConfig = {
    ...editingProvider.value.generationConfig,
    maxTokens:
      typeof maxTokens === 'number' && maxTokens > 0 ? maxTokens : undefined,
  };

  if (editingProvider.value.id) {
    settingsStore.updateAIProvider(editingProvider.value.id, editingProvider.value);
    message.success(t('settings.aiProviders.messages.saveSuccess'));
  } else {
    settingsStore.addAIProvider(editingProvider.value);
    message.success(t('settings.aiProviders.messages.addSuccess'));
  }
  showAddModal.value = false;
}

function deleteProvider(id: string) {
  settingsStore.removeAIProvider(id);
  message.success(t('settings.aiProviders.messages.deleteSuccess'));
}

function duplicateProvider(provider: AIProvider) {
  try {
    const copied = settingsStore.duplicateAIProvider(
      provider.id,
      t('settings.aiProviders.copySuffix')
    );
    if (!copied) {
      message.error(t('settings.aiProviders.messages.copyFailed'));
      return;
    }
    notification.success({
      title: t('settings.aiProviders.messages.copySuccessTitle'),
      content: t('settings.aiProviders.messages.copySuccess', {
        name: copied.name,
      }),
      duration: 3000,
    });
  } catch {
    message.error(t('settings.aiProviders.messages.copyFailed'));
  }
}

async function testConnection(provider: AIProvider) {
  if (!provider.apiKey || provider.apiKey === t('settings.aiProviders.notSet')) {
    message.warning(t('settings.aiProviders.messages.testWarning'));
    return;
  }

  // Cancel any existing test
  if (activeTestController) {
    activeTestController.abort();
  }
  activeTestController = new AbortController();

  provider.isTesting = true;

  // Timeout handler
  const timeoutId = setTimeout(() => {
    activeTestController?.abort();
  }, TEST_TIMEOUT_MS);

  try {
    const result = await settingsStore.testAIProvider(provider, activeTestController.signal);

    clearTimeout(timeoutId);

    if (result.success) {
      message.success(
        t('settings.aiProviders.messages.testSuccess', {
          name: provider.name,
          models: result.models ? `${result.models.length} 个` : '',
        })
      );
    } else {
      const errorMessage =
        result.error || t(`settings.aiProviders.messages.${getErrorMessageKey(result.errorCode)}`);
      message.error(
        t('settings.aiProviders.messages.testFailed', {
          name: provider.name,
        }) +
          ': ' +
          errorMessage
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);
    // Check if it was aborted
    if (error instanceof Error && error.name === 'AbortError') {
      message.warning(t('settings.aiProviders.messages.testTimeout'));
    } else {
      const errorMessage = extractErrorMessage(error, 'Test failed');
      message.error(
        t('settings.aiProviders.messages.testFailed', {
          name: provider.name,
        }) +
          ': ' +
          errorMessage
      );
    }
  } finally {
    provider.isTesting = false;
    if (activeTestController) {
      activeTestController = null;
    }
  }
}

// 根据错误码获取对应的国际化消息 key
function getErrorMessageKey(errorCode?: string): string {
  switch (errorCode) {
    case 'NO_ENDPOINT':
      return 'testErrorNoEndpoint';
    case 'INVALID_API_KEY':
      return 'testErrorInvalidApiKey';
    case 'PERMISSION_DENIED':
      return 'testErrorPermissionDenied';
    case 'RATE_LIMITED':
    case 'RATE_LIMIT':
      return 'testErrorRateLimit';
    case 'TIMEOUT':
      return 'testErrorTimeout';
    case 'NETWORK_ERROR':
    case 'CONNECTION_FAILED':
    case 'CONNECTION_REFUSED':
    case 'SERVICE_NOT_FOUND':
      return 'testErrorNetwork';
    default:
      return 'testErrorUnknown';
  }
}

function toggleProvider(provider: AIProvider) {
  settingsStore.updateAIProvider(provider.id, { enabled: !provider.enabled });
}

function handleDefaultModelChange(modelId: string) {
  const selectedModel = availableModels.value.find(m => m.id === modelId);
  if (selectedModel) {
    settingsStore.setDefaultModel({
      providerId: selectedModel.providerId,
      modelName: selectedModel.modelName,
    });
  }
}

// Cleanup on component unmount - reset any stuck testing states
onUnmounted(() => {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
  if (activeTestController) {
    activeTestController.abort();
    activeTestController = null;
  }
  // Reset testing state for all providers
  settingsStore.aiProviders.forEach(p => {
    if (p.isTesting) {
      p.isTesting = false;
    }
  });
});

// Reset any stuck testing states on page mount
onMounted(() => {
  initProviderSortable();
  const hasStuckProviders = settingsStore.resetTestingStates();
  if (hasStuckProviders) {
    console.warn('[AIModelConfig] Found stuck testing states on mount, resetting...');
    message.warning(t('settings.aiProviders.messages.stuckStateReset'));
  }
});

// Provider list drag-to-sort (Sortable.js on the two-column grid)
function initProviderSortable() {
  if (!providerGridRef.value || sortableInstance) return;
  sortableInstance = new Sortable(providerGridRef.value, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'provider-card-ghost',
    chosenClass: 'provider-card-chosen',
    onEnd(evt) {
      const { oldIndex, newIndex, item, from } = evt;
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
        return;
      }
      // Sortable moved the DOM node itself; revert it so the vdom stays
      // authoritative and Vue re-renders the new order from store data
      const refNode = from.children[oldIndex < newIndex ? oldIndex : oldIndex + 1] ?? null;
      from.insertBefore(item, refNode);
      settingsStore.reorderAIProviders(oldIndex, newIndex);
    },
  });
}
</script>

<template>
  <div class="space-y-8">
    <!-- Security Notice -->
    <div class="relative group">
      <div
        class="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
      ></div>
      <div
        class="relative bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-5 border border-green-100 dark:border-green-800/50"
      >
        <div class="flex items-start gap-4">
          <div
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg flex-shrink-0"
          >
            <Shield class="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 class="font-semibold text-green-900 dark:text-green-300 mb-1">
              {{ t('settings.aiProviders.securityTitle') }}
            </h4>
            <p class="text-sm text-green-700 dark:text-green-400">
              {{ t('settings.aiProviders.securityDesc') }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Default Model Selection -->
    <div class="relative group">
      <div
        class="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
      ></div>
      <div
        class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex items-center gap-3 mb-4">
          <div
            class="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0"
          >
            <Zap class="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white text-sm">
              {{ t('settings.aiProviders.defaultModel') }}
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ t('settings.aiProviders.defaultModelDesc') }}
            </p>
          </div>
        </div>

        <!-- No providers configured -->
        <div
          v-if="availableModels.length === 0"
          class="flex flex-col items-center justify-center py-6 px-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-center"
        >
          <AlertCircle class="w-8 h-8 text-gray-400 mb-2" />
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">
            {{ t('settings.aiProviders.noModelsAvailable') }}
          </p>
          <p class="text-xs text-gray-400 dark:text-gray-500">
            {{ t('settings.aiProviders.noModelsHint') }}
          </p>
        </div>

        <!-- Model selection grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          <button
            v-for="model in availableModels"
            :key="model.id"
            class="p-3 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02]"
            :class="[
              model.id === effectiveDefaultModel
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700',
            ]"
            @click="handleDefaultModelChange(model.id)"
          >
            <div class="flex flex-col gap-1 min-w-0">
              <div class="flex items-start justify-between gap-1">
                <span
                  class="text-xs font-semibold text-gray-900 dark:text-white line-clamp-1"
                  :title="model.displayName"
                  >{{ model.displayName }}</span
                >
                <span
                  v-if="model.id === effectiveDefaultModel"
                  class="px-1.5 py-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-full whitespace-nowrap"
                >
                  {{ t('settings.aiProviders.defaultModelOption') }}
                </span>
              </div>
              <span
                class="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate"
                :title="model.modelName"
                >{{ model.modelName }}</span
              >
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Provider List -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-gray-900 dark:text-white">
            {{ t('settings.aiProviders.title') }}
          </h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {{ t('settings.aiProviders.titleDesc') }}
          </p>
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium shadow-md hover:shadow-lg transition-all"
          @click="openAddModal"
        >
          <Plus class="w-3.5 h-3.5" />
          {{ t('settings.aiProviders.addProvider') }}
        </button>
      </div>

      <!-- Empty State -->
      <div v-if="settingsStore.aiProviders.length === 0" class="relative group">
        <div
          class="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
        ></div>
        <div
          class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-10 border border-gray-100 dark:border-gray-700/50 border-dashed text-center"
        >
          <div
            class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center"
          >
            <Cpu class="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
          </div>
          <h4 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {{ t('settings.aiProviders.emptyTitle') }}
          </h4>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
            {{ t('settings.aiProviders.emptyDesc') }}
          </p>
          <button
            class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
            @click="openAddModal"
          >
            <Plus class="w-4 h-4" />
            {{ t('settings.aiProviders.addFirstProvider') }}
          </button>
        </div>
      </div>

      <!-- Provider List -->
      <div ref="providerGridRef" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="provider in settingsStore.aiProviders"
          :key="provider.id"
          class="relative group"
        >
          <div
            class="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
            :class="provider.enabled ? '' : 'opacity-50'"
          ></div>
          <div
            class="relative bg-white dark:bg-gray-800/50 rounded-xl p-4 border transition-all duration-300"
            :class="[
              provider.enabled
                ? 'border-gray-100 dark:border-gray-700/50 hover:border-indigo-200 dark:hover:border-indigo-700/50'
                : 'border-gray-200 dark:border-gray-700 opacity-60',
            ]"
          >
            <div class="flex items-start justify-between gap-3 mb-3">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow text-sm shrink-0"
                  :class="[
                    provider.enabled
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500',
                  ]"
                >
                  {{ getProviderIcon(provider.provider) }}
                </div>
                <div class="min-w-0 flex-1">
                  <h4
                    class="font-medium text-gray-900 dark:text-white text-sm truncate"
                    :title="provider.name"
                  >
                    {{ provider.name }}
                  </h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {{ provider.baseUrl || t('settings.common.defaultEndpoint') }}
                  </p>
                  <div class="flex items-center gap-1 mt-0.5">
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">ID</span>
                    <code
                      class="text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate"
                      :title="provider.id"
                      >{{ provider.id }}</code
                    >
                    <button
                      type="button"
                      class="inline-flex items-center justify-center w-5 h-5 rounded text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors shrink-0"
                      title="复制配置 ID"
                      @click.stop="copyProviderId(provider.id)"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex flex-col items-end gap-1.5 flex-shrink-0 pt-0.5">
                <button
                  type="button"
                  class="drag-handle inline-flex items-center justify-center w-5 h-5 rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing transition-colors"
                  :title="t('settings.aiProviders.dragToSort')"
                >
                  <GripVertical class="w-3.5 h-3.5" />
                </button>
                <NSwitch :value="provider.enabled" @update:value="() => toggleProvider(provider)" />
                <NTag v-if="provider.isValid === true" type="success" size="tiny" round>
                  {{ t('settings.common.verified') }}
                </NTag>
                <NTag v-if="provider.isValid === false" type="error" size="tiny" round>
                  {{ t('settings.common.failed') }}
                </NTag>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-400 dark:text-gray-500 mb-0.5 text-[10px]">
                  {{ t('settings.common.apiKey') }}
                </div>
                <div class="font-mono text-gray-700 dark:text-gray-300 truncate">
                  {{ maskApiKey(provider.apiKey) }}
                </div>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-400 dark:text-gray-500 mb-0.5 text-[10px]">
                  {{ t('settings.aiProviders.modelName') }}
                </div>
                <div class="text-gray-700 dark:text-gray-300 truncate">
                  {{ provider.modelName || t('settings.aiProviders.notConfigured') }}
                </div>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-400 dark:text-gray-500 mb-0.5 text-[10px]">
                  {{ t('settings.aiProviders.maxTokens') }}
                </div>
                <div class="text-gray-700 dark:text-gray-300">
                  {{ formatTokens(provider.maxTokens) }}
                </div>
              </div>
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-400 dark:text-gray-500 mb-0.5 text-[10px]">
                  {{ t('settings.aiProviders.temperature') }}
                </div>
                <div class="text-gray-700 dark:text-gray-300">
                  {{ provider.generationConfig?.temperature ?? 0.5 }}
                </div>
              </div>
            </div>

            <div
              class="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50"
            >
              <button
                class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                :disabled="provider.isTesting"
                @click="testConnection(provider)"
              >
                <TestTube class="w-3 h-3" />
                {{ provider.isTesting ? t('settings.common.testing') : t('settings.common.test') }}
              </button>
              <button
                class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                @click="openEditModal(provider)"
              >
                <Edit2 class="w-3 h-3" />
                {{ t('settings.common.edit') }}
              </button>
              <button
                class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-xs font-medium hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                @click="duplicateProvider(provider)"
              >
                <Copy class="w-3 h-3" />
                {{ t('settings.common.copy') }}
              </button>
              <NPopconfirm @positive-click="deleteProvider(provider.id)">
                <template #trigger>
                  <button
                    class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 class="w-3 h-3" />
                    {{ t('settings.common.delete') }}
                  </button>
                </template>
                {{ t('settings.aiProviders.confirmDelete') }}
              </NPopconfirm>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <NModal
      v-model:show="showAddModal"
      preset="card"
      :title="
        editingProvider?.id
          ? t('settings.aiProviders.editTitle')
          : t('settings.aiProviders.addTitle')
      "
      class="max-w-md"
    >
      <NForm v-if="editingProvider" label-placement="left" label-width="120" class="space-y-4">
        <NFormItem v-if="editingProvider.id" label="配置 ID">
          <div class="flex items-center gap-2 w-full">
            <NInput :value="editingProvider.id" readonly class="font-mono text-xs" />
            <NButton size="small" @click="copyProviderId(editingProvider.id)">
              <template #icon>
                <Copy class="w-3.5 h-3.5" />
              </template>
              复制
            </NButton>
          </div>
        </NFormItem>
        <NFormItem :label="t('settings.common.displayName')">
          <NInput v-model:value="editingProvider.name" :placeholder="'e.g. OpenAI'" />
        </NFormItem>
        <NFormItem :label="t('settings.common.providerType')">
          <NSelect v-model:value="editingProvider.provider" :options="providerOptions" />
        </NFormItem>
        <NFormItem :label="t('settings.common.apiKey')">
          <NInput
            v-model:value="editingProvider.apiKey"
            type="password"
            :placeholder="
              editingProvider.provider === 'ollama'
                ? t('settings.aiProviders.messages.ollamaNoKey')
                : t('settings.aiProviders.messages.enterApiKey')
            "
            show-password-on="click"
          >
            <template #prefix>
              <Key class="w-4 h-4 text-gray-400" />
            </template>
          </NInput>
        </NFormItem>
        <NFormItem :label="t('settings.aiProviders.modelName')">
          <NInput
            v-model:value="editingProvider.modelName"
            :placeholder="'e.g. gpt-4o, claude-3-5-sonnet-20241022'"
          />
        </NFormItem>
        <NFormItem :label="t('settings.aiProviders.maxTokens')">
          <NSelect
            v-model:value="editingProvider.maxTokens"
            :options="tokenOptions"
            class="w-full"
            clearable
            placeholder="1M (默认)"
          />
        </NFormItem>

        <!-- Advanced Settings Toggle -->
        <div class="border-t border-gray-100 dark:border-gray-700 pt-4 mt-2">
          <button
            type="button"
            class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            @click="showAdvancedSettings = !showAdvancedSettings"
          >
            <component :is="showAdvancedSettings ? ChevronDown : ChevronRight" class="w-4 h-4" />
            {{ t('settings.aiProviders.advancedSettings') }}
            <span class="text-xs text-gray-400 dark:text-gray-500">
              ({{ t('settings.aiProviders.optional') }})
            </span>
          </button>

          <!-- Advanced Settings Panel -->
          <div v-show="showAdvancedSettings" class="mt-4 space-y-4 pl-2">
            <NFormItem
              :label="t('settings.common.customEndpoint')"
              :validation-status="formErrors.baseUrl ? 'error' : undefined"
              :feedback="formErrors.baseUrl"
            >
              <NInput
                v-model:value="editingProvider.baseUrl"
                :placeholder="t('settings.aiProviders.endpointPlaceholder')"
              />
            </NFormItem>
            <NFormItem :label="t('settings.aiProviders.temperature')">
              <NSelect
                v-model:value="editingProvider.generationConfig!.temperature"
                :options="temperatureOptions"
                class="w-full"
              />
            </NFormItem>
            <NFormItem :label="t('settings.aiProviders.topP')">
              <NSelect
                v-model:value="editingProvider.generationConfig!.topP"
                :options="topPOptions"
                class="w-full"
              />
            </NFormItem>
            <NFormItem :label="t('settings.aiProviders.frequencyPenalty')">
              <NSelect
                v-model:value="editingProvider.generationConfig!.frequencyPenalty"
                :options="frequencyPenaltyOptions"
                class="w-full"
              />
            </NFormItem>
            <NFormItem :label="t('settings.aiProviders.presencePenalty')">
              <NSelect
                v-model:value="editingProvider.generationConfig!.presencePenalty"
                :options="presencePenaltyOptions"
                class="w-full"
              />
            </NFormItem>
          </div>
        </div>

        <NFormItem :label="t('settings.common.enabled')">
          <NSwitch v-model:value="editingProvider.enabled" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            @click="showAddModal = false"
          >
            {{ t('settings.common.cancel') }}
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
            @click="saveProvider"
          >
            {{ t('settings.common.save') }}
          </button>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
/* Provider card drag states (Sortable.js adds these at runtime) */
.provider-card-ghost {
  opacity: 0.35;
}

.provider-card-chosen {
  cursor: grabbing;
}
</style>
