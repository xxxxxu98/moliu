<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Wand2 } from 'lucide-vue-next';

defineProps<{
  modelValue: string;
  canSubmit: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-3 w-full">
    <textarea
      :model-value="modelValue"
      rows="5"
      class="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
      :placeholder="t('topicDiscovery.promptPlaceholder')"
      :disabled="disabled"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <button
      type="button"
      class="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-base font-medium text-white bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="!canSubmit"
      @click="emit('submit')"
    >
      <Wand2 class="w-5 h-5" />
      {{ t('topicDiscovery.generateDirections') }}
    </button>
  </div>
</template>
