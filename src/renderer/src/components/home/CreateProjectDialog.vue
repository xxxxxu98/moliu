<script setup lang="ts">
import { ref, computed } from 'vue';
import { NModal, NCard, NInput, NSelect, NForm, NFormItem } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useProjectStore } from '@/stores/project.store';
import { BookOpen } from 'lucide-vue-next';

const router = useRouter();
const projectStore = useProjectStore();

interface Props {
  show: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
}>();

const formData = ref({
  name: '',
  description: '',
  status: 'planning' as 'planning' | 'writing' | 'paused' | 'completed',
});

const isCreating = ref(false);
const isValid = computed(() => formData.value.name.trim().length > 0);

const statusOptions = [
  { label: '规划中', value: 'planning' },
  { label: '创作中', value: 'writing' },
  { label: '已暂停', value: 'paused' },
  { label: '已完成', value: 'completed' },
];

async function handleCreate() {
  if (!isValid.value || isCreating.value) return;

  isCreating.value = true;

  try {
    const newProject = await projectStore.createProject({
      name: formData.value.name.trim(),
      description: formData.value.description.trim(),
      status: formData.value.status,
    });

    if (newProject) {
      // Close dialog
      emit('update:show', false);
      // Navigate to the new project
      router.push(`/project/${newProject.id}`);
    }
  } catch (error) {
    console.error('Failed to create project:', error);
  } finally {
    isCreating.value = false;
  }
}

function handleClose() {
  emit('update:show', false);
}
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="!isCreating"
    :close-on-esc="!isCreating"
    @update:show="(val) => emit('update:show', val)"
  >
    <NCard
      class="max-w-md w-full !bg-white dark:!bg-gray-800 !border dark:!border-gray-700 !rounded-2xl !shadow-2xl"
      :bordered="false"
      role="dialog"
      aria-modal="true"
    >
      <template #header>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <BookOpen class="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">新建项目</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">创建一个新的创作项目</p>
          </div>
        </div>
      </template>

      <NForm :model="formData" class="space-y-4">
        <NFormItem 
          path="name" 
          label="项目名称"
          :required="true"
        >
          <NInput
            v-model:value="formData.name"
            placeholder="给你的故事起个名字"
            :maxlength="100"
            show-count
            @keydown.enter="handleCreate"
          />
        </NFormItem>

        <NFormItem 
          path="description" 
          label="项目描述"
        >
          <NInput
            v-model:value="formData.description"
            type="textarea"
            placeholder="简要描述你的故事..."
            :rows="3"
            :maxlength="500"
            show-count
          />
        </NFormItem>

        <NFormItem 
          path="status" 
          label="项目状态"
        >
          <NSelect
            v-model:value="formData.status"
            :options="statusOptions"
          />
        </NFormItem>
      </NForm>

      <template #footer>
        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button 
            @click="handleClose"
            :disabled="isCreating"
            class="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button 
            @click="handleCreate"
            :disabled="!isValid || isCreating"
            class="px-4 py-2 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span v-if="isCreating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            <span>{{ isCreating ? '创建中...' : '创建项目' }}</span>
          </button>
        </div>
      </template>
    </NCard>
  </NModal>
</template>

