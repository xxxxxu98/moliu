<script setup lang="ts">
import { Check, Save } from 'lucide-vue-next';
import { NButton, NInput } from 'naive-ui';

interface InputStatus {
  type: string;
  message: string;
  remaining?: number;
}

interface Props {
  prompt: string;
  placeholder: string;
  minPromptLength: number;
  maxPromptLength: number;
  isPromptTooLong: boolean;
  inputStatus: InputStatus | null;
}

interface Emits {
  (e: 'update:prompt', value: string): void;
  (e: 'save-draft'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="space-y-3">
    <NInput
      :value="props.prompt"
      type="textarea"
      :placeholder="placeholder"
      :autosize="{ minRows: 4, maxRows: 8 }"
      show-count
      :status="isPromptTooLong ? 'error' : props.prompt.trim().length >= minPromptLength ? 'success' : undefined"
      @update:value="emit('update:prompt', $event)"
    />
    <div class="flex items-center justify-between mt-1.5">
      <div v-if="inputStatus?.type === 'insufficient'" class="flex items-center gap-1 text-xs text-amber-500">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        {{ inputStatus.message }}
      </div>
      <div v-else-if="inputStatus?.type === 'good'" class="flex items-center gap-1 text-xs text-green-500">
        <Check class="w-3 h-3" />
        {{ inputStatus.message }}
      </div>
      <div v-else></div>
      <div class="flex items-center gap-2">
        <span class="text-xs transition-colors" :class="isPromptTooLong ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'">
          {{ props.prompt.length }} / {{ maxPromptLength }}
        </span>
        <NButton
          v-if="props.prompt.trim()"
          quaternary
          size="small"
          @click="emit('save-draft')"
        >
          <template #icon>
            <Save class="w-3.5 h-3.5" />
          </template>
        </NButton>
      </div>
    </div>
  </div>
</template>
