<script setup lang="ts">
/**
 * GenerateButton - 生成按钮组件
 * Moliu v2.0 - 统一的大纲生成按钮
 */
import { computed } from "vue";
import { Sparkles, Loader2, AlertCircle, Check } from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

type ButtonVariant = "primary" | "secondary" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface Props {
  /** 按钮变体 */
  variant?: ButtonVariant;
  /** 按钮尺寸 */
  size?: ButtonSize;
  /** 是否加载中 */
  loading?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否成功 */
  success?: boolean;
  /** 错误信息 */
  error?: string | null;
  /** 进度文本 */
  progressText?: string;
  /** 是否显示进度 */
  showProgress?: boolean;
}

interface Emits {
  (e: "click"): void;
}

// ============================================================
// Props & Emits
// ============================================================

const props = withDefaults(defineProps<Props>(), {
  variant: "primary",
  size: "md",
  loading: false,
  disabled: false,
  success: false,
  error: null,
  progressText: "",
  showProgress: false,
});

const emit = defineEmits<Emits>();

// ============================================================
// Computed
// ============================================================

const isDisabled = computed(() => props.disabled || props.loading);

const buttonClasses = computed(() => {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900";

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variants = {
    primary: {
      default:
        "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl focus:ring-indigo-500",
      disabled:
        "bg-gray-300 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed",
      loading:
        "bg-gradient-to-r from-indigo-500 to-purple-600 text-white",
    },
    secondary: {
      default:
        "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg hover:shadow-xl focus:ring-amber-500",
      disabled:
        "bg-gray-300 dark:bg-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed",
      loading:
        "bg-gradient-to-r from-amber-500 to-orange-500 text-white",
    },
    outline: {
      default:
        "border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 focus:ring-indigo-500",
      disabled:
        "border-2 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed",
      loading:
        "border-2 border-indigo-500 text-indigo-600 dark:text-indigo-400",
    },
  };

  let variantClasses = variants[props.variant].default;
  if (isDisabled.value) {
    variantClasses = variants[props.variant].disabled;
  } else if (props.loading) {
    variantClasses = variants[props.variant].loading;
  }

  return `${base} ${sizes[props.size]} ${variantClasses}`;
});

const iconSize = computed(() => {
  const sizes = { sm: "w-3.5 h-3.5", md: "w-4 h-4", lg: "w-5 h-5" };
  return sizes[props.size];
});
</script>

<template>
  <div class="relative">
    <!-- Main Button -->
    <button
      :class="buttonClasses"
      :disabled="isDisabled"
      @click="emit('click')"
    >
      <!-- Loading Spinner -->
      <Loader2 v-if="loading" :class="[iconSize, 'animate-spin']" />

      <!-- Success Icon -->
      <Check v-else-if="success" :class="[iconSize]" />

      <!-- Error Icon -->
      <AlertCircle v-else-if="error" :class="[iconSize, 'text-red-500']" />

      <!-- Default Icon -->
      <Sparkles v-else :class="iconSize" />

      <!-- Button Text -->
      <span>
        <slot>
          {{ loading ? "生成中..." : "生成大纲" }}
        </slot>
      </span>
    </button>

    <!-- Progress Indicator -->
    <div
      v-if="showProgress && loading && progressText"
      class="absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap"
    >
      <div class="px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs">
        {{ progressText }}
      </div>
    </div>

    <!-- Error Tooltip -->
    <div
      v-if="error && !loading"
      class="absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap"
    >
      <div class="px-2 py-1 rounded bg-red-500 text-white text-xs">
        {{ error }}
      </div>
    </div>

    <!-- Disabled Tooltip -->
    <div
      v-if="disabled && !loading && !error"
      class="absolute left-1/2 -translate-x-1/2 -bottom-8 whitespace-nowrap"
    >
      <div class="px-2 py-1 rounded bg-gray-800 dark:bg-gray-700 text-white text-xs">
        {{ $slots.tooltip || "请先选择标签和设定" }}
      </div>
    </div>
  </div>
</template>
