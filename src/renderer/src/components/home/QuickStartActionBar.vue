<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next';
import { NButton } from 'naive-ui';
import WordCountSelector from '@/components/common/WordCountSelector.vue';

interface Props {
  show: boolean;
  wordCountRange: string;
  disabled: boolean;
  canGenerate: boolean;
  isProcessing: boolean;
  generateLabel: string;
  generatingLabel: string;
}

interface Emits {
  (e: 'update:wordCountRange', value: string): void;
  (e: 'generate'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <template v-if="show">
    <div class="flex items-center justify-between px-1">
      <WordCountSelector
        :model-value="wordCountRange"
        :disabled="disabled"
        @update:model-value="emit('update:wordCountRange', $event)"
      />
      <span class="text-xs text-gray-400 dark:text-gray-500">字数范围</span>
    </div>

    <div class="relative">
      <NButton
        class="w-full"
        type="primary"
        size="large"
        :disabled="!canGenerate || isProcessing"
        :loading="isProcessing"
        @click="emit('generate')"
      >
        <template #icon>
          <Sparkles v-if="!isProcessing" class="w-4 h-4" />
        </template>
        {{ isProcessing ? generatingLabel : generateLabel }}
      </NButton>
    </div>
  </template>
</template>
