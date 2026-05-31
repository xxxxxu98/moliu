<script setup lang="ts">
/**
 * 强行完结确认对话框
 */
import { ref, computed } from 'vue';
import { NModal, NCard, NButton, NAlert } from 'naive-ui';
import { AlertTriangle, Flag, BookOpen, Layers, Swords } from 'lucide-vue-next';

interface Props {
  show: boolean;
  projectName: string;
  currentChapter: number;
  totalChapters: number;
  unresolvedForeshadows: number;
  unresolvedConflicts: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const isConfirmed = ref(false);

const totalWordCount = computed(() => {
  return props.totalChapters * 3000;
});

function handleConfirm() {
  if (!isConfirmed.value) return;
  emit('confirm');
  close();
}

function handleCancel() {
  emit('cancel');
  close();
}

function close() {
  emit('update:show', false);
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="null"
    :style="{ width: '480px' }"
    :mask-closable="false"
    @update:show="(val) => emit('update:show', val)"
  >
    <template #header-extra>
      <div class="flex items-center gap-2 text-amber-500">
        <AlertTriangle class="w-5 h-5" />
        <span class="font-semibold text-sm">强行完结确认</span>
      </div>
    </template>

    <div class="space-y-4">
      <!-- 项目信息 -->
      <div class="p-3 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/50">
        <div class="flex items-center gap-2 mb-2">
          <BookOpen class="w-4 h-4 text-amber-500" />
          <span class="font-semibold text-sm text-gray-900 dark:text-white">
            {{ projectName }}
          </span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">
          第 {{ currentChapter }} 章 / {{ totalChapters }} 章
        </div>
      </div>

      <!-- 警告信息 -->
      <NAlert type="warning" :show-icon="true">
        <div class="text-sm">
          <p class="font-medium mb-1">即将强制完结，以下内容将被跳过：</p>
          <ul class="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <li>所有未揭示的伏笔将被标记为「已放弃」</li>
            <li>所有未解决的冲突将被标记为「已忽略」</li>
            <li>后续续写操作将被禁止</li>
            <li>此操作可在「取消完结」后撤销</li>
          </ul>
        </div>
      </NAlert>

      <!-- 统计 -->
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
          <div class="flex items-center justify-center gap-1 mb-1">
            <Layers class="w-4 h-4 text-amber-500" />
            <span class="text-lg font-bold text-gray-900 dark:text-white">
              {{ unresolvedForeshadows }}
            </span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">未解决伏笔</div>
        </div>
        <div class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-center">
          <div class="flex items-center justify-center gap-1 mb-1">
            <Swords class="w-4 h-4 text-red-500" />
            <span class="text-lg font-bold text-gray-900 dark:text-white">
              {{ unresolvedConflicts }}
            </span>
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400">未解决冲突</div>
        </div>
      </div>

      <!-- 字数统计 -->
      <div class="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600 dark:text-gray-400">预计总字数</span>
          <span class="font-semibold text-indigo-600 dark:text-indigo-400">
            约 {{ totalWordCount.toLocaleString() }} 字
          </span>
        </div>
      </div>

      <!-- 确认复选框 -->
      <label class="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 cursor-pointer">
        <input
          v-model="isConfirmed"
          type="checkbox"
          class="mt-0.5 w-4 h-4 text-red-600 rounded border-red-300 focus:ring-red-500"
        />
        <div class="flex-1">
          <span class="text-sm font-medium text-red-700 dark:text-red-400">
            我已知悉强行完结的风险
          </span>
          <p class="text-xs text-red-600 dark:text-red-400/70 mt-0.5">
            确认后项目将标记为已完成，无法通过正常续写继续
          </p>
        </div>
      </label>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3">
        <NButton @click="handleCancel">
          取消
        </NButton>
        <NButton
          type="warning"
          :disabled="!isConfirmed"
          @click="handleConfirm"
        >
          <template #icon>
            <Flag class="w-4 h-4" />
          </template>
          确认强行完结
        </NButton>
      </div>
    </template>
  </NModal>
</template>
