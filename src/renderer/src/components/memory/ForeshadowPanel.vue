<script setup lang="ts">
import { ref, computed } from 'vue';
import { NButton, NTag, NEmpty, NProgress, NModal, NInput, NSelect, NPopconfirm, useMessage } from 'naive-ui';
import { Plus, Lightbulb, AlertCircle, CheckCircle, Trash2, Target } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useProjectStore } from '@/stores/project.store';
import type { Foreshadow } from '@/types/project';

const { t } = useI18n();
const projectStore = useProjectStore();
const message = useMessage();

// Dialog state
const showForeshadowDialog = ref(false);
const foreshadowForm = ref({
  hint: '',
  type: 'event' as 'item' | 'dialogue' | 'event' | 'mystery',
  createdChapter: 1,
  suggestedResolutionChapter: undefined as number | undefined,
});

// Edit dialog state
const showEditDialog = ref(false);
const editingForeshadow = ref<Foreshadow | null>(null);
const editForm = ref({
  hint: '',
  type: 'event' as 'item' | 'dialogue' | 'event' | 'mystery',
  createdChapter: 1,
  suggestedResolutionChapter: undefined as number | undefined,
});

const typeOptions = [
  { label: '物品', value: 'item' },
  { label: '对话', value: 'dialogue' },
  { label: '事件', value: 'event' },
  { label: '悬念', value: 'mystery' },
];

const stats = computed(() => ({
  total: projectStore.foreshadows.length,
  resolved: projectStore.resolvedForeshadowCount,
  resolutionRate: projectStore.foreshadowResolutionRate,
}));

function getStatusIcon(status: string) {
  switch (status) {
    case 'resolved':
      return CheckCircle;
    case 'foreshadowed':
    case 'hinted':
      return AlertCircle;
    default:
      return Lightbulb;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'foreshadowed':
    case 'hinted':
      return 'warning';
    default:
      return 'default';
  }
}

function getStatusText(status: string) {
  const statusMap: Record<string, string> = {
    buried: t('editor.toBeRevealed'),
    hinted: t('editor.revealed'),
    foreshadowed: t('editor.toBeRevealed'),
    resolved: t('editor.resolved'),
  };
  return statusMap[status] || status;
}

function getTypeLabel(type: string) {
  const typeMap: Record<string, string> = {
    item: '物品',
    dialogue: '对话',
    event: '事件',
    mystery: '悬念',
  };
  return typeMap[type] || type;
}

function openAddForeshadowDialog() {
  foreshadowForm.value = {
    hint: '',
    type: 'event',
    createdChapter: 1,
    suggestedResolutionChapter: undefined,
  };
  showForeshadowDialog.value = true;
}

function openEditDialog(foreshadow: Foreshadow) {
  editingForeshadow.value = foreshadow;
  editForm.value = {
    hint: foreshadow.hint,
    type: foreshadow.type,
    createdChapter: foreshadow.createdChapter,
    suggestedResolutionChapter: foreshadow.suggestedResolutionChapter,
  };
  showEditDialog.value = true;
}

async function handleAddForeshadow() {
  if (!foreshadowForm.value.hint.trim()) {
    message.warning('请输入伏笔内容');
    return;
  }
  
  try {
    await projectStore.createForeshadow({
      hint: foreshadowForm.value.hint.trim(),
      type: foreshadowForm.value.type,
      status: 'buried',
      createdChapter: foreshadowForm.value.createdChapter,
      suggestedResolutionChapter: foreshadowForm.value.suggestedResolutionChapter,
    });
    message.success('伏笔添加成功');
    showForeshadowDialog.value = false;
  } catch (error) {
    message.error('添加失败');
  }
}

async function handleEditForeshadow() {
  if (!editingForeshadow.value || !editForm.value.hint.trim()) {
    message.warning('请输入伏笔内容');
    return;
  }
  
  try {
    await projectStore.updateForeshadow(editingForeshadow.value.id, {
      hint: editForm.value.hint.trim(),
      type: editForm.value.type,
      createdChapter: editForm.value.createdChapter,
      suggestedResolutionChapter: editForm.value.suggestedResolutionChapter,
    });
    message.success('伏笔已更新');
    showEditDialog.value = false;
  } catch (error) {
    message.error('更新失败');
  }
}

async function handleUpdateStatus(foreshadow: Foreshadow, newStatus: Foreshadow['status']) {
  try {
    await projectStore.updateForeshadow(foreshadow.id, { status: newStatus });
    message.success('伏笔状态已更新');
  } catch (error) {
    message.error('更新失败');
  }
}

async function handleDeleteForeshadow(id: string) {
  try {
    await projectStore.deleteForeshadow(id);
    message.success('伏笔已删除');
  } catch (error) {
    message.error('删除失败');
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Stats -->
    <div class="p-3 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)]">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-[var(--moliu-text-secondary)]">{{ t('editor.foreshadowResolutionRate') }}</span>
        <span class="text-lg font-bold text-[var(--moliu-primary)]">{{ stats.resolutionRate }}%</span>
      </div>
      <NProgress
        type="line"
        :percentage="stats.resolutionRate"
        :height="8"
        :border-radius="4"
        :fill-border-radius="4"
        :show-indicator="false"
        status="success"
      />
      <div class="flex justify-between mt-2 text-xs text-[var(--moliu-text-secondary)]">
        <span>{{ t('editor.resolved') }}: {{ stats.resolved }}</span>
        <span>{{ t('editor.total') }}: {{ stats.total }}</span>
      </div>
    </div>

    <!-- Add Button -->
    <NButton class="w-full" quaternary @click="openAddForeshadowDialog">
      <template #icon>
        <Plus class="w-4 h-4" />
      </template>
      {{ t('editor.addForeshadow') }}
    </NButton>

    <!-- Foreshadow List -->
    <div v-if="projectStore.foreshadows.length > 0" class="space-y-2">
      <div
        v-for="foreshadow in projectStore.foreshadows"
        :key="foreshadow.id"
        class="p-3 rounded-lg bg-[var(--moliu-bg-primary)] border border-[var(--moliu-border-color)] hover:border-[var(--moliu-primary)] transition-colors cursor-pointer group"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-start gap-2 flex-1">
            <component
              :is="getStatusIcon(foreshadow.status)"
              class="w-4 h-4 mt-0.5"
              :class="{
                'text-green-500': foreshadow.status === 'resolved',
                'text-yellow-500': foreshadow.status === 'foreshadowed' || foreshadow.status === 'hinted',
                'text-[var(--moliu-text-secondary)]': foreshadow.status === 'buried'
              }"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm text-[var(--moliu-text-primary)]">{{ foreshadow.hint }}</p>
              <div class="flex items-center gap-2 mt-2 flex-wrap">
                <NTag size="tiny" :type="getStatusColor(foreshadow.status)">
                  {{ getStatusText(foreshadow.status) }}
                </NTag>
                <NTag size="tiny" type="info">
                  {{ getTypeLabel(foreshadow.type) }}
                </NTag>
                <span class="text-xs text-[var(--moliu-text-secondary)]">
                  第{{ foreshadow.createdChapter }}章埋下
                </span>
                <span v-if="foreshadow.suggestedResolutionChapter" class="flex items-center gap-1 text-xs text-purple-500">
                  <Target class="w-3 h-3" />
                  建议第{{ foreshadow.suggestedResolutionChapter }}章揭晓
                </span>
              </div>
              <!-- Status actions -->
              <div v-if="foreshadow.status !== 'resolved'" class="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <NButton size="tiny" type="info" @click.stop="openEditDialog(foreshadow)">
                  编辑
                </NButton>
                <NButton
                  v-if="foreshadow.status === 'buried'"
                  size="tiny"
                  type="warning"
                  @click.stop="handleUpdateStatus(foreshadow, 'foreshadowed')"
                >
                  标记伏笔
                </NButton>
                <NButton
                  v-if="foreshadow.status === 'foreshadowed'"
                  size="tiny"
                  type="success"
                  @click.stop="handleUpdateStatus(foreshadow, 'resolved')"
                >
                  标记回收
                </NButton>
                <NPopconfirm
                  @positive-click="handleDeleteForeshadow(foreshadow.id)"
                >
                  <template #trigger>
                    <NButton size="tiny" type="error">
                      删除
                    </NButton>
                  </template>
                  确定要删除这个伏笔吗？
                </NPopconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <NEmpty v-else :description="t('editor.noForeshadows')" size="small" />

    <!-- Add Foreshadow Dialog -->
    <NModal
      v-model:show="showForeshadowDialog"
      preset="dialog"
      title="添加伏笔"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleAddForeshadow"
      @negative-click="showForeshadowDialog = false"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">伏笔内容</label>
          <NInput
            v-model:value="foreshadowForm.hint"
            type="textarea"
            :rows="3"
            placeholder="描述这个伏笔的内容"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">伏笔类型</label>
          <NSelect
            v-model:value="foreshadowForm.type"
            :options="typeOptions"
            placeholder="选择类型"
          />
        </div>
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">埋下章节</label>
            <NInput
              v-model:value="foreshadowForm.createdChapter"
              type="number"
              placeholder="输入章节号"
            />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">建议揭晓章节（可选）</label>
            <NInput
              v-model:value="foreshadowForm.suggestedResolutionChapter"
              type="number"
              placeholder="预计揭晓章节"
            />
          </div>
        </div>
      </div>
    </NModal>

    <!-- Edit Foreshadow Dialog -->
    <NModal
      v-model:show="showEditDialog"
      preset="dialog"
      title="编辑伏笔"
      positive-text="确认"
      negative-text="取消"
      @positive-click="handleEditForeshadow"
      @negative-click="showEditDialog = false"
    >
      <div class="space-y-4 py-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">伏笔内容</label>
          <NInput
            v-model:value="editForm.hint"
            type="textarea"
            :rows="3"
            placeholder="描述这个伏笔的内容"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">伏笔类型</label>
          <NSelect
            v-model:value="editForm.type"
            :options="typeOptions"
            placeholder="选择类型"
          />
        </div>
        <div class="flex gap-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">埋下章节</label>
            <NInput
              v-model:value="editForm.createdChapter"
              type="number"
              placeholder="输入章节号"
            />
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">建议揭晓章节（可选）</label>
            <NInput
              v-model:value="editForm.suggestedResolutionChapter"
              type="number"
              placeholder="预计揭晓章节"
            />
          </div>
        </div>
      </div>
    </NModal>
  </div>
</template>
