<script setup lang="ts">
/**
 * TabSwitcher - 标签切换组件
 * Moliu v2.0 - 多标签切换
 */
import { computed } from "vue";
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";

// ============================================================
// Types
// ============================================================

interface Tab {
  id: string;
  label: string;
  icon?: any;
  badge?: number | string;
  closable?: boolean;
  disabled?: boolean;
}

// ============================================================
// Props & Emits
// ============================================================

interface Props {
  tabs: Tab[];
  modelValue: string;
  variant?: "line" | "card" | "pill";
  size?: "sm" | "md" | "lg";
  showArrows?: boolean;
  showAdd?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: string): void;
  (e: "close", tabId: string): void;
  (e: "add"): void;
}

const props = withDefaults(defineProps<Props>(), {
  variant: "line",
  size: "md",
  showArrows: true,
  showAdd: false,
});

const emit = defineEmits<Emits>();

// ============================================================
// State
// ============================================================

const containerRef = ref<HTMLElement | null>(null);
const scrollLeft = ref(0);

// ============================================================
// Computed
// ============================================================

const activeIndex = computed(() => {
  return props.tabs.findIndex((t) => t.id === props.modelValue);
});

const canScrollLeft = computed(() => scrollLeft.value > 0);

const canScrollRight = computed(() => {
  if (!containerRef.value) return false;
  return (
    scrollLeft.value + containerRef.value.clientWidth <
    containerRef.value.scrollWidth
  );
});

const sizeClasses = computed(() => {
  const sizes = {
    sm: "text-xs px-3 py-1.5",
    md: "text-sm px-4 py-2",
    lg: "text-base px-5 py-2.5",
  };
  return sizes[props.size];
});

const variantClasses = computed(() => {
  const base = `${sizeClasses.value} font-medium rounded-lg transition-all duration-200`;

  if (props.variant === "line") {
    return {
      default: `${base} text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200`,
      active: `${base} text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500`,
      disabled: `${base} text-gray-300 dark:text-gray-600 cursor-not-allowed`,
    };
  }

  if (props.variant === "card") {
    return {
      default: `${base} text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700`,
      active: `${base} text-white bg-indigo-500 shadow-md`,
      disabled: `${base} text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-800 cursor-not-allowed`,
    };
  }

  // pill
  return {
    default: `${base} text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800`,
    active: `${base} text-white bg-indigo-500 shadow-md`,
    disabled: `${base} text-gray-300 dark:text-gray-600 cursor-not-allowed`,
  };
});

// ============================================================
// Methods
// ============================================================

function selectTab(tabId: string) {
  const tab = props.tabs.find((t) => t.id === tabId);
  if (tab?.disabled) return;
  emit("update:modelValue", tabId);
}

function closeTab(tabId: string, event: MouseEvent) {
  event.stopPropagation();
  emit("close", tabId);
}

function scroll(direction: "left" | "right") {
  if (!containerRef.value) return;
  const scrollAmount = containerRef.value.clientWidth / 2;
  const targetScroll =
    direction === "left"
      ? scrollLeft.value - scrollAmount
      : scrollLeft.value + scrollAmount;

  containerRef.value.scrollTo({
    left: targetScroll,
    behavior: "smooth",
  });

  setTimeout(() => {
    if (containerRef.value) {
      scrollLeft.value = containerRef.value.scrollLeft;
    }
  }, 200);
}

function handleScroll() {
  if (containerRef.value) {
    scrollLeft.value = containerRef.value.scrollLeft;
  }
}
</script>

<template>
  <div class="relative flex items-center">
    <!-- Left Arrow -->
    <button
      v-if="showArrows && canScrollLeft"
      class="absolute left-0 z-10 p-1 rounded-full bg-white dark:bg-gray-800 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      @click="scroll('left')"
    >
      <ChevronLeft class="w-4 h-4 text-gray-600 dark:text-gray-400" />
    </button>

    <!-- Tabs Container -->
    <div
      ref="containerRef"
      class="flex items-center gap-1 overflow-x-auto scrollbar-hide"
      :class="variant === 'line' ? 'border-b border-gray-200 dark:border-gray-700 -mb-px' : ''"
      @scroll="handleScroll"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="inline-flex items-center gap-1.5 whitespace-nowrap transition-all duration-200"
        :class="[
          variantClasses.default,
          modelValue === tab.id ? variantClasses.active : '',
          tab.disabled ? variantClasses.disabled : '',
        ]"
        :disabled="tab.disabled"
        @click="selectTab(tab.id)"
      >
        <!-- Icon -->
        <component v-if="tab.icon" :is="tab.icon" class="w-4 h-4" />

        <!-- Label -->
        <span>{{ tab.label }}</span>

        <!-- Badge -->
        <span
          v-if="tab.badge"
          class="px-1.5 py-0.5 rounded-full text-xs"
          :class="[
            modelValue === tab.id
              ? 'bg-white/20 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
          ]"
        >
          {{ tab.badge }}
        </span>

        <!-- Close Button -->
        <button
          v-if="tab.closable"
          class="ml-0.5 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          @click="closeTab(tab.id, $event)"
        >
          <X class="w-3 h-3" />
        </button>
      </button>
    </div>

    <!-- Right Arrow -->
    <button
      v-if="showArrows && canScrollRight"
      class="absolute right-0 z-10 p-1 rounded-full bg-white dark:bg-gray-800 shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      @click="scroll('right')"
    >
      <ChevronRight class="w-4 h-4 text-gray-600 dark:text-gray-400" />
    </button>

    <!-- Add Button -->
    <button
      v-if="showAdd"
      class="ml-2 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
      title="添加标签"
      @click="emit('add')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
