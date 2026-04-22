<script setup lang="ts">
import { ref } from 'vue';
import { NButton, NInput, NSwitch, NTag, NModal, NForm, NFormItem, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Trash2, TestTube, Check, X, Key, Edit2, Shield, Zap } from 'lucide-vue-next';
import { useSettingsStore, type AIProvider } from '@/stores/settings.store';

const message = useMessage();
const settingsStore = useSettingsStore();

const showAddModal = ref(false);
const editingProvider = ref<AIProvider | null>(null);

const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic (Claude)', value: 'anthropic' },
  { label: 'Google (Gemini)', value: 'google' },
  { label: 'Moonshot (Kimi)', value: 'moonshot' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Ollama (本地)', value: 'ollama' },
];

function maskApiKey(key: string): string {
  if (!key) return '未设置';
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.slice(0, 4) + '*'.repeat(Math.min(key.length - 8, 12)) + key.slice(-4);
}

function getProviderIcon(provider: string) {
  return 'AI';
}

function openAddModal() {
  editingProvider.value = {
    id: '',
    name: '',
    provider: 'openai',
    apiKey: '',
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
    message.warning('请输入 API Key');
    return;
  }
  if (!editingProvider.value.name) {
    message.warning('请输入显示名称');
    return;
  }

  if (editingProvider.value.id) {
    settingsStore.updateAIProvider(editingProvider.value.id, editingProvider.value);
    message.success('保存成功');
  } else {
    settingsStore.addAIProvider(editingProvider.value);
    message.success('添加成功');
  }
  showAddModal.value = false;
}

function deleteProvider(id: string) {
  settingsStore.removeAIProvider(id);
  message.success('删除成功');
}

async function testConnection(provider: AIProvider) {
  if (!provider.apiKey || provider.apiKey === '未设置') {
    message.warning('请先配置 API Key');
    return;
  }

  provider.isTesting = true;
  const success = await settingsStore.testAIProvider(provider);
  provider.isTesting = false;

  if (success) {
    message.success(`${provider.name} 连接成功！`);
  } else {
    message.error(`${provider.name} 连接失败，请检查 API Key`);
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
      <div class="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-5 border border-green-100 dark:border-green-800/50">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg flex-shrink-0">
            <Shield class="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 class="font-semibold text-green-900 dark:text-green-300 mb-1">安全说明</h4>
            <p class="text-sm text-green-700 dark:text-green-400">
              所有 API Key 均使用 AES-256 加密存储在本地，不会同步至任何服务器。请勿将您的 API Key 透露给他人。
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Provider List -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">已配置的 AI 厂商</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">管理你的 AI 模型连接</p>
        </div>
        <button
          class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
          @click="openAddModal"
        >
          <Plus class="w-4 h-4" />
          添加厂商
        </button>
      </div>

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
                : 'border-gray-200 dark:border-gray-700 opacity-60'
            ]"
          >
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-4">
                <div
                  class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-lg"
                  :class="[
                    provider.enabled
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                  ]"
                >
                  {{ getProviderIcon(provider.provider) }}
                </div>
                <div>
                  <div class="flex items-center gap-3">
                    <h4 class="font-semibold text-gray-900 dark:text-white">{{ provider.name }}</h4>
                    <NTag
                      v-if="provider.isValid === true"
                      type="success"
                      size="small"
                      round
                    >
                      已验证
                    </NTag>
                    <NTag
                      v-if="provider.isValid === false"
                      type="error"
                      size="small"
                      round
                    >
                      验证失败
                    </NTag>
                  </div>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {{ provider.baseUrl || '默认端点' }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <NSwitch :value="provider.enabled" @update:value="() => toggleProvider(provider)" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-500 dark:text-gray-400 mb-1">API Key</div>
                <div class="font-mono text-gray-900 dark:text-white">{{ maskApiKey(provider.apiKey) }}</div>
              </div>
              <div class="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
                <div class="text-gray-500 dark:text-gray-400 mb-1">可用模型</div>
                <div class="text-gray-900 dark:text-white truncate">
                  {{ provider.models.join(', ') || '未配置' }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700/50">
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                :disabled="provider.isTesting"
                @click="testConnection(provider)"
              >
                <TestTube class="w-4 h-4" />
                {{ provider.isTesting ? '测试中...' : '测试连接' }}
              </button>
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                @click="openEditModal(provider)"
              >
                <Edit2 class="w-4 h-4" />
                编辑
              </button>
              <NPopconfirm @positive-click="deleteProvider(provider.id)">
                <template #trigger>
                  <button
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                    删除
                  </button>
                </template>
                确定删除此厂商配置吗？
              </NPopconfirm>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Default Model -->
    <div class="relative group">
      <div class="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="relative bg-white dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3 mb-6">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
            <Zap class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">默认模型</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">选择创作时默认使用的 AI 模型</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            v-for="model in [
              { id: 'openai-gpt-4o', name: 'GPT-4o', provider: 'OpenAI', desc: '最新强大模型' },
              { id: 'anthropic-claude-sonnet', name: 'Claude Sonnet 4', provider: 'Anthropic', desc: '最佳平衡' },
              { id: 'google-gemini-pro', name: 'Gemini 1.5 Pro', provider: 'Google', desc: '超长上下文' },
            ]"
            :key="model.id"
            class="p-4 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02]"
            :class="[
              model.id === settingsStore.defaultModel
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700'
            ]"
            @click="handleDefaultModelChange(model.id)"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-gray-900 dark:text-white">{{ model.name }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ model.provider }}</span>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ model.desc }}</p>
          </button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <NModal
      v-model:show="showAddModal"
      preset="card"
      :title="editingProvider?.id ? '编辑厂商' : '添加 AI 厂商'"
      class="max-w-md"
    >
      <NForm v-if="editingProvider" label-placement="left" label-width="100" class="space-y-4">
        <NFormItem label="显示名称">
          <NInput v-model:value="editingProvider.name" placeholder="例如：OpenAI" />
        </NFormItem>
        <NFormItem label="厂商类型">
          <NSelect
            v-model:value="editingProvider.provider"
            :options="providerOptions"
          />
        </NFormItem>
        <NFormItem label="API Key">
          <NInput
            v-model:value="editingProvider.apiKey"
            type="password"
            placeholder="输入 API Key"
            show-password-on="click"
          >
            <template #prefix>
              <Key class="w-4 h-4 text-gray-400" />
            </template>
          </NInput>
        </NFormItem>
        <NFormItem label="自定义端点">
          <NInput
            v-model:value="editingProvider.baseUrl"
            placeholder="留空使用默认端点（可选）"
          />
        </NFormItem>
        <NFormItem label="启用状态">
          <NSwitch v-model:value="editingProvider.enabled" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-3">
          <button
            class="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            @click="showAddModal = false"
          >
            取消
          </button>
          <button
            class="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl transition-all"
            @click="saveProvider"
          >
            保存
          </button>
        </div>
      </template>
    </NModal>
  </div>
</template>
