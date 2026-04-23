<script setup lang="ts">
import { ref, computed } from "vue";
import {
  NButton,
  NInput,
  NSwitch,
  NTag,
  NModal,
  NForm,
  NFormItem,
  NPopconfirm,
  useMessage,
} from "naive-ui";
import {
  Plus,
  Trash2,
  TestTube,
  Check,
  X,
  Key,
  Edit2,
  Shield,
  Zap,
  AlertCircle,
  Cpu,
} from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { useSettingsStore, type AIProvider } from "@/stores/settings.store";
import {
  providerNameMap,
  defaultProviders,
  type ProviderType,
} from "@/config/ai-providers";

const { t } = useI18n();
const message = useMessage();
const settingsStore = useSettingsStore();

const showAddModal = ref(false);
const editingProvider = ref<AIProvider | null>(null);

const providerOptions = defaultProviders.map((p) => ({
  label: providerNameMap[p.provider],
  value: p.provider,
}));

const availableModels = computed(() => {
  const models: Array<{
    id: string;
    name: string;
    provider: string;
    providerName: string;
  }> = [];

  settingsStore.aiProviders
    .filter((p) => p.enabled && p.apiKey)
    .forEach((provider) => {
      if (provider.models && provider.models.length > 0) {
        provider.models.forEach((model) => {
          models.push({
            id: `${provider.id}:${model}`,
            name: model,
            provider: provider.provider,
            providerName:
              providerNameMap[provider.provider] || provider.provider,
          });
        });
      } else {
        models.push({
          id: `${provider.id}:default`,
          name: t("settings.aiProviders.defaultModelOption"),
          provider: provider.provider,
          providerName: providerNameMap[provider.provider] || provider.provider,
        });
      }
    });

  return models;
});

function maskApiKey(key: string): string {
  if (!key) return t("settings.aiProviders.notSet");
  if (key.length <= 8) return "*".repeat(key.length);
  return (
    key.slice(0, 4) + "*".repeat(Math.min(key.length - 8, 12)) + key.slice(-4)
  );
}

function getProviderIcon(provider: string) {
  return "AI";
}

function openAddModal() {
  editingProvider.value = {
    id: "",
    name: "",
    provider: "openai",
    apiKey: "",
    enabled: true,
    models: [],
  };
  showAddModal.value = true;
}

function openEditModal(provider: AIProvider) {
  editingProvider.value = { ...provider };
  showAddModal.value = true;
}

function saveProvider() {
  if (!editingProvider.value) return;
  if (!editingProvider.value.apiKey) {
    message.warning(t("settings.aiProviders.messages.enterApiKey"));
    return;
  }
  if (!editingProvider.value.name) {
    message.warning(t("settings.aiProviders.messages.enterDisplayName"));
    return;
  }

  if (editingProvider.value.id) {
    settingsStore.updateAIProvider(
      editingProvider.value.id,
      editingProvider.value,
    );
    message.success(t("settings.aiProviders.messages.saveSuccess"));
  } else {
    settingsStore.addAIProvider(editingProvider.value);
    message.success(t("settings.aiProviders.messages.addSuccess"));
  }
  showAddModal.value = false;
}

function deleteProvider(id: string) {
  settingsStore.removeAIProvider(id);
  message.success(t("settings.aiProviders.messages.deleteSuccess"));
}

async function testConnection(provider: AIProvider) {
  if (
    !provider.apiKey ||
    provider.apiKey === t("settings.aiProviders.notSet")
  ) {
    message.warning(t("settings.aiProviders.messages.testWarning"));
    return;
  }

  provider.isTesting = true;
  const result = await settingsStore.testAIProvider(provider);
  provider.isTesting = false;

  if (result.success) {
    const models = result.models?.slice(0, 5).join(", ") || "";
    message.success(
      t("settings.aiProviders.messages.testSuccess", {
        name: provider.name,
        models: result.models ? `${result.models.length} 个` : "",
      }),
    );
  } else {
    message.error(
      t("settings.aiProviders.messages.testFailed", {
        name: provider.name,
        error: result.error || "Unknown error",
      }),
    );
  }
}

function toggleProvider(provider: AIProvider) {
  settingsStore.updateAIProvider(provider.id, { enabled: !provider.enabled });
}

function handleDefaultModelChange(modelId: string) {
  settingsStore.setDefaultModel(modelId);
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
              {{ t("settings.aiProviders.securityTitle") }}
            </h4>
            <p class="text-sm text-green-700 dark:text-green-400">
              {{ t("settings.aiProviders.securityDesc") }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Provider List -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ t("settings.aiProviders.title") }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t("settings.aiProviders.titleDesc") }}
          </p>
        </div>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
          @click="openAddModal"
        >
          <Plus class="w-4 h-4" />
          {{ t("settings.aiProviders.addProvider") }}
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
            {{ t("settings.aiProviders.emptyTitle") }}
          </h4>
          <p
            class="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto"
          >
            {{ t("settings.aiProviders.emptyDesc") }}
          </p>
          <button
            class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
            @click="openAddModal"
          >
            <Plus class="w-4 h-4" />
            {{ t("settings.aiProviders.addFirstProvider") }}
          </button>
        </div>
      </div>

      <!-- Provider List -->
      <div class="space-y-4">
        <div
          v-for="provider in settingsStore.aiProviders"
          :key="provider.id"
          class="relative group"
        >
          <div
            class="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-purple-500/5 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
            :class="provider.enabled ? '' : 'opacity-50'"
          ></div>
          <div
            class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-5 border transition-all duration-300"
            :class="[
              provider.enabled
                ? 'border-gray-100 dark:border-gray-700/50 hover:border-indigo-200 dark:hover:border-indigo-700/50'
                : 'border-gray-200 dark:border-gray-700 opacity-60',
            ]"
          >
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-4">
                <div
                  class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-lg"
                  :class="[
                    provider.enabled
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500',
                  ]"
                >
                  {{ getProviderIcon(provider.provider) }}
                </div>
                <div>
                  <div class="flex items-center gap-3">
                    <h4 class="font-semibold text-gray-900 dark:text-white">
                      {{ provider.name }}
                    </h4>
                    <NTag
                      v-if="provider.isValid === true"
                      type="success"
                      size="small"
                      round
                    >
                      {{ t("settings.common.verified") }}
                    </NTag>
                    <NTag
                      v-if="provider.isValid === false"
                      type="error"
                      size="small"
                      round
                    >
                      {{ t("settings.common.failed") }}
                    </NTag>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {{
                      provider.baseUrl || t("settings.common.defaultEndpoint")
                    }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <NSwitch
                  :value="provider.enabled"
                  @update:value="() => toggleProvider(provider)"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-500 dark:text-gray-400 mb-1">
                  {{ t("settings.common.apiKey") }}
                </div>
                <div class="font-mono text-gray-900 dark:text-white">
                  {{ maskApiKey(provider.apiKey) }}
                </div>
              </div>
              <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-500 dark:text-gray-400 mb-1">
                  {{ t("settings.aiProviders.availableModels") }}
                </div>
                <div class="text-gray-900 dark:text-white truncate">
                  {{
                    provider.models.join(", ") ||
                    t("settings.aiProviders.notConfigured")
                  }}
                </div>
              </div>
            </div>

            <div
              class="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700/50"
            >
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                :disabled="provider.isTesting"
                @click="testConnection(provider)"
              >
                <TestTube class="w-4 h-4" />
                {{
                  provider.isTesting
                    ? t("settings.common.testing")
                    : t("settings.common.test")
                }}
              </button>
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                @click="openEditModal(provider)"
              >
                <Edit2 class="w-4 h-4" />
                {{ t("settings.common.edit") }}
              </button>
              <NPopconfirm @positive-click="deleteProvider(provider.id)">
                <template #trigger>
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                    {{ t("settings.common.delete") }}
                  </button>
                </template>
                {{ t("settings.aiProviders.confirmDelete") }}
              </NPopconfirm>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Default Model -->
    <div class="relative group">
      <div
        class="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"
      ></div>
      <div
        class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex items-center gap-3 mb-6">
          <div
            class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg"
          >
            <Zap class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">
              {{ t("settings.aiProviders.defaultModel") }}
            </h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t("settings.aiProviders.defaultModelDesc") }}
            </p>
          </div>
        </div>

        <!-- No providers configured -->
        <div
          v-if="availableModels.length === 0"
          class="flex flex-col items-center justify-center py-8 px-4 rounded-xl bg-gray-50 dark:bg-gray-900/50 text-center"
        >
          <AlertCircle class="w-10 h-10 text-gray-400 mb-3" />
          <p class="text-gray-500 dark:text-gray-400 mb-2">
            {{ t("settings.aiProviders.noModelsAvailable") }}
          </p>
          <p class="text-sm text-gray-400 dark:text-gray-500">
            {{ t("settings.aiProviders.noModelsHint") }}
          </p>
        </div>

        <!-- Model selection grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            v-for="model in availableModels"
            :key="model.id"
            class="p-4 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02]"
            :class="[
              model.id === settingsStore.defaultModel
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700',
            ]"
            @click="handleDefaultModelChange(model.id)"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-gray-900 dark:text-white">{{
                model.name
              }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{
                model.providerName
              }}</span>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ model.provider }}
            </p>
          </button>
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
      <NForm
        v-if="editingProvider"
        label-placement="left"
        label-width="100"
        class="space-y-4"
      >
        <NFormItem :label="t('settings.common.displayName')">
          <NInput
            v-model:value="editingProvider.name"
            :placeholder="'e.g. OpenAI'"
          />
        </NFormItem>
        <NFormItem :label="t('settings.common.providerType')">
          <NSelect
            v-model:value="editingProvider.provider"
            :options="providerOptions"
          />
        </NFormItem>
        <NFormItem :label="t('settings.common.apiKey')">
          <NInput
            v-model:value="editingProvider.apiKey"
            type="password"
            :placeholder="t('settings.aiProviders.messages.enterApiKey')"
            show-password-on="click"
          >
            <template #prefix>
              <Key class="w-4 h-4 text-gray-400" />
            </template>
          </NInput>
        </NFormItem>
        <NFormItem :label="t('settings.common.customEndpoint')">
          <NInput
            v-model:value="editingProvider.baseUrl"
            :placeholder="t('settings.aiProviders.endpointPlaceholder')"
          />
        </NFormItem>
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
            {{ t("settings.common.cancel") }}
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
            @click="saveProvider"
          >
            {{ t("settings.common.save") }}
          </button>
        </div>
      </template>
    </NModal>
  </div>
</template>
