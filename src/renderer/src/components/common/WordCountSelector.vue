<script setup lang="ts">
import { computed } from "vue";
import { NSelect } from "naive-ui";
import type { SelectProps } from "naive-ui";
import {
  WORD_COUNT_OPTIONS,
  DEFAULT_WORD_COUNT_RANGE,
} from "@/services/ai/unified.service";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    disabled?: boolean;
    /** 下拉框弹出位置 */
    placement?:
      | "top"
      | "bottom"
      | "top-start"
      | "bottom-start"
      | "top-end"
      | "bottom-end";
    /** 传递给 NSelect 的其他属性 */
    selectProps?: SelectProps;
  }>(),
  {
    modelValue: DEFAULT_WORD_COUNT_RANGE,
    disabled: false,
    placement: "bottom-start",
    selectProps: () => ({}),
  },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

// 转换选项格式以适配 NSelect
const options = computed(() =>
  WORD_COUNT_OPTIONS.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);

function handleUpdateValue(value: string) {
  emit("update:modelValue", value);
}
</script>

<template>
  <div class="w-[240px]">
    <NSelect
      :value="modelValue"
      :options="options"
      :disabled="disabled"
      :placement="placement"
      size="small"
      placeholder="选择字数范围"
      v-bind="selectProps"
      @update:value="handleUpdateValue"
    />
  </div>
</template>
